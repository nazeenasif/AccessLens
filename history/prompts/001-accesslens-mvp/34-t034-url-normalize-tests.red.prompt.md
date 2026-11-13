---
id: 34
title: T034 URL Normalisation Tests
stage: red
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M1 decisions Q1-Q4; tests only for T034-T036
labels: ["m1", "g0", "t034", "url-policy", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - packages/shared/tests/unit/url-normalize.test.ts
 - specs/001-accesslens-mvp/spec.md (review: FR-001 amended, FR-002 note, Clarifications)
tests:
 - npx vitest run --project unit packages/shared/tests/unit/url-normalize.test.ts: 1 failed suite, no tests; Cannot find module '../../src/url-policy/validate-url.ts'
 - tsc (shared): only TS2307 for the missing url-policy modules
 - Review rerun: still fails only on Cannot find module '../../src/url-policy/validate-url.ts'
 - Final decisions: tests unchanged; still fails only on the missing validate-url.ts
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

- **API expected from T037**: `validateUrl(input) → { ok: true; url } | { ok: false; code: ErrorCode }`, where `url` is normalised. Only this function is imported; `normalize.ts` stays internal.
- **46 cases**:
  - normalisation: missing scheme → https; fragment stripped; IDN → punycode; scheme and host lowercased; default ports dropped;
  - Q3 length: 2048 accepted; raw 2049 rejected; 2048 raw that grows to 2056 once `https://` is added rejected; all → `INVALID_URL`;
  - `UNSUPPORTED_SCHEME` (ftp, file, javascript, data, ws); `CREDENTIALS_IN_URL` (user:pass, user only, password only); `PORT_NOT_ALLOWED` (8443, 8080, 22);
  - `INVALID_URL` for malformed input (empty, whitespace, no host, space in host, port > 65535, octet > 255);
  - Q2: 16 IP-literal forms (public and private IPv4, decimal/hex/octal/short/trailing-dot encodings, IPv6 including public and IPv4-mapped) → `BLOCKED_DESTINATION`.
- **Q2 conflict, reported and not resolved**: FR-001 says any absolute http(s) URL is accepted, and FR-002 requires rejecting only hosts that are or resolve to non-public addresses. Rejecting public IP literals is stricter than both. `BLOCKED_DESTINATION` is the existing code used: it is the only destination-policy code (contract group "URL / destination (FR-001–FR-005)"), and nothing in the spec, research, or data model names a code for IP literals.
- **Left untested (ambiguous)**:
  - `http://host:443` and `https://host:80`: T034 says "ports other than 80/443", but the proxy accepts only plain HTTP on 80 and CONNECT on 443 (R3);
  - scheme-less `host:port` and `user:pass@host`, which the WHATWG parser reads as a scheme.

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

- **Spec**: FR-001 is amended (dated 2026-11-13): IP-literal hosts are rejected with `BLOCKED_DESTINATION` and detail `{ reason: "ip_literal" }`. FR-002 gets a dated note pointing to it, and Clarifications has a Session 2026-11-13 entry. The Q2 conflict reported earlier is resolved by this amendment.
- **API**: a `validateUrl` failure may now carry `detail?: { reason: "ip_literal" }`. All 16 IP-literal cases assert the full result, including the detail.
- **Ports (rule 4)**: http only on 80, https only on 443; added `http://example.com:443/` and `https://example.com:80/` → `PORT_NOT_ALLOWED`.
- **Scheme-less input (rule 5)**:
  - `example.com:8080` → `PORT_NOT_ALLOWED`;
  - `user:pass@example.com` and `javascript:alert(1)` → `UNSUPPORTED_SCHEME`;
  - `user:1234@example.com` → `CREDENTIALS_IN_URL`;
  - positive control: `example.com:443` → `https://example.com/`.
- **Count**: 53 cases (was 46).
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

- **Spec edge cases** (dated notes, 2026-11-13; existing text kept):
  - *Missing scheme*: input containing `://` is parsed as written. Otherwise a leading `[a-zA-Z][a-zA-Z0-9+.-]*:` not followed by a digit is an unsupported scheme, and anything else gets `https://` prefixed. The 2048-character limit applies to raw input and to the normalised URL.
  - *Ports*: each scheme's own default only (`http` on 80, `https` on 443).
  - These close the open point that the rules lived only in the T034 test header and this PHR.
- **Tests**: unchanged in this round.
- **Reruns**: each of the three suites still fails only on its missing module; shared `tsc` shows only the 4 TS2307 errors; `npm run lint` and `npm run format:check` exit 0.

## Outcome

- ✅ Impact: tests written ahead of T037; red only because the module is missing.
- 🧪 Tests: see the front matter.
- 📁 Files: url-normalize.test.ts, plus this PHR.
- 🔁 Next prompts: owner reviews the API shape and the reported conflicts; then T037.
- 🧠 Reflection: Node's URL parser rewrites every encoded IPv4 form to dotted form, so IP-literal detection can run on the parsed hostname.

## Evaluation notes (flywheel)

- Failure modes observed: none in the red run.
- Graders run and results (PASS/FAIL): expected-red run PASS; eslint and prettier PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
