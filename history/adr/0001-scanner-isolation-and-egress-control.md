# ADR-0001: Scanner Isolation and Egress Control

> **Scope**: This ADR covers one decision cluster: how the browser that renders untrusted pages
> is isolated, and how its network traffic is constrained (process/container topology, network
> segmentation, application-layer egress filtering, host firewall policy, browser sandboxing).
> These parts protect the same boundary and would change together.

- **Amendments:** Amendment 1 to §3 (NL-2 firewall rule order and scoping) — Accepted
  2026-10-23, resolves OD-12. Amendment 2 to §4 (`SYS_CHROOT` for the scanner) — Accepted
  2026-11-08, resolves OD-13. Amendment 3 to §3 (four more non-public IPv4 ranges; one range list
  for proxy and firewall) — Accepted 2026-11-13. Amendment 4 to §1, §2 and §6 (test mode,
  separate from `SCAN_ENABLED`) — Accepted 2026-11-13.
- **Status:** Accepted (2026-10-22, by the project owner, after review revision 1). Resolves
  plan Open Decisions **OD-1** and **OD-5** and narrows **OD-2**. Acceptance approves the
  design only: **no security gate (G0/G1) has passed**; gates pass only with recorded execution
  evidence from the actual Docker stack and host firewall.
- **Date:** 2026-10-22
- **Feature:** 001-accesslens-mvp
- **Context:** AccessLens loads arbitrary user-supplied public URLs in a real browser. The
  following facts and constraints shaped the decision.
  - **Constitution III** requires all of the following:
    - SSRF and private-network protection validated against the IP actually connected to;
    - re-validation of every redirect and subrequest;
    - resource limits;
    - a sandboxed, least-privilege browser in a process or container separate from the web/API
      server.
  - **Research R3** requires two network-level controls in production, so that a Chromium flag
    bypass or proxy bug cannot be exploited:
    - **NL-1**: the browser has no route except the egress proxy;
    - **NL-2**: the proxy's own egress to non-public ranges is denied at the network level.
  - **Playwright's Docker guidance** (checked 2026-10-22):
    - the official image runs browsers as `root` by default, which disables Chromium's sandbox;
    - for untrusted sites it recommends a separate non-root user combined with its
      `seccomp_profile.json`, and says that profile "is needed to run Chromium with sandbox";
    - it states that using the image to visit untrusted websites "is not recommended" without
      those measures;
    - it recommends `--ipc=host` (to avoid Chromium memory crashes) and `--init`.
  - **Docker's documentation** (checked 2026-10-22):
    - `DOCKER-USER` rules are "processed before" Docker's own forwarding rules;
    - Compose `internal: true` creates "an externally isolated network";
    - subnets (`ipam`) and `enable_ipv6` can be set per network;
    - the docs say nothing about `DOCKER-USER` persistence across daemon restarts, or about
      IPv6-specific `DOCKER-USER` usage.
  - **Fixed constraints**: one Docker Compose host (stakeholder choice); a stateless server
    (no database or queue); `cap_drop: [ALL]` for the scanner; MVP simplicity (Principle VIII).

<!-- Significance checklist (ALL must be true to justify this ADR)
     1) Impact: Long-term consequence for architecture/platform/security? YES — defines the SSRF boundary and constrains hosting.
     2) Alternatives: Multiple viable options considered with tradeoffs? YES — see below.
     3) Scope: Cross-cutting concern (not an isolated detail)? YES — compose topology, scanner, proxy, host ops, release gating. -->

## Decision

Accepted cluster:

1. **Topology — three containers on segmented networks** (Docker Compose):

   | Container | Networks | Published ports | Secrets | Role |
   |---|---|---|---|---|
   | `web` | `public` (normal), `scan-ctl` (`internal: true`) | 3000 (behind TLS reverse proxy) | `OPENROUTER_API_KEY`, `EVIDENCE_SIGNING_SECRET*`, `SCANNER_INTERNAL_TOKEN` | UI, public API, evidence sealing, AI calls |
   | `scanner` | `scan-ctl` (`internal`), `scan-egress` (`internal`, fixed subnet) | none | `SCANNER_INTERNAL_TOKEN`, `PROXY_CONTROL_TOKEN` | `/scan` control API, Playwright Chromium, axe-core |
   | `egress-proxy` | `scan-egress` (`internal`, **fixed IP**), `outbound` (normal, fixed IPv4 subnet, `enable_ipv6: false`) | none | `PROXY_CONTROL_TOKEN` only | Filtering forward proxy; the **only** scan-path component with an external route |

   No AI key or evidence-signing secret is present in `scanner` or `egress-proxy`.
   `PROXY_CONTROL_TOKEN` (≥ 32 random bytes) only authenticates scanner → proxy control calls.

   - **NL-1** is enforced by Docker. `scanner` is attached only to internal networks, so
     Chromium has no route to the internet, the host, or metadata endpoints. Its only way out is
     `egress-proxy`.
   - `web` binds its HTTP listener **only** to its `public`-network address, so nothing on
     `scan-ctl` listens except the scanner's control API. A browser in `scanner` therefore can't
     open connections to `web`. *(To be proven by the G1 test "browser → web on scan-ctl is
     refused".)*

2. **Application-layer egress filtering** — the R3 proxy logic moves from the scanner process
   into `egress-proxy`. The proxy:
   - resolves DNS itself, IPv4 only, matching `enable_ipv6: false`;
   - rejects the request if any resolved address is non-public;
   - connects to the validated IP without re-resolving;
   - allows only ports 80/443.

   **Per-audit accounting and proxy authentication**:
   - Before each audit, the scanner registers a fresh random credential pair with the proxy's
     control endpoint, authenticated with `PROXY_CONTROL_TOKEN`.
   - The audit's browser context uses those credentials through Playwright's per-context
     `proxy` username/password option, which Playwright documents for authenticated HTTP
     proxies.
   - The proxy **refuses every request without currently registered credentials (407)** and
     attributes requests and bytes per audit.
   - The scanner revokes the credentials when the context closes, and the proxy also drops them
     after the total audit timeout.
   - The scanner reads cap breaches and blocked hosts from the same endpoint.

   **The browser can reach the control endpoint**, because it shares the scanner container's
   network namespace, so network placement can't protect it. Its protection is the token
   (constant-time compare), rate-limiting, and read-only per-audit views; it never exposes
   other audits' credentials.

   The Chromium flags from R3 (`<-loopback>` bypass removal, QUIC/WebRTC UDP off) are **kept as
   defense in depth**. The host-resolver lock becomes `MAP * ~NOTFOUND`, with the proxy
   addressed by its **fixed IP**, so Chromium needs no DNS at all.

   **DNS leakage**: Docker's embedded DNS may still answer external names for containers on
   internal networks. The documentation reviewed doesn't settle this. G1 must test whether
   external DNS resolution works from `scanner`. If it does, the M2 implementation must disable
   it for `scanner` (mechanism to be chosen at M2, documented in an addendum to this ADR) before
   G1 can pass.

3. **Network-layer egress denial (NL-2)** — host firewall rules in the `DOCKER-USER` chain,
   applied to traffic from the `outbound` subnet:
   - **order**: ESTABLISHED/RELATED accept first, then DROP for `0.0.0.0/8`, `10.0.0.0/8`,
     `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`,
     `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`,
     `224.0.0.0/4`, `240.0.0.0/4` (which includes `255.255.255.255`), and every Docker bridge
     subnet on the host. This list matches the proxy's application-level non-public
     classification; a unit test keeps the two in sync;
   - a matching `INPUT` rule drops connections from the `outbound` subnet to the host's own
     addresses (`DOCKER-USER` covers forwarded traffic only);
   - IPv6 egress is removed by `enable_ipv6: false`, not by firewall rules.

   Because the docs don't say whether the rules persist, deployment MUST install them
   persistently and run the NL-2 smoke test after every daemon or host restart.

   > **Amendment 1 to §3 — ACCEPTED (2026-10-23, by the project owner; resolves OD-12 via
   > task T185).** The original §3 text above is preserved as the historical record. From
   > 2026-10-23 its **"order" bullet is superseded** by this amendment; every other part of
   > §3 (the range list, the `INPUT` rule, IPv6 off, persistence) stays in force. Proposed
   > 2026-10-23; accepted the same day.
   >
   > **Problem**: the accepted rule order accepts ESTABLISHED/RELATED first, so the prohibited
   > destination drops are skipped by any flow conntrack already tracks. Three ways that can
   > happen:
   > 1. a connection opened before the rules were installed (boot ordering, or rules re-applied
   >    after a flush);
   > 2. RELATED flows created by a conntrack helper;
   > 3. a broad ESTABLISHED/RELATED accept that isn't scoped to the `outbound` subnet and so
   >    matches unrelated traffic.
   >
   > **Proposed rule set**:
   > - **Drop first, regardless of state.** In `DOCKER-USER`, insert
   >   `-s <outbound subnet> -d <each prohibited range or Docker bridge subnet> -j DROP` at the
   >   **top**, before any ACCEPT and with **no** `--ctstate` match. These rules only match
   >   packets that originate from the proxy and are addressed to a prohibited destination;
   >   return traffic from public servers has a public source and a container destination, so
   >   it isn't affected.
   > - **No broad ESTABLISHED/RELATED accept** in `DOCKER-USER`; leave Docker's own handling of
   >   established return traffic as it is. If an accept rule is ever needed, it must be scoped
   >   to `-s <outbound subnet>` and placed **after** the drops.
   > - **`INPUT`**: insert the drop from the `outbound` subnet to the host's own addresses at
   >   position 1, ahead of any distribution or ufw ESTABLISHED accept.
   > - **Startup order and existing flows**: the rules are installed **before** the
   >   `egress-proxy` container starts (the systemd unit runs `After=docker.service`,
   >   `Before=` the Compose service unit). After installing, conntrack entries with source
   >   `<outbound subnet>` are flushed (`conntrack -D -s <outbound subnet>`), which needs the
   >   conntrack tools on the host.
   > - **Conntrack helpers**: verify that automatic helper assignment is off
   >   (`net.netfilter.nf_conntrack_helper=0`, the kernel default since 4.7). No helper is
   >   configured for the `outbound` subnet.
   >
   > **Tests against the running stack (G1)**:
   > - rule order: the drops are first;
   > - packet path: the drop-rule counters increase on a probe;
   > - a pre-existing flow is cut by install plus flush;
   > - no helper is assigned;
   > - return traffic from a public endpoint still works.
   >
   > **Effect**: replaces the "order" bullet above. No other part of this ADR changes.
   >
   > **Scoping and traffic paths (part of the accepted amendment)**. The firewall must enforce
   > NL-2 on exactly the intended packets and leave unrelated host and container traffic alone.
   >
   > *Packet paths on a Docker Engine host with the iptables backend*:
   >
   > | Traffic from `egress-proxy` (source in `outbound` subnet) | Netfilter path | Enforced by |
   > |---|---|---|
   > | To an internet or prohibited IP | `FORWARD` → `DOCKER-USER` (before Docker's chains; source still the container IP, because masquerade happens later in `POSTROUTING`) | `DOCKER-USER` drops |
   > | To another container's IP, including after DNAT of a host-published port such as `web:3000` | `PREROUTING` DNAT → `FORWARD` → `DOCKER-USER` with destination = a container IP in a Docker subnet | `DOCKER-USER` Docker-subnet drops |
   > | To the host's own addresses (bridge gateway, host LAN/public IP, a `docker-proxy` listener) | `INPUT` | `INPUT` drop at position 1 |
   > | DNS from inside the container to Docker's embedded resolver `127.0.0.11` | Stays in the container namespace; the daemon forwards upstream from the host namespace (`OUTPUT`, not `FORWARD`) | Not affected (proxy resolution keeps working) |
   >
   > *Scoping rules*:
   > - Every rule matches **`-s <outbound subnet>`** (the `outbound` subnet is fixed in
   >   Compose). The `INPUT` rule additionally matches `-d <host addresses>`. No rule matches
   >   traffic from other subnets, the host itself, or inbound clients.
   > - Every rule carries the comment tag `accesslens-nl2`. Install and uninstall add or delete
   >   **only** tagged rules, idempotently. The scripts never flush chains (`-F`), never change
   >   chain policies, and never modify Docker-owned chains (`DOCKER`, `DOCKER-FORWARD`,
   >   `DOCKER-ISOLATION-*`).
   > - The conntrack flush is limited to `conntrack -D -s <outbound subnet>`. Host SSH sessions,
   >   `web`'s connections, and other containers' flows are untouched.
   > - The install script **fails closed** if Docker isn't using the iptables backend (for
   >   example, the experimental nftables backend, where `DOCKER-USER` doesn't exist), if the
   >   `outbound` subnet doesn't match Compose, or if `nf_conntrack_helper` ≠ 0. On failure it
   >   leaves no partial rule set and exits non-zero, so `SCAN_ENABLED` must stay `false`.
   >
   > *Validation*: task **T184** checks all of the above against the **live** stack on the G1
   > host, including that unrelated connections survive install and flush. Accepting this
   > amendment doesn't mean G1 has passed. G1 passes only through task T066 with recorded
   > evidence.

   > **Amendment 3 to §3 — ACCEPTED (2026-11-13, by the project owner; M1 review, before
   > task T035).** This adds to §3's range list and to R3. Their earlier text is kept unchanged
   > as the record; where they conflict, this amendment governs.
   >
   > **Finding.** §3 says its range list matches the proxy's non-public classification. With
   > ipaddr.js 2.5.0 that wasn't true: `range()` reports four more IPv4 ranges as non-unicast,
   > so the proxy would have blocked them while the firewall allowed them.
   > - `192.88.99.0/24` (`reserved`: 6to4 relay anycast, RFC 7526);
   > - `192.31.196.0/24` (`as112`, RFC 7535);
   > - `192.175.48.0/24` (`as112`: direct delegation, RFC 7534);
   > - `192.52.193.0/24` (`amt`, RFC 7450).
   >
   > **Decision.**
   > - The four ranges above are added to the §3 list. NL-2 now drops 18 ranges, plus every
   >   Docker bridge subnet on the host.
   > - `NON_PUBLIC_IPV4_RANGES` (exported by `packages/shared/src/url-policy/ip-classify.ts`,
   >   task T038) is the **single source of truth** for both the proxy's check and the firewall
   >   rules. The firewall list is generated from it, and the T045 sync test keeps them equal.
   > - ipaddr.js is used **for parsing only**. A non-public verdict comes from
   >   `NON_PUBLIC_IPV4_RANGES`, not from `range()`. This supersedes R3 item 4's
   >   "`range() !== "unicast"`".
   > - A T035 cross-check test requires every non-unicast IPv4 range ipaddr.js knows about to
   >   be covered by the list. A future ipaddr.js upgrade that adds a range therefore fails the
   >   build until the list, and this ADR, are updated.
   >
   > *Validation*: the list is covered by T035 and the T036 G0 suite. The firewall side is
   > covered by T045 and T057, and on the live stack by G1. Accepting this amendment doesn't
   > mean G0 or G1 has passed.

4. **Browser sandboxing (resolves OD-5)**:
   - Chromium runs as the non-root `pwuser` with Playwright's `seccomp_profile.json`, keeping
     Chromium's sandbox **enabled**.
   - `--no-sandbox` MUST NOT be used in any deployment with `SCAN_ENABLED=true`. If the sandbox
     can't start on a host, live scanning stays disabled there until a superseding ADR.
   - `--ipc=host` is **not** used, because it shares the host IPC namespace. Instead, raise
     `shm_size`; the value is set and measured at M2.
   - Use `init: true`.
   - Retain R4 hardening: `cap_drop: [ALL]`, `no-new-privileges`, read-only rootfs with `tmpfs`
     `/tmp`, memory/CPU/PID limits, and a fresh context per audit.

   > **Open issue OD-13 (2026-11-04; not decided).** This section requires both
   > `cap_drop: [ALL]` and an enabled Chromium sandbox, and the two conflict. Measured 2026-11-04 on Docker Desktop (WSL2): with `cap_drop: [ALL]`, `chromium.launch({ chromiumSandbox: true })` exits with `Zygote process exited prematurely`, on both our image (Node 24.22.1) and the unmodified Playwright image (Node 26.13.0). Adding only `SYS_CHROOT` launches with the rest of the hardening intact; none of Docker's 13 other default capabilities does.
   > Options are in the OD-13 row of the plan. The accepted text stays in force until the owner decides.

   > **Amendment 2 to §4 — ACCEPTED (2026-11-08, by the project owner; resolves OD-13, Option A).**
   > This amendment adds to §4 and to the note above. Their text is kept unchanged as the record;
   > where they conflict, this amendment governs.
   >
   > **Decision.** The `scanner` service keeps `cap_drop: [ALL]` and adds only
   > `cap_add: [SYS_CHROOT]`. `web`, `web-dev`, and `egress-proxy` get no capabilities. The scanner
   > launches Chromium with Playwright's `chromiumSandbox: true`. `--no-sandbox` and
   > `--disable-sandbox` remain forbidden. §4's fallback still applies: if the sandbox can't start
   > on a host, live scanning stays disabled there.
   >
   > **Why it is necessary.**
   > - Chromium's sandbox calls `chroot`.
   > - `ops/seccomp/playwright-seccomp-profile.json` allows `chroot` only when the container has
   >   `CAP_SYS_CHROOT`, so `cap_drop: [ALL]` also blocks that syscall. Chromium then exits with
   >   `Zygote process exited prematurely`.
   > - Of Docker's 14 default capabilities, tested one at a time, only `SYS_CHROOT` lets the sandbox
   >   start under the full hardening.
   >
   > **The trade-off.**
   > - *What it opens:* `chroot` is the only syscall in the profile tied to this capability, so
   >   `chroot` is the only syscall the grant unlocks. It adds to the kernel surface already noted
   >   under Consequences for user-namespace cloning.
   > - *What limits it:* `pwuser` doesn't hold the capability. Its effective, permitted, inheritable,
   >   and ambient sets are all empty; `SYS_CHROOT` is only in the bounding set. `no-new-privileges`
   >   stops a setuid or file-capability binary from raising it.
   > - *What remains:* a process running as root in the container would hold `SYS_CHROOT`. The
   >   Dockerfile's `USER pwuser` and the non-root test guard against that.
   > - *Not investigated:* Option B, keeping `cap_drop: [ALL]` by other means. A custom seccomp
   >   profile might allow it, but that is untested and would mean maintaining a fork of Playwright's
   >   profile.
   >
   > **Sandbox-on verification is mandatory.** A browser launch alone proves nothing, because
   > Playwright launches without the sandbox unless asked. Any check of this control MUST:
   > - launch with `chromiumSandbox: true` under the actual Compose service definition, and render a
   >   page;
   > - confirm the renderer is in a nested PID namespace. `Seccomp: 2` alone is not enough, because
   >   an unsandboxed renderer also reports it, from the container's profile;
   > - confirm no Chromium process carries a sandbox-disabling flag.
   >
   > `tests/config/scanner-sandbox.test.ts` does this and is required in CI. Removing the capability
   > makes it fail.
   >
   > **Evidence and its limits.** Measured 2026-11-08 on Docker Desktop 29.9.2 on WSL2, with renderer
   > `NSpid: 129 4 1` when sandboxed and `NSpid: 72` in an unsandboxed control. **This does not prove
   > production-host compatibility.** Ubuntu 24.04 can restrict unprivileged user namespaces through
   > AppArmor (`kernel.apparmor_restrict_unprivileged_userns`), so a sandbox that works here may not
   > start there.
   >
   > **G1 requirement.** The §6 check "Chromium reports its sandbox as enabled" is met only by the
   > checks above, run on the actual Ubuntu 24.04 G1 host (T062, T066), with that host's
   > user-namespace and AppArmor state recorded in the evidence log. Any change to that host's
   > AppArmor or sysctl settings is an owner decision. This amendment doesn't mean G1 has passed. G1
   > passes only through task T066 with recorded evidence.

5. **Hosting consequence (narrows OD-2)**:
   - Live scanning may only run on a host where the operator controls the Docker Engine and the
     host firewall, such as a VM or VPS with root access.
   - Managed container platforms without host-firewall control may host AccessLens only with
     `SCAN_ENABLED=false` (demo and saved-history features only).

6. **Release gate G1 (tests that must pass on the composed stack before `SCAN_ENABLED=true`)**:
   - From `scanner`: a direct TCP connection to a public IP fails (no route); `web` on `scan-ctl`
     is refused; `169.254.169.254` and RFC 1918 targets are unreachable.
   - Through the proxy, every R3 SSRF vector is refused.
   - From `egress-proxy`, a raw TCP probe (bypassing proxy logic) to `169.254.169.254`, RFC 1918,
     and a Docker subnet is dropped by the host firewall (NL-2 independent of app code).
   - The `scanner` and `egress-proxy` environments contain no AI or signing secrets.
   - The proxy returns 407 for requests without registered credentials, and for revoked
     credentials after an audit ends.
   - The control endpoint rejects requests without `PROXY_CONTROL_TOKEN`.
   - External DNS resolution from `scanner` fails (see the DNS leakage note in §2).
   - Chromium reports its sandbox as enabled.
   - **No gate counts as passed without recorded execution evidence** (CI run or deploy smoke-test
     log) from the actual composed stack and host firewall.

   > **Amendment 4 to §1, §2 and §6 — ACCEPTED (2026-11-13, by the project owner; test mode).**
   > This adds to §1 (topology and environment table), §2 (proxy behaviour), and §6 (G1). Their
   > earlier text is kept unchanged; where they conflict, this amendment governs. Production
   > behaviour doesn't change.
   >
   > **Problem.** `web` refuses every audit unless `SCAN_ENABLED` is exactly `true`, and nothing
   > outside a deployment host may set it (T186, T187). Local and CI end-to-end tests still need
   > real audits of test pages. R13's existing guard, an allowlist honoured only when
   > `NODE_ENV=test`, can't protect `web`, because Next.js replaces `NODE_ENV` at build time.
   >
   > **Decision: test mode is a separate setting.**
   >
   > | Variable | Read by | Meaning |
   > |---|---|---|
   > | `ACCESSLENS_TEST_MODE` | web, scanner, egress-proxy | On only when exactly `true`; any other value, including unset or empty, is off. |
   > | `ACCESSLENS_TEST_ALLOWLIST` | web, egress-proxy | Comma-separated exact host names of test pages. An IP address, wildcard, port, or empty entry is a startup error. Replaces R13's `EGRESS_TEST_ALLOWLIST`. |
   > | `ACCESSLENS_TEST_FIXTURE_SUBNET` | web, egress-proxy | `172.30.50.0/24`: the only addresses an allowlisted host may resolve to. Checked on 2026-11-13: it overlaps none of `public` (172.30.10.0/24), `scan-ctl` (.20), `scan-egress` (.30), or `outbound` (.40), nor any Docker network on the development host. |
   >
   > **What test mode can reach.**
   > - **`web`**: with `SCAN_ENABLED=true`, the production path. Otherwise, with test mode on, only
   >   a URL whose host is exactly on the allowlist goes ahead, and every other URL gets
   >   `SCAN_DISABLED`. The URL policy (FR-001, T037) still applies to allowed test URLs.
   > - **DNS check** (`resolveAndCheck`): an optional test allowance. For an allowlisted host,
   >   every answer must lie inside the fixture subnet; any other answer is
   >   `BLOCKED_DESTINATION`. Without the allowance it behaves exactly as before, so G0 is
   >   unaffected.
   > - **`egress-proxy`**: in test mode it serves only allowlisted hosts resolving into the
   >   fixture subnet, and refuses every other host, public ones included. A test-mode stack
   >   therefore can't reach the internet.
   > - **Topology**: a test-only network `test-fixtures` (`172.30.50.0/24`) exists only in
   >   `docker-compose.test.yml` (ADR-0003 Addendum D). It attaches only the fixture server and
   >   `egress-proxy`. `scanner` stays on internal networks only, so NL-1 is unchanged.
   > - **`/api/health`** doesn't report test mode; the contract is unchanged.
   >
   > **Refused in production.** Each layer fails closed on its own:
   > - every service exits non-zero at startup if `ACCESSLENS_TEST_MODE=true` and
   >   `SCAN_ENABLED=true` are both set;
   > - `scanner` and `egress-proxy` also require `NODE_ENV=test` for any `ACCESSLENS_TEST_*`
   >   variable, as R13 already required for the allowlist;
   > - `web` exits if the allowlist or fixture subnet is set without test mode;
   > - T187 (`check-scan-enable.mjs`) refuses to approve a host whose environment has **any**
   >   `ACCESSLENS_TEST_*` variable;
   > - G1 (T062) asserts that no production-config container has any `ACCESSLENS_TEST_*`
   >   variable.
   >
   > **`SCAN_ENABLED` rules unchanged.** No Compose file, including `docker-compose.test.yml`,
   > may set `SCAN_ENABLED=true`. The T186 guard is extended to every `docker-compose*.yml`.
   >
   > *Validation*: tasks T189–T197 plus dated notes on the affected tasks. This amendment doesn't
   > change any gate's status. G1 is not passed, and `SCAN_ENABLED` stays `false`.

## Consequences

### Positive

- **Defense in depth with independent layers.** Exploiting SSRF would need a proxy logic bug
  **and** a host firewall gap, or a browser escape **and** a Docker network escape. A Chromium
  flag regression alone becomes harmless because NL-1 is enforced by Docker, not by flags.
- The proxy runs in a container holding only `PROXY_CONTROL_TOKEN` (no AI or signing
  secrets) and no access to the web/API process, which limits the blast radius of a proxy
  compromise.
- Running sandboxed as non-root follows Playwright's own guidance for untrusted sites. Avoiding
  `--ipc=host` keeps the host IPC namespace closed.
- Each control has an automated test, satisfying constitution III and VI, and G1 is checkable in
  CI and at deploy.
- The scanner, web, and proxy can be reasoned about and replaced independently. Swapping the
  proxy implementation later doesn't touch the scanner.

### Negative

- **One more container** (`egress-proxy`) and a small control channel for per-audit accounting.
  More moving parts than a single-process proxy (Complexity Tracking entry required).
- **Host coupling**: NL-2 depends on host firewall rules, so live scanning can't run on most
  managed container platforms. Operators must maintain persistent firewall rules, and Docker
  doesn't document their persistence.
- **IPv6 targets aren't supported** for scanning (IPv4-only egress); IPv6-only sites fail with
  `TARGET_UNREACHABLE`.
- The seccomp profile allows user-namespace cloning (needed for Chromium's sandbox), which
  widens the kernel attack surface slightly compared with Docker's default profile.
- Without `--ipc=host`, Chromium may hit shared-memory limits on heavy pages. `shm_size` must be
  tuned, and crashes map to `SCANNER_FAILURE`.
- **Constitution wording gap**: Principle III says redirects and subrequests are re-validated
  "via request interception". This ADR enforces that at the network/proxy layer instead, which
  meets the intent (it is stronger than in-browser interception), but a literal reading differs.
  A PATCH amendment to the constitution is recommended; it isn't made here.
- Binding `web` only to its `public` address depends on how Next.js standalone binds and on
  stable container addressing. This must be proven at M2; if it can't be, the fallback is to
  move scanner control onto a separate network or reverse the control connection (a superseding
  ADR).

## Alternatives Considered

| Alternative cluster | NL-1 | NL-2 | Why rejected |
|---|---|---|---|
| **B-only**: proxy inside the scanner container (original R3 design) + host `DOCKER-USER` rules | No — the browser has a direct route; bypass prevention rests on Chromium flags | Yes | Fails the R3 requirement that flags are not the only barrier |
| **A-only**: separate proxy container on internal networks, no host firewall | Yes | No — only the proxy's application-level checks stop private egress | Fails NL-2; one proxy bug equals SSRF |
| **C**: single container with in-container iptables owner-match rules for the browser UID | Yes | Yes | Needs `NET_ADMIN`, which contradicts `cap_drop: [ALL]`, and a compromised container could rewrite its own rules |
| **Off-the-shelf egress proxy** (e.g., Squid or a dedicated SSRF-filtering proxy) in the `egress-proxy` slot | Same as chosen | Same as chosen | Viable; deferred. Per-audit byte/request accounting and the TypeScript test harness favor the small custom proxy for the MVP. Can replace it later without changing this topology |
| **MicroVM / gVisor per scan** | Yes | Yes (with host policy) | Strongest isolation but heavy operations and cost for a single-host MVP; candidate for a future ADR if scanning is opened widely |
| **Playwright image defaults**: root, `--no-sandbox`, `--ipc=host` | — | — | Explicitly discouraged by Playwright for untrusted sites; disables the sandbox and shares host IPC |

## References

- Feature Spec: [specs/001-accesslens-mvp/spec.md](../../specs/001-accesslens-mvp/spec.md) (FR-001–FR-008, Constitution-Mandated Requirements)
- Implementation Plan: [specs/001-accesslens-mvp/plan.md](../../specs/001-accesslens-mvp/plan.md) (Delivery Order M2/G1, Open Decisions OD-1/OD-2/OD-5, Complexity Tracking)
- Research: [specs/001-accesslens-mvp/research.md](../../specs/001-accesslens-mvp/research.md) (R3, R4, R12, R13)
- Contracts: [specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml](../../specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml)
- Constitution: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) Principles III, IV, VI, VIII
- External: Playwright Docker docs (https://playwright.dev/docs/docker); Docker packet filtering and `DOCKER-USER` (https://docs.docker.com/engine/network/firewall-iptables/); Compose networks (https://docs.docker.com/reference/compose-file/networks/) — all checked 2026-10-22
- Related ADRs: [ADR-0002](./0002-stateless-server-signed-evidence.md) (keeps the signing key in `web` only); [ADR-0003](./0003-stack-and-deployment.md) (adopts the hosting constraint in Decision §5)
- Evaluator Evidence: [history/prompts/001-accesslens-mvp/6-adr-scanner-isolation-egress.misc.prompt.md](../prompts/001-accesslens-mvp/6-adr-scanner-isolation-egress.misc.prompt.md)
