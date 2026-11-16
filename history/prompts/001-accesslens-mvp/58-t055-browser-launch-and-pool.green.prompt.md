---
id: 58
title: T055 Browser Launch and Pool
stage: green
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: implement T055, T056, T057 scripts (tests unchanged)
labels: ["m2", "scanner", "t055", "chromium", "sandbox", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - services/scanner/src/browser.ts (new)
 - specs/001-accesslens-mvp/tasks.md (T053, T055 ticked; T055 note)
tests:
 - T053: 13/13 pass
 - mutation: 21/21 browser.ts mutations caught (flags, sandbox, context options, recycle, per-slot pool)
 - npm test (Docker 29.9.2 running): 28 files passed; 925 passed | 5 skipped (930)
 - test:ci (REQUIRE_DOCKER=1, REQUIRE_GITLEAKS=1): 28 files passed; 925 passed | 5 skipped (930)
 - test:assert: OK (146 required tests passed; only allowlisted skips)
 - test:security -- g0: 74/74; lint, format, typecheck, web build, check:secrets, check:secrets:diff clean
 - gitleaks v8.30.1 dir on the 11 uncommitted files: no leaks found
---

## Prompt

T053/T054/T057 tests approved and committed locally. Implement T055 (browser.ts), T056
(proxy-client.ts), and T057's scripts (install-nl2.sh, uninstall-nl2.sh, verify-nl2.sh) and
accesslens-nl2.service. Do not commit or push.

1. Do not modify tests, case lists or the audit script. If a test seems wrong, stop and report.
2. NEVER run the real scripts, iptables, sysctl or conntrack on this machine. Only run them
   through the test harness with the fake tools.
3. browser.ts: Chromium sandbox on, never --no-sandbox; proxy-client.ts reuses the
   egress-proxy contract and never logs or returns the token.
4. Mutation check with automatic restore: every launch flag and sandbox setting, per-audit
   proxy credentials, the 50-audit recycle, register → run → counters → terminal → revoke-in-
   finally order, token never in errors, every install rule (position, tags, order), each
   pre-check including the kernel/helper rules, idempotent re-run, conntrack scope and order,
   uninstall tagged-only, verify read-only and each verify failure. Report what catches each.
   Confirm no scratch files remain.
5. Run gitleaks on the uncommitted files, then the full pre-push suite with Docker running
   (npm test, test:ci with both REQUIRE flags, test:assert at 146+, test:security -- g0,
   lint, format, typecheck, build, secret scans). Paste raw totals.
6. Tick T053–T057 only if everything passes. Write PHRs. Stop for review.

(Resumed with "resume" after the previous session ended during the mutation run.)

## Response snapshot

- `browser.ts`:
  - `LAUNCH_ARGS` holds the four R3 flags;
  - `launchOptions()` returns `{ chromiumSandbox: true, args }`;
  - `contextOptions()` sets the proxy `http://<EGRESS_PROXY_ADDR>` with the audit's credentials, `acceptDownloads: false`, `serviceWorkers: "block"` and 1280×800;
  - `createBrowserPool()` launches one browser per slot lazily, shares concurrent launches, doesn't cache a failed launch, recycles after 50 audits, and checks slot range.
- Mutation check: every flag, sandbox setting, context option, recycle rule and slot rule is caught by the T053 tests.

## Follow-up 2026-11-16 (prompts, verbatim)

T055–T057 approved, with these additions. Do not commit or push.

1. Add the three missing tests:
   a. T054: make fetch itself fail; the error must not contain the token.
   b. nl2: include a bridge subnet that duplicates a listed range; the rule appears once.
   c. nl2 fail-closed cases: put a stale tagged rule in INPUT too; it must survive a failed
      pre-check untouched.
2. New install pre-check: install-nl2.sh refuses (exit non-zero, no changes) while any
   AccessLens container is running. Test-first: add the nl2 cases (fake docker ps), show them
   fail, then implement. Add them to the nl2 case list (the required count follows). Add a
   dated ADR-0001 Amendment 5 note: re-running install requires the stack to be stopped,
   because install deletes before inserting.
3. Mutation check for each new test and the new pre-check (Linux container as before).
4. Add a dated note to T129: confirm the /opt/accesslens checkout path used by ExecStart.
5. Run gitleaks on the uncommitted files and the full pre-push suite with Docker running.
   Paste raw totals.
6. Update PHRs 58–60, then paste git status --short with test files and source files listed
   separately. Stop.

Decision on the restart conflict: set restart: "no" for scanner and egress-proxy (the scan
path). web keeps its current policy. Test-first: update T014's Compose test to require
restart: "no" for those two services, show it fail, then change docker-compose.yml. Add a
dated ADR-0001 Amendment 5 note (Docker must never start the scan path before
accesslens-nl2.service; systemd owns the lifecycle) and a dated note on T128/T129: the stack
unit owns restarts after a crash and must keep the After=/Requires= order on
accesslens-nl2.service.

Then resume: run gitleaks on the uncommitted files and the full pre-push suite with Docker
running (npm test, test:ci with both REQUIRE flags, test:assert at 150+, test:security -- g0,
lint, format, typecheck, build, secret scans). Paste raw totals. Update PHRs 58–60, then paste
git status --short with test files, source files and docs listed separately. Do not commit
or push. Stop.

## Follow-up response snapshot

- T055 approved; `browser.ts` is unchanged this round.
- **Gitleaks v8.30.1 `dir` on the 17 uncommitted files:** no leaks found.
- **Pre-push suite, Docker 29.9.2 running:**
  - npm test: 28 files passed; 931 passed | 5 skipped (936);
  - test:ci (both REQUIRE flags): 28 files passed; 931 passed | 5 skipped (936);
  - test:assert: OK (150 required tests passed);
  - g0: 74/74;
  - lint, format, typecheck, web build, check:secrets and check:secrets:diff all clean.

## Outcome

- ✅ Impact: T055 implemented; T053 green.
- 🧪 Tests: full pre-push suite green; 146 required tests pass.
- 📁 Files: see the list above.
- 🔁 Next prompts: Review; M3 page controls (`permissions: []` and the rest) build on `contextOptions`.
- 🧠 Reflection: Implementation passed the approved tests unchanged.

## Evaluation notes (flywheel)

- Failure modes observed: the session ended during the mutation run (resumed on a fresh container); the nl2 suite is slow on Windows because of process start-up cost.
- Graders run and results (PASS/FAIL): all pre-push gates PASS; mutation 84/91 caught (plus 1 extra mutant caught), 7 reported.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): add a duplicate bridge subnet and a stale INPUT rule to the nl2 test data.
