---
id: 43
title: T191 Test Allowance Tests
stage: red
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Begin M2 with T189-T192 (tests first; T189 and T191 only)
labels: ["m2", "test-mode", "t191", "g0", "dns", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/tests/security/test-allowance.test.ts
tests:
 - npx vitest run --project security packages/shared/tests/security/test-allowance.test.ts: 5 failed | 46 passed (51)
 - tsc (shared): TS2305 (no exported TestAllowance) and TS2554 (3 arguments, 1-2 expected); eslint clean
 - npm run test:security -- g0: 74/74, with src/, the G0 suite, the case list and the audit unchanged
---

## Prompt

Begin M2 with T189–T192 (test-mode config and test allowance). Tests first.

1. Read ADR-0001 Amendment 4, ADR-0003 Addendum D, the FR-002 test-mode note, research R13,
   and T189–T192 in tasks.md.
2. Write T189 (packages/shared/tests/unit/test-mode-config.test.ts) and T191
   (packages/shared/tests/security/test-allowance.test.ts) exactly as specified.
3. Show each failing for the right reason (missing module or missing allowance option).
   The existing G0 suite must stay green and unchanged.
4. Write PHRs. Do not start T190 or T192. Do not commit or push. Stop for review.

## Response snapshot

- **API expected from T192**: `export type TestAllowance = { hosts: readonly string[]; subnet: string }` and `resolveAndCheck(hostname, resolve?, allowance?)`.
- **51 cases**:
  - **Allowed**: an allowlisted host resolving inside `172.30.50.0/24` (one answer, several, and the subnet's first and last addresses; every allowlisted host).
  - **Blocked for an allowlisted host**: public, another private range, the neighbouring `outbound` subnet, loopback, cloud metadata, just outside the subnet, three mixed orders, and IPv6.
  - **Non-allowlisted hosts unaffected**: a public host is still allowed; a non-allowlisted host resolving into the fixture subnet, a sub-domain of an allowlisted host, and another private range are blocked; an IP-literal host is still refused with `ip_literal` before any lookup.
  - **No allowance = G0**: every published G0 case that reaches the DNS check (dns, host, allowed, and the redirect-to-localhost case) gives the same result with no third argument, with `undefined`, and with an allowance for unrelated hosts.
- **Why exactly 5 fail (missing allowance option)**: the current function ignores a third argument.
  - the 4 "allowed" cases fail because the fixture subnet is private and therefore blocked today;
  - "an allowlisted host with a public answer" fails because nothing yet confines allowlisted hosts to the subnet;
  - the other 46 assert that the normal rules still hold, so they already pass and guard against T192 loosening anything.
- No T192 code; the G0 suite is unchanged; nothing committed or pushed.

## Outcome

- ✅ Impact: tests written ahead of the implementation; red only for the expected reason.
- 🧪 Tests: see the front matter.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews the API shape and the flagged choices; then T190 and T192.
- 🧠 Reflection: Running every published G0 case through the new parameter is the cheapest strong proof that the allowance can't leak into production behaviour.

## Evaluation notes (flywheel)

- Failure modes observed: two problems in the new test code, fixed before reporting: ESLint flagged unused `_omitted` destructuring in T189 (replaced with a `without()` helper), and `flatMap` couldn't unify the case union in T191 (explicit return type). Neither was part of the expected red.
- Graders run and results (PASS/FAIL): expected-red runs PASS; G0 suite 74/74 PASS; eslint and prettier PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
