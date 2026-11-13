---
id: 36
title: T036 G0 Destination Suite and Required List
stage: red
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M1 decisions Q1-Q4; tests only for T034-T036
labels: ["m1", "g0", "t036", "sc-003", "ci", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/tests/security/destination-cases.ts
 - packages/shared/tests/security/g0-destination.test.ts
 - scripts/assert-required-tests.mjs
tests:
 - npm run test:security -- g0: 1 failed suite, no tests; Cannot find module '../../src/url-policy/resolve-and-check.ts'
 - Audit script loads (node --check, dynamic import): REQUIRED 76 (18 + 58 G0); ci-strictness evaluate() tests 5 passed
 - npm run test:assert on the report written before the G0 suite existed: FAIL, 58 G0 tests NOT EXECUTED (exit 1)
 - tsc (shared): only TS2307 (an exactOptionalPropertyTypes error in the case list was fixed)
 - Review rerun: npm run test:security -- g0 still fails only on Cannot find module '../../src/url-policy/resolve-and-check.ts'
 - Review: REQUIRED 77 (18 + 59 G0); the new case's title is required
 - Final decisions: REQUIRED 78 (18 + 60 G0); the all-IPv6 case's title is required
 - Real dns.lookup(family 4, all) on this host: ipv6.google.com and no-such-host.invalid reject with ENOTFOUND; example.com resolves to IPv4
---

## Prompt

M1 decisions approved:
- Q1: NON_PUBLIC_IPV4_RANGES is the single source of truth for the proxy and the firewall.
  ipaddr.js is used for parsing only. Amend ADR-0001 §3 to add 192.88.99.0/24,
  192.31.196.0/24, 192.175.48.0/24 and 192.52.193.0/24, with a dated amendment note.
- Q2: Reject all IP-literal URLs: IPv4 in any encoding, and all IPv6. Classification still
  applies to DNS answers. First check FR-001/FR-002 for conflicts, and report which existing
  ErrorCode applies. Do not add new codes.
- Q3: Enforce ≤2048 on raw input before parsing and on the normalised URL. Both → INVALID_URL.
- Q4: Add the G0 tests to the test:assert required list.

Write tests only, for T034, T035 and T036 (including the ADR amendment). T035 must include a
cross-check test that every non-unicast range ipaddr.js knows about is covered by
NON_PUBLIC_IPV4_RANGES. Show each test file failing for the right reason (missing module),
write PHRs, and report any conflicts with the spec instead of resolving them. Do not start
T037–T039. Do not commit or push. Stop for review.

## Response snapshot

- **Published case list (SC-003)**: `destination-cases.ts` has 52 cases.
  - 19 direct IP literals (Q2, including a public IPv4, a public IPv6, and the Compose container addresses);
  - 12 alternate encodings;
  - 13 DNS cases with stub answers (non-public, the four new ranges, mixed answers in either order; IPv6-only as no IPv4 answer or ENODATA; ENOTFOUND);
  - 6 redirect targets;
  - 2 allowed controls.
- **API expected from T039**: `resolveAndCheck(hostname, resolve) → { ok: true; addresses } | { ok: false; code: BLOCKED_DESTINATION | TARGET_UNREACHABLE }`. `resolve` returns IPv4 answers, as `dns.lookup` does with family 4 and all: true, or rejects with ENOTFOUND/ENODATA.
- **Suite**: one test per case, run through `validateUrl` then `resolveAndCheck` with a stub. Also:
  - the list covers all five kinds, its outcomes are existing ErrorCodes, and its titles are unique;
  - IP-literal URLs never trigger a DNS lookup;
  - a rebinding resolver is called once and only the validated address is returned;
  - one non-public answer blocks the host in any position.
- **Q4**: `assert-required-tests.mjs` imports the case list (Node 24 strips the types) and requires the 6 structural tests plus every per-case title (58 G0 entries; 76 required in total), so a dropped, renamed, or skipped G0 case fails CI.
- **Mappings**: unresolvable and IPv6-only hosts → `TARGET_UNREACHABLE`, matching research R5 and ADR-0001.
- **Reported, not resolved**: a resolver returning an IPv6 string isn't tested, because T036 says an IPv6-only answer is `TARGET_UNREACHABLE` while fail-closed would block it.
- Committing these tests before T037–T039 turns CI red (missing modules, and the audit's 58 required G0 tests).

## Review amendments (2026-11-13)

Prompt (verbatim):

```text
Review decisions for T034–T036. Tests and docs only; do not start T037–T039. Do not commit or push.

1. Q2 stands. Amend spec FR-001 (IP-literal hosts are rejected) and add a note to FR-002 that
   points to it, both dated. Error: BLOCKED_DESTINATION with detail { reason: "ip_literal" }.
   Update the T034 tests to assert the detail.
2. Add a dated note to research.md R3 item 4 pointing to ADR-0001 Amendment 3.
3. isPublicIPv4 accepts canonical dotted-quad only. Anything else (encoded forms such as
   0x08080808, IPv6, garbage) → non-public. Add T035 cases for this.
4. Ports: http only on 80 and https only on 443. Add T034 cases for http://host:443 and
   https://host:80 → PORT_NOT_ALLOWED.
5. Inputs without a scheme: input containing "://" is parsed as-is. Otherwise, a leading
   [a-zA-Z][a-zA-Z0-9+.-]*: NOT followed by a digit → UNSUPPORTED_SCHEME. Otherwise prefix
   https://. Add T034 cases: example.com:8080 → PORT_NOT_ALLOWED; user:pass@host and
   javascript:alert(1) → UNSUPPORTED_SCHEME; user:1234@host → CREDENTIALS_IN_URL.
6. T036: add a case where the resolver returns an IPv6 address among IPv4 answers →
   BLOCKED_DESTINATION. Keep IPv6-only host → TARGET_UNREACHABLE. Update the published case
   list and the test:assert count to match.
7. Rerun the three suites (each should still fail only on the missing modules), the shared
   tsc, lint and format:check. Update PHRs 34–36 and paste git status --short.
Stop for review.
```

- **New case (rule 6)**: "IPv6 address among IPv4 answers" (`dualstack.example` → `93.184.216.34`, `2606:4700:4700::1111`) → `BLOCKED_DESTINATION`. The IPv6-only cases (`[]` and `ENODATA`) stay `TARGET_UNREACHABLE`. The case-list type comment and the suite's resolver contract now say that any answer which isn't a public IPv4 address blocks the host, while no IPv4 answer at all is unreachable.
- **Count**: the published list has 53 cases (dns 14). Because the required titles are generated from the list, `test:assert` now requires 59 G0 tests (77 in total) with no edit to the audit script.
- **Was open (resolved in the final decisions below)**: a host whose answers are *only* IPv6 strings, with no IPv4, wasn't covered. Under the current rules it could be read either as IPv6-only → `TARGET_UNREACHABLE` or as a non-IPv4 answer → `BLOCKED_DESTINATION`.
- **Reruns**: each of the three suites still fails only on its missing module; shared `tsc` shows only the 4 TS2307 errors; `npm run lint` and `npm run format:check` exit 0.

## Final decisions (2026-11-13)

Prompt (verbatim):

```text
Final T034–T036 decisions. Tests and docs only; do not commit or push.

1. Resolver answers: TARGET_UNREACHABLE only when the IPv4 lookup returns no addresses. Any
   returned string that isn't canonical public IPv4 (including an all-IPv6 answer) →
   BLOCKED_DESTINATION. Add a T036 case for an all-IPv6 answer, and confirm the two IPv6-only
   cases are modelled as empty IPv4 answers. Update the case list; the audit count follows.
2. Add dated notes to the spec's "Ports" and "Missing scheme" edge cases stating the rules
   from PHR 34.
3. Rerun the three suites (each should fail only on the missing modules), the shared tsc,
   lint and format:check. Update PHRs 34 and 36, then paste git status --short. Stop.
```

- **Rule**: `TARGET_UNREACHABLE` only when the IPv4 lookup returns no addresses. Any returned string that isn't a canonical public IPv4 address, including an all-IPv6 answer, is `BLOCKED_DESTINATION`.
- **New case**: "all-IPv6 answer" (`v6strings.example` → `2606:4700:4700::1111`, `::1`) → `BLOCKED_DESTINATION`. The published list has 54 cases (dns 15), and the audit now requires 60 G0 tests (78 in total). The required titles follow the list automatically.
- **The two IPv6-only cases, as found**: only one is literally an empty answer (`v6only.example` → `[]`). The other (`v6only-nodata.example`) is an `ENODATA` rejection. Both mean the IPv4 lookup returned no addresses, so both stay `TARGET_UNREACHABLE`.
  - Real `dns.lookup` with family 4 rejects for an IPv6-only host (`ipv6.google.com` → `ENOTFOUND` here); it never resolves to `[]`. The rejection case is therefore the realistic path, and it was kept rather than converted to `[]`.
  - The case-list type comment and the suite's contract comment now define "no addresses" as `[]` or a not-found rejection (ENODATA, ENOTFOUND).
  - The owner should confirm this reading, or ask for the case to become `[]`.
- **Reruns**: each of the three suites still fails only on its missing module; shared `tsc` shows only the 4 TS2307 errors; `npm run lint` and `npm run format:check` exit 0.

## Outcome

- ✅ Impact: G0 suite and its published case list written ahead of T039; CI now requires every G0 case.
- 🧪 Tests: see the front matter.
- 📁 Files: destination-cases.ts, g0-destination.test.ts, and assert-required-tests.mjs, plus this PHR.
- 🔁 Next prompts: owner reviews the API shape and the IPv6-answer question; then T037–T039.
- 🧠 Reflection: Generating the required titles from the published list keeps SC-003's list, the G0 suite, and the CI audit from drifting apart.

## Evaluation notes (flywheel)

- Failure modes observed: none in the red run.
- Graders run and results (PASS/FAIL): expected-red run PASS; audit requirement demonstrated (58 NOT EXECUTED); eslint and prettier PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
