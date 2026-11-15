---
id: 54
title: M2 Proxy Startup Firewall File
stage: green
date: 2026-11-15
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: T050 halt decisions, then T051, T198, T057 (file only), contract addition, mutation check, pre-push suite
labels: ["m2", "egress-proxy", "scanner", "t043-fix", "t014", "t050", "t051", "t198", "t057", "mutation", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - services/egress-proxy/tests/integration/proxy.test.ts (T043 helper fix)
 - tests/config/compose.test.ts (T014: allowlist entry + same-.env-value test)
 - services/scanner/tests/security/startup.test.ts (header comment T085 → T198)
 - docker-compose.yml (egress-proxy SCAN_TOTAL_TIMEOUT_MS)
 - history/adr/0001-scanner-isolation-and-egress-control.md (§1 dated note)
 - specs/001-accesslens-mvp/contracts/internal-egress-proxy.md (§1 dated addition: port 3129, 100 per 10 s, 400)
 - services/egress-proxy/src/config.ts (new), services/egress-proxy/src/main.ts
 - services/scanner/src/startup-refusal.ts (new), services/scanner/src/main.ts
 - scripts/generate-nl2-ranges.mjs (new), ops/firewall/nonpublic-ipv4.txt (new), package.json (firewall:ranges)
 - specs/001-accesslens-mvp/tasks.md (notes; T190, T048-T052, T198 ticked; T057 partial)
 - follow-up 2026-11-15: services/egress-proxy/src/secret-compare.ts (new); control.ts and credentials.ts use it
 - follow-up 2026-11-15: services/egress-proxy/tests/unit/secret-compare.test.ts (new); credentials, control, logging and proxy tests extended; tests/support/startup-refusal-cases.ts (+1 case); vitest.config.ts (security testTimeout 20 s)
 - follow-up 2026-11-15: specs/001-accesslens-mvp/tasks.md (T041-T046 ticked; notes on T008, T041-T044, T046)
 - follow-up 2 2026-11-15: specs/001-accesslens-mvp/contracts/internal-egress-proxy.md (§5 dated line: token under 32 characters)
tests:
 - npm test: 24 files passed; 821 passed, 19 skipped (840) (Docker not running at that point)
 - test:ci with ACCESSLENS_REQUIRE_DOCKER=1 ACCESSLENS_REQUIRE_GITLEAKS=1: 24 files passed; 835 passed, 5 skipped (840)
 - test:assert: OK (105 required tests passed; only allowlisted skips)
 - test:security -- g0: 74/74
 - lint, format:check, typecheck, web build, check:secrets, check:secrets:diff (docker gitleaks, --all): all clean
 - mutation check: 51/58 caught by tests, all restored
 - follow-up 2026-11-15: mutation check 64/64 caught (plus 2 helper-behaviour mutations: 66/66), all restored
 - follow-up 2026-11-15: gitleaks v8.30.1 dir on the 30 uncommitted files: no leaks found
 - follow-up 2026-11-15, Docker running: npm test 25 files, 855 passed | 5 skipped (860); test:ci (both REQUIRE flags) 25 files, 855 passed | 5 skipped (860); test:assert OK (106 required); g0 74/74; lint, format, typecheck, build, check:secrets, check:secrets:diff clean
---

## Prompt

Decisions on the T050 halt:

1. Apply the T043 fix: helpers take auth: string | null = AUTH, send Proxy-Authorization only
   when auth !== null, and the two no-credential cases pass null. Search all test files for
   the same default-parameter-with-undefined pattern and report any other cases (fix only
   T043's without asking).
2. Add 400 (malformed body, duplicate audit or username) to the internal contract's dated
   addition, alongside the port and rate-limit values.
3. Pass SCAN_TOTAL_TIMEOUT_MS to egress-proxy from the same .env value as the scanner.
   Test-first: update T014's Compose test, show it fail, then change Compose. Add a dated note
   to the ADR-0001 environment table.
4. Fix the stale comment in the scanner startup test header (T085 → T198).

Then continue from T050: T051, T198, T057 (firewall file generation only), the contract
addition, the full mutation check and the full pre-push suite as in the previous prompt.
Report the T043 and T014 test changes separately in the summary. Check off only tasks that
fully pass. Do not commit or push. Stop for review.

(Followed by "resume" after an interruption.)

## Response snapshot

- **T043**: helper fix applied; 27/27. The search found no other default parameter that receives an explicit `undefined`.
- **T014**: added `SCAN_TOTAL_TIMEOUT_MS` to the egress-proxy allowlist and a new test that both services take it from the same `.env` value. It was shown failing ("expected undefined to be defined") and passed after the Compose change. The ADR-0001 §1 note was added.
- **T051** (config.ts + main.ts): refusals, numeric and log-level validation, and a token minimum of 32 characters. Listeners on 172.30.30.30:3128 and :3129. The start event is logged once both are listening. Sweep runs every 1 s.
- **T198**: `startup-refusal.ts` uses only `isTestModeEnabled`; the placeholder stays idle after the checks.
- **T057** (file only): generator script plus an 18-range file; T045 passes 3/3; no firewall rule touched. Left unticked.
- **Mutation check**: 58 mutations, 51 caught by tests. Missed: a non-Basic scheme with valid credentials; `Buffer.equals` instead of `timingSafeEqual` (control: ESLint only; registry: nothing); the mid-transfer byte cap; a fixed hash key; `Proxy-Authorization` forwarded upstream; a revoked audit's open tunnel. Test additions were proposed; tests weren't changed.
- **Pre-push**: Docker Desktop was started for the REQUIRE_DOCKER run. All gates passed (totals above).

## Follow-up 2026-11-15 (prompt, verbatim)

Approved. Close all 7 mutation gaps, then re-verify. Do not commit or push.

1. Add tests:
   - T043: plain-HTTP upstream request carries no Proxy-Authorization; a revoked audit's open
     tunnel is cut; an expired audit's open tunnel is cut; the byte cap stops a transfer
     mid-stream.
   - T046: hostHash differs between two separate processes for the same host.
   - T041: valid credentials under a non-Basic scheme → 407.
   - Secrets comparison: add one shared constant-time compare helper with direct unit tests,
     used by both control.ts and credentials.ts. Extend the source check to require it in both
     files and ban .equals( and === on secret values there.
   - Add "PROXY_CONTROL_TOKEN shorter than 32 characters" to the shared startup case list
     (required count follows).
2. For each new test, show it fails under its mutation, then restore. Re-run the full mutation
   check and report 58+ of 58+ caught.
3. Tick T041–T046. Leave T057 unticked (install script still open).
4. Run gitleaks dir on the uncommitted working tree, then the full pre-push suite with Docker
   running for both npm test and test:ci. Paste raw totals.
5. Update PHR 54, then paste git status --short, listing test files and source files separately.
   Stop.

## Follow-up response snapshot

- New tests:
  - T043: four cases (no upstream `Proxy-Authorization`; revoked tunnel cut; expired tunnel cut before any sweep; mid-stream byte cap).
  - T046: two-process `hostHash` test.
  - T041: non-Basic scheme case.
  - `secret-compare.test.ts`: direct tests plus source checks for the helper, `control.ts` and `credentials.ts`.
  - T042: the constant-time check now points to `secretEquals`.
  - Startup case list: new egress-proxy case for a token under 32 characters, so 106 tests are required.
- `secretEquals` (SHA-256 digests + `timingSafeEqual`) replaces both direct comparisons.
- Every new test was shown failing under its mutation. The full run caught 64/64; two more helper-behaviour mutations make it 66/66.
- Flakiness found and fixed. The security project ran on Vitest's 5 s default while the T044 tests allow an 8 s spawn, so slow spawns under load failed. I set the security `testTimeout` to 20 s (T008 note); the approved T044 test files are unchanged. The new two-process test has its own 40 s timeout. Afterwards there were three clean runs of 789/789.
- T041–T046 ticked; T057 still unticked.

## Follow-up 2 2026-11-15 (prompt, verbatim)

Add a dated line to contracts/internal-egress-proxy.md §5: egress-proxy refuses to start when
PROXY_CONTROL_TOKEN is shorter than 32 characters. Contract only; no other change. Update PHR 54
and paste git status --short. Stop.

## Follow-up 2 response snapshot

- Added one dated line to contract §5 (egress-proxy refuses a `PROXY_CONTROL_TOKEN` shorter than 32 characters; ADR-0001 §1; T044 case). No other file changed except this PHR.

## Outcome

- ✅ Impact: egress-proxy implemented end to end (registry, control, logger, proxy, startup); scanner startup refusal; firewall range file.
- 🧪 Tests: full suite green under both REQUIRE flags; 105 required tests pass.
- 📁 Files: see the list above.
- 🔁 Next prompts: the rest of T057 (install-nl2.sh); T053+.
- 🧠 Reflection: mutation testing found real gaps (upstream credential stripping and tunnel cut-off are implemented but untested).

## Evaluation notes (flywheel)

- Failure modes observed: the Vitest 5 JSON reporter writes to .vitest/json/output.json, not stdout (the driver was fixed and the directory removed).
- Graders run and results (PASS/FAIL): all pre-push gates PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): add a T043 case asserting the upstream request has no Proxy-Authorization header.
