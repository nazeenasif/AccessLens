---
id: 60
title: T057 NL2 Firewall Scripts
stage: green
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: implement T055, T056, T057 scripts (tests unchanged)
labels: ["m2", "firewall", "nl2", "t057", "no-root", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - ops/firewall/install-nl2.sh (new)
 - ops/firewall/uninstall-nl2.sh (new)
 - ops/firewall/verify-nl2.sh (new)
 - ops/firewall/accesslens-nl2.service (new)
 - specs/001-accesslens-mvp/tasks.md (T057 ticked; note)
tests:
 - nl2-firewall: 40/40 pass (fake tools only; no real firewall command ran)
 - mutation (disposable non-root Linux container, pinned node:24.22.1-bookworm-slim, copy of the tree): 49/54 nl2 mutations caught, plus 1 extra mutant caught; 5 reported
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

- `install-nl2.sh` does everything in this order:
  - runs all pre-checks before any change: DOCKER-USER exists; Compose outbound subnet = actual; helpers off per Amendment 5 (sysctl 0, or missing on 6.0+; no raw `-j CT --helper`); `conntrack` installed; the range file is valid;
  - deletes the existing tagged rules;
  - inserts the DOCKER-USER drops at positions 1..n (ranges in file order, then IPv4 bridge subnets, deduplicated) and the INPUT drops at 1..m (host `/32`s);
  - runs `conntrack -D -s <outbound>`, tolerating "0 flow entries".
- **`uninstall-nl2.sh`:** removes only the tagged rules.
- **`verify-nl2.sh`:** read-only; names every missing, extra, ACCEPT or out-of-order rule.
- **The unit:** exactly `After=docker.service accesslens-networks.service` and `Before=accesslens-stack.service`, with `Type=oneshot`, `RemainAfterExit=yes`, `ExecStart=/opt/accesslens/ops/firewall/install-nl2.sh` and `WantedBy=multi-user.target`.
- **The mutation check** ran in a container because on Windows each run takes about 370 s versus 19 s on Linux. The session ended mid-run; it was resumed from mutation 57 on a fresh copy.
- **Missed mutations:**
  - IPv6 subnets not filtered in `network_subnets`: equivalent, because `dests` filters again;
  - deduplication removed: a test gap, because no bridge subnet in the test data duplicates a range;
  - outbound network missing accepted: equivalent, because the subnet-mismatch check still fails closed naming "outbound";
  - INPUT tagged rules deleted before the pre-checks: a test gap, because the fail-closed cases seed a stale rule only in DOCKER-USER (the DOCKER-USER variant is caught by 9 cases);
  - verify with a missing DOCKER-USER chain: equivalent, because it still exits 1 naming DOCKER-USER.

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

- **New tests:**
  - a bridge subnet equal to a listed range (`custom_pool` = `192.168.0.0/16`) gets exactly one DOCKER-USER rule;
  - every fail-closed case also seeds a stale tagged INPUT rule, which must survive untouched.
- **New pre-check, test-first:**
  - "fails closed when an AccessLens container is running" failed first, because install exited 0;
  - `install-nl2.sh` then gained a `docker ps --filter label=com.docker.compose.project=accesslens` check that counts only running containers;
  - three "installs when…" cases pass: created only (`up --no-start`), stopped, and only another project running;
  - the fake `docker ps` honours the label filter and `-a`;
  - the nl2 case list has 44 tests, and `test:assert` requires 150.
- **Mutation check** (Linux container): 10/10 caught, all restored:
  - removing the deduplication fails 9 tests;
  - deleting INPUT rules before the pre-checks fails 11 cases;
  - six variants of the new check are caught: removed, `docker ps -a`, no project filter, wrong label, warning without failing, checked after the deletes.
- **Docs:**
  - ADR-0001 Amendment 5 notes: re-running install requires the stack to be stopped; and Docker must never start the scan path before `accesslens-nl2.service`, because systemd owns the lifecycle;
  - T129: confirm the `/opt/accesslens` path;
  - T128/T129: the stack unit owns restarts and keeps `After=`/`Requires=accesslens-nl2.service`.
- **Restart decision, test-first (T014):** the new Compose test "scanner and egress-proxy have restart: "no"; web keeps unless-stopped" failed first ("expected 'unless-stopped' to be 'no'"). It passed after the `docker-compose.yml` change, and `docker compose config` confirms the policies `no`, `no` and `unless-stopped`.
- **Gitleaks v8.30.1 `dir` on the 17 uncommitted files:** no leaks found.
- **Pre-push suite, Docker 29.9.2 running:**
  - npm test: 28 files passed; 931 passed | 5 skipped (936);
  - test:ci (both REQUIRE flags): 28 files passed; 931 passed | 5 skipped (936);
  - test:assert: OK (150 required tests passed);
  - g0: 74/74;
  - lint, format, typecheck, web build, check:secrets and check:secrets:diff all clean.

## Outcome

- ✅ Impact: T057 implemented; 40/40 nl2 tests green through fakes; no real firewall touched.
- 🧪 Tests: full pre-push suite green; 146 required tests pass.
- 📁 Files: see the list above.
- 🔁 Next prompts: set the scripts' executable bit in git; confirm /opt/accesslens in T129; define accesslens-networks/accesslens-stack units (T128/T129).
- 🧠 Reflection: Running the mutation check in a pinned Linux container made it practical and also exercised the ubuntu CI path (/bin/bash, non-root).

## Evaluation notes (flywheel)

- Failure modes observed: the session ended during the mutation run (resumed on a fresh container); the nl2 suite is slow on Windows because of process start-up cost.
- Graders run and results (PASS/FAIL): all pre-push gates PASS; mutation 84/91 caught (plus 1 extra mutant caught), 7 reported.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): add a duplicate bridge subnet and a stale INPUT rule to the nl2 test data.
