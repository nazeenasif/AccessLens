---
id: 19
title: M0 Checkpoint Review and CI Strictness
stage: green
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M0 checkpoint review (pre-commit)
labels: ["m0", "review", "ci", "skips", "node-version", "eslint", "scan-enabled"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - tests/config/docker-support.ts
 - tests/config/web-binding.test.ts
 - tests/config/images-nonroot.test.ts
 - tests/config/diff-secret-scan.test.ts
 - tests/config/ci-strictness.test.ts (new)
 - scripts/assert-required-tests.mjs (new)
 - .github/workflows/ci.yml
 - package.json
 - apps/web/Dockerfile
 - services/egress-proxy/Dockerfile
 - README.md
 - specs/001-accesslens-mvp/tasks.md
tests:
 - npm ci; lint; typecheck; format:check; web build; check:secrets — all pass
 - check:secrets:diff via the Docker gitleaks image (CI path) — no leaks
 - test:ci in CI mode (ACCESSLENS_REQUIRE_DOCKER=1, ACCESSLENS_REQUIRE_GITLEAKS=1) — 47 passed, 4 allowlisted skips, 0 failed
 - test:assert — OK (10 required tests passed)
 - candidate-file gitleaks scan (61 files) — no leaks; ESLint rule-firing probe — Next/hooks/a11y rules fire
---

## Prompt

Review and finish the AccessLens M0 checkpoint only.

1. Inspect the current git status and diff. Check for secrets, unintended files, and consistency with the updated tasks and plan.
2. Make CI fail if any required Docker-backed test is skipped or does not execute. Preserve intentional local skips when Docker is unavailable, but do not let those skips make CI green.
3. Verify the Node-version difference between the scanner and other services. Recommend exact alignment only if compatible with the pinned Playwright image; otherwise document the justified difference.
4. Verify ESLint works with the current Next.js configuration. Do not upgrade to ESLint 10 unless compatibility is confirmed.
5. Run the M0-required checks and report their actual results. Do not claim tests passed unless they ran successfully.
6. Confirm SCAN_ENABLED defaults to false in both web and web-dev.
7. Do not start M1, change unrelated architecture, or mark any security gate passed without evidence.

Then show me the final changed-file list, test results, remaining blockers, and proposed commit contents. Stop before committing so I can review.

(Follow-up message in session: "resume" after an interrupted tool call; Docker Desktop restarted mid-review.)

## Response snapshot

1. **Review**: no secrets (gitleaks on the exact candidate files; manual grep), no .env, no unintended files.
2. **CI strictness**: required mode in `docker-support.ts` and the T027 gate; new `assert-required-tests.mjs`, which requires 10 named tests to pass and allows only 4 allowlisted skips; CI runs all projects once in required mode, then the audit with `if: always()`; `ci-strictness.test.ts` proves a local skip still exits 0 but is rejected by the audit, and required mode fails.
3. **Node**: aligned web and egress-proxy to node:24.22.1 (latest 24 LTS, security release 2026-10-20, identical to the Playwright image's Node); rebuilt and verified.
4. **ESLint**: stays at 9.39.5 (latest react/import/jsx-a11y plugins still cap at ESLint 9); verified 118 rules load and that the Next, hooks, and a11y rules fire.
5. **Checks**: the M0 checks all passed in CI mode.
6. **SCAN_ENABLED**: Compose resolves it to "false" for web and web-dev.
7. **Scope**: no M1 work; no gate run; nothing committed.

## Outcome

- ✅ Impact: M0 is complete locally; CI can no longer go green on skipped tool-backed tests.
- 🧪 Tests: 47 passed / 4 allowlisted skips / 0 failed (CI mode); audit OK.
- 📁 Files: 61 candidate files (uncommitted).
- 🔁 Next prompts: owner reviews and commits; add a GitHub remote and push to run CI (the last M0 criterion).
- 🧠 Reflection: A skipped required test looked green before; an independent report audit makes "did it run" checkable.

## Evaluation notes (flywheel)

- Failure modes observed: Docker Desktop dropped mid-session; Git Bash path conversion broke an ad-hoc `docker -v` scan (re-run with MSYS_NO_PATHCONV=1); a meta-test regex was initially too loose (tightened).
- Graders run and results (PASS/FAIL): CI-mode suite PASS; audit PASS; candidate secret scan PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
