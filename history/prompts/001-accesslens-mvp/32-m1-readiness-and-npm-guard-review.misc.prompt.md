---
id: 32
title: M1 Readiness and npm Guard Review
stage: misc
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Report next tasks (M1) and evaluate npm-version guards; no implementation
labels: ["m1", "g0", "url-policy", "npm", "lockfile", "review"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - history/prompts/001-accesslens-mvp/32-m1-readiness-and-npm-guard-review.misc.prompt.md
 - package.json (follow-up: devEngines.packageManager)
 - .nvmrc (follow-up: 24 -> 24.22.1)
tests:
 - ipaddr.js 2.5.0 range() vs ADR-0001 §3 list (real output): 4 non-unicast ranges not in the ADR list
 - npm 11.6.2 relock with no guard: exit 0, lockfile rewritten (+16 -22)
 - packageManager only: exit 0, lockfile rewritten
 - packageManager + Corepack shim: shim reported 11.19.1 even with packageManager npm@11.6.2 (inconclusive); npx npm@11.6.2 bypasses it and rewrites the lockfile
 - engines.npm + engine-strict: EBADENGINE, exit 1, lockfile unchanged (install and ci)
 - devEngines.packageManager onFail=error: EBADDEVENGINES, exit 1, lockfile unchanged; correct npm leaves the lockfile unchanged
 - npm ci --dry-run in the pinned image on an npm-11.6.2 lockfile: EUSAGE Missing @emnapi, exit 1
 - Follow-up: npm install --package-lock-only after devEngines: package-lock.json unchanged
 - Follow-up: npm 11.6.2 install / ci / run in the repo: EBADDEVENGINES, exit 1, nothing modified
 - Follow-up: Node 24.22.1 bundles npm 11.19.1 (pinned image and nodejs.org dist index)
 - Follow-up: full pre-push suite: 371 passed, 5 allowlisted skips, 0 failed; test:assert OK
---

## Prompt

T029–T033 are complete, committed and green in GitHub Actions. Do not implement anything yet.

1. Read tasks.md and report the next unchecked task(s) in order, with their IDs,
   descriptions, dependencies, and whether any are test-first pairs.
2. List the specs, contracts, research sections and ADRs each one depends on.
3. Flag anything that touches G0, G1, SCAN_ENABLED, or the scanner sandbox.
4. Separately: check which mechanism, if any, actually stops a mismatched npm version from
   rewriting package-lock.json (packageManager with or without Corepack, root engines.npm with
   engine-strict, or a CI/config test). Show real command output for each; don't rely on docs.
   Recommend one, but don't change any files.
Stop and report.

## Response snapshot

- **Next tasks**: M1, T034–T040, three test-first pairs (T034→T037, T035→T038, T036→T039), then gate T040 (G0).
- **Dependencies**: FR-001–FR-005, SC-003, data-model URL length, ErrorCode (T032), research R3, ADR-0001 §2/§3, constitution III.
- **Flags**:
  - G0: T036, T039, T040.
  - G1: T038's list feeds the NL-2 firewall list (T045, T057).
  - SCAN_ENABLED unchanged; no sandbox work.
- **Open questions found**:
  - ipaddr.js 2.5.0 classifies 4 IPv4 ranges as non-unicast that ADR-0001 §3 omits (192.88.99.0/24, 192.31.196.0/24, 192.175.48.0/24, 192.52.193.0/24);
  - how IP-literal URLs and IPv6 literals are handled;
  - whether the 2048 limit applies before or after normalisation;
  - whether G0 tests should be required in test:assert.
- **npm guard**: only engines.npm + engine-strict and devEngines.packageManager (onFail=error) stopped npm 11.6.2 before it rewrote the lockfile. packageManager alone, and Corepack (bypassable), did not. CI `npm ci` detects the problem only after the fact. Recommended: devEngines.packageManager, plus pinning .nvmrc to 24.22.1 so CI's npm matches. No files changed.

## Follow-up: guard applied (2026-11-12)

Prompt (verbatim):

```text
Approved: devEngines.packageManager (npm 11.19.1, onFail "error") and .nvmrc → 24.22.1.
Do not commit or push.

1. Apply both changes. Show that package-lock.json is unchanged.
2. Confirm npm run, npm test and npx still work under the correct npm, and that npm install
   fails with EBADDEVENGINES under npm 11.6.2.
3. Confirm the CI workflow reads .nvmrc and that Node 24.22.1 bundles npm 11.19.1.
4. Run the full pre-push suite, paste raw totals and git status --short, and update PHR 32.
Stop for review.
```

- **Applied**: root `package.json` gets `devEngines.packageManager` `{ name: "npm", version: "11.19.1", onFail: "error" }`; `.nvmrc` goes from `24` to `24.22.1`. A relock with npm 11.19.1 leaves `package-lock.json` unchanged.
- **Correct npm (11.19.1)**:
  - `npm run test:unit` 310 passed;
  - `npx tsc --version` 5.9.3 and `npx vitest --version` 5.0.5 work;
  - `npm ci --dry-run` exits 0. Its "removed 6 packages" line is a dry-run report of stray packages in the local `node_modules`; nothing was removed.
- **npm 11.6.2 in the real repo**: `install`, `ci`, and `run` all fail with `EBADDEVENGINES` (exit 1); the lockfile, working tree, and `node_modules` are untouched. So devEngines blocks every npm command under the wrong npm, not only installs.
- **CI and images**: `ci.yml` sets up Node with `node-version-file: .nvmrc`. Node 24.22.1 bundles npm 11.19.1, confirmed by `docker run` on the pinned image and by the nodejs.org dist index (`{"version":"v24.22.1","npm":"11.19.1"}`). All three Dockerfiles build from `node:24.22.1-bookworm-slim`.
- **Suite**:
  - lint, format:check, typecheck, web build, check:secrets, and check:secrets:diff: exit 0;
  - `npm test` and `test:ci`: 12 files, 371 passed, 5 skipped, 0 failed;
  - `test:assert`: OK (18 required; only allowlisted skips).
- **Noted, not changed**:
  - the host runs Node v24.18.0. devEngines checks only npm, and `.nvmrc` isn't enforced locally;
  - the web and egress-proxy Dockerfiles pin `node:24.22.1-bookworm-slim` by tag only, while the scanner Dockerfile also pins the digest.

## Outcome

- ✅ Impact: M1 scope, dependencies, and risks mapped. npm guard options evaluated with real runs; the chosen guard (devEngines + pinned .nvmrc) is applied and verified.
- 🧪 Tests: review experiments ran in scratch copies. After applying the guard, the full pre-push suite passes (371 passed, 5 allowlisted skips).
- 📁 Files: package.json and .nvmrc (follow-up), plus this PHR.
- 🔁 Next prompts: owner reviews and commits the guard; decides the range-list question; then T034.
- 🧠 Reflection: Checking the library against the ADR before writing T035 found a list mismatch that would otherwise surface in T045.

## Evaluation notes (flywheel)

- Failure modes observed: the Corepack shim result was inconclusive (same version printed for both packageManager values).
- Graders run and results (PASS/FAIL): n/a (review only).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): confirm in CI that devEngines blocks a floating Node 24 npm.
