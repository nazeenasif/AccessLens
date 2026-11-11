---
id: 22
title: Dedicated Sandbox Test Compose Project
stage: green
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Review corrections to tests/config/scanner-sandbox.test.ts
labels: ["od-13", "sandbox", "docker", "compose", "tests"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - tests/config/scanner-sandbox.test.ts
tests:
 - scanner-sandbox.test.ts: 5 passed, 0 failed, 1 allowlisted skip
 - Sentinel container and volume labelled accesslens and accesslens-m0test survived the focused run; resource diff empty
 - Sentinel container and volume labelled accesslens survived the full CI run
 - Planted chromiumSandbox false and --no-sandbox in services/scanner/src: static check failed both times; plant removed
 - format:check, lint, typecheck: pass
 - test:ci with Docker and gitleaks required: 61 passed, 5 skipped, 0 failed; test:assert OK (18 required)
---

## Prompt

Review tests/config/scanner-sandbox.test.ts and make only these corrections:

1. Repair the malformed static-check section. Define a complete FORBIDDEN array containing:
   "--no-sandbox"
   "--disable-sandbox"
   "--disable-setuid-sandbox"
   "chromiumSandbox: false"

2. Make the Docker Compose sandbox test use a dedicated project name for BOTH
   `compose run` and cleanup. Do not let its cleanup remove volumes or containers
   belonging to the normal AccessLens development Compose project.

3. Preserve the existing security assertions. Do not weaken the renderer
   namespace check, capability checks, or chromiumSandbox: true setting.

4. Do not modify ADR acceptance status or mark G1 as passed.

Afterward, run the focused sandbox test, the required-test assertion,
format check, and the full CI test suite. Report exact results.
Do not commit or push.

(Follow-up after the run was interrupted: "resume")

## Response snapshot

- **FORBIDDEN**: already complete on disk with exactly the four values, so left unchanged. A planted-value check confirmed it works.
- **Project name**: the test now uses its own `accesslens-sandboxtest` project for run and cleanup, instead of `accesslens-m0test`, which it shared with two other test files.
- **Isolation**: sentinel resources in the `accesslens` project survived the focused and full CI runs.
- Assertions, ADR status, and G1 unchanged. No commit or push.

## Outcome

- ✅ Impact: The sandbox test's `down -v` is limited to its own project.
- 🧪 Tests: 61 passed, 5 allowlisted skips, 0 failed locally; audit OK with 18 required tests.
- 📁 Files: 1 test file changed, plus this PHR (uncommitted).
- 🔁 Next prompts: owner reviews and commits.
- 🧠 Reflection: The reported malformed section didn't match the file, so it was verified and reported rather than rewritten.

## Evaluation notes (flywheel)

- Failure modes observed: the first background run was killed at typecheck and Docker Desktop had stopped; the remaining steps were rerun.
- Graders run and results (PASS/FAIL): focused test PASS; sentinels PASS; planted values PASS (fail as expected); CI-mode suite PASS; audit PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
