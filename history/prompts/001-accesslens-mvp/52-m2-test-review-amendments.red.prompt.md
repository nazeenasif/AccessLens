---
id: 52
title: M2 Test Review Amendments
stage: red
date: 2026-11-14
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: T041-T046 review amendments (tests and docs only)
labels: ["m2", "egress-proxy", "scanner", "test-mode", "t044", "t046", "t189", "contract", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - tests/support/startup-refusal-cases.ts
 - packages/shared/tests/unit/test-mode-config.test.ts
 - services/egress-proxy/tests/unit/logging.test.ts
 - specs/001-accesslens-mvp/contracts/internal-egress-proxy.md (new)
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/tasks.md
tests:
 - T189: 53 pass, 14 new isTestModeEnabled cases red (export missing; T190 reopened)
 - T044: egress-proxy 6 and scanner 7 cases red (placeholder main.ts does not exit)
 - T046: suite red (src/credentials.ts and src/logger.ts missing)
 - G0 74/74 and T191 51/51 green; test:assert REQUIRED 105 (G0 74 + startup 13)
 - tsc: only TS2305 (isTestModeEnabled) and TS2307 (missing egress-proxy modules); eslint and prettier clean
---

## Prompt

T041–T046 tests approved, with these amendments. Tests and docs only. Do not commit or push.

1. SCAN_ENABLED stays web-only. Keep the scanner/proxy refusal as protection against a stray
   variable; add a dated note to ADR-0001 Amendment 4 and T044 explaining this. T014 unchanged.
2. Scanner test mode: add a mode-only function to test-mode.ts's API (same exact-"true" rule)
   with T189 tests. Scanner startup must refuse when ACCESSLENS_TEST_ALLOWLIST or
   ACCESSLENS_TEST_FIXTURE_SUBNET is set. Add those cases to the shared startup case list,
   and make sure the audit's required count follows.
3. Add a dated note to research R14: Proxy-Authorization is redacted.
4. T046: the host hash must be HMAC-SHA256 with a random per-process key. Add a test that it
   differs from plain sha256(host) and stays stable within a process.
5. Write specs/001-accesslens-mvp/contracts/internal-egress-proxy.md documenting the control
   endpoint (routes, X-Proxy-Control-Token, statuses 201/204/401/404/429, rate-limit
   behaviour), the proxy's 403 for policy refusals, the registry log events, and the firewall
   file format.
6. Add a dated note to T085: the scanner startup refusal is implemented early,

(The message ended there. Clarification answer for item 6: "Early, as its own task".)

## Response snapshot

- Startup case list restructured to 13 cases (egress-proxy 6, scanner 7). The new scanner cases refuse when ACCESSLENS_TEST_ALLOWLIST or ACCESSLENS_TEST_FIXTURE_SUBNET is set, both outside and inside test mode. The test:assert required count follows automatically (105).
- T189: new isTestModeEnabled describe block (exact "true" only, reads nothing else, agrees with parseTestModeConfig). Because the request said "tests and docs only", T190 was reopened (unticked) to add the export rather than implementing it here.
- T046: hostHash tests for "not plain sha256(host), full or truncated" and "stable within the process".
- Docs: ADR-0001 Amendment 4 note, R14 note, notes on T044/T046/T189/T190, and the new internal-egress-proxy contract.
- Item 6: new task T198 (scanner startup refusal in services/scanner/src/main.ts, M2, after T190 and T052) with a dated T085 note and an ID note in the Notes section. The contract doc references T198.

## Outcome

- ✅ Impact: M2 tests amended per review; scanner test-mode surface reduced to ACCESSLENS_TEST_MODE; internal proxy contract written.
- 🧪 Tests: expected red for T189 new cases, T044 and T046; G0 and T191 green.
- 📁 Files: 3 test/support files, 1 new contract, ADR-0001, research.md, tasks.md.
- 🔁 Next prompts: implement T190 (isTestModeEnabled), then T048–T052 and T198.
- 🧠 Reflection: the user's item 6 was truncated; I asked rather than guessing the note.

## Evaluation notes (flywheel)

- Failure modes observed: truncated user message; resolved by a clarifying question.
- Graders run and results (PASS/FAIL): prettier PASS, eslint PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
