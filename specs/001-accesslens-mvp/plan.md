# Implementation Plan: AccessLens MVP — Single-Page Accessibility Audit & AI Remediation

**Branch**: `001-accesslens-mvp` | **Date**: 2026-10-21 (reconciled 2026-10-21; ADR alignment 2026-10-22) | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-accesslens-mvp/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.claude/commands/sp.plan.md` for the execution workflow.

## Summary

A developer submits one public URL. A Next.js web app first checks the URL, then hands it to a
separate, locked-down **scanner container** that renders the page in sandboxed Playwright
Chromium and runs axe-core 4.14.0 with an explicit, version-verified set of WCAG 2.0/2.1/2.2 A/AA
and best-practice tags.

Per [ADR-0001](../../history/adr/0001-scanner-isolation-and-egress-control.md) (Accepted):
- the scanner sits only on internal Docker networks, and its browser traffic leaves solely
  through a separate **egress-proxy container**;
- the proxy resolves DNS once, connects only to validated public IPv4 addresses, and is itself
  fenced by **host firewall rules**.

Each audit gets a fixed time budget: 30 s navigation, 20 s axe analysis, 5 s teardown, within
60 s. Each audit also gets a 50,000-element page-size limit.

Progress streams back as NDJSON and ends in exactly one outcome: a **complete** audit, a
labelled **partial** audit (valid findings plus recorded reasons), or an **error** (no valid
results, nothing saved).

Per [ADR-0002](../../history/adr/0002-stateless-server-signed-evidence.md) (Accepted):
- nothing is persisted server-side; history lives in browser IndexedDB (7-day purge, "Clear
  history");
- each violation's AI-relevant evidence is sealed with HMAC-SHA256;
- on "Explain" (on demand, one finding at a time), the server verifies the seal before building
  any prompt and then calls OpenRouter through a one-method typed provider interface.

Comparison and the self-contained HTML export are client-side. The demo is static sample data
with an accessible guided tour.

## Technical Context

**Language/Version**: TypeScript 7.0 (fallback 5.9 — OD-9, decided by the M0 check in ADR-0003) on Node.js 24 LTS
**Primary Dependencies**: Next.js 16.4 (App Router, Node runtime), React 19.3, Tailwind CSS 4.3, Radix UI primitives, Zod 4.6, Playwright 1.64 (Chromium), @axe-core/playwright 4.14 / axe-core 4.14.0, ipaddr.js 2.5, idb 8.0, pino 10
**Storage**: Browser IndexedDB only (audits incl. partial, AI annotations). The server stores no audit data (ADR-0002).
**Testing**: Vitest 5 (unit, integration, security), Playwright Test 1.64 + @axe-core/playwright (e2e and self-audit), msw (AI HTTP mocks), composed-stack G1 suite on a firewall-equipped Linux host
**Target Platform**: Docker Compose on one Linux VM/VPS with Docker Engine + host-firewall control (ADR-0001 §5; provider OD-2); evergreen desktop and mobile browsers for the UI
**Project Type**: Web application — npm-workspaces monorepo (`apps/web`, `services/scanner`, `services/egress-proxy`, `packages/shared`) (ADR-0003)
**Performance Goals**: 95% of typical-page audits finish in ≤ 60 s (SC-001); axe p95 ≤ 15 s at 50k elements (benchmark, R5); dashboard stays interactive with 500+ findings; Explain p95 ≤ 20 s
**Constraints**: concrete limits in research R12. Navigation 30 s; analysis 20 s; teardown 5 s; total 60 s; 50 000 DOM elements; 15 MB; 300 requests; 10 redirects; ports 80/443; IPv4 egress only; 2 concurrent scans (one browser each) + queue of 4; 5 audits and 20 explains per IP per 10 min; 25 explains per audit; 500 AI requests per day; 900 output tokens; evidence ≤ 5 nodes / 6 000 chars. WCAG 2.2 AA for AccessLens's own UI; usable at 320 px.
**Scale/Scope**: Portfolio and small-agency usage — about 10 concurrent users, one host, one replica per service. 5 user stories, about 8 screens/states.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates from `.specify/memory/constitution.md` (v1.0.0). Each gate is marked PASS / FAIL / N/A with
a one-line justification; any FAIL requires a Complexity Tracking entry. "PASS" here means **the
design** complies; it does not mean any test gate has executed.

- [x] **I. Evidence-First** — PASS. Findings come only from axe `violations`/`incomplete` with
      a pinned tag set (R2). AI output must echo `findingId`/`ruleId`, has no severity field,
      and is built only from sealed evidence (R6, [ai-provider.ts](./contracts/ai-provider.ts)).
      Audit status is set by the scanner alone.
- [x] **II. Honest Claims** — PASS.
      - The categories are detected violation, needs manual review, best practice (not a WCAG
        requirement), AI explanation, unverified suggestion, no longer detected, and partial
        audit with reasons. There are no verified outcomes for live sites.
      - The limitations statement reflects the verified coverage gaps.
      - The banned-wording test covers SC-006.
- [x] **III. Untrusted Targets** — PASS (design).
      - The topology, network isolation (NL-1), host firewall (NL-2), proxy authentication, and
        sandbox are fixed by ADR-0001.
      - The DOM cap is R15, and timeouts and budgets are R5 and R12.
      - **Wording note**: Principle III says redirect and subrequest checks happen "via request
        interception". The design enforces this at the proxy/network layer instead, which meets
        the intent; a constitution PATCH clarification is recommended (not made).
- [x] **IV. Secrets** — PASS. `OPENROUTER_API_KEY` and `EVIDENCE_SIGNING_SECRET*` live only in
      `web`. `scanner` holds `SCANNER_INTERNAL_TOKEN` + `PROXY_CONTROL_TOKEN`, and `egress-proxy`
      holds `PROXY_CONTROL_TOKEN` only (asserted by test). Redaction, the build secret scan, and
      the placeholder-only `.env.example` are in R14.
- [x] **V. Provider Independence** — PASS. Everything goes through the single `AiProvider`
      interface, with OpenRouter as the only MVP adapter. Audits are complete without AI.
- [x] **VI. Tests** — PASS (planned). Suites map to gates G0–G3 (R13), and ADRs 0002 and 0003
      list the tests required before their implementation is accepted. No live AI or live sites
      run in CI.
- [x] **VII. Increments** — PASS. Ordered milestones M0–M3 with gates, then stories in priority
      order: US1 (P1) → US2 (P2) → US4 (P3) → US5 (P4) → US3 (P5).
- [x] **VIII. Simplicity** — PASS, with the justified items in Complexity Tracking (separate
      scanner, separate egress-proxy, custom proxy). There is no database, queue, Redis,
      Kubernetes, or agent framework.
- [x] **IX. Privacy & Cost** — PASS. There is no server persistence, and the limits are concrete
      (R12). Retention is documented (quickstart §6). OpenRouter `data_collection: "deny"` is set.
      The daily-cap restart behavior is OD-6.
- [x] **X. Documentation** — PASS. The quickstart covers architecture, env, test commands, and
      production controls. ADRs 0001–0003 are recorded.

**Post-design re-check (2026-10-22)**: all gates PASS at the design level. Remaining open items
are listed under Open Decisions; none contradicts an accepted decision.

## Project Structure

### Documentation (this feature)

```text
specs/001-accesslens-mvp/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R15
├── data-model.md        # Phase 1: entities, outcome semantics, IndexedDB layout, validation
├── quickstart.md        # Phase 1: architecture, setup, env, test commands, production controls, retention
├── contracts/
│   ├── public-api.openapi.yaml   # /api/audits (NDJSON), /api/explain, /api/health
│   ├── scanner-api.openapi.yaml  # internal /scan, /healthz
│   └── ai-provider.ts            # AiProvider interface + strict output schema
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/sp.tasks — not created here)
history/adr/
├── 0001-scanner-isolation-and-egress-control.md   # Accepted
├── 0002-stateless-server-signed-evidence.md       # Accepted
└── 0003-stack-and-deployment.md                   # Accepted
```

### Source Code (repository root)

```text
package.json                    # npm workspaces, root scripts (test, lint, typecheck, test:g1, bench:axe)
docker-compose.yml              # web (public :3000) + scanner + egress-proxy; networks per ADR-0001
ops/firewall/                   # NL-2 host rule install + verify scripts (written at M2)
.env.example
.nvmrc

packages/shared/                # pure TS, no I/O except url-policy DNS helper
├── src/schemas/                # audit.ts, finding.ts, evidence.ts, explain.ts, events.ts (Zod)
├── src/url-policy/             # normalize.ts, validate-url.ts, ip-classify.ts (shared range list), resolve-and-check.ts
├── src/compare.ts              # occurrence comparison (R10)
├── src/canonical-json.ts       # JCS-subset serialization for sealing (R6)
├── src/evidence-reduce.ts      # deterministic ≤5-node / 6000-char reduction (R6)
├── src/wording.ts              # limitations statement, partial-reason explanations, banned claims
└── tests/unit/

services/egress-proxy/          # filtering forward proxy container (ADR-0001 §2)
├── src/proxy.ts                # CONNECT/HTTP, IPv4 resolve-once, connect-to-validated-IP, 80/443 only
├── src/credentials.ts          # per-audit credential registry (407 otherwise)
├── src/control.ts              # PROXY_CONTROL_TOKEN-authenticated register/revoke/counters
├── Dockerfile
└── tests/{unit,integration,security}/

services/scanner/               # Node HTTP service, runs in the Playwright container
├── src/server.ts               # /scan (NDJSON), /healthz, token auth, concurrency/queue
├── src/browser.ts              # one browser per slot, launch flags, sandbox, recycle (R4)
├── src/scan.ts                 # navigate, redirect counting, DOM measure (R15), axe with budget, partial/error mapping (R5)
├── src/proxy-client.ts         # registers per-audit credentials, reads counters
├── src/map-axe.ts              # axe results → Finding[] (tags, truncation, categories, WCAG)
├── Dockerfile
└── tests/{unit,integration,security}/

apps/web/                       # Next.js 16 App Router
├── src/app/
│   ├── page.tsx                # URL form + live audit view
│   ├── audits/[id]/page.tsx    # saved audit (from IndexedDB), compare, export
│   ├── history/page.tsx        # local history, Clear history
│   ├── demo/page.tsx           # guided demo
│   └── api/{audits,explain,health}/route.ts
├── src/server/                 # server-only: scanner-client.ts, evidence-seal.ts, rate-limit.ts,
│   │                           # client-ip.ts, logger.ts, ai/{provider.ts,openrouter.ts,prompt.ts,factory.ts}
├── src/components/             # dashboard, finding-detail, ai-panel, states/, tour/, report/
├── src/lib/                    # storage.ts (idb), audit-stream.ts (NDJSON reader), export.ts
├── src/demo/data/              # sample audits + reviewed AI annotations (JSON)
└── tests/{unit,integration,security}/

fixtures/
├── axe/rule-inventory.4.14.0.json  # effective rule snapshot (R2, test F-INV)
├── pages/wcag/                 # F-20A … F-CLEAN pages + *.expected.json (R2)
├── pages/interruptions/        # slow-load, request-heavy, large, frames, blocked-subresource pages (R5)
├── pages/dom-limit/            # 49 999 / 50 000 / 50 001 elements, two-frame, shadow-root pages (R15)
├── pages/benchmark/            # ~1k/10k/25k/50k, contrast-heavy, multi-frame (R5 benchmark)
├── benchmark/                  # recorded results-<axe-version>.json
├── pages-v2/                   # second version for comparison tests (SC-010)
└── demo-site/                  # source page for demo dataset

e2e/                            # Playwright Test specs per user story + self-axe checks
```

**Structure Decision**: An npm-workspaces monorepo with four workspaces (ADR-0003). The scanner
and egress proxy are separate services because constitution III and ADR-0001 require the
browser to be isolated from the web/API process, and its only network path to be a separately
fenced proxy. `packages/shared` holds the schemas and pure logic used by all three.

## Request Flows

**Audit (US1)**:
1. Browser `POST /api/audits {url}`.
2. `web` checks `SCAN_ENABLED` (else `SCAN_DISABLED`), applies the rate limit, and runs the URL
   policy as a fast reject.
3. `web` calls `POST scanner:/scan` over `scan-ctl` with the token.
4. The scanner re-validates and waits for a slot (`queued`). The `t0` budget clock starts at slot
   acquisition.
5. The scanner registers per-audit credentials with `egress-proxy`, opens a fresh sandboxed
   context through it, and navigates (`loading`, ≤ 30 s).
6. The scanner measures the DOM (≤ 2 s; over 50 000 → `DOM_TOO_LARGE`) and runs axe with the R2
   tags (`analyzing`, ≤ 20 s; over → `AUDIT_TIMEOUT`).
7. The scanner reads the proxy counters (caps, blocked hosts) and maps the outcome per R5 to a
   `result` (complete or partial with reasons) or an `error`, then revokes the credentials and
   tears down (≤ 5 s).
8. `web` reduces and seals each violation's evidence (R6) and relays the terminal event.
9. The browser saves complete and partial audits to IndexedDB. Errors are shown and not saved.

**Explain (US2)**:
1. Browser `POST /api/explain { evidence, evidenceSignature }`.
2. `web` checks: size → per-IP limit → strict schema → `v`/`kid` → MAC → expiry/skew → daily
   cap.
3. `ExplainInput` is built from the verified evidence only.
4. OpenRouter is called, and the output goes through strict validation and the echo check.
5. 200 → the browser caches it. No refusal before step 3 reaches the provider.

**Compare / Export / Demo (US3–US5)**: all client-side and pure. The demo reads bundled JSON and
makes no network calls to `/api/*`.

## Delivery Order (one milestone or story at a time — Principle VII)

**Arbitrary public-URL scanning stays disabled** (`SCAN_ENABLED=false`) in every environment
until G0 and G1 have passed with **recorded execution evidence on that host**. Until then,
scanner work and e2e tests use only local fixtures through the test-only allowlist (R13). **No
gate has passed as of this plan revision.**

| Order | Milestone / Story | Delivers | Exit gate |
|---|---|---|---|
| M0 | Project setup | four workspaces, TS/lint/format, CI skeleton, `.env.example`, README, secret scan, Compose skeleton per ADR-0001, ADR-0003 M0 tests (toolchain → OD-9, Compose config test, `web` binding test) | CI green; ADR-0003 M0 tests pass |
| M1 | URL / destination policy | `packages/shared/url-policy` with the shared non-public range list | **G0**: all URL-policy unit and security cases pass (SC-003 list) |
| M2 | Egress proxy + network isolation | `services/egress-proxy` (credentials, control channel, accounting), Chromium launch flags and sandbox, NL-2 firewall install/verify scripts, DNS-leak mitigation if needed, provisional `shm_size`, proxy lifecycle logging | **G1**: all ADR-0001 §6 and R3 tests pass on a Linux host with firewall rules applied, with an evidence log kept |
| M3 | Scanner service (fixtures only) | `/scan` NDJSON, axe with R2 tags, R5 budget and outcome mapping (incl. target-response errors), R4 page controls, R15 DOM limit, one browser per slot, final `shm_size` measured, scanner lifecycle logging | **G2**: WCAG F-20A…F-INV, interruption, target-response, page-control, and DOM-limit fixtures pass; axe benchmark recorded with p95 ≤ 15 s at 50k (else plan amendment) |
| 1 | US1 (P1) | public `/api/audits`, **evidence reduction + sealing** (the contract requires sealed evidence on every violation result), progress, dashboard, manual review, best-practice labelling, partial/error states (incl. page too large and target errors), local save, `web` no-persistence enforcement | US1 e2e; no-persistence test; G0 + G1 evidence on the target host **before** `SCAN_ENABLED=true` there |
| 2 | US2 (P2) | evidence **verification**, per-audit and daily AI caps, `/api/explain`, OpenRouter adapter with provider-call logging, AI panel and states | **G3**: R6 tampering suite passes (zero provider calls on refusal); ADR-0002 test list |
| 3 | US4 (P3) | history view, Clear history, re-audit, compare | SC-010, SC-012 |
| 4 | US5 (P4) | HTML report + accessible print stylesheet | SC-011 |
| 5 | US3 (P5) | demo dataset, guided tour (tours comparison and export) | US3 e2e + self-axe |

Delivery follows **priority order** (constitution VII). Stories were re-prioritized on
2026-10-22 (US4 → P3, US5 → P4, US3 → P5) because the demo tour (US3) depends on comparison and
export. This replaces the earlier ordering exception. Tasks: [tasks.md](./tasks.md).

## Open Decisions

`/sp.tasks` must create a decision task for each open item, placed before the milestone it
blocks.

| ID | Decision | Status | Blocks | Notes |
|---|---|---|---|---|
| OD-1 | NL-1/NL-2 mechanism | **Resolved** by ADR-0001 (Accepted) | — | Three containers, internal networks, host `DOCKER-USER` + `INPUT` rules. |
| OD-2 | VM/VPS provider and region | **Open** (narrowed) | US1 public release | Must provide Docker Engine + host-firewall control (ADR-0001 §5, ADR-0003). |
| OD-3 | Analysis budget | **Resolved** (R5): 20 s within 60 s; 5 s teardown | M3 exit | Subject to the benchmark acceptance (p95 ≤ 15 s at 50k). A miss requires a plan amendment, not a silent change. |
| OD-4 | DOM size limit | **Resolved** (R15): 50 000 elements, configurable 1k–200k; over → `DOM_TOO_LARGE`, no partial | M3 | No new `PartialReason`. |
| OD-5 | Chromium sandbox | **Resolved** by ADR-0001 | — | Non-root + seccomp; no `--no-sandbox` with scanning enabled. |
| OD-6 | Daily AI cap across `web` restarts | **Open** | US2 | ADR-0002 options: provider-side key limit / persisted counter / both. |
| OD-7 | TLS reverse proxy | **Open** | US1 public release | ADR-0003. |
| OD-8 | CI platform and where G1 runs | **Open** | M2 exit (G1) | ADR-0003. The repo has no remote yet. |
| OD-9 | TypeScript 7.0 vs 5.9 | **Open** — decided by test | M0 | ADR-0003 M0 compatibility test. |
| OD-10 | Docker embedded-DNS leakage from `scanner` | **Open** — conditional | M2 exit (G1) | If the G1 DNS check shows external resolution, choose a mitigation and add an ADR-0001 addendum. |
| OD-12 | NL-2 firewall rule order and scoping | **Resolved** 2026-10-23 by ADR-0001 Amendment 1 (Accepted; task T185) | — | Drop-first, state-independent drops scoped to `-s <outbound>`; no broad ESTABLISHED/RELATED accept; `INPUT` drop at position 1; tagged, idempotent rules; scoped conntrack flush; helpers off; fail closed on a non-iptables backend. Implemented by T057, validated live by T184, gated by T066 (G1 **not passed**). |
| OD-11 | `web` binding fallback | **Open** — conditional | M0 | If the ADR-0003 binding test fails, ADR-0001's fallback (separate control network or reversed control connection) needs a superseding ADR. |

## Risks

1. **Egress bypass** (blast radius: SSRF into the host or cloud network). Mitigations:
   - three independent layers (proxy IP validation, Docker internal networks, host firewall);
   - Chromium flags as defense in depth;
   - a test per vector;
   - the G0/G1 evidence gate before public scanning.

   Residual: host-firewall persistence is operator-dependent, so re-verify after every restart.
   Kill switch: `SCAN_ENABLED=false`.
2. **AI cost or abuse without accounts**. Mitigations: sealed evidence covering every prompt
   input, a per-IP limit counting all attempts, a daily cap, the output token cap, and
   `AI_PROVIDER=none`. Residual: the cap resets on restart until OD-6 is resolved.
3. **Coverage misread as compliance**. Mitigations: the pinned tag inventory test, a limitations
   statement naming the gaps, best-practice labelling, and banned wording.

## Architecture Decision Records

| ADR | Title | Status |
|---|---|---|
| [0001](../../history/adr/0001-scanner-isolation-and-egress-control.md) | Scanner Isolation and Egress Control | Accepted (2026-10-22) |
| [0002](../../history/adr/0002-stateless-server-signed-evidence.md) | Stateless Server with Browser-Local History and Sealed Evidence | Accepted (2026-10-22) |
| [0003](../../history/adr/0003-stack-and-deployment.md) | Application Stack and Deployment | Accepted (2026-10-22) |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Separate scanner service/container | Constitution III requires the browser to be isolated from the web/API process, with its own resource limits | Running Playwright inside Next.js routes shares memory, secrets, and the crash domain |
| Separate `egress-proxy` container (ADR-0001, Accepted) | Docker-enforced NL-1: the browser has no route except the proxy, and the proxy holds no AI or signing secrets | Proxy inside the scanner leaves bypass prevention to Chromium flags (ADR-0001 alternatives) |
| Custom egress proxy (~200–300 LOC) with per-audit credentials | Validates the IP actually connected to for every request, and attributes caps per audit | Off-the-shelf proxies lack per-audit accounting without extra integration; may be revisited (ADR-0001) |
| Four npm workspaces | One per independently deployed service, plus shared schemas | Fewer workspaces would merge security domains or duplicate schemas |
