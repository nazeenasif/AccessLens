# Gate Evidence Ledger: AccessLens MVP

A gate counts as passed **only** when a row below records an actual run with evidence. Writing
code or tests never counts. Public scanning (`SCAN_ENABLED=true`) is allowed on a host only when
it has passing **G0** and **G1** rows for **that host** (checked by `scripts/check-scan-enable.mjs`,
task T187).

| Gate | Date | Host/Runner | Commit | Command | Result | Evidence link |
|---|---|---|---|---|---|---|
| **G0** (URL / destination policy; task T040) | 2026-11-13 | GitHub Actions, `ubuntu-24.04` hosted runner (workflow `ci`, job `checks`, push to `001-accesslens-mvp`) | `6bad3069b2d2e152947dd0b38dbe49147dc7a93d` | `npm run test:ci` with `ACCESSLENS_REQUIRE_DOCKER=1` and `ACCESSLENS_REQUIRE_GITLEAKS=1` (all Vitest projects, including `unit` and the `security` G0 suite), then `npm run test:assert` | **Passed**: run conclusion `success`, every step green | [Run 43438828829](https://github.com/nazeenasif/AccessLens/actions/runs/43438828829) |

### G0 — 2026-11-13 details

- **What passed**: the G0 destination suite `packages/shared/tests/security/g0-destination.test.ts`
  (**74 tests**: one per published SC-003 case, 67 from `destination-cases.ts`, plus 7 list and
  property checks)
  and the unit suites, including T034 `url-normalize` and T035 `ip-classify`. `test:assert`
  required **92 tests** (18 Docker/gitleaks-backed plus the 74 G0 tests) and passed with only
  allowlisted skips.
- **How the counts are established**: the run's step results were read from the GitHub REST API
  (run and jobs endpoints). The run log itself needs authentication, so the counts weren't read
  from the log. They follow from commit `6bad306`: its audit script requires exactly these 92
  tests, including all 74 G0 tests, and fails if any is missing, skipped, or failed. The
  "Assert required tests executed" step succeeded. A local run on the same commit gave G0 74/74
  and `test:assert` OK (92).
- **Task wording**: T040 names `npm run test:security -- g0` and `npm run test:unit`. CI ran both
  projects as part of `npm run test:ci`, which runs every project in required mode.
- **Policy this evidence covers**:
  - [ADR-0001 Amendment 3 to §3](../../history/adr/0001-scanner-isolation-and-egress-control.md)
    (Accepted 2026-11-13): `NON_PUBLIC_IPV4_RANGES` (18 ranges) is the single source of truth for
    the proxy and the firewall, and ipaddr.js is used for parsing only.
  - [Spec](./spec.md) **FR-001, amended 2026-11-13**: IP-literal hosts (IPv4 in any encoding, all
    IPv6) are rejected with `BLOCKED_DESTINATION`, detail `{ reason: "ip_literal" }`.
  - [Spec](./spec.md) **FR-002, note 2026-11-13**: FR-002 applies to the addresses a host name
    resolves to.
  - The spec's "Missing scheme" and "Ports" edge-case notes, also dated 2026-11-13.
- **Not covered by G0**: G0 tests the URL policy and DNS-answer checks in isolation, with a stub
  resolver. It says nothing about the network boundary.

> **G1 is NOT passed.** No G1 row exists: the network-boundary gate (NL-1, NL-2 host firewall,
> proxy, DNS leakage, Chromium sandbox on the Ubuntu 24.04 host) needs task T066 run on the T047
> host with recorded evidence.
>
> **`SCAN_ENABLED` stays `false`** in every environment. Live scanning needs passing G0 **and** G1
> rows for the same host, and this G0 row is from a CI runner, not a deployment host.
