---
id: 31
title: Apply npm 11.19.1 Lockfile
stage: misc
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Apply the regenerated lockfile and rerun the pre-push suite
labels: ["lockfile", "npm", "ci", "docker", "emnapi"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - package-lock.json
tests:
 - npm ci (host, npm 11.6.2): exit 0, added 479 packages
 - npm ci --dry-run (pinned node:24.22.1 image, npm 11.19.1): exit 0
 - npm test: 12 files passed; 371 passed, 5 skipped; exit 0
 - test:ci (Docker and gitleaks required): 12 files passed; 371 passed, 5 skipped, 0 failed; exit 0
 - test:assert: OK (18 required tests passed; only allowlisted skips)
 - lint, format:check, typecheck, web build, check:secrets, check:secrets:diff: exit 0
---

## Prompt

Lockfile decision: approved. Apply the npm 11.19.1 lockfile. Do not commit or push.

1. Copy the scratchpad package-lock.npm11.19.1.json over package-lock.json. Leave package.json
   unchanged and confirm git diff shows no change to it.
2. Show git diff --stat package-lock.json and a summary of the changed entries. It should only
   restore @emnapi/core, @emnapi/runtime and @emnapi/wasi-threads (including the nested copies under
   @unrs/resolver-binding-wasm32-wasi) and drop the nested copy under @img/sharp-wasm32. Report
   anything else rather than accepting it.
3. Run npm ci on the host, then run npm ci --dry-run inside the pinned Node 24.22.1 image.
4. Rerun the full pre-push suite: npm test, ACCESSLENS_REQUIRE_DOCKER=1
   ACCESSLENS_REQUIRE_GITLEAKS=1 npm run test:ci, npm run test:assert, lint, format:check,
   typecheck, build, and both secret scans. Include the pass/fail/skip totals, not only failure
   lines.
5. Confirm specifically:
   - The scanner-sandbox Chromium test passes, so its earlier failure was the image build and
     not a sandbox regression.
   - test:assert shows no unexpected skips. The two web-binding skips should disappear.
6. Paste raw output and git status --short. Stop for review.

## Response snapshot

- **Applied**: package-lock.json now matches the scratchpad file; package.json unchanged (its diff is empty).
- **Expected entries**: `@emnapi/core` and `@emnapi/runtime` 1.11.3 and `@emnapi/wasi-threads` 1.2.1 → 1.2.3 restored at top level; the three copies nested under `@unrs/resolver-binding-wasm32-wasi` (1.10.0 / 1.2.1) added; the copy nested under `@img/sharp-wasm32` dropped.
- **Unexpected, reported and not accepted**: 16 entries lose `"peer": true`, with no version or integrity change. Both earlier lockfiles came from host npm 11.6.2 and set the flag; npm 11.19.1 doesn't. Nothing in the repo installs with `--omit=peer` (the Dockerfiles use `--omit=dev` or nothing; CI uses plain `npm ci`). Several of the 16 are direct dependencies, including the runtime deps `zod`, `react`, and `react-dom`, so the new lockfile is the more accurate one. Owner decision pending.
- **Suite**: everything passes. scanner-sandbox 5/5 (the earlier failure was the image build, not the sandbox); web-binding 3/3; test:assert OK with only the 5 allowlisted skips.
- No commit or push.

## Outcome

- ✅ Impact: Docker image builds and the full CI-equivalent suite pass again.
- 🧪 Tests: 371 passed, 5 allowlisted skips, 0 failed.
- 📁 Files: package-lock.json, plus this PHR.
- 🔁 Next prompts: owner accepts or rejects the `peer` metadata change, then commits.
- 🧠 Reflection: A version-only comparison missed metadata changes; comparing whole entries caught them.

## Evaluation notes (flywheel)

- Failure modes observed: the earlier scratch diff compared versions only; an inline node -e script lost its backslashes in the shell.
- Graders run and results (PASS/FAIL): npm ci on host and image PASS; full suite PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): add a CI-parity check that runs `npm ci --dry-run` in the pinned image whenever the lockfile changes.
