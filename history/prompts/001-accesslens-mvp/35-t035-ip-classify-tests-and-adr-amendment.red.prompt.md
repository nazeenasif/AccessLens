---
id: 35
title: T035 IP Classification Tests and ADR Amendment
stage: red
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M1 decisions Q1-Q4; tests only for T034-T036
labels: ["m1", "g0", "g1", "t035", "adr-0001", "ip-ranges", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/tests/unit/ip-classify.test.ts
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - specs/001-accesslens-mvp/research.md (review: dated note on R3 item 4)
tests:
 - npx vitest run --project unit packages/shared/tests/unit/ip-classify.test.ts: 1 failed suite, no tests; Cannot find module '../../src/url-policy/ip-classify.ts'
 - ipaddr.js 2.5.0 SpecialRanges vs the ADR list plus the 4 new ranges: all 19 non-unicast entries covered (scratch check)
 - tsc (shared): only TS2307 for the missing url-policy modules (an implicit-any error caused by the missing module was fixed with an annotation)
 - Review rerun: still fails only on Cannot find module '../../src/url-policy/ip-classify.ts'
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

- **ADR-0001 Amendment 3 to §3** (Accepted 2026-11-13; earlier text kept unchanged; the header lists it):
  - adds 192.88.99.0/24, 192.31.196.0/24, 192.175.48.0/24, and 192.52.193.0/24 (now 18 ranges, plus Docker bridge subnets);
  - `NON_PUBLIC_IPV4_RANGES` is the single source of truth for the proxy and the firewall, kept equal by T045;
  - ipaddr.js is for parsing only, superseding R3 item 4's `range() !== "unicast"`;
  - a T035 cross-check fails the build if an ipaddr.js upgrade adds a range;
  - G0 and G1 are not passed.
- **API expected from T038**: `NON_PUBLIC_IPV4_RANGES` (CIDR strings) and `isPublicIPv4(address)`, which is true only for a public IPv4 address. Any IPv6 address or unparsable input is false (fail closed).
- **About 114 cases**:
  - the list equals the ADR list, and each entry is a valid CIDR on its boundary;
  - **cross-check**: every non-unicast range in ipaddr.js's `SpecialRanges` is covered by the list;
  - first, middle, and last address of each range are non-public;
  - 15 neighbouring addresses just outside the ranges, and 4 well-known public addresses, are public;
  - IPv6 (::1, fc00::/7, fe80::/10, IPv4-mapped, public) is never a public IPv4 address;
  - decimal, hex, and octal encodings of non-public addresses are non-public;
  - garbage input is non-public.
- **Reported, not changed**:
  - research R3 item 4 still says `range() !== "unicast"`; Amendment 3 supersedes it;
  - T035 lists IPv6 ranges while T038 exports only `isPublicIPv4`, so IPv6 input is defined as non-public;
  - encoded *public* addresses (for example `0x08080808`) are left unspecified.

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

- **Research**: R3 item 4 gets a dated note (2026-11-13) pointing to ADR-0001 Amendment 3. The original text is kept. This closes the research conflict reported earlier.
- **Canonical form only (rule 3)**: `isPublicIPv4` is true only for canonical dotted-quad public addresses. New cases:
  - non-public: `0x08080808`, `134744072`, `010.010.010.010`, `8.8.8.08`, `093.184.216.34`, `0x8.0x8.0x8.0x8`, `8.8`, `8.8.8.8.`;
  - public control: the canonical forms `8.8.8.8` and `93.184.216.34`.
  - The header comment documents the rule; the earlier "encoded public addresses unspecified" gap is closed.
- **Count**: about 124 cases (was about 114).
- **Reruns**: each of the three suites still fails only on its missing module; shared `tsc` shows only the 4 TS2307 errors; `npm run lint` and `npm run format:check` exit 0.

## Outcome

- ✅ Impact: ADR range list closed against ipaddr.js; tests written ahead of T038.
- 🧪 Tests: see the front matter.
- 📁 Files: ip-classify.test.ts and the ADR-0001 amendment, plus this PHR.
- 🔁 Next prompts: owner reviews; research R3 wording update if wanted; then T038.
- 🧠 Reflection: Using ipaddr.js's own table in the cross-check means a library upgrade that adds a range fails the build instead of silently opening a gap between proxy and firewall.

## Evaluation notes (flywheel)

- Failure modes observed: none in the red run.
- Graders run and results (PASS/FAIL): expected-red run PASS; coverage scratch check PASS; eslint and prettier PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
