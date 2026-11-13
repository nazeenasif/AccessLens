# Research: AccessLens MVP

**Feature**: `001-accesslens-mvp` | **Date**: 2026-10-21 (reconciled 2026-10-21) | **Plan**: [plan.md](./plan.md)

Versions were checked on 2026-10-21 against the npm registry and the local toolchain (Node
v24.18.0, npm 11.6.2, Docker 29.2.0, Compose v5.0.2). OpenRouter behavior was checked against
openrouter.ai docs (structured outputs, API overview, errors, provider routing) on the same date.
The axe-core rule and tag inventory in R2 was read statically from the published
`axe-core@4.14.0` tarball (`axe.js` rule metadata and the `ruleShouldRun`/`matchTags` source).
Exact versions are pinned in lockfiles at implementation.

Open decisions that this research does **not** settle are listed in
[plan.md → Open Decisions](./plan.md#open-decisions) and are marked **OPEN** below.

---

## R1. Application stack

- **Decision**: TypeScript everywhere. Next.js 16.4 (App Router, `runtime = "nodejs"` route
  handlers, `output: "standalone"`), React 19.3, Tailwind CSS 4.3, Radix UI primitives for
  accessible widgets. npm workspaces monorepo with four workspaces: `apps/web`,
  `services/scanner`, `services/egress-proxy`, `packages/shared` (ADR-0003; topology per
  ADR-0001).
- **Rationale**: Chosen by the stakeholder. Playwright and `@axe-core/playwright` have
  first-class Node support. Shared Zod schemas give one source of truth for findings across the
  scanner, the API, and the UI (constitution Principles I and VIII).
- **Alternatives**: Vite + Fastify (two servers, no extra benefit); Python FastAPI (two
  languages, no shared types).

## R2. Scan engine and WCAG tag selection

- **Decision**: Playwright 1.64 (Chromium only) with `@axe-core/playwright` 4.14 /
  `axe-core` **4.14.0**, run with `withTags([...])` (axe `runOnly: { type: "tag" }`) and exactly
  these tags:

  | Tag | Meaning | Rules that run in axe-core 4.14.0 |
  |---|---|---|
  | `wcag2a` | WCAG 2.0 Level A | 57 |
  | `wcag2aa` | WCAG 2.0 Level AA | 3 (`color-contrast`, `meta-viewport`, `valid-lang`) |
  | `wcag21a` | WCAG 2.1 Level A | 1 (`label-content-name-mismatch`) |
  | `wcag21aa` | WCAG 2.1 Level AA | 2 (`autocomplete-valid`, `avoid-inline-spacing`) |
  | `wcag22aa` | WCAG 2.2 Level AA | 1 (`target-size`, SC 2.5.8) |
  | `best-practice` | axe best practices (not WCAG requirements) | 27 |

  In total, 91 of the 105 rules in axe-core 4.14.0 run.

- **Verified tag facts (axe-core 4.14.0)**:
  - **`wcag22a` has no rules.** The new WCAG 2.2 Level A criteria are not automated by axe.
    The tag is therefore not selected, and the limitations statement covers this gap.
  - **`target-size` is `enabled: false` by default but still runs.** axe's `matchTags` runs any
    rule whose tag is selected, regardless of `enabled`. `target-size` is the only automated
    WCAG 2.2 coverage, so it is included deliberately; fixture test F-22AA proves it runs.
  - **Excluded despite a selected tag.** axe's default `tagExclude` removes rules tagged
    `experimental` or `deprecated` unless those tags are selected. AccessLens does not select
    them, so these rules don't run:
    - `css-orientation-lock` (`wcag21aa`, experimental);
    - `p-as-heading`, `td-has-header`, and `table-fake-caption` (`wcag2a`, experimental);
    - `aria-roledescription` and `audio-caption` (`wcag2a`, deprecated);
    - `focus-order-semantics` and `hidden-content` (`best-practice`, experimental);
    - `landmark-complementary-is-top-level` (`best-practice`, deprecated).
  - **Not selected**: the AAA rules (`color-contrast-enhanced`, `identical-links-same-purpose`,
    `meta-refresh-no-exceptions`) and the obsolete WCAG 2.0 Parsing rules (`duplicate-id`,
    `duplicate-id-active`, tagged `wcag2a-obsolete`).
  - **No 4.14.0 rule carries both `best-practice` and a WCAG level tag.**

- **Classification**:
  - `violations` → **detected violation**; `incomplete` → **needs manual review**.
  - A finding is `isBestPractice = true` when its rule's tags include `best-practice` and no
    WCAG level tag. Best-practice findings are labelled "Best practice — not a WCAG requirement"
    and filterable separately (spec FR-010a).
  - WCAG criteria come from `wcagNNN`/`wcagNNNN` tags: the first digit is the principle, the
    second the guideline, the rest the criterion (`wcag1410` → 1.4.10).
  - `passes` and `inapplicable` results are counted but not stored per node.
- **Version guard**: a committed rule-inventory snapshot
  (`fixtures/axe/rule-inventory.4.14.0.json`) lists the 91 effective rule IDs and their tags.
  Test F-INV compares `axe.getRules(selectedTags)` filtered by `tagExclude` against it, so any
  axe upgrade that changes coverage fails CI until the snapshot and this section are updated.
- **Fixture coverage tests**: required, in `fixtures/pages/wcag/`, each with
  `*.expected.json`.

  | Test | Page seeds | Must report | Must NOT report |
  |---|---|---|---|
  | F-20A | missing `alt`, unlabeled input, empty button, empty link, missing `lang`, missing `<title>` | `image-alt`, `label`, `button-name`, `link-name`, `html-has-lang`, `document-title` | — |
  | F-20AA | low-contrast text, `user-scalable=no`, invalid `lang` on an element | `color-contrast`, `meta-viewport`, `valid-lang` | `color-contrast-enhanced` (AAA) |
  | F-21A | visible label not in accessible name | `label-content-name-mismatch` | — |
  | F-21AA | invalid `autocomplete`, `!important` inline letter-spacing | `autocomplete-valid`, `avoid-inline-spacing` | `css-orientation-lock` (experimental) |
  | F-22AA | 10×10 px adjacent targets | `target-size` | — |
  | F-BP | no `<main>`, content outside landmarks, skipped heading level | `landmark-one-main`, `region`, `heading-order`, all with `isBestPractice=true`, `wcag=[]` | — |
  | F-OBS | duplicate `id` | — | `duplicate-id` (obsolete) |
  | F-CLEAN | accessible page | zero violations | — |
  | F-INV | — | effective rule inventory equals the snapshot | — |

- **Rationale**: Stakeholder-mandated engine. Every claim about coverage is pinned to a version
  and backed by a test, which is constitution Principles I, II, and VI.
- **Alternatives**: `runOnly: { type: "rule" }` with an explicit rule list (more brittle across
  upgrades); Pa11y / Lighthouse (wrappers, add indirection).

## R3. SSRF and egress control (FR-001–FR-005, constitution III)

**Problem**: Request interception (`page.route`) can check URLs, but Chromium does its own DNS
resolution. A check-then-load approach is therefore open to DNS rebinding, and IP-literal or
loopback requests can bypass it.

**Decision: [ADR-0001](../../history/adr/0001-scanner-isolation-and-egress-control.md)
(Accepted 2026-10-22)**. The design has three containers (`web`, `scanner`, `egress-proxy`) on
segmented networks. The rest of this section summarizes it; the ADR is authoritative.

**Application layer — `egress-proxy` container** (`services/egress-proxy`, `node:http` +
`node:net`). It is the only scan-path component with an outbound route. The proxy:
1. requires **per-audit credentials** registered by the scanner (unregistered or revoked
   credentials get 407) and attributes requests and bytes to the audit;
2. accepts only `CONNECT host:443` and plain HTTP to port 80;
3. resolves DNS itself, **IPv4 only** (`dns.lookup`, `family: 4`, `all: true`), because the
   `outbound` network has `enable_ipv6: false`;
4. rejects the request if **any** resolved address is non-public, classified with `ipaddr.js`
   2.5 (`range() !== "unicast"`), using the same range list as the NL-2 firewall rules (a sync
   unit test enforces this);
   *Note 2026-11-13:* superseded by [ADR-0001 Amendment 3](../../history/adr/0001-scanner-isolation-and-egress-control.md).
   `NON_PUBLIC_IPV4_RANGES` is the single source of truth for the proxy and the firewall,
   ipaddr.js parses only, and the list gained four ranges ipaddr.js treats as non-unicast;
5. connects to the **validated IP itself**, never re-resolving, which defeats rebinding;
6. reports per-audit cap breaches and blocked hosts to the scanner through a control endpoint
   authenticated with `PROXY_CONTROL_TOKEN` (R5).
   *Note 2026-11-13:* in test mode only (ADR-0001 Amendment 4; never in production), the proxy
   serves only `ACCESSLENS_TEST_ALLOWLIST` hosts whose answers lie in `172.30.50.0/24`, and
   refuses every other host, public ones included.

**Browser launch** (`scanner` container, defense in depth on top of NL-1):
- the per-context `proxy: { server: "http://<egress-proxy fixed IP>:<port>", username,
  password }`;
- `--proxy-bypass-list=<-loopback>`;
- `--host-resolver-rules="MAP * ~NOTFOUND"` (the proxy is addressed by IP, so Chromium needs no
  DNS);
- `--disable-quic`;
- `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`.

Before anything launches, a URL policy check rejects the URL on scheme, credentials,
non-default port, length, or IP-literal grounds. The web app runs the same policy as a fast
pre-check; the scanner re-runs it.

Redirects: main-frame redirects are counted through `request.redirectedFrom()` (max 10). Each hop
passes through the proxy, so a prohibited hop fails there and maps to `BLOCKED_REDIRECT` when it
is on the main-frame navigation chain.

**Network layer (required for any deployment with `SCAN_ENABLED=true`)**: Chromium flags and
proxy logic are not accepted as the only barrier.
- **NL-1 Proxy-bypass prevention**: `scanner` is attached **only** to Docker `internal: true`
  networks (`scan-ctl` with `web`, `scan-egress` with `egress-proxy`). `web` binds its listener
  only to its `public`-network address. The browser therefore has no route except the proxy.
- **NL-2 Egress range denial**: host `DOCKER-USER` rules (plus an `INPUT` rule for the host's
  own addresses) drop traffic from the `outbound` subnet to every non-public IPv4 range listed
  in ADR-0001 §3 and to the Docker bridge subnets. IPv6 egress is removed by
  `enable_ipv6: false`. The rules must be installed persistently and re-verified after every
  daemon or host restart, because Docker doesn't document their persistence.
  **Rule order and scoping per ADR-0001 Amendment 1 (Accepted 2026-10-23, OD-12)**:
  - drops are inserted first and match regardless of connection state;
  - there is no broad ESTABLISHED/RELATED accept;
  - every rule is scoped to `-s <outbound subnet>` and tagged `accesslens-nl2`;
  - the `INPUT` drop sits at position 1;
  - the conntrack flush covers only the `outbound` subnet;
  - conntrack helpers are off;
  - the install script fails closed on a non-iptables Docker firewall backend.

  The packet-path table is in ADR-0001.
- **Consequence for hosting**: NL-2 needs control of the host firewall. Live scanning may only
  run on a Linux VM/VPS where the operator controls Docker Engine and iptables. Managed
  platforms, and local Docker Desktop installs that can't apply and verify these rules, may run
  AccessLens only with `SCAN_ENABLED=false`.
- **DNS leakage check**: whether Docker's embedded DNS resolves external names for `scanner` is
  unverified. G1 tests it, and if it resolves, M2 must disable it before G1 can pass (ADR-0001
  §2).

- **Rationale**: Three independent layers (proxy IP validation, Docker network isolation, host
  firewall), each tested on its own. A bug in any single layer doesn't make SSRF exploitable.
- **Alternatives**: see the ADR-0001 alternatives table (proxy inside the scanner,
  proxy container without a firewall, in-container iptables, off-the-shelf proxy, microVM,
  Playwright image defaults).
- **Security tests (required, gate G1 in plan; see ADR-0001 §6)**:
  - **Through the proxy**: page loads pointed at loopback (`127.0.0.1`, `[::1]`, `localhost`),
    RFC 1918, `169.254.169.254`, the `web`/`scanner`/`egress-proxy` container addresses,
    decimal/octal/hex IP encodings, IPv4-mapped IPv6, a rebinding resolver stub, public→private
    redirects, WebRTC, DNS prefetch, and a non-80/443 port.
  - **Composed stack**: a direct TCP connection from `scanner` fails; `web` on `scan-ctl` is
    refused; raw probes from `egress-proxy` to non-public ranges are dropped by the host
    firewall; 407 without credentials; the control endpoint rejects a missing token; external
    DNS from `scanner` fails; the Chromium sandbox is enabled.
  - **No control is trusted, and no gate counts as passed, without recorded execution evidence**
    from the actual Docker stack and host firewall.

## R4. Browser isolation (constitution III)

- **Decision (per ADR-0001 §1 and §4)**:
  - **`scanner` container**: built from the official Playwright image
    `mcr.microsoft.com/playwright:v1.64.1-noble`, pinned by digest, with the image's Node and
    package managers replaced by the exact Node 24.22.1 binary (ADR-0003 Addendum C). Runtime
    settings:
    - Chromium runs as the non-root `pwuser` with Playwright's `seccomp_profile.json` and is
      launched with `chromiumSandbox: true`, so Chromium's sandbox stays **enabled** (Playwright
      leaves it off otherwise);
    - `init: true`, and **no `--ipc=host`** (shared memory is raised through `shm_size`
      instead; a provisional value is set at M2 and the final value is measured at M3 against the
      benchmark fixtures);
    - `read_only: true` rootfs with a `tmpfs` for `/tmp`;
    - `cap_drop: [ALL]`, `cap_add: [SYS_CHROOT]` (only this one; the seccomp profile allows
      `chroot`, which the sandbox needs, only with it; `pwuser` holds it in no effective set; ADR-0001
      Amendment 2), `no-new-privileges`;
    - limits of `mem_limit: 1.5g`, `cpus: 1.5`, `pids_limit: 512`;
    - no host volumes and **no published ports**;
    - networks `scan-ctl` and `scan-egress` only, both `internal: true`.
  - **Scanner secrets**: only `SCANNER_INTERNAL_TOKEN` and `PROXY_CONTROL_TOKEN`.
  - **`egress-proxy` container**: a minimal Node image with no browser, and the same baseline
    hardening (non-root, read-only rootfs, `cap_drop: [ALL]`, `no-new-privileges`, no published
    ports). Its resource limits are set at M2. It holds only `PROXY_CONTROL_TOKEN`.
  - Neither container ever receives `OPENROUTER_*` or `EVIDENCE_SIGNING_*` (asserted by test).
  - **One browser process per concurrency slot** (`SCAN_CONCURRENCY`, default 2), so recycling
    or killing one browser after a timeout or crash can't affect another slot's audit.
  - **Per audit**: a fresh `browser.newContext()` with per-audit proxy credentials,
    `acceptDownloads: false`, no permissions, `serviceWorkers: "block"`, and a viewport of
    1280×800. Dialogs are dismissed and popups closed, and the context is closed in `finally`.
    Each browser is recycled every 50 audits.
- **Page controls (constitution III "block downloads, popups, and permission prompts", "maximum
  pages per audit", "no shared cookies/storage"; spec FR-006, FR-008)**. Each control has an
  automated security test in M3:

  | Control | Mechanism | Effect on audit |
  |---|---|---|
  | Popups / new windows (`window.open`, `target=_blank` auto-clicks) | `context.on("page")` closes any page other than the audited one | Audit continues; popup count goes in `limitations` |
  | Dialogs (`alert`, `confirm`, `prompt`, `beforeunload`) | `page.on("dialog")` → `dismiss()` | Audit continues |
  | Permission prompts (geolocation, notifications, camera/mic, clipboard, etc.) | Context created with `permissions: []`; no grants | Requests are denied; audit continues |
  | Downloads | `acceptDownloads: false`. A main-document download response → `NOT_HTML` (R5) | Subresource download refused |
  | Navigation away from the audited page (script `location` changes, meta refresh, auto form submit) | After the initial navigation (including its redirect chain) settles, any further **main-frame document request** is aborted through `page.route` | Audit continues on the original document; "page attempted to navigate away" goes in `limitations` |
  | Form submission | Same main-frame navigation block; the scanner never interacts with forms | No submission reaches the network |
  | State between audits | Fresh `newContext()` per audit; no `storageState`; the context is closed in `finally` | A cookie or `localStorage` value set in audit N is absent in audit N+1 (tested) |

- **Sandbox fallback**: `--no-sandbox` is never used with `SCAN_ENABLED=true`. If the sandbox
  can't start on a host, live scanning stays disabled there until a superseding ADR.
- **Sandbox verification**: a launch alone isn't enough. The check launches with
  `chromiumSandbox: true` under the real Compose service, renders a page, and confirms the
  renderer is in a nested PID namespace and no process has a sandbox-disabling flag
  (`tests/config/scanner-sandbox.test.ts`). The Docker Desktop (WSL2) result isn't production-host
  evidence: Ubuntu 24.04 can restrict unprivileged user namespaces through AppArmor, so G1 repeats
  the check on the actual host and records that state (T062, T066).
- **Alternatives**: see ADR-0001 (the browser in the web process violates III; a microVM per scan
  is a future ADR).

## R5. Audit request flow, progress, and partial results (FR-007, FR-007a, FR-015)

- **Decision (stream)**: `POST /api/audits` streams **NDJSON**: `progress` events (stages
  `validating`, `queued`, `loading`, `analyzing`), then exactly one terminal `result` or
  `error`. The web route relays the scanner's internal `POST /scan` stream. There are no job IDs
  and no server-side storage (FR-033).
- **Decision (partial vs. error)**: an audit is `complete`, `partial`, or produces an `error`.
  - **`result` with `status: "partial"`**: a recoverable interruption happened, **and** axe
    finished on a page document. The findings are valid for what was evaluated. The browser
    shows, labels, and saves the audit locally.
  - **`error`**: no valid axe results exist. No audit object is returned or saved.

  | Interruption | When it happens | Valid results? | Outcome |
  |---|---|---|---|
  | Navigation time limit | Document committed but `load` not reached within `SCAN_NAV_TIMEOUT_MS` | axe runs on the current DOM | `partial` + `navigation_timeout` |
  | Navigation time limit | No document committed | No | `error` `NAVIGATION_TIMEOUT` |
  | Request cap / byte cap | After a document committed: further requests are refused and axe runs | Yes | `partial` + `request_limit_reached` / `byte_limit_reached` |
  | Request cap / byte cap | Before a document committed | No | `error` `LIMIT_EXCEEDED` |
  | Cross-origin/blocked frame not testable | axe `frame-tested` reports it | Yes | `partial` + `frames_not_inspected` |
  | Subresource blocked by destination policy (FR-003) | Any time | Yes | `partial` + `subresources_blocked`; hosts in `blockedRequests` |
  | DOM element limit (R15) | Measured before axe runs | No (axe isn't run) | `error` `DOM_TOO_LARGE` |
  | Analysis budget / total audit time limit | axe has not finished | No | `error` `AUDIT_TIMEOUT` |
  | Prohibited main-frame redirect / too many redirects | — | No | `error` `BLOCKED_REDIRECT` / `TOO_MANY_REDIRECTS` |
  | Browser crash / axe exception | — | No | `error` `SCANNER_FAILURE` |
  | Host doesn't resolve (NXDOMAIN), connection refused or reset, TLS failure, IPv6-only host | Before a document commits | No | `error` `TARGET_UNREACHABLE` |
  | Main document final status 4xx/5xx | After redirects | No (not audited) | `error` `TARGET_HTTP_ERROR` with `detail.httpStatus` |
  | Main document isn't HTML (`Content-Type` other than `text/html` / `application/xhtml+xml`), or is served as a download | After redirects | No | `error` `NOT_HTML` |

  Rationale for not auditing 4xx/5xx pages: their findings would describe the error page, not the
  site the developer intended to audit. Reporting the status is more honest (constitution II).

  Several reasons can apply together. `partialReasons` is non-empty if and only if
  `status === "partial"`.

- **Independence from AI**: audit `status` and `partialReasons` are set **only** by the scanner.
  AI availability, Explain failures, and AI budget never change them (spec FR-007a).
- **Time budget (resolves OD-3)**: the clock `t0` starts when the audit acquires a scanner slot;
  queue wait is reported through `queued` progress and is not part of the budget.

  | Phase | Deadline | On expiry |
  |---|---|---|
  | Context setup + navigation | `t0 + min(SCAN_NAV_TIMEOUT_MS (30 s), SCAN_TOTAL_TIMEOUT_MS − SCAN_ANALYSIS_BUDGET_MS − SCAN_TEARDOWN_MS)` = `t0 + 30 s` with defaults | Document committed → continue (`navigation_timeout` reason); none → `error NAVIGATION_TIMEOUT` |
  | DOM measurement (R15) | ≤ 2 s, inside the analysis budget | Over the limit, or measurement not finished in 2 s → `error DOM_TOO_LARGE` |
  | **axe analysis** | **`SCAN_ANALYSIS_BUDGET_MS` = 20 s** after navigation ends; never later than `t0 + SCAN_TOTAL_TIMEOUT_MS − SCAN_TEARDOWN_MS` | `error AUDIT_TIMEOUT`. axe returns results only when the run completes, so there are no valid findings and no partial audit. |
  | Teardown | `SCAN_TEARDOWN_MS` = 5 s to close the context | If the context doesn't close in time, the slot's browser process is killed and relaunched (other slots unaffected) |
  | Hard backstop | `t0 + SCAN_TOTAL_TIMEOUT_MS` (60 s) | Terminal event already sent, or `error AUDIT_TIMEOUT` |

  With the defaults the phases fit as 30 + 20 + 5 = 55 s ≤ 60 s. Configuration in which
  `nav + analysis + teardown > total` is rejected at scanner startup.
  - **Bounded behavior**: an analysis timeout closes the page context, which stops in-page axe
    execution. The terminal `error` is emitted before teardown starts. No audit object exists
    for an analysis timeout.
  - **Benchmark requirements (exit criterion for M3/G2)**: run in the real `scanner` container
    with production resource limits, 20 runs per fixture:
    - fixtures of about 1k, 10k, 25k, and 50k elements (`fixtures/pages/benchmark/`), plus a
      contrast-heavy page and a multi-frame page;
    - record p50 and p95 axe duration in `fixtures/benchmark/results-<axe-version>.json`;
    - **acceptance**: p95 at the 50k-element fixture ≤ **15 s**, which is 25% headroom under the
      20 s budget;
    - if the target is missed, either lower `SCAN_MAX_DOM_ELEMENTS` or raise the budget, through
      a plan amendment. Defaults are not silently changed.
- **Verify in integration tests**:
  - the `frame-tested` → `frames_not_inspected` mapping;
  - axe running after a navigation `TimeoutError` on a committed document;
  - refusing requests after a cap without aborting axe.
- **Alternatives**: a job ID plus polling (needs server state); `EventSource` (GET-only, so the
  URL would end up in logs); returning partial data inside the `error` event (rejected: two
  shapes for one outcome).

## R6. Explain authenticity without server storage (FR-022a)

**Goal**: the AI prompt is built **only** from values the server signed, and the server never
trusts any client-supplied field it didn't sign.

- **Signed payload (`SignedEvidenceV1`)**: created by the **web** service for each detected
  violation once the scanner result arrives. It contains **every** value the prompt uses, plus
  identity and time, and nothing else:

  ```text
  {
    v: 1,
    kid: string,                  // signing-key id (see rotation)
    auditId: string (uuid),
    findingId: string,
    kind: "violation",
    ruleId: string,
    impact: "critical"|"serious"|"moderate"|"minor",
    help: string (≤ 500),
    description: string (≤ 1000),
    wcag: string[] (≤ 10),
    isBestPractice: boolean,
    finalUrl: string (≤ 2048),
    nodes: [{ selector: string (≤ 500), html: string (≤ 501), failureSummary: string (≤ 1001) }] (1..5),
                                  // html/failureSummary copied from the stored node (500/1000 + "…")
    nodesOmitted: integer ≥ 0,     // total nodes − nodes included
    issuedAt: string (RFC 3339 UTC, second precision, "Z")
  }
  ```

- **Bounded reduction (server-side, at signing)**: the stored Finding keeps up to 25 nodes, but
  the evidence takes nodes in axe order:
  1. take at most **5** nodes;
  2. truncate `selector` to 500 chars;
  3. drop trailing nodes until the sum of `selector + html + failureSummary` across nodes is
     ≤ **6 000** chars, always keeping at least one node, whose `failureSummary` is truncated
     further if needed to fit;
  4. set `nodesOmitted` to the total node count (including `omittedNodeCount`) minus the nodes
     included;
  5. truncate `help` to 500 and `description` to 1000 chars (axe text is normally far shorter;
     the cap bounds request size).

  The function is deterministic and unit-tested. The public contract's `maxItems: 5` on evidence
  nodes therefore matches the provider limit exactly.
- **Canonical serialization**: the RFC 8785 (JCS) subset.
  - Object keys sorted by UTF-16 code units, with no insignificant whitespace.
  - Strings are serialized as `JSON.stringify` does, which is JCS-conformant for strings.
  - Only strings, booleans, safe integers, arrays, and objects are allowed. The serializer
    **throws** on `null`, `undefined`, floats, or any other type.
  - No Unicode normalization is applied.
  - Array order is significant.

  It lives in `packages/shared/src/canonical-json.ts`, tested against the JCS examples that fall
  in this subset.
- **MAC**: `HMAC-SHA256(key[kid], "accesslens.evidence.v1\n" + canonical(evidence))`, where the
  prefix gives domain separation. The output is base64url without padding (43 chars) and is sent
  as `evidenceSignature`.
- **Verification order in `POST /api/explain`**: the AI prompt is built only after step 7.
  1. Body ≤ 64 KB, else `PAYLOAD_TOO_LARGE`.
  2. Per-IP Explain rate limit, which counts every attempt, else `EXPLAIN_RATE_LIMITED`.
  3. Strict Zod parse of `{ evidence, evidenceSignature }`; unknown keys are rejected, else
     `INVALID_REQUEST`.
  4. `evidence.v === 1`, and `kid` is a currently accepted key, else `EVIDENCE_INVALID`.
  5. Recompute the MAC over `canonical(evidence)` and compare with `timingSafeEqual`, else
     `EVIDENCE_INVALID`.
  6. `issuedAt ≤ now + 60 s` (skew) and `now − issuedAt ≤ 7 days`, else `EVIDENCE_EXPIRED`
     (or `EVIDENCE_INVALID` if future-dated).
  7. **Per-audit cap** (constitution IX, FR-021): at most `AI_EXPLAINS_PER_AUDIT` (default
     **25**) verified Explain calls per verified `auditId`, else `AUDIT_AI_LIMIT_REACHED` (429).
     - The counter is in-memory, keyed by `auditId`, and each entry expires with its evidence
       (7 days).
     - At most 50 000 tracked audits; when full, the oldest entry is evicted, which resets that
       audit's count. This is accepted and bounded because the per-IP and daily caps still
       apply.
     - The counter resets on `web` restart; OD-6 governs persistence.
     - Per-audit AI spend is therefore bounded by 25 × (≤ 6 000 chars of evidence plus the system
       prompt, and ≤ 900 output tokens).
  8. Global daily AI cap, else `AI_BUDGET_EXHAUSTED`. The cap is consumed only by verified
     requests.
  9. Build `ExplainInput` from the verified `evidence` object only, then call the provider.
- **Expiry alignment**: `issuedAt ≥ completedAt`, and local `expiresAt = completedAt + 7 d`, so
  evidence never expires before its locally stored audit.
- **Replay**: re-sending valid evidence within its window is allowed (the user may retry
  Explain). It is bounded by the per-IP and daily caps and documented as accepted.
- **Key rotation (retained)**:
  - Keys: `EVIDENCE_SIGNING_SECRET` (current, ≥ 32 random bytes) and the optional
    `EVIDENCE_SIGNING_SECRET_PREVIOUS`.
  - `kid` = the first 8 hex characters of `SHA-256(key)`.
  - Signing always uses the current key; verification accepts current or previous by `kid`.
  - Procedure: set the new value as current and move the old value to previous. Remove previous
    **after 7 days**, when everything it signed has expired.
  - Rotating without keeping previous makes existing evidence `EVIDENCE_INVALID`. Audits stay
    viewable, and the UI says "Re-audit to enable explanations".
- **Tampering tests (required, gate G3 in plan)**: each case must be refused **before any
  provider call**, asserted by the provider mock receiving zero calls. The cases are:
  - modifying each top-level field, including `help`, `description`, `finalUrl`, `impact`,
    `ruleId`, `findingId`, `auditId`, `issuedAt`, `kid`, `v`, `isBestPractice`, `wcag`, and
    `nodesOmitted`;
  - modifying each nested node field;
  - adding a field, at top level or inside a node;
  - removing a field;
  - reordering, adding, or removing nodes;
  - a Unicode-equivalent but byte-different string;
  - a truncated or wrong-length signature;
  - a valid signature from another finding;
  - a removed previous key;
  - expired and future-dated evidence;
  - `v: 2`.

  **Positive cases**: reordered object keys still verify, and a previous-key signature still
  verifies.
- **Alternatives**: server-side evidence cache (breaks no-persistence); re-scanning on Explain
  (slow, and the page may have changed); signing only some fields (rejected: it's the gap this
  section closes); JWT/JWS (more surface than an HMAC over a fixed canonical form).

## R7. AI provider (Principle V, FR-016–FR-022)

- **Decision**: A minimal interface in `apps/web/src/server/ai/provider.ts` (see
  [contracts/ai-provider.ts](./contracts/ai-provider.ts)), with one method `explainFinding()`
  that takes an `ExplainInput` derived only from verified `SignedEvidenceV1` (R6) and returns a
  typed `Result`. Generation is **on demand only** (one finding per request, FR-022). The
  OpenRouter adapter calls `POST https://openrouter.ai/api/v1/chat/completions` with:
  - `Authorization: Bearer ${OPENROUTER_API_KEY}`;
  - `model: OPENROUTER_MODEL`;
  - `max_tokens`;
  - `response_format: { type: "json_schema", json_schema: { name: "finding_explanation",
    strict: true, schema } }`;
  - `provider: { require_parameters: true, data_collection: "deny" }`;
  - the attribution headers `HTTP-Referer` and `X-OpenRouter-Title`.

  The adapter reads `choices[0].message.content` and `usage.*`. The output is **always**
  re-validated with Zod, because providers vary in how strictly they enforce schemas and errors
  can arrive with HTTP 200 and an `error` body field.
- **Error mapping**: 429/503 → `rate_limited` / `unavailable`, retried at most once and only if
  `Retry-After` ≤ 5 s; 402 → `quota_exhausted` (not retried); 401/403 → `config_error`
  (logged, user sees "unavailable"); 408 and the client's own timeout → `timeout`; 502 →
  `unavailable`; an invalid or mismatching body → `invalid_output`.
- **Gemini later (out of MVP scope)**: add `gemini.ts` implementing the same interface and set
  `AI_PROVIDER=gemini`. The scanner, finding model, and UI don't change.
- **Prompt-injection posture**:
  - The system prompt states that the evidence is untrusted data, not instructions.
  - Evidence is sent inside a JSON object, never mixed into the instructions.
  - The output schema has no severity field.
  - `findingId` and `ruleId` must echo the request exactly, or the output is discarded.

## R8. Browser-local storage (FR-033–FR-038)

- **Decision**: IndexedDB through `idb` 8.0, with database `accesslens` v1 and object stores
  `audits` and `aiAnnotations`.
  - **Retention**: 7 days. Every app load runs a purge of records whose `expiresAt` has passed.
  - **Clear history**: a confirmed action that deletes all records.
  - **Fallback**: if storage throws (private mode, quota), the app falls back to memory and shows
    the "history not saved" notice.
  - Partial audits are saved like complete ones (FR-007a).
- **Alternatives**: localStorage (~5 MB, synchronous, could overflow).

## R9. Export (FR-026, FR-026a)

- **Decision**: The export is built **in the browser** from the stored audit, as one
  self-contained HTML file.
  - A React `ReportDocument` component is rendered with `renderToStaticMarkup` and wrapped in an
    HTML shell.
  - The shell has inline CSS, no `<script>` tags, no external URLs except text links to axe
    guidance, and a CSP
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`.
  - The file is downloaded via a Blob. All page-derived strings go through React escaping.
  - The **accessible print stylesheet** (`@media print`):
    - keeps a logical heading order;
    - conveys severity and status by text, not color alone;
    - wraps code blocks instead of clipping them;
    - avoids page breaks inside a finding where possible;
    - prints link URLs after link text.

    PDF is produced by the browser's "Save as PDF". Partial audits carry their partial label and
    reasons into the report.
- **Rationale**: Needs no server and no PDF engine. The CSP makes any injected markup inert.

## R10. Comparison (FR-024, FR-025)

- **Decision**: The comparison unit is an **occurrence** = (`kind`, `ruleId`, normalized
  selector). It is a pure function in `packages/shared/src/compare.ts` that sorts occurrences
  into `remaining`, `noLongerDetected`, and `new`, and the UI groups them back by rule.
  Comparability warnings: final URLs differ, either audit is `partial`, or the axe versions
  differ.

## R11. Rate limiting and identity (FR-007, FR-022)

- **Decision**: An in-memory fixed-window limiter in the web process (single host), keyed by
  client IP. The IP is taken from the socket address, or from `X-Forwarded-For` only when the
  number of trusted proxy hops is set by `TRUSTED_PROXY_HOPS` (default 0). The limiter is
  **fail-closed** if the IP can't be determined.
- **Alternatives**: Redis (extra infrastructure for one host — revisit when scaling out, ADR).

## R12. Concrete limits (constitution IX — values for this plan)

| Limit | Value | Env override |
|---|---|---|
| Max URL length | 2048 chars | — |
| Allowed ports | 80, 443 | — |
| Navigation timeout | 30 s | `SCAN_NAV_TIMEOUT_MS` |
| Total audit timeout | 60 s | `SCAN_TOTAL_TIMEOUT_MS` |
| axe analysis budget (OD-3, R5) | 20 s; benchmark p95 at 50k elements ≤ 15 s | `SCAN_ANALYSIS_BUDGET_MS` |
| Context teardown bound | 5 s, then kill and relaunch that slot's browser | `SCAN_TEARDOWN_MS` |
| Max DOM elements processed (OD-4, R15) | 50 000 elements across all frames; measurement ≤ 2 s; over → `DOM_TOO_LARGE` | `SCAN_MAX_DOM_ELEMENTS` |
| Max redirects | 10 | — |
| Max bytes per audit (all responses) | 15 MB | `SCAN_MAX_BYTES` |
| Max requests per audit | 300 | `SCAN_MAX_REQUESTS` |
| Concurrent scans / queue depth | 2 / 4 (more → `SCANNER_BUSY`) | `SCAN_CONCURRENCY`, `SCAN_QUEUE` |
| Nodes stored per finding | 25 (plus `omittedNodeCount`) | — |
| Stored markup snippet / failure summary | 500 / 1000 chars (+ "…") | — |
| Audits per IP | 5 per 10 min | `RL_AUDITS_PER_10M` |
| Explains per IP (all attempts) | 20 per 10 min | `RL_EXPLAINS_PER_10M` |
| Explains per audit (verified only) | 25 per `auditId` within the 7-day evidence window | `AI_EXPLAINS_PER_AUDIT` |
| Global AI requests per day (verified only; window resets 00:00 UTC; restart behavior per OD-6) | 500 | `AI_DAILY_REQUEST_CAP` |
| Signed evidence / AI input | ≤ 5 nodes; node text ≤ 6 000 chars; selector ≤ 500; help ≤ 500; description ≤ 1000 (R6) | — |
| AI `max_tokens` (output) | 900 | `AI_MAX_OUTPUT_TOKENS` |
| AI request timeout | 20 s, ≤ 1 retry | `AI_TIMEOUT_MS` |
| Explain request body | ≤ 64 KB | — |
| Evidence validity / clock skew | 7 days / 60 s | — |
| Local retention | 7 days | — |

## R13. Testing stack (Principle VI)

- **Decision**:
  - Vitest 5 for unit, integration, and security tests.
  - Playwright Test 1.64 for e2e, plus `@axe-core/playwright` against AccessLens's own pages
    (SC-007).
  - OpenRouter is mocked at the HTTP layer with `msw`. CI never calls live providers or live
    external sites.
  - Scanner integration tests serve fixtures from a test-only fixture server through a
    **test-only** allowlist (`EGRESS_TEST_ALLOWLIST`, honored by `egress-proxy` only when
    `NODE_ENV=test`). Both `egress-proxy` and `scanner` refuse to start outside test mode if it
    is set (security test).
    *Note 2026-11-13:* superseded by ADR-0001 Amendment 4.
    - **Names**: the allowlist is now `ACCESSLENS_TEST_ALLOWLIST`, alongside
      `ACCESSLENS_TEST_MODE` and `ACCESSLENS_TEST_FIXTURE_SUBNET` (`172.30.50.0/24`).
    - **Explicit setting**: test mode is now an explicit setting, because `web` can't rely on
      `NODE_ENV` (Next.js inlines it at build time). `scanner` and `egress-proxy` still also
      require `NODE_ENV=test`.
    - **Where it lives**: only in `docker-compose.test.yml`.
    - **Production checks**: production checks (T187, T062) assert that no `ACCESSLENS_TEST_*`
      variable exists.
  - G1 runs with production configuration: no allowlist, firewall rules applied.
  - **Required suites**, mapped to the plan gates:
    - URL policy (G0);
    - network boundary, including the NL-1, NL-2, proxy-auth, DNS-leak, and sandbox tests from
      R3 and ADR-0001 §6 (G1);
    - WCAG fixtures F-20A … F-INV from R2, interruption fixtures, the DOM-limit fixtures from
      R15, and the analysis-budget benchmark from R5 (G2);
    - evidence tampering from R6 (G3);
    - partial/error mapping from R5, including the target-response rows;
    - page controls from R4 (popups, dialogs, permissions, downloads, navigation away, form
      submission, no state between audits);
    - the per-audit AI cap from R6;
    - no server persistence (ADR-0002);
    - lifecycle and provider-call logging from R14;
    - secret leakage from R14;
    - banned wording (SC-006).
  - A gate counts as passed only with recorded execution evidence (CI run or deploy smoke-test
    log). Documentation never states a gate as passed.
- **Version note** (original text, kept for traceability): TypeScript 7.0 (native compiler) is
  current. If any tooling proves incompatible during setup, pin TypeScript 5.9.x and record it
  here (setup-time check).
- **Decision OD-9 (resolved 2026-10-23, task T005)**: pin **`typescript@5.9.3`** (exact) for
  all workspaces.
  - **Method**: an isolated probe outside the repository (a scratchpad Next.js app; no
    application code) on Node v24.18.0 and npm 11.6.2, with the exact pinned stack:
    `next@16.4.2`, `react`/`react-dom@19.3.1`, `eslint@9` + `eslint-config-next@16.4.2` +
    `typescript-eslint@8.72.0` (type-aware `recommendedTypeChecked` with `projectService`),
    `vitest@5.0.5` + `vite@8`, `@types/node@24.19.2`.
  - **tsconfig** used the strict settings planned for T006: `strict`,
    `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
  - **Checks per version**: `tsc --noEmit`; `next build` (which includes Next's TypeScript
    step); `eslint .`; `vitest run`. Then both `tsc` and `next build` were re-run with a
    planted type error, to prove type checking is active.

    | Result | 7.0.2 | 6.0.3 | 5.9.3 |
    |---|---|---|---|
    | `npm install` (normal resolution) | **ERESOLVE**: `typescript-eslint@8.72.0` peer `typescript >=4.8.4 <6.1.0`, required through `eslint-config-next@16.4.2` (`typescript-eslint@^8.56.0`) | ok | ok |
    | `tsc --noEmit` / planted error detected | ok / yes (TS2322) | ok / yes | ok / yes |
    | `next build` / planted error detected | ok / yes | ok / yes | ok / yes |
    | `eslint .` (type-aware) | **fails**: "typescript-eslint does not support TS 7.0" (forced with `--legacy-peer-deps`) | ok | ok |
    | `vitest run` | ok | ok | ok |

    The `typescript@7.0.2` package also exports only `version.cjs` and `unstable/*` APIs, not
    the classic compiler API that `typescript-eslint` loads.
  - **Why 5.9.3, not 6.0.3**: both pass. Accepted ADR-0003 defines the fallback as **5.9.x**,
    so choosing 6.0 would change an accepted decision. 6.0.3 is recorded as a verified
    alternative; moving to it needs an ADR-0003 amendment.
  - **Revisit when**: `typescript-eslint` declares support for TypeScript ≥ 7 and
    `eslint-config-next` depends on that version. Re-run this probe before changing the pin.
  - **Scope**: the probe verifies toolchain compatibility only. It isn't a project test run,
    and it doesn't pass any gate. The in-repo M0 tests (T014, T019, T023, T024, T027, T186)
    still run when M0 is implemented.

## R14. Logging and secrets (Principle IV)

- **Decision**: pino 10 structured logs, with `redact` paths for `authorization`, `*.apiKey`,
  `*.evidenceSignature`, and `req.headers.cookie`.
  - Page snippets, evidence, and AI content are never logged; only counts, durations, codes,
    token usage, and a hash of the target host are.
  - Server-only modules import `"server-only"`.
  - A CI check greps `.next/static` for secret env var names and the `sk-or-` prefix.
  - The `scanner` and `egress-proxy` environments are asserted in a test to contain no
    `OPENROUTER_*` or `EVIDENCE_SIGNING_*` variables. `PROXY_CONTROL_TOKEN` and
    `SCANNER_INTERNAL_TOKEN` are added to the redaction list.
- **Observability events (constitution Operational Constraints)**: every service uses pino with
  the same redaction set and emits these structured events, each tested to be emitted with no
  forbidden fields:
  - **scanner**: `audit.slot_acquired` (queue wait ms); `audit.navigation_done` (ms, outcome,
    redirect count); `audit.dom_measured` (count, capped flag); `audit.axe_done` (ms, finding
    counts); `audit.outcome` (status or error code, partial reasons, total ms). Each carries the
    `auditId` and the target host hash.
  - **egress-proxy**: `proxy.audit_summary` per audit (requests, bytes, blocked count, cap
    flags); `proxy.blocked` (reason, hashed host). No URLs, paths, or query strings.
  - **web**: `explain.call` (provider, model, duration ms, prompt and completion tokens, outcome or
    error kind, retry count); `explain.refused` (code); `audit.relay` (terminal code, total ms).
  - **Forbidden in all logs**: page HTML/snippets, evidence, AI output, full target URLs,
    secrets, and client IPs beyond what rate limiting needs in memory.

## R15. DOM size limit (resolves OD-4; constitution III "maximum DOM/node count processed")

- **Limit**: `SCAN_MAX_DOM_ELEMENTS`, default **50 000**, configurable. Values below 1 000 or
  above 200 000 are rejected at startup. Any change to the default must be backed by the R5
  benchmark.
- **Measurement**:
  - **When**: once, after the navigation phase ends (on `load`, or on navigation timeout with a
    committed document) and **before** axe runs.
  - **What is counted**: Element nodes in every frame Playwright can evaluate (main frame plus
    child frames, same- or cross-origin), including elements inside **open** shadow roots.
    Closed shadow roots and frames that can't be evaluated aren't counted; they're reported
    through `frames_not_inspected` / limitations as today.
  - **How**: an in-page `TreeWalker` per frame that **stops counting at limit + 1**, so the cost
    stays bounded even on very large pages. The running total carries across frames, and the
    whole measurement has a 2 s timeout inside the analysis budget.
- **Enforcement and over-limit behavior**:
  - **The limit is inclusive.** A page with **≤ `SCAN_MAX_DOM_ELEMENTS`** elements is analysed,
    so with the default 49 999 and 50 000 are allowed. **> limit** exceeds it (50 001 is
    rejected). Early stop at limit + 1 is exactly the first count that exceeds.
  - If the count exceeds the limit, or the measurement doesn't finish in 2 s, axe is **not run**
    and the audit ends with `error DOM_TOO_LARGE` ("This page has more than 50,000 elements, which
    is too large to audit automatically"). Nothing is saved.
  - **No partial audit**: FR-007a allows a partial audit only when valid findings exist for what
    was evaluated. Here no evaluation happens, so there are no valid findings. No new
    `PartialReason` is introduced, and the `PartialReason` enum is unchanged.
  - Elements added by page scripts **after** measurement aren't re-counted. Growth during the
    analysis is bounded by the 20 s analysis budget (`AUDIT_TIMEOUT`).
- **Alternatives**:
  - Run axe anyway and rely on the analysis timeout (wastes up to 20 s and risks browser memory
    exhaustion).
  - Scope axe to a subset of the DOM and return a partial audit. Rejected: axe's `include`
    context can't express "the first N elements" deterministically, and a partial audit on an
    arbitrary subset would overstate coverage.
  - Count only the main frame (undercounts pages built from frames).
- **Tests (G2)**: fixtures at 49 999, **50 000**, and 50 001 elements (main frame; the first two
  are analysed, the last gives `DOM_TOO_LARGE`), a 30k + 30k two-frame page
  (over the limit in total), and a large open-shadow-root page. The tests assert `DOM_TOO_LARGE`
  is emitted, axe is not called, and nothing is saved. A unit test checks the early stop at
  limit + 1.
