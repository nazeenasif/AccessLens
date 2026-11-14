---
id: 44
title: T190 Test Mode Config
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
 - packages/shared/src/test-mode.ts
 - packages/shared/tests/unit/test-mode-config.test.ts (review: port case)
 - packages/shared/src/index.ts
 - specs/001-accesslens-mvp/tasks.md (T189-T192 checked off)
tests:
 - test-mode-config.test.ts (T189): 52/52
 - Review 2026-11-14: new port case failed against the existing code (message lacked 'port'); after the port rule, T189 53/53; with the port rule disabled: 1 failed | 52 passed; restored
 - Review reruns: npm run test:unit 540/540 (6 files); test:security -- g0 74/74; lint, format:check, shared tsc: exit 0
 - Mutation check (test-mode.ts): exact 'true', missing allowlist, empty entries, whitespace, uppercase, trailing dot, non-ASCII, wildcard, path, IP literal, subnet overlap, missing subnet: all caught
 - Mutation check: 'port silently dropped' NOT caught by a dedicated assertion (the entry is still rejected by the IP-literal check)
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

- **`parseTestModeConfig(env)`**:
  - only the exact string `true` enables test mode; otherwise it returns `{ enabled: false }` and ignores stray test variables (startup refusals are T044/T193);
  - with test mode on, the allowlist and fixture subnet are both required.
- **Allowlist**: split on commas, and each entry must match one canonical host-name pattern (lowercase ASCII letter-digit-hyphen labels, at most 253 characters, no trailing dot). Nothing is trimmed or lowercased, so whitespace, uppercase, a trailing dot, non-ASCII, wildcards, ports, schemes, paths, and empty entries are all rejected. Entries that are IP addresses are rejected by the shared `isIpLiteral`.
- **Subnet**: must parse as an IPv4 CIDR, and must not overlap the four production subnets (either contains the other at the shorter prefix).
- **Errors**: each error message starts with the variable name.
- **Mutation finding, reported and not fixed (tests are frozen)**: if the host-name pattern let a port through, `fixtures.test:8080` would still be rejected, because `isIpLiteral` treats any colon as IPv6. The entry never gets in, but the message would call it an IP address rather than a port. The tests only check that the error names the variable, so they can't tell which rule fired. A test asserting the message reason would pin it.

## Review addition (2026-11-14)

Prompt (verbatim):

```text
T190/T192 approved, with one small addition. Do not commit or push.

1. Add a T189 case asserting that an allowlist entry with a port (fixtures.test:8080) is
   rejected with an error that names the port problem, not "is an IP address". Show it fails
   with the port rule disabled, then restore the rule. Change test-mode.ts only if the new
   test fails against the current code.
2. Rerun the T189 file, the full unit project and test:security -- g0, then lint and format:check.
3. Update T190's note in tasks.md and PHR 44, then paste git status --short. Stop.
```

- **New T189 case**: "rejects an entry with a port, naming the port problem". It asserts the error
  for `fixtures.test:8080` names `ACCESSLENS_TEST_ALLOWLIST`, matches the word `port`, and does
  not say `IP address`.
- **Against the existing code it failed**: the message was `ACCESSLENS_TEST_ALLOWLIST:
  "fixtures.test:8080" is not a canonical host name`. Under the rule "change test-mode.ts only if
  the new test fails", `test-mode.ts` was changed.
- **The change**: a dedicated `HOST_WITH_PORT` rule (`^[^:]+:[0-9]+$`, exactly one colon, digits
  after it) now runs before the host-name pattern. It fails with `"…" includes a port; give the host
  name only`. Bare IPv6 such as `::1` has more than one colon, so it never matches this rule.
  `::1` and `[::1]` still fail the host-name pattern ("is not a canonical host name"), and
  `127.0.0.1` still gets "is an IP address, not a host name".
- **Proof**: T189 53/53. With the port rule disabled, exactly the new case fails (1 failed | 52
  passed); the file was restored and byte-compared, and the backup removed.
- **Reruns**: unit project 540/540, G0 74/74; lint, format:check, and the shared typecheck all exit 0.
- **Effect on the original mutation finding**: it is closed. A port entry is now reported as a
  port, and a test pins that.

## Outcome

- ✅ Impact: test mode's config parser and the DNS allowance exist; production paths unchanged; T189–T192 checked off.
- 🧪 Tests: see the front matter.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews; then T041 onward (M2 egress proxy, which uses the allowance in T050).
- 🧠 Reflection: One strict pattern, with no normalisation, makes the 'must already be canonical' rule simple to state and to test.

## Evaluation notes (flywheel)

- Failure modes observed: none in implementation; one mutation not caught by a dedicated assertion (the port entry, still rejected by a second rule).
- Graders run and results (PASS/FAIL): T189/T191/G0 PASS; mutation check 16/17 caught; full pre-push suite PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null (the port reason is now asserted; review 2026-11-14).
