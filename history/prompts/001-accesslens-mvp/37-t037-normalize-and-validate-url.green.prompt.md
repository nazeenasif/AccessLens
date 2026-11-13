---
id: 37
title: T037 Normalise and Validate URL
stage: green
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T037-T039 (URL policy)
labels: ["m1", "g0", "t037", "url-policy", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/src/url-policy/normalize.ts
 - packages/shared/src/url-policy/validate-url.ts
 - packages/shared/src/index.ts
 - specs/001-accesslens-mvp/tasks.md (T037-T039 checked off)
 - packages/shared/tests/unit/url-normalize.test.ts (review: raw-length case)
tests:
 - url-normalize.test.ts (T034): 53/53
 - Mutation check: IP-literal rejection, normalised length, port, both scheme checks, credentials: caught
 - Mutation check: raw length check off: NOT caught (236 tests still pass)
 - lint, format:check, typecheck (root + 4 workspaces), web build, check:secrets, check:secrets:diff: exit 0
 - npm test and test:ci (Docker and gitleaks required): 15 files, 611 passed, 5 skipped, 0 failed
 - npm run test:assert: OK (78 required tests passed; only allowlisted skips)
 - Review: new T034 case passes with the raw-length check; with the check disabled: 1 failed | 53 passed (the new case); restored: 54/54
---

## Prompt

T034–T036 tests are approved and committed locally. Implement T037, T038 and T039 in order.
Do not commit or push.

1. Do not modify any test, the case list, or the test:assert audit. If a test seems wrong,
   stop and report it.
2. T039: the real resolver must do IPv4-only DNS resolution returning all addresses (for
   example dns.promises.resolve4), not the OS lookup, which can return IPv6. Resolve once, and
   return the validated addresses for the caller to connect to.
3. Mutation check with automatic restore: disable each rule in turn (each range, the
   canonical-dotted-quad check, the IP-literal rejection, both length checks, the port rule,
   the scheme rule, the credentials check, and the any-non-public-blocks rule). Report which
   tests catch each change, then confirm no scratch files remain.
4. Run the full pre-push suite: npm test, test:ci with the REQUIRE_DOCKER and REQUIRE_GITLEAKS
   flags set, test:assert (77 or more required tests), npm run test:security -- g0, lint,
   format, typecheck, build and the secret scans. Paste the raw totals.
5. Check off T037–T039 only if everything passes. Do NOT touch T040: G0 passes only after a
   green CI run is recorded in gate-evidence.md. Write PHRs and stop for review.

## Response snapshot

- **normalize.ts**: trims the input, then applies the scheme rule. Input with `://` is parsed as written; a leading `[a-zA-Z][a-zA-Z0-9+.-]*:` not followed by a digit is `UNSUPPORTED_SCHEME`; anything else gets `https://`. It then parses with WHATWG URL (unparsable → `INVALID_URL`) and strips the fragment.
- **validate-url.ts**, in order:
  - raw length > 2048 → `INVALID_URL`;
  - normalise;
  - protocol other than http/https → `UNSUPPORTED_SCHEME`;
  - username or password → `CREDENTIALS_IN_URL`;
  - any remaining port → `PORT_NOT_ALLOWED` (the parser drops each scheme's own default, so only http:80 and https:443 survive);
  - bracketed IPv6 or dotted IPv4 host (every IPv4 encoding is already rewritten) → `BLOCKED_DESTINATION` with detail `ip_literal`;
  - normalised length > 2048 → `INVALID_URL`.
- **Exports**: re-exported from the package index; `normalize.ts` stays internal.
- **Test gap, reported and not fixed (tests are frozen)**: no T034 case isolates the raw-length check. The 2049-character input normalises to 2049 characters, so the normalised check rejects it anyway. Suggested case: a 2049-character URL that is mostly a `#fragment`, which shrinks once normalised.

## Review additions (2026-11-13)

Prompt (verbatim):

```text
T037–T039 approved, with two small additions. Do not commit or push.

1. T034: add a case where a 2049-character input, mostly a #fragment, normalises below 2048 →
   INVALID_URL. Show it fails with the raw-length check disabled, then restore the check.
2. resolveAndCheck: if the host is an IP literal (IPv4 in any form, or IPv6), return
   BLOCKED_DESTINATION with detail { reason: "ip_literal" } without calling the resolver.
   Add G0 cases for this (the case list and required count follow), including a check that the
   stub resolver is never called. Show they fail before the change, then implement it.
3. Remove the stray leading space on the OD-10 row in tasks.md.
4. Rerun the full pre-push suite, including test:assert and test:security -- g0, and paste the
   raw totals. Update PHRs 37 and 39, then paste git status --short. Stop.
```

- **New T034 case**: "rejects raw input over 2048 even when it normalises shorter". The input is `https://example.com/#` padded to 2049 characters. Normalising strips the fragment, leaving `https://example.com/` (20 characters), so only the raw-length check can reject it.
- **Mutation proof**: with `input.length > MAX_URL_LENGTH` disabled, exactly this test fails (1 failed | 53 passed). The source was restored and byte-compared, and the backup removed. This closes the gap reported above; every T037 rule is now covered by a test.
- **Suite**:
  - lint, format:check, typecheck (root + 4 workspaces), web build, check:secrets, and check:secrets:diff: exit 0;
  - `npm run test:security -- g0`: 74/74;
  - `npm test` and `test:ci` (Docker and gitleaks required): 15 files, 626 passed, 5 skipped, 0 failed;
  - `test:assert`: OK, 92 required tests passed.
- **tasks.md**: the stray leading space on the OD-10 row is removed (the row matches HEAD again); the T037 and T039 notes are updated.

## Outcome

- ✅ Impact: implemented with no test, case-list, or audit change; full pre-push suite green; task checked off.
- 🧪 Tests: see the front matter. After the review: T034 54/54; full suite 626 passed.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews; T040 (G0) after a green CI run is recorded.
- 🧠 Reflection: The parser's canonicalisation of hosts and default ports lets each rule be a single, simple check.

## Evaluation notes (flywheel)

- Failure modes observed: the mutation driver crashed once on console encoding (cp1252 can't print "→"). `python -I` ignores PYTHONIOENCODING, so stdout is now reconfigured in the script. Sources were restored by `finally` each time.
- Graders run and results (PASS/FAIL): full suite PASS; mutation check 28/29 caught (raw-length gap, see PHR 37).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null (the long-fragment case was added in the review).
