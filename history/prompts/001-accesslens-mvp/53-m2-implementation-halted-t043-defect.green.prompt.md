---
id: 53
title: M2 Implementation Halted T043 Defect
stage: green
date: 2026-11-14
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: implement T190, T048, T049, T052, T050, T051, T198, T057 (stopped at T050)
labels: ["m2", "egress-proxy", "t190", "t048", "t049", "t052", "t050", "test-defect", "stopped"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/src/test-mode.ts
 - services/egress-proxy/src/logger.ts (new)
 - services/egress-proxy/src/credentials.ts (new)
 - services/egress-proxy/src/control.ts (new)
 - services/egress-proxy/src/proxy.ts (new)
 - services/egress-proxy/package.json (pino 10.4.0)
 - package-lock.json
tests:
 - T189 67/67 pass (T190)
 - T041, T042, T046 pass; T043 2 failing, caused by a test defect (see below)
 - T045 3 failing (T057 not started)
 - egress-proxy and shared typecheck clean; eslint and prettier clean on new sources
---

## Prompt

T041–T046 tests and amendments approved and committed locally. Implement, in order:
T190 (add isTestModeEnabled; re-tick T190), T048 (registry), T049 (control), T052 (logger),
T050 (proxy), T051 (egress-proxy startup), T198 (scanner startup refusal), and T057
(firewall file generation only; do not run or install any firewall rules). Do not commit or push.

1. Do not modify tests, case lists, the audit script or the internal contract. If a test or
   the contract seems wrong, stop and report.
2. The proxy must use the shared resolveAndCheck and parseTestModeConfig, connect only to the
   validated address, and never resolve twice. The scanner uses isTestModeEnabled only.
3. pino: pin an exact version per research R14 and relock with npm 11.19.1 only. Show the
   lockfile diff summary.
4. Record the chosen control port and rate-limit window/budget in the internal contract as a
   dated addition (this is the one contract change allowed).
5. Mutation check with automatic restore on every security rule: auth, timing-safe compare,
   rate limit, port rules, the IP-literal refusal, the any-non-public-blocks rule, no
   re-resolve, both caps, test-mode scope, every startup refusal (both services), redaction,
   the keyed hash, once-only audit_summary, and the firewall file matching
   NON_PUBLIC_IPV4_RANGES. Report what each is caught by. Confirm no scratch files remain.
6. Run the full pre-push suite (npm test, test:ci with both REQUIRE flags, test:assert
   (105 required), test:security -- g0, lint, format, typecheck, build, secret scans).
   Paste raw totals.
7. Check off only the tasks that fully pass. Write PHRs and stop for review.

## Response snapshot

- T190: `isTestModeEnabled` added; `parseTestModeConfig` uses it. T189 is 67/67.
- pino 10.4.0, exact pin (R14 says pino 10; 10.4.0 was published 2026-10-02). Relocked with npm 11.19.1: 13 packages added (12 MIT, split2 ISC); only the egress-proxy entry changed.
- T052, T048 and T049 written; T041, T042 and T046 pass.
- T050 written. Stopped there per rule 1, because two T043 tests are defective: `connectVia`/`getVia` declare `auth: string | undefined = AUTH`, and JavaScript applies a default when `undefined` is passed explicitly, so the two "without credentials" cases send valid credentials and expect 407. A scratch probe (deleted afterwards) confirmed that a CONNECT with no header gets 407 with `Proxy-Authenticate` and no lookup.
- Not started: T051, T198, T057, the contract addition, mutation checks, and the full suite. No task ticked.
- Also reported: the control endpoint returns 400 for an invalid or duplicate registration body, which the contract doesn't list. The egress-proxy Compose environment (T014) has no `SCAN_TOTAL_TIMEOUT_MS`. The scanner startup test header still names T085.

## Outcome

- ✅ Impact: T190 done; registry, control, logger and proxy implemented; halted on a T043 test defect.
- 🧪 Tests: T189, T041, T042 and T046 green; T043 2 red (test defect); T045 red (T057 pending).
- 📁 Files: shared test-mode.ts; 4 new egress-proxy sources; pino dependency and lockfile.
- 🔁 Next prompts: owner decision on the T043 fix (and the 400 / TTL gaps), then resume T050 → T057.
- 🧠 Reflection: a default parameter hid the "no header" case, so the test never exercised it; a probe outside the test proved the behaviour.

## Evaluation notes (flywheel)

- Failure modes observed: a test defect (default-parameter masking) found during implementation.
- Graders run and results (PASS/FAIL): typecheck PASS, eslint PASS, prettier PASS; T043 FAIL (test defect).
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): pass a sentinel such as `null` for "no header" in the T043 helpers.
