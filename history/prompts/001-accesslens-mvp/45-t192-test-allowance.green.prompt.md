---
id: 45
title: T192 Test Allowance
stage: green
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T190 and T192 (test mode)
labels: ["m2", "test-mode", "adr-0001", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/src/url-policy/resolve-and-check.ts
tests:
 - test-allowance.test.ts (T191): 51/51; G0 suite: 74/74
 - Mutation check: ALL->SOME answers caught (3 mixed cases); exact->suffix host match caught (sub-domain case); test allowance leaking into the no-allowance path caught (3 G0 cases + 3 T191 cases); allowance before the IP-literal check caught (14)
 - lint, format:check, typecheck (root + 4 workspaces), web build, check:secrets, check:secrets:diff: exit 0
 - npm run test:security -- g0: 74/74
 - npm test and test:ci (Docker and gitleaks required): 17 files, 729 passed, 5 skipped, 0 failed
 - npm run test:assert: OK (92 required tests passed; only allowlisted skips)
---

## Prompt

T189/T191 tests are approved and committed locally. Implement T190 and T192. Do not commit or push.

1. Do not modify any test, the G0 case list, or the audit script. If a test seems wrong, stop and report.
2. T190: packages/shared/src/test-mode.ts with parseTestModeConfig, as the tests expect.
3. T192: the optional allowance argument on resolveAndCheck. With no allowance, the code path
   and results must be identical to today's. An allowlisted host must have ALL answers inside
   the fixture subnet; IP-literal hosts are still refused before DNS.
4. Mutation check with automatic restore: the exact-"true" check, each allowlist rejection
   rule, the subnet-overlap check, "all answers inside the subnet", "allowlist matches exact
   host only", and the no-allowance path. Report what each is caught by, then confirm no
   scratch files remain.
5. Run the full pre-push suite (npm test, test:ci with both REQUIRE flags, test:assert,
   test:security -- g0, lint, format, typecheck, build, secret scans) and paste raw totals.
6. Check off T189–T192 only if everything passes. Write PHRs and stop for review.

## Response snapshot

- **New API**: `export type TestAllowance = { hosts: readonly string[]; subnet: string }`; `resolveAndCheck(hostname, resolve = resolveIPv4, allowance?)`.
- **Order**:
  1. IP-literal hosts are refused before DNS, as before, allowance or not;
  2. resolve once; DNS failure or an empty answer → `TARGET_UNREACHABLE`, as before;
  3. only if an allowance is given **and** it lists the host exactly: every answer must be a canonical dotted-quad IPv4 address inside the subnet, else `BLOCKED_DESTINATION`;
  4. otherwise the unchanged public-IPv4 rule.
- **No allowance**: with no allowance, step 3 is skipped entirely, so the code path and results are today's. The G0 suite (74) and T191's comparison of every published case confirm it.
- **`isIpLiteral`**: now exported so T190 can reject IP-address allowlist entries with the same logic.
- **Usage contract (documented in the type comment)**: callers pass an allowance only when test mode is on (T050 proxy, T116 web).

## Outcome

- ✅ Impact: test mode's config parser and the DNS allowance exist; production paths unchanged; T189–T192 checked off.
- 🧪 Tests: see the front matter.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews; then T041 onward (M2 egress proxy, which uses the allowance in T050).
- 🧠 Reflection: Placing the allowance after the IP-literal check and the empty-answer rule keeps every production refusal ahead of the only test-mode exception.

## Evaluation notes (flywheel)

- Failure modes observed: none in implementation; one mutation not caught by a dedicated assertion (the port entry, still rejected by a second rule).
- Graders run and results (PASS/FAIL): T189/T191/G0 PASS; mutation check 16/17 caught; full pre-push suite PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): assert the error reason, not just the variable name, for the port case.
