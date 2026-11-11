---
id: 20
title: Fix Scanner Node CI Failure
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: CI failure fix (scanner image EBADENGINE)
labels: ["ci", "docker", "node", "playwright", "t024", "sandbox", "od-13"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - services/scanner/Dockerfile
 - tests/config/images-nonroot.test.ts
 - scripts/assert-required-tests.mjs
 - README.md
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - history/adr/0003-stack-and-deployment.md
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/tasks.md
tests:
 - images-nonroot.test.ts against the unchanged Dockerfile: 11 failed (EBADENGINE reproduced; dependents reported "not checked")
 - images-nonroot.test.ts against the fixed Dockerfile: 16 passed, 0 failed
 - docker compose build --pull --no-cache web scanner egress-proxy: rc 0
 - lint, typecheck, format:check, web build, check:secrets, check:secrets:diff via Docker: pass
 - test:ci with Docker and gitleaks required: 56 passed, 4 skipped, 0 failed; test:assert OK (15 required)
 - GitHub Actions re-run: not executed (nothing pushed)
---

## Prompt

Fix the AccessLens GitHub Actions CI failure. Diagnose the scanner Docker image build failure shown in the CI log.

Root cause:
- services/scanner/Dockerfile uses mcr.microsoft.com/playwright:v1.64.1-noble.
- That image provides Node v26.13.0.
- The project requires Node >=24 <25.
- npm ci fails with EBADENGINE.
- The subsequent web/scanner non-root image tests fail because the expected images were not successfully built.

Requirements:

1. Inspect the actual scanner Dockerfile, package.json, lockfile, Playwright version and current Compose configuration.
2. Keep the project Node engine requirement at >=24 <25.
3. Preserve the pinned Playwright version and browser compatibility.
4. Make the scanner runtime use the project's pinned Node 24.22.1.
5. Prefer a reproducible Dockerfile solution. Do not install an unpinned Node version or use a floating image tag.
6. Preserve all existing security properties: non-root runtime, read-only filesystem where configured, dropped capabilities, seccomp profile, browser sandbox requirements and secret isolation.
7. Do not weaken tests, skip the image-build checks, loosen the Node engine requirement, or mark T024 complete based on static checks alone.
8. Improve images-nonroot.test.ts if necessary so dependent non-root checks do not misleadingly run against missing or stale images after a build failure. The underlying build failure must remain visible and fail CI.
9. Add or update tests to verify the scanner image actually runs Node 24 and the required Playwright browser is available.
10. Run the relevant Docker build and non-root tests locally, then the full CI test suite.

Do not start M1, change unrelated architecture, or mark any security gate passed.

Report the Dockerfile strategy, files changed, actual commands and test results. Stop before committing.

## Response snapshot

- **Diagnosis**: confirmed the reported EBADENGINE. The deeper cause is that upstream republished the `v1.64.1-noble` tag (digest 47b510dd → 2f05f8a7, Node 24.22.1 → 26.13.0); local builds had passed on a cached copy.
- **Fix**: both scanner bases pinned by digest. Dependencies install on node:24.22.1-bookworm-slim. The Playwright image remains the runtime, with its Node and package managers removed and the exact Node binary copied in.
- **Tests**: dependent image checks fail explicitly if the build failed. Added exact-Node, single-binary, digest, lockfile-match, and real Chromium launch checks. The audit now requires 15 tests.
- **New finding**: `cap_drop: [ALL]` prevents Chromium's sandbox from starting, on the unmodified Playwright image too. Adding only SYS_CHROOT allows it. Not changed; recorded as open decision OD-13, which blocks T055, T062, and T066.
- No commit, push, M1 work, or gate pass.

## Outcome

- ✅ Impact: The scanner image builds reproducibly on the exact Node 24.22.1; all local CI-mode checks pass.
- 🧪 Tests: 56 passed, 4 allowlisted skips, 0 failed locally; GitHub Actions not yet re-run.
- 📁 Files: 9 modified, plus this PHR (uncommitted).
- 🔁 Next prompts: owner reviews and commits; push to confirm CI; owner decides OD-13 before M2's browser work.
- 🧠 Reflection: Verifying the sandbox directly, rather than relying on a passing default launch, exposed a real conflict in an accepted ADR.

## Evaluation notes (flywheel)

- Failure modes observed: a version tag treated as immutable; local Docker cache hid the upstream change; earlier "identical Node" statements were true only for the cached image.
- Graders run and results (PASS/FAIL): failing-first run PASS; fixed-image tests PASS; CI-mode suite PASS; audit PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add scheduled digest review so pinned base images still receive OS updates.
