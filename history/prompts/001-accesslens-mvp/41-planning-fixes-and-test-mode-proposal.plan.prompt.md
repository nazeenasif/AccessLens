---
id: 41
title: Planning Fixes and Test Mode Proposal
stage: plan
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Planning fixes in tasks.md; draft (not applied) test-mode proposal
labels: ["planning", "tasks", "test-mode", "scan-enabled", "g1", "proposal"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - specs/001-accesslens-mvp/tasks.md
 - history/adr/0001-scanner-isolation-and-egress-control.md (follow-up: Amendment 4)
 - history/adr/0003-stack-and-deployment.md (follow-up: Addendum D)
 - specs/001-accesslens-mvp/spec.md (follow-up: FR-002 test-mode note)
 - specs/001-accesslens-mvp/research.md (follow-up: R3 and R13 notes)
tests:
 - none run (planning only)
 - Follow-up subnet check: 172.30.50.0/24 vs compose subnets 172.30.10/20/30/40.0/24 (outbound = .40) and host Docker networks (bridge 172.17.0.0/16, minikube 192.168.49.0/24, todo-network 172.18.0.0/16): no overlap
---

## Prompt

Planning fixes only. No implementation, no commit or push.

1. Tick T034–T036 in tasks.md with a dated note (tests committed and passing at 6bad306).
2. Move the /demo-reachable assertion from T108 to T176, with a dated note in both tasks.
3. Add a dated note to tasks.md stating that the G1 run (T066) is a release gate, not a build
   blocker: M3 may start once M2's implementation tasks are done, and SCAN_ENABLED=true still
   requires G0 and G1 evidence from the deployment host (T129).
4. Draft (don't apply) a proposal for test mode as a separate setting from SCAN_ENABLED:
   - test mode can only reach the test-page allowlist;
   - it's refused in production;
   - T186's rule against setting SCAN_ENABLED=true stays intact;
   - list the tests that would prove all of the above, and which tasks, ADR and spec sections
     it touches.
Write a PHR, show the tasks.md diff and the proposal, and stop for review.

## Response snapshot

- **tasks.md** (the only file changed besides this PHR):
  - T034–T036 ticked, each with a dated note (written test-first in `7b8ef93`, passing at `6bad306`; 54 / 123 / 74 tests).
  - T108's "`/demo` stays reachable" assertion moved to T176, with dated notes in both. T176 names T171's e2e test as where it's checked.
  - A dated owner-decision note in Dependencies (and a pointer at Checkpoint G1): the G1 run (T066) is a release gate, not a build blocker. M3 may start once T041–T046 and T048–T057 are done, and `SCAN_ENABLED=true` still requires host G0 + G1 evidence (T129/T187).
  - Correction made while drafting: T063 was first listed as an M2 prerequisite, but it needs M3's fixture server (T071), so the note says it completes during M3.
- **Proposal**: drafted below; not applied anywhere else.
- **Noticed, not changed**: T037's done-note still says "T034 53/53"; the review later made it 54.

## Proposal (DRAFT — not applied): test mode separate from SCAN_ENABLED

### Problem
- T116 returns `SCAN_DISABLED` whenever `SCAN_ENABLED` isn't exactly `true`.
- T186 forbids any Compose service, profile, script, or CI config from setting `SCAN_ENABLED=true`.
- Yet T106, T108, T141, and T173 must run real audits locally and in CI against test pages.
- So "test mode" needs its own switch. It must never be a way round the network gates.

### Settings
| Setting | Read by | Meaning |
|---|---|---|
| `ACCESSLENS_TEST_MODE` | web, scanner, egress-proxy | Exactly `true` enables test mode; anything else (unset, empty, `1`, `TRUE`) is off, matching how T186 treats `SCAN_ENABLED`. |
| `EGRESS_TEST_ALLOWLIST` (existing name, R13) | web, egress-proxy | Comma-separated **exact host names** of test pages (for example `fixtures.test`). No IP addresses, wildcards, or ports; any such entry is a startup error. |
| `TEST_FIXTURE_SUBNET` (fixed in the test overlay, for example `172.30.50.0/24`) | web, egress-proxy | The only addresses an allowlisted host may resolve to. It is used only in test mode, and must not overlap the four production subnets. |

### Behaviour
1. **Test mode reaches only the allowlist.**
   - **web** (`/api/audits`, T116), in order:
     - `SCAN_ENABLED=true` → normal production path;
     - otherwise, test mode on and the URL's host exactly in the allowlist → audit proceeds;
     - everything else → `SCAN_DISABLED`.
     The URL policy still applies to test URLs (scheme, port, credentials, IP-literal rejection, length).
   - **DNS check** (`resolveAndCheck`, T039, shared): an optional test allowance `{ hosts, subnet }`. For an allowlisted host, every answer must lie inside `TEST_FIXTURE_SUBNET`; any other answer (public, another private range, mixed) → `BLOCKED_DESTINATION`. Hosts not on the allowlist get the normal rules. Without the allowance, behaviour is exactly today's, so G0 is unaffected.
   - **egress-proxy** (T050): in test mode it serves **only** allowlisted hosts, resolving into the fixture subnet. Any other host, public ones included, is refused, so test mode can't reach the internet.
2. **Refused in production.** Each layer fails closed on its own:
   - every service exits non-zero at startup if `ACCESSLENS_TEST_MODE=true` **and** `SCAN_ENABLED=true`; the two are mutually exclusive;
   - scanner and egress-proxy keep the R13 rule: test mode or the allowlist without `NODE_ENV=test` → exit non-zero. web can't use this rule, because Next.js inlines `NODE_ENV` at build time, so web relies on the layers here and below;
   - web exits if `EGRESS_TEST_ALLOWLIST` or `TEST_FIXTURE_SUBNET` is set without test mode;
   - T187 (`check-scan-enable.mjs`) refuses to approve a host whose environment sets either test variable;
   - G1 (T062) asserts that the production-config containers carry neither variable.
3. **T186 stays intact.** Test mode lives only in a separate Compose overlay, `docker-compose.test.yml`, alongside the fixture server (T071) and mock OpenRouter (T150), on a test-only network attached to egress-proxy. It sets `ACCESSLENS_TEST_MODE`, never `SCAN_ENABLED`. T186 is extended to every `docker-compose*.yml` file, so no Compose file anywhere can set `SCAN_ENABLED=true`.

### Tests that would prove it
| # | Test (proposed location) | Proves |
|---|---|---|
| 1 | `packages/shared/tests/unit/test-mode-config.test.ts` | Only exact `true` enables. Allowlist entries must be host names (IPs, wildcards, ports, empty → error). The subnet must parse and must not overlap production subnets. |
| 2 | `packages/shared/tests/security/test-allowance.test.ts` | An allowlisted host resolving inside the fixture subnet is allowed. Resolving to public, other private, or mixed answers → `BLOCKED_DESTINATION`. Non-allowlisted hosts are unaffected. With no allowance passed, results are identical to G0. |
| 3 | Extend T044 startup tests (scanner, egress-proxy) + new `apps/web/tests/security/startup.test.ts` | Exit non-zero for: test mode + `SCAN_ENABLED=true` (all three services); test mode or allowlist without `NODE_ENV=test` (scanner, proxy); allowlist or subnet without test mode (web). |
| 4 | Extend T043 proxy tests | In test mode, a non-allowlisted **public** host is refused; an allowlisted host outside the fixture subnet is refused; outside test mode the allowlist is ignored. |
| 5 | Extend T100 `/api/audits` contract tests | Test mode + allowlisted test page → `result`. Test mode + any other URL → `SCAN_DISABLED`. Neither flag → `SCAN_DISABLED`. |
| 6 | Extend T014 compose test and T186 | The base `docker-compose.yml` mentions neither test variable. Only `docker-compose.test.yml` sets them, and it sets `NODE_ENV=test` for scanner and proxy. **No** `docker-compose*.yml` sets `SCAN_ENABLED=true`. The T186 assertions are unchanged and still pass. |
| 7 | Extend T187 `check-scan-enable` test | A host environment with `ACCESSLENS_TEST_MODE` or `EGRESS_TEST_ALLOWLIST` is refused. |
| 8 | Extend T062 (G1, production config) | Neither test variable is present in any production container. |
| 9 | Optional: extend T101 health test | Test mode is visible in `/api/health`. This needs a contract change (see decisions). |

Suggested: add tests 3, 6, and 7 to the `test:assert` required list, so a skipped safety check fails CI.

### What it touches
- **Tasks**: T014, T018 (Compose), T039 (shared allowance parameter), T043, T044, T050, T051, T071, T085 (scanner config), T100, T101, T106, T108, T116, T141, T150, T173, T186, T187, T062, T064, plus new task IDs (T189 onward, no renumbering): a decision task and the test tasks above.
- **ADR-0001**: a new **Amendment 4**. It covers the per-service environment table (new variables), the test-only network and overlay (never in production topology), mutual exclusion with `SCAN_ENABLED`, and that G1 runs without them.
- **ADR-0003**: an addendum for the `docker-compose.test.yml` overlay and how CI and e2e use it.
- **Spec**: a dated note under **FR-002**. Test mode (never in production) may reach only the allowlisted test pages inside the fixture subnet; production behaviour is unchanged. SC-003 is unaffected, since G0 runs without test mode. Optional: contract `/api/health` `scanning` enum gains `test` (public API 1.5.0).
- **Research**: R13 (the test-mode definition replaces "`NODE_ENV=test`" alone) and an R3 note. **quickstart.md** and **README** test commands.

### Decisions for the owner
1. What a non-allowlisted URL gets in test mode: `SCAN_DISABLED` (recommended: live scanning really is off) or `BLOCKED_DESTINATION`.
2. Whether `/api/health` reports test mode (needs the contract change) or stays `disabled`.
3. Keep the name `EGRESS_TEST_ALLOWLIST` (now also read by web), or rename it to `ACCESSLENS_TEST_ALLOWLIST`.
4. The fixture subnet value.

## Follow-up: proposal approved and documented (2026-11-13)

Prompt (verbatim):

```text
Test-mode proposal approved, with these decisions:
1. In test mode, a non-allowlisted URL gets SCAN_DISABLED.
2. /api/health does NOT report test mode. No contract change.
3. Rename to ACCESSLENS_TEST_ALLOWLIST and ACCESSLENS_TEST_FIXTURE_SUBNET. Production checks
   (T187, T062) assert that no ACCESSLENS_TEST_* variable exists. Add a dated note to R13.
4. Subnet 172.30.50.0/24, but first confirm it doesn't overlap any existing Compose network
   or the egress outbound subnet. If it does, report back instead of choosing another.

Documentation and planning only. No code or tests yet; those get written in their own
tasks, test-first, as each task comes up.
- Write ADR-0001 Amendment 4, the ADR-0003 addendum (docker-compose.test.yml), and the
  dated spec note under FR-002, plus the R13/R3 notes. All dated additions; don't edit
  existing text.
- Update the affected tasks in tasks.md with dated notes, and add new tasks from T189 for
  work no existing task covers. Mark proposal tests 3, 6 and 7 to be added to the
  test:assert required list when they're written.
- Fix T037's done-note: T034 has 54 tests, not 53.
- Update PHR 41 and show git diff --stat plus the new tasks. Do not commit or push. Stop.
```

- **Subnet check first**: `172.30.50.0/24` overlaps none of the Compose networks (`public` .10,
  `scan-ctl` .20, `scan-egress` .30, `outbound` .40) and none of the Docker networks on this host
  (`bridge` 172.17.0.0/16, `minikube` 192.168.49.0/24, `todo-network` 172.18.0.0/16). Docker's
  default address pools cover 172.17–172.31, so an unrelated project could later take an
  overlapping range. That risk already applies to the four fixed 172.30.x networks.
- **ADR-0001 Amendment 4** (to §1, §2, §6; Accepted 2026-11-13; the header lists it):
  - the three `ACCESSLENS_TEST_*` variables, each with its exact meaning;
  - test mode reaches only allowlisted host names resolving into `172.30.50.0/24`, and every
    other URL gets `SCAN_DISABLED`;
  - the proxy refuses every other host;
  - a test-only `test-fixtures` network, which `scanner` never joins;
  - `/api/health` unchanged;
  - five independent production refusals;
  - `SCAN_ENABLED` rules unchanged, with T186 extended to every `docker-compose*.yml`;
  - no gate status change.
- **ADR-0003 Addendum D**: what `docker-compose.test.yml` contains and must never contain. It is
  never used on a deployment host. The mock OpenRouter moves from a profile into it.
- **Spec**: a dated FR-002 test-mode note. Production behaviour is unchanged; SC-003 / G0 run
  without test mode.
- **Research**: an R3 note (proxy test-mode scope) and an R13 note (renamed variables, explicit
  setting because Next.js inlines `NODE_ENV`, overlay-only, production checks).
- **tasks.md**:
  - a header note;
  - 23 dated notes on T014, T018, T039, T043, T044, T050, T051, T062, T064, T071, T085, T100,
    T101, T106, T108, T116, T126, T141, T145, T150, T173, T186, and T187;
  - new tasks **T189–T197**, inserted where they run (T189–T192 before T041; T195–T196 before
    T072; T193 before T101; T194 before T116; T197 before T127), plus an IDs note;
  - proposal tests 3, 6, and 7 are marked to join the `test:assert` required list when written
    (T044 and T193; T014, T186, and T195; T187);
  - T037's note now reads T034 54/54.
- **Found while documenting**: T145's OpenRouter base-URL override was also to be "honored only
  when `NODE_ENV=test`", which can't work in `web` for the same Next.js reason. Its note now
  says to use `ACCESSLENS_TEST_MODE`.
- **Existing text**: the only existing line edited outside tasks.md is ADR-0001's Amendments
  header entry (extended). No code or tests written; nothing committed or pushed.

## Outcome

- ✅ Impact: tasks.md reflects reality (M1 fully ticked), the US1→US3 ordering issue is removed, and the G1 build-vs-release question is decided; test mode is ready for a decision.
- 🧪 Tests: none (planning only).
- 📁 Files: tasks.md, plus this PHR.
- 🔁 Next prompts: owner reviews and commits the documentation; then T189 (test-first), working in task order.
- 🧠 Reflection: Next.js inlining `NODE_ENV` is why web can't reuse R13's `NODE_ENV=test` guard; the proposal relies on mutual exclusion with `SCAN_ENABLED` and on refusals at deploy time and in G1 instead.

## Evaluation notes (flywheel)

- Failure modes observed: the first edit script anchored on lines ticked later in the same run and stopped (nothing written); a T063 ordering error in the new note was caught and fixed.
- Graders run and results (PASS/FAIL): n/a (planning).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
