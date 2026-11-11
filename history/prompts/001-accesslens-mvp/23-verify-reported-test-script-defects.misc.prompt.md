---
id: 23
title: Verify Reported Test Script Defects
stage: misc
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Review corrections to scanner-sandbox.test.ts and assert-required-tests.mjs
labels: ["od-13", "tests", "ci", "verification"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - history/prompts/001-accesslens-mvp/23-verify-reported-test-script-defects.misc.prompt.md
tests:
 - node --check scripts/assert-required-tests.mjs: rc 0
 - npx tsc --noEmit: rc 0
 - npm run format:check: rc 0
 - scanner-sandbox.test.ts: 5 passed, 0 failed, 1 allowlisted skip
 - test:ci with Docker and gitleaks required: 61 passed, 5 skipped, 0 failed
 - test:assert before and after the full run: OK (18 required)
 - evaluate() with synthetic failing reports: descriptive problem entries; CLI exits 1
---

## Prompt

Inspect the actual contents of:
- tests/config/scanner-sandbox.test.ts
- scripts/assert-required-tests.mjs

Fix the missing FORBIDDEN array declaration in scanner-sandbox.test.ts.
Fix the malformed failed-test / failed-suite handling in
scripts/assert-required-tests.mjs so it adds a descriptive entry to `problems`.

Do not change the required test list or allowed skip list unless a concrete
error requires it. Do not weaken any assertions, change ADR decisions,
mark G1 as passed, commit, or push.

Then run:
1. node --check scripts/assert-required-tests.mjs
2. npx tsc --noEmit
3. npm run format:check
4. The focused scanner sandbox test
5. npm run test:assert
6. The full required CI test suite

Report exact commands and results.

## Response snapshot

- Neither reported defect exists on disk: `FORBIDDEN` is declared at `tests/config/scanner-sandbox.test.ts:143`, and `scripts/assert-required-tests.mjs:47-51` pushes a descriptive entry to `problems`.
- Neither file was edited; matching SHA-256 hashes before and after confirm it.
- Failure handling was exercised with synthetic reports and works.
- All six requested checks pass.
- No commit, push, ADR change, or gate change.

## Outcome

- ✅ Impact: Reported defects checked against the files and not reproduced; no code change.
- 🧪 Tests: 61 passed, 5 allowlisted skips, 0 failed locally; audit OK with 18 required tests.
- 📁 Files: this PHR only.
- 🔁 Next prompts: owner compares their view of the files with the recorded hashes and shares the text they see if it differs.
- 🧠 Reflection: Exercising the behaviour gives a clearer answer than rewriting working code to match a report.

## Evaluation notes (flywheel)

- Failure modes observed: the review's view of the files differs from the files on disk; cause unknown.
- Graders run and results (PASS/FAIL): six requested checks PASS; synthetic failure reports PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Compare hashes with the owner's copy.
