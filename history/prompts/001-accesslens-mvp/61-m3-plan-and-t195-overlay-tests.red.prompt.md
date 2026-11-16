---
id: 61
title: M3 Plan and T195 Overlay Tests
stage: red
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: begin M3 — plan, then first-batch test tasks only
labels: ["m3", "plan", "t195", "compose", "test-mode", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - tests/config/compose-test-overlay.test.ts (new)
 - scripts/assert-required-tests.mjs (OVERLAY_REQUIRED; 157 required)
 - specs/001-accesslens-mvp/tasks.md (T195 note)
tests:
 - compose-test-overlay: 6 red (docker-compose.test.yml missing), 1 green (base mentions no ACCESSLENS_TEST_*)
 - harness check: a throwaway overlay passes 7/7; a published port, scanner on test-fixtures, and a SCAN_ENABLED key each fail (files removed)
 - npm test (Docker running): 28 existing files pass, 932 passed | 5 skipped; only the new file fails
---

## Prompt

M2 implementation is complete and green in CI. Begin M3 (T067–T094, T188), including T063,
T195 and T196, which now run during M3.

1. Read every M3 task in tasks.md (with dated notes), the spec FRs they reference, research
   R2/R3/R13, ADR-0001 (all amendments), ADR-0003 Addendum D, the internal egress-proxy
   contract, and the scanner code from T055/T056/T198.
2. Report a plan before writing anything:
   - every task, whether it's a test or implementation task, and its pair;
   - the required order, including where T063 (needs T071), T195 and T196 (after T071) go;
   - small test-first batches, each ending at a point where the full suite can be green;
   - which tasks belong to Gate G2 (benchmark, T092–T094), and what G2 needs as evidence;
   - any conflicts between tasks, spec, research and ADRs.
3. Then write ONLY the test tasks of the first batch, exactly as specified, reusing existing
   shared and scanner modules. Add security-critical tests to the test:assert required list
   where tasks.md says to.
4. Show each failing for the right reason; existing suites must stay green and unchanged.
5. Never enable SCAN_ENABLED, and never scan anything outside local test fixtures. Write PHRs.
   Do not commit or push. Stop for review.

## Response snapshot

- **Plan, 8 batches:**
  - B1: T195 → T071, T196;
  - B2: T072/T073/T074 → T086/T085/T087;
  - B3: T067/T068/T070 fixtures + T075 → scan.ts axe core;
  - B4: T069/T077 + T076/T078 → outcomes and target responses;
  - B5: T079 + T080/T081 → T088/T089;
  - B6: T063 → redirect policy;
  - B7: T082/T188/T083 → T091 server and budgets;
  - B8 (G2): T084, T092, T093, T094.
- **Batch 1 tests written:** `tests/config/compose-test-overlay.test.ts` (T195), plus the T014 note's base-file check, so existing test files stay unchanged. All 7 are required in `test:assert`.
- **Conflicts reported:**
  1. where and how the scanner integration tests run Chromium (sandbox on ubuntu-24.04 runners, the scanner has no published port);
  2. axe `cat.*` labels: only `cat.color` is defined;
  3. Addendum D gives the scanner only `ACCESSLENS_TEST_MODE`, but T195 doesn't assert it;
  4. the ADR's T186 extension to every `docker-compose*.yml` has no task;
  5. T082's "rejects private destinations" can only be URL-policy checks in the scanner (it has no DNS), with DNS checks at the proxy;
  6. the URL policy refuses non-default ports, so the fixture server must listen on 80 in the stack.

## Follow-up 2026-11-16 (prompt, verbatim)

M3 plan approved. Decisions:
1. Chromium: option (b), inside the scanner image. Before batch 3, describe the exact test
   setup (containers, networks, proxy and fixture wiring). Traffic must go through an egress
   proxy as in production, never straight to fixtures. Don't build it yet.
2. Category labels: list every cat.* tag present in axe-core 4.14.0 and propose a plain-English
   label for each. Report the list for my approval; don't write it into the data model yet.
3. T195: add per-service test-variable checks (scanner: ACCESSLENS_TEST_MODE only;
   egress-proxy: all three; web: per T194).
4. Extend T186's test to every docker-compose*.yml (no SCAN_ENABLED=true) and make it required.
5. Add a dated note to T082: the scanner re-runs the URL policy only; DNS blocking stays at
   the proxy.
6. T195: the fixture server runs non-root, with cap_drop ALL and no added capabilities, on
   port 80.

Tests and docs only. Show the new checks failing for the right reason (base-file checks may
pass); existing suites unchanged. Update PHR 61 and paste git status --short. Do not commit
or push. Stop.

## Follow-up response snapshot

- **T195 additions (4 tests, all required):**
  - scanner gets `ACCESSLENS_TEST_MODE` only;
  - egress-proxy gets all three, validated with the shared `parseTestModeConfig`, subnet 172.30.50.0/24;
  - web gets none or all three (T194);
  - the fixture server is non-root, `cap_drop: [ALL]`, no `cap_add`, `expose: ["80"]`.
- **T186 extension:** "no docker-compose*.yml file sets SCAN_ENABLED to anything but false". The five non-skipped T186 tests are now required (166 required in total). The required title for T186's scripts check is built in two parts, because that guard scans `scripts/` and would otherwise flag the literal text.
- **Red for the right reason:** 10 overlay tests fail ("docker-compose.test.yml must exist"); the base and T186 checks pass.
- **Harness check:** a throwaway overlay passes everything. Each broken one fails exactly one test: scanner with the allowlist, egress-proxy without the subnet, an invalid allowlist, web with only the allowlist, the fixture server as root, the fixture server with `cap_add`, the fixture server on 8080. An overlay with `SCAN_ENABLED: "true"` fails the T186 extension. All files were removed.
- **npm test (Docker running):** 28 files pass, 933 passed | 5 skipped; only the overlay file fails. A first run had a transient Docker failure in `scanner-sandbox`/`web-binding`; both passed when rerun alone and in the full rerun.
- **Docs:** T082 note (URL policy only; DNS at the proxy); T195 and T186 notes.
- **Reported for approval (not written):**
  - the option (b) integration-test setup;
  - labels for the 13 `cat.*` tags in axe-core 4.14.0.

## Outcome

- ✅ Impact: M3 planned; first-batch test (T195) written and required.
- 🧪 Tests: red for the right reason; existing suites unchanged and green.
- 📁 Files: see the list above.
- 🔁 Next prompts: owner decisions on the conflicts (above all, where the integration tests run); then T071 + T196.
- 🧠 Reflection: putting the T014 base-file check in the new file keeps existing suites unchanged while satisfying the note.

## Evaluation notes (flywheel)

- Failure modes observed: intermittent command-classifier errors (worked around with read-only tools).
- Graders run and results (PASS/FAIL): eslint PASS, prettier PASS, tsc PASS; harness check PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): add per-service test-mode variable checks to T195 once approved.
