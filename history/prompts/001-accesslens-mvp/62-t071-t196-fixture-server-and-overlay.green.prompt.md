---
id: 62
title: T071 T196 Fixture Server and Overlay
stage: green
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: implement T071 and T196 (tests unchanged)
labels: ["m3", "batch-1", "t071", "t195", "t196", "compose", "test-mode", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - tests/support/fixture-server.ts (new)
 - docker-compose.test.yml (new)
 - fixtures/README.md (new)
 - specs/001-accesslens-mvp/tasks.md (T071, T195, T196 ticked; notes)
tests:
 - compose-test-overlay (T195): 11/11 pass; T186 guard incl. the every-Compose-file extension: 5/5 pass
 - mutation: 23/23 overlay-rule mutations caught, all restored
 - live smoke (throwaway Compose project, torn down): proxy 200 for fixtures.test, 407 without credentials, 403 for a non-allowlisted host, direct access ENETUNREACH
 - gitleaks v8.30.1 dir on the 3 uncommitted files: no leaks found
 - npm test (Docker 29.9.2): 29 files passed; 943 passed | 5 skipped (948)
 - test:ci (both REQUIRE flags): 29 files passed; 943 passed | 5 skipped (948)
 - test:assert: OK (166 required tests passed); g0 74/74; lint, format, typecheck, web build, check:secrets, check:secrets:diff clean
---

## Prompt

Batch 1 tests approved and committed locally. Implement T071 (fixture server) and T196
(docker-compose.test.yml), making T195 and the extended T186 guard pass. Do not modify tests.
Mutation check each rule in the overlay tests, run gitleaks on the uncommitted files and the
full pre-push suite with Docker running, and paste raw totals. Tick T071, T195 and T196 only if
everything passes. Include the category-label list and the batch-3 test setup in your report.
Write PHRs. Do not commit or push. Stop.

## Response snapshot

- **Fixture server (T071):** `tests/support/fixture-server.ts` uses only Node built-ins. Routes:
  - `/fixtures/<path>`: files from `fixtures/` (no traversal, dotfiles or directories);
  - `/ok`;
  - redirects: `/redirect/chain/<n>` (n ≤ 50), `/redirect/to-private` (169.254.169.254), `/redirect/to-host/<host>`;
  - slow endpoints: `/slow/delay/<ms>`, `/slow/hang`, `/slow/load` (the document commits but `load` never fires);
  - `/healthz`.

  GET and HEAD only; `close()` ends hanging requests; listens on `$FIXTURE_PORT` (default 80).
- **Overlay (T196):** `docker-compose.test.yml` defines four pieces:
  - the `fixtures` service: pinned Node image, uid 1000, read-only, `cap_drop: [ALL]`, no-new-privileges, port 80, alias `fixtures.test` at 172.30.50.10, read-only mounts of `tests/support` and `fixtures`;
  - `egress-proxy` in test mode with all three variables;
  - `scanner` with `NODE_ENV=test` and `ACCESSLENS_TEST_MODE` only;
  - an internal `test-fixtures` network.
- **Overlay comment fix:** my first header comment mentioned `SCAN_ENABLED`, which T195 bans anywhere in the file, so I reworded it. No test changed.
- **Report also covers** (unchanged from the previous round; still pending approval):
  - the 13 axe-core 4.14.0 `cat.*` tags with proposed labels;
  - the option (b) batch-3 test setup.

## Outcome

- ✅ Impact: batch 1 done; the test-mode stack runs and keeps all scan traffic behind the egress proxy.
- 🧪 Tests: full pre-push suite green; 166 required tests pass.
- 📁 Files: see the list above.
- 🔁 Next prompts: approve the category labels and the batch-3 setup; then batch 2 (T072–T074 tests).
- 🧠 Reflection: the live smoke run confirmed what the static tests can't: Docker DNS resolves the alias inside the fixture subnet, and NL-1 holds in test mode.

## Evaluation notes (flywheel)

- Failure modes observed: my own comment tripped a text-level guard (fixed in the overlay, not the test).
- Graders run and results (PASS/FAIL): all pre-push gates PASS; mutation 23/23.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
