---
id: 18
title: Complete M0 Docker-Dependent Tasks
stage: green
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: /sp.implement (M0 continuation after Docker Desktop started)
labels: ["m0", "docker", "binding", "images", "dev-profile", "tdd"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - docker-compose.yml
 - tests/config/compose.test.ts
 - tests/config/scan-enabled-default.test.ts
 - specs/001-accesslens-mvp/tasks.md
 - specs/001-accesslens-mvp/plan.md
tests:
 - docker compose build web scanner egress-proxy (all built, ~9.5 min)
 - T024 images-nonroot: 7/7 pass (uids 1000/1001/1000)
 - T019 web-binding: negative control (bind-all override) FAILED as expected; real run 3/3 pass
 - full hardened stack up: all healthy; scanner read-only, cap_drop ALL, seccomp filter mode, no ports
 - T022 dev profile: first run HTTP 500 (defect), fixed, re-run HTTP 200 with scan-ctl refused
 - full suite: lint, typecheck, prettier, check:secrets, gitleaks history clean; vitest 40 passed, 4 skipped (all expected inverse branches), 0 failed
---

## Prompt

i have started Docker Desktop

## Response snapshot

- **Images**: built all three; T024 passed 7/7. Scanner Node is v24.22.1 (Playwright image), the others v24.18.0.
- **T019 binding test**: a negative-control override binding `web` to 0.0.0.0 made it fail, proving the test discriminates. With the T020 entrypoint it passes 3/3, and the socket table shows only 172.30.10.10:3000.
- **T020** verified; **T021/OD-11** resolved as not needed.
- **Full hardened stack**: confirmed read-only rootfs, seccomp filter mode, dropped capabilities, and no published ports.
- **T022 dev profile defect**: it returned HTTP 500 because `tsconfig.base.json` wasn't mounted. Fixed with a read-only mount, and `web-dev` now gets `NODE_ENV=development` via a YAML merge key.
- **Test hardening**: the parsers now use `merge: true`, and T186 asserts it inspected `web` and `web-dev`, to prevent vacuous passes.
- **Result**: full suite 40 passed / 4 expected skips / 0 failed. All M0 tasks are checked, and the checkpoint's "CI green" criterion stays pending (no git remote). No gate run; SCAN_ENABLED false.

## Outcome

- ✅ Impact: Every M0 task is done and verified locally; only CI execution is outstanding.
- 🧪 Tests: 40 passed, 4 skipped (expected), 0 failed.
- 📁 Files: docker-compose.yml, 2 tests, tasks.md, plan.md.
- 🔁 Next prompts: add a GitHub remote and push to run CI; commit M0; start M1 on request.
- 🧠 Reflection: Running the dev profile, rather than trusting its config, exposed a real defect.

## Evaluation notes (flywheel)

- Failure modes observed: the dev profile was missing the base tsconfig mount; a YAML anchor alias couldn't override NODE_ENV without merge keys.
- Graders run and results (PASS/FAIL): T019 negative control FAIL (expected) and real run PASS; T024 PASS; full suite PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Fail CI on any skipped Docker-backed test.
