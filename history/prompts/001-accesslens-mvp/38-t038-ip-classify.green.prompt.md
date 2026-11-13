---
id: 38
title: T038 IP Classification
stage: green
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T037-T039 (URL policy)
labels: ["m1", "g0", "g1", "t038", "ip-ranges", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/src/url-policy/ip-classify.ts
tests:
 - ip-classify.test.ts (T035): 123/123
 - Mutation check: each of the 18 ranges removed → caught (5-8 failures each, including the ipaddr.js cross-check)
 - Mutation check: canonical check relaxed to any ipaddr-valid IPv4 → caught (6 encoded-form cases)
 - lint, format:check, typecheck (root + 4 workspaces), web build, check:secrets, check:secrets:diff: exit 0
 - npm test and test:ci (Docker and gitleaks required): 15 files, 611 passed, 5 skipped, 0 failed
 - npm run test:assert: OK (78 required tests passed; only allowlisted skips)
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

- **NON_PUBLIC_IPV4_RANGES**: the 18 CIDRs of ADR-0001 §3 with Amendment 3. It is the single source of truth for the proxy and, through T045, the firewall.
- **isPublicIPv4**: requires canonical dotted-quad input (octets 0-255, no leading zeros), parses it with ipaddr.js, and is true only if no listed range matches. Encoded forms, IPv6, and garbage are false. ipaddr.js's `range()` is never used.
- **Mutations**: every range removal is caught by the list-equality test, the cross-check, and the per-range points. Ranges that DNS cases resolve into are also caught by the G0 suite.

## Outcome

- ✅ Impact: implemented with no test, case-list, or audit change; full pre-push suite green; task checked off.
- 🧪 Tests: see the front matter.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews; T040 (G0) after a green CI run is recorded.
- 🧠 Reflection: Keeping the verdict in one explicit list makes the proxy and firewall comparable line by line.

## Evaluation notes (flywheel)

- Failure modes observed: the mutation driver crashed once on console encoding (cp1252 can't print "→"). `python -I` ignores PYTHONIOENCODING, so stdout is now reconfigured in the script. Sources were restored by `finally` each time.
- Graders run and results (PASS/FAIL): full suite PASS; mutation check 28/29 caught (raw-length gap, see PHR 37).
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): add a T034 case with a long fragment to isolate the raw-length check.
