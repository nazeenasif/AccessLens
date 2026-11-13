---
id: 39
title: T039 Resolve and Check
stage: green
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T037-T039 (URL policy)
labels: ["m1", "g0", "t039", "dns", "rebinding", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/src/url-policy/resolve-and-check.ts
 - packages/shared/tests/security/destination-cases.ts (review: kind "host", 13 cases)
 - packages/shared/tests/security/g0-destination.test.ts (review)
 - scripts/assert-required-tests.mjs (review: 2 structural titles)
tests:
 - npm run test:security -- g0 (T036): 60/60
 - Mutation check: any-non-public-blocks weakened to all-non-public → caught (4 G0 cases); empty-answer rule off → caught
 - Real resolver smoke check (3 runs): example.com allowed (2 addresses); localhost blocked; ipv6.google.com unreachable (resolve4 returns []); no-such-host.invalid unreachable (ENOTFOUND)
 - lint, format:check, typecheck (root + 4 workspaces), web build, check:secrets, check:secrets:diff: exit 0
 - npm test and test:ci (Docker and gitleaks required): 15 files, 611 passed, 5 skipped, 0 failed
 - npm run test:assert: OK (78 required tests passed; only allowlisted skips)
 - Review RED: before the change, 14 failed | 60 passed (13 host cases + the no-lookup test)
 - Review GREEN: npm run test:security -- g0 74/74; REQUIRED 92 (18 + 74 G0)
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

- **resolveAndCheck(hostname, resolve = resolveIPv4)**: resolves once. A DNS error with a code (ENOTFOUND, ENODATA, or any other DNS failure) → `TARGET_UNREACHABLE`; errors without a code are rethrown as programming errors. An empty answer → `TARGET_UNREACHABLE`. Any answer that isn't a canonical public IPv4 address → `BLOCKED_DESTINATION`. Otherwise it returns the validated addresses for the caller to connect to, without re-resolving.
- **resolveIPv4**: `dns.promises.resolve4`, an IPv4-only A-record query returning all addresses. It never uses the OS lookup, so neither IPv6 nor the hosts file can leak in.
- **Real-DNS findings**:
  - resolve4 returns `[]` for an IPv6-only host (`ipv6.google.com`), whereas `dns.lookup` with family 4 rejects with ENOTFOUND. The empty-answer case in the published list therefore models the chosen resolver exactly, and the ENODATA case covers the error path.
  - One early smoke run returned `TARGET_UNREACHABLE` for example.com. Direct resolve4 retries through the router's DNS (192.168.0.1) and 1.1.1.1 both succeeded, and three later runs were consistent, so it was a transient DNS failure, correctly reported as unreachable.
- **Gate**: G0 is NOT passed. T040 is unchanged and needs a green CI run recorded in gate-evidence.md.
- **Not in scope**: an IP-literal hostname passed straight to resolveAndCheck isn't special-cased here. validateUrl rejects IP literals first, and the M2 proxy will need its own handling for CONNECT targets.

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

- **Behaviour**: `resolveAndCheck` refuses an IP-literal host before any lookup with `{ ok: false, code: "BLOCKED_DESTINATION", detail: { reason: "ip_literal" } }`. `DestinationCheck` gained an optional `detail`.
- **Detection** (`isIpLiteral`): a host counts as an IP literal if any of these holds:
  - it contains a colon or starts with a bracket (IPv6; a DNS name never contains either);
  - `ipaddr.isValid` accepts it;
  - the WHATWG host parser turns it into dotted IPv4 (decimal, hex, octal, short, and trailing-dot forms).
- **Ordinary names still resolve**: `example.com`, `xn--bcher-kva.example`, `1.example`, `a1b2.example`, `123.example.com`, and `localhost` all still reach the resolver (scratch check).
- **Tests (written first)**:
  - the case list's `DestinationCase` is now a union with a new kind `"host"` (field `host`). 13 cases: IPv4 loopback, RFC 1918, cloud metadata, public IPv4, decimal/hex/octal/short loopback, IPv6 loopback (bare and bracketed), IPv4-mapped IPv6, and public IPv6 (bare and bracketed);
  - the suite sends `host` cases straight to `resolveAndCheck`;
  - the structural test now expects six kinds, and was renamed to "covers direct, encoded, DNS-resolved, redirect-target and IP-literal host cases, plus allowed controls";
  - a new test, "IP-literal hosts are refused by resolveAndCheck with detail ip_literal, before any DNS lookup", asserts the full result and that the stub resolver is never called.
- **Red, then green**: before the change, 14 failed (each host case rejected because the stub throws an error without a DNS code when called, and the no-lookup test failed); after it, 74/74.
- **Audit**: the two hand-listed structural titles in `assert-required-tests.mjs` were updated (one renamed, one added). The per-case titles follow the case list, so 74 G0 tests and 92 in total are required.
- This closes the "not in scope" note above: an IP-literal connect target is now refused even when the URL policy is skipped.
- **Suite**:
  - lint, format:check, typecheck (root + 4 workspaces), web build, check:secrets, and check:secrets:diff: exit 0;
  - `npm run test:security -- g0`: 74/74;
  - `npm test` and `test:ci` (Docker and gitleaks required): 15 files, 626 passed, 5 skipped, 0 failed;
  - `test:assert`: OK, 92 required tests passed.
- **tasks.md**: the stray leading space on the OD-10 row is removed (the row matches HEAD again); the T037 and T039 notes are updated.

## Outcome

- ✅ Impact: implemented with no test, case-list, or audit change; full pre-push suite green; task checked off.
- 🧪 Tests: see the front matter. After the review: G0 74/74; full suite 626 passed; 92 required.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews; T040 (G0) after a green CI run is recorded.
- 🧠 Reflection: Querying A records directly removes a whole class of IPv6 and hosts-file leaks that dns.lookup allows.

## Evaluation notes (flywheel)

- Failure modes observed: the mutation driver crashed once on console encoding (cp1252 can't print "→"). `python -I` ignores PYTHONIOENCODING, so stdout is now reconfigured in the script. Sources were restored by `finally` each time.
- Graders run and results (PASS/FAIL): full suite PASS; mutation check 28/29 caught (raw-length gap, see PHR 37).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null (the long-fragment case was added in the review).
