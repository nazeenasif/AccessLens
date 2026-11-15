---
id: 57
title: T057 NL2 No-Root Tests
stage: red
date: 2026-11-15
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M2 test tasks T053-T057 (tests only)
labels: ["m2", "firewall", "nl2", "t057", "no-root", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - tests/config/nl2-firewall.test.ts (new)
 - tests/config/fixtures/nl2-fake-tool.sh (new)
 - specs/001-accesslens-mvp/tasks.md (T057 note)
 - follow-up 2 2026-11-15: unit After= line (test + title), T128/T129 and T057 notes, ADR-0001 Amendment 5 note
 - follow-up 2026-11-15: tests/support/nl2-cases.ts (new); scripts/assert-required-tests.mjs (NL2_REQUIRED); history/adr/0001-scanner-isolation-and-egress-control.md (Amendment 5); tasks.md (T057, T128, T129 notes)
tests:
 - nl2-firewall: 18/18 red as expected (scripts and unit file missing: exit 127 / ENOENT)
 - follow-up 2026-11-15: 40/40 red for the right reason; 40/40 pass against a throwaway reference; all 40 required in test:assert (146 required in total)
 - harness check: 18/18 pass against a throwaway reference (deleted); bottom-append, ctstate match, missing helper check and a global conntrack flush are each rejected
 - no firewall rule was run, installed or modified; the test refuses to run as root
---

## Prompt

Egress proxy core is complete and green in CI. Continue M2 with T053–T057. Tests first.

1. Read T053–T057 in tasks.md (including dated notes), ADR-0001 (all amendments), the
   internal egress-proxy contract, research R3/R13/R14, and the egress-proxy and scanner code
   they build on.
2. List which of T053–T057 are test tasks and which are implementation, and which test task
   each implementation task pairs with. For T057's install script, say what can be tested
   without root or a real firewall (for example, a dry run that prints the rules it would apply).
3. Write only the test tasks (plus any no-root test for T057's script), exactly as specified.
   Reuse the shared url-policy, test-mode and NON_PUBLIC_IPV4_RANGES; reimplement nothing.
   Add any security-critical tests to the test:assert required list where tasks.md says to.
4. Show each failing for the right reason. Existing suites must stay green and unchanged.
5. Do NOT run, install or modify any firewall rules on this machine. Do not touch G1 tasks
   (T058–T062, T064–T066, T184).
6. Report conflicts instead of resolving them. Write PHRs. Do not commit or push. Stop for review.

## Response snapshot

- No-root approach: run the real scripts with stateful fakes for `iptables`, `docker`, `sysctl`, `ip` and `conntrack` placed first on `PATH`.
- The fakes keep the chains in files and log every call.
- Safety guards: the test refuses to run as root; `PATH` holds no sbin directory; a source check bans `sudo`, absolute tool paths, `ip6tables` and `nft`.
- Tests cover:
  - top-of-DOCKER-USER tagged drops for all ranges (`NON_PUBLIC_IPV4_RANGES`) and IPv4 bridge subnets;
  - INPUT position-1 drops for host addresses;
  - no ACCEPT and no ctstate match;
  - only DOCKER-USER/INPUT touched; no flush or policy change;
  - an outbound-only conntrack flush after the inserts, with exit 1 tolerated;
  - an idempotent re-run that deletes stale tagged rules first;
  - five fail-closed pre-checks, each with no mutation;
  - uninstall removing only tagged rules;
  - the unit file (`After=docker.service`, a `Before=` line, oneshot running `install-nl2.sh`, `WantedBy`).
- Harness fix found while validating: Git's `bin/bash.exe` launcher puts its own directories ahead of `PATH`, so the test uses `usr/bin/bash.exe`.
- Conflicts reported, not resolved:
  - the `nf_conntrack_helper` sysctl is gone on kernel 6.0 and later;
  - no Compose-stack unit is defined;
  - `verify-nl2.sh` has no specified behaviour.

## Follow-up 2026-11-15 (prompt, verbatim)

T053/T054/T057 tests approved, with these decisions. Tests and docs only. Do not commit or push.

1. Conntrack helpers: helpers count as "off" if nf_conntrack_helper=0, or if the sysctl is
   missing AND the kernel is ≥ 6.0 (parse uname -r). A missing sysctl on a kernel < 6.0 →
   fail closed. On any kernel, fail closed if any raw-table rule uses "-j CT --helper". Add
   tests for each case (fake uname and fake iptables raw output). Add a dated ADR-0001
   amendment explaining the change and citing kernel commit b118509076b3.
2. accesslens-nl2.service: After=docker.service and Before=accesslens-stack.service (that unit
   will be defined in T128/T129; add a dated note there). Test both lines exactly.
   Separately, report how the install pre-checks find the live bridge subnets, and whether
   they need the Compose networks to exist before the stack starts. Report only; don't resolve.
3. verify-nl2.sh: read-only. Exit 0 only if every expected tagged rule is present at the top
   of DOCKER-USER and INPUT in the expected order with no ACCEPT; otherwise non-zero with a
   message naming what's wrong. Test that it makes only read-only iptables calls (-S/-L/-C)
   and fails on a missing, reordered or extra rule.
4. Confirm the T057 harness uses /bin/bash on Linux (ubuntu-24.04 CI) and that the not-root
   guard passes there. Show the code path.
5. Add the nl2 firewall tests to the test:assert required list.
6. Show the new tests failing for the right reason; existing suites unchanged. Update PHRs
   55–57 and tasks.md notes, then paste git status --short. Stop.

## Follow-up response snapshot

- **Conntrack helpers (ADR-0001 Amendment 5, citing kernel commit b118509076b3):**
  - helpers count as off if `nf_conntrack_helper=0`, or if the sysctl is missing and `uname -r` is 6.0 or later;
  - fail closed if the sysctl is missing on kernel 5.15, 5.19 or an unparseable version, or if any raw-table rule uses `-j CT --helper` (with the sysctl at 0, and on 6.8 without the sysctl);
  - `-j CT --notrack` is accepted;
  - the fake tool gained `uname` and whole-table listing (`iptables -t raw -S`).
- **Unit:** exactly `After=docker.service` and `Before=accesslens-stack.service`; dated notes added on T128/T129.
- **verify-nl2.sh:** must be read-only (`-S`/`-L`/`-C`) and pass on the expected set and right after install. It must fail, naming the problem, on:
  - a missing DOCKER-USER or INPUT rule;
  - reordered DOCKER-USER or INPUT rules;
  - an untagged rule or the ESTABLISHED accept above the drops;
  - an extra tagged rule;
  - a tagged ACCEPT;
  - a missing DOCKER-USER chain.
- **Order defined:** ranges in file order, then IPv4 bridge subnets in `docker network ls` order; INPUT in `ip` order. The install tests now check this order.
- **Required list:** cases and titles moved to `tests/support/nl2-cases.ts`, and all 40 nl2 tests are now required in `test:assert` (106 → 146). The source check's title no longer contains an absolute path.
- **Red for the right reason:** 40/40 fail because the scripts and unit are missing (exit 127 / ENOENT).
- **Harness check:** 40/40 pass against a throwaway reference (deleted). Six broken variants are each rejected: a missing sysctl accepted on any kernel, the raw-table check removed, reverse order, verify ignoring order, verify making a mutating call, and the wrong `Before=` unit.
- **Reported, not resolved:** how the bridge subnets are found at install time, and the networks having to exist before the stack starts.

## Follow-up 2 2026-11-15 (prompt, verbatim)

Approved. One change, then stop. Tests and docs only; do not commit or push.

1. accesslens-nl2.service: After=docker.service accesslens-networks.service, and
   Before=accesslens-stack.service. Update the test to check both lines exactly.
2. Add dated notes to T128/T129: define accesslens-networks.service (oneshot,
   "docker compose up --no-start", so the networks exist before nl2 installs) and
   accesslens-stack.service (After= and Requires=accesslens-nl2.service, so the stack never
   starts without the firewall).
3. Add a dated note to ADR-0001 Amendment 5: default Docker address pools fall inside the
   listed ranges; a host with custom pools outside them must rerun install-nl2.sh after
   creating networks; G1 records the daemon's address-pool configuration.
4. Confirm the nl2 tests still fail only on the missing scripts. Update PHR 57, then paste
   git status --short. Stop.

## Follow-up 2 response snapshot

- **Unit test:** the only `After=` line must be exactly `After=docker.service accesslens-networks.service`, and the only `Before=` line exactly `Before=accesslens-stack.service`. The title in `tests/support/nl2-cases.ts` changed to match, so `test:assert` follows (146 required).
- **T128/T129:** the dated notes now define `accesslens-networks.service` (oneshot, `docker compose up --no-start`) and `accesslens-stack.service` (`After=` and `Requires=accesslens-nl2.service`). The T057 note was updated to match.
- **ADR-0001 Amendment 5:** dated note added:
  - default address pools fall inside the listed ranges;
  - a host with custom pools must rerun `install-nl2.sh` after creating networks;
  - the unit order;
  - G1 (T066) records the daemon's address-pool configuration.
- **Check:** the 40 nl2 tests still fail only because the scripts and unit are missing (exit 127, "No such file", ENOENT). A throwaway unit file with the right lines passes the unit test, and one with only `After=docker.service` fails it (file removed).

## Outcome

- ✅ Impact: No-root tests for T057 written; red until the scripts exist.
- 🧪 Tests: red for the right reason (missing modules or scripts); the existing suites are unchanged.
- 📁 Files: see the list above.
- 🔁 Next prompts: implement T057's scripts (install, uninstall, verify, unit) against these tests.
- 🧠 Reflection: Validating the harness against a reference found the bash launcher's PATH reordering; without it the pre-check cases would have passed for the wrong reason.

## Evaluation notes (flywheel)

- Failure modes observed: none in the deliverable; harness validated against a throwaway reference.
- Graders run and results (PASS/FAIL): eslint PASS, prettier PASS, tsc PASS except the expected missing-module errors.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
