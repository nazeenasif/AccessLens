---
id: 42
title: T189 Test Mode Config Tests
stage: red
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Begin M2 with T189-T192 (tests first; T189 and T191 only)
labels: ["m2", "test-mode", "t189", "adr-0001", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/tests/unit/test-mode-config.test.ts
tests:
 - npx vitest run --project unit packages/shared/tests/unit/test-mode-config.test.ts: 1 failed suite, no tests; Cannot find module '../../src/test-mode.ts'
 - tsc (shared): TS2307 for src/test-mode.ts (plus T191's expected TS2305/TS2554); eslint clean
 - G0 suite unchanged: 74/74
 - Review addition: canonical-entry cases added (52 cases total); still fails only on Cannot find module '../../src/test-mode.ts'; tsc shows only TS2307 for this file; eslint clean
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

- **API expected from T190**: `parseTestModeConfig(env)` from `packages/shared/src/test-mode.ts`. It returns `{ enabled: false }`, or `{ enabled: true, allowlist, fixtureSubnet }`, and throws an Error naming the offending variable.
- **42 cases**:
  - **`ACCESSLENS_TEST_MODE`**: only the exact `true` enables it; unset, empty, `TRUE`, `True`, `1`, `yes`, `on`, leading or trailing space, and `false` are disabled; an empty environment is disabled.
  - **`ACCESSLENS_TEST_ALLOWLIST`**: several host names accepted. Rejected: IPv4 (plain and encoded), IPv6 (bare and bracketed), wildcards, a port, a scheme, a path, empty entries (middle and trailing), an empty list, and a missing allowlist.
  - **`ACCESSLENS_TEST_FIXTURE_SUBNET`**: `172.30.50.0/24` and another non-overlapping subnet accepted. Rejected: non-CIDR input, no prefix, a prefix above 32, IPv6, empty, each of the four production subnets itself, a supernet of them, a subnet inside `outbound` and inside `scan-ctl`, and a missing subnet.
- **Interpretive choices, flagged for review**:
  - test mode on with no allowlist or subnet is a config error (fail closed), since test mode would otherwise reach nothing;
  - when test mode is off, the parser just returns `{ enabled: false }`; refusing stray test variables is left to the startup tasks (T044, T193), as T189 doesn't specify it;
  - entries aren't trimmed or lowercased, and no case asserts either way (decided in the review: rejected, never normalised).
- No T190 code; nothing committed or pushed.

## Review addition (2026-11-13)

Prompt (verbatim):

```text
T189/T191 tests approved, with one addition. Do not commit or push.

Choices confirmed:
1. Test mode on with no allowlist or subnet → config error.
2. With test mode off, the parser ignores stray test variables (T044/T193 refuse them at startup).
3. Allowlist entries must already be canonical: reject any entry containing whitespace,
   uppercase letters, a trailing dot, or non-ASCII characters (international names must be
   given in xn-- form). The error names ACCESSLENS_TEST_ALLOWLIST. No silent trimming or
   lowercasing.

Add T189 cases for choice 3 (leading/trailing space, an inner space, uppercase, trailing dot,
a Unicode host name; plus an xn-- entry accepted). Confirm T189 still fails only on the
missing module. Update PHR 42 and paste git status --short. Stop.
```

- **Choices confirmed**: (1) test mode on with no allowlist or subnet → config error; (2) with
  test mode off, the parser ignores stray test variables (T044/T193 refuse them at startup);
  (3) allowlist entries must already be canonical.
- **New describe block** "ACCESSLENS_TEST_ALLOWLIST: entries must already be canonical", with a
  dated comment recording the decision:
  - **accepted**: `fixtures.test,xn--bcher-kva.test`, returned unchanged;
  - **rejected, error names `ACCESSLENS_TEST_ALLOWLIST`**: leading space, trailing space, a space
    after the comma, an inner space, a tab, an uppercase letter, all uppercase, a trailing dot,
    and a Unicode host name (`bücher.test`). Each is rejected rather than normalised.
- **Count**: T189 now has 52 cases (was 42).
- **Still red only for the missing module**: `Cannot find module '../../src/test-mode.ts'`;
  `tsc` reports only TS2307 for this file; eslint clean. The tab case is stored as the `\t`
  escape, checked on disk.
- **The first-round open choice** about trimming and lowercasing is now decided: neither.

## Outcome

- ✅ Impact: tests written ahead of the implementation; red only for the expected reason.
- 🧪 Tests: see the front matter.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews the API shape and the flagged choices; then T190 and T192.
- 🧠 Reflection: Making the error name the variable gives operators a clear startup message, and lets the tests check which rule fired without fixing exact wording.

## Evaluation notes (flywheel)

- Failure modes observed: two problems in the new test code, fixed before reporting: ESLint flagged unused `_omitted` destructuring in T189 (replaced with a `without()` helper), and `flatMap` couldn't unify the case union in T191 (explicit return type). Neither was part of the expected red.
- Graders run and results (PASS/FAIL): expected-red runs PASS; G0 suite 74/74 PASS; eslint and prettier PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
