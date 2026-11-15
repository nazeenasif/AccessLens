---
id: 56
title: T054 Proxy Client Tests
stage: red
date: 2026-11-15
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M2 test tasks T053-T057 (tests only)
labels: ["m2", "scanner", "t054", "egress-proxy", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - services/scanner/tests/unit/proxy-client.test.ts (new)
 - specs/001-accesslens-mvp/tasks.md (T054 note)
tests:
 - T054: red as expected (Cannot find module '../../src/proxy-client.ts'); scanner tsc shows TS2307 plus TS7006 that follow from it
 - harness check: passes against a throwaway reference (deleted); usage-after-terminal and revoke-not-in-finally variants each fail
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

- Wrote `services/scanner/tests/unit/proxy-client.test.ts`. The client runs against the egress-proxy's real `createControlHandler` and `CredentialRegistry`, so nothing is reimplemented.
- `controlUrlFrom` uses port 3129.
- `register` produces random credentials (at least 32 bytes of password), and the proxy then accepts them.
- `revoke` makes the proxy refuse the pair.
- `usage` returns the proxy's view.
- Errors don't carry the token.
- `runWithAuditProxy` order is register → run → usage → terminal → revoke, including the failure paths (register, run, usage, terminal throwing, and a failed revoke).

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

- T054 tests approved as written; no change this round. Still red until T056.

## Outcome

- ✅ Impact: T054 written; red until T056.
- 🧪 Tests: red for the right reason (missing modules or scripts); the existing suites are unchanged.
- 📁 Files: see the list above.
- 🔁 Next prompts: Implement T056 after review.
- 🧠 Reflection: The ordering rule needed a small orchestration function (`runWithAuditProxy`); its contract is in the test header for review.

## Evaluation notes (flywheel)

- Failure modes observed: none in the deliverable; harness validated against a throwaway reference.
- Graders run and results (PASS/FAIL): eslint PASS, prettier PASS, tsc PASS except the expected missing-module errors.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
