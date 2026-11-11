---
id: 21
title: OD-13 Scanner SYS_CHROOT Sandbox
stage: green
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement approved decision OD-13 (Option A)
labels: ["od-13", "adr-0001", "sandbox", "chromium", "docker", "seccomp", "g1"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - docker-compose.yml
 - tests/config/scanner-sandbox.test.ts
 - tests/config/compose.test.ts
 - tests/config/images-nonroot.test.ts
 - scripts/assert-required-tests.mjs
 - vitest.config.ts
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/tasks.md
 - specs/001-accesslens-mvp/quickstart.md
tests:
 - scanner-sandbox.test.ts with SYS_CHROOT: 5 passed, 0 failed, 1 allowlisted skip
 - scanner-sandbox.test.ts with cap_add reset in a scratchpad override: 1 passed, 4 failed (Zygote process exited prematurely)
 - Manual control, chromiumSandbox false vs. true: renderer NSpid 72 vs. 129 4 1
 - lint, typecheck, format:check, web build, check:secrets, check:secrets:diff: pass
 - gitleaks dir over the 15 uncommitted files: no leaks
 - test:ci with Docker and gitleaks required: 61 passed, 5 skipped, 0 failed; test:assert OK (18 required)
 - Ubuntu 24.04 host and GitHub Actions: not executed
---

## Prompt

Implement the user's approved decision for OD-13 in AccessLens. **Approved decision:** Option A — grant only `SYS_CHROOT` to the scanner so Chromium can run with its sandbox enabled.
Requirements:
1. Inspect the existing `docker-compose.yml` scanner service and ADR-0001 §4.
2. Preserve `cap_drop: [ALL]`.
3. Add only `SYS_CHROOT` through `cap_add` for the scanner service.
4. Do not add capabilities to web or egress-proxy.
5. Do not use Chromium `--no-sandbox` or `--disable-sandbox`.
6. Amend ADR-0001 with a clearly labeled OD-13 amendment. Preserve all existing accepted ADR text; do not rewrite it.
7. Document why `SYS_CHROOT` is necessary, the narrow security trade-off, and the requirement for sandbox-on verification.
8. Update the relevant plan, research, and task documentation consistently.
9. Add a test that launches Chromium with Playwright's `chromiumSandbox: true` under the actual Compose hardening and verifies that it can render a page. A normal browser launch without sandbox enabled is insufficient.
10. Keep Ubuntu 24.04 user-namespace compatibility as a G1 verification requirement. Do not claim WSL2 testing proves production-host compatibility.
11. Do not mark G1 passed or start M1/M2.
12. Run relevant tests and report the exact files changed, commands, and results.
Do not commit or push. Stop for review.

## Response snapshot

- **Change**: the scanner keeps `cap_drop: [ALL]` and adds only `cap_add: [SYS_CHROOT]`. No other service gets a capability, and no sandbox-disabling flag exists.
- **Mechanism verified**: the seccomp profile allows `chroot`, its only `CAP_SYS_CHROOT` rule, only with that capability. `pwuser` holds it only in the bounding set.
- **Test**: `tests/config/scanner-sandbox.test.ts` launches with `chromiumSandbox: true` through `docker compose run scanner`, renders a page, and checks the renderer's PID namespace, flags, and capability sets. CI requires it.
- **Docs**: ADR-0001 Amendment 2 added with earlier text kept. Plan, research, tasks, and quickstart updated. Ubuntu 24.04 stays a G1 requirement in T062 and T066.
- No commit, push, M1/M2 work, or gate pass.

## Outcome

- ✅ Impact: OD-13 is resolved as designed; the sandbox runs under the full Compose hardening on Docker Desktop (WSL2). Production-host compatibility is unverified.
- 🧪 Tests: 61 passed, 5 allowlisted skips, 0 failed locally; audit OK with 18 required tests.
- 📁 Files: 11 changed for OD-13, plus this PHR (uncommitted, alongside the earlier CI fix).
- 🔁 Next prompts: owner reviews and commits; push to see the required sandbox test on a real Ubuntu 24.04 runner; decide OD-8b for the G1 host.
- 🧠 Reflection: Negative controls mattered: one first run was invalid because of leftover networks, and the unsandboxed control showed `Seccomp: 2` doesn't discriminate.

## Evaluation notes (flywheel)

- Failure modes observed: the probe's own `node -e` command line matched its Chromium process filter; leftover empty Compose networks caused subnet overlap and an invalid first red run.
- Graders run and results (PASS/FAIL): no-capability control PASS (fails as expected); unsandboxed control PASS (discriminates); CI-mode suite PASS; audit PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Record whether the GitHub `ubuntu-24.04` runner allows the sandbox on the first push.
