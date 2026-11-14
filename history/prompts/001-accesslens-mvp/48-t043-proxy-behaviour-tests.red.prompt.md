---
id: 48
title: T043 Proxy Behaviour Tests
stage: red
date: 2026-11-14
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: M2 test tasks T041-T046 (tests only)
labels: ["m2", "egress-proxy", "t043", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - services/egress-proxy/tests/integration/proxy.test.ts
tests:
 - T043: red as expected: Cannot find module '../../src/credentials.ts' (first missing import; proxy.ts is missing too)
 - G0 74/74, T189 53/53, T191 51/51: unchanged and green
 - tsc: only TS2307 for the missing egress-proxy modules; shared, scanner and root clean; eslint and prettier clean
---

## Prompt

T189–T192 are complete and green in CI. Continue M2 with the test tasks among T041–T046.
Tests only.

1. Read T041–T046 in tasks.md (including their dated test-mode notes), ADR-0001 (including
   Amendments 3 and 4), ADR-0003, research R3 and R13, the relevant spec FRs, and the
   url-policy and test-mode modules they build on.
2. Start by listing which of T041–T046 are test tasks and which are implementation tasks, and
   which implementation task each test task belongs to.
3. Write only the test tasks, exactly as specified. They must reuse the existing shared
   url-policy and test-mode modules, not reimplement them, and use NON_PUBLIC_IPV4_RANGES as
   the only range list.
4. T044 includes proposal test 3 (startup refusals). Add those tests to the test:assert
   required list as its note says.
5. Show each test file failing for the right reason (missing module or missing behaviour).
   The G0 suite, T189 and T191 must stay green and unchanged.
6. Report any conflicts between tasks, ADRs and spec instead of resolving them.
7. Write PHRs. Do not start any implementation task. Do not commit or push. Stop for review.

## Response snapshot

- **Task mapping (step 2)**: all six of T041–T046 are test tasks. T041→T048, T042→T049, T043→T050,
  T044→T051 (egress-proxy) and T085 (scanner), T045→T057 (generates the firewall list),
  T046→T052. None of their implementation tasks were started.
- **This PHR covers T043** (implementation T050).
- **Setup**: a real proxy on 127.0.0.1. DNS is a stub resolver, and `connect` is stubbed to record the validated address and port and then reach local test servers, so no test touches the internet.
- **Reuse**: shared `parseTestModeConfig`; the proxy is expected to use the shared `resolveAndCheck` and `TestAllowance`. There is no range list in the test.
- **Credentials**: 407 without credentials or with revoked ones, with no lookup and no connection.
- **Ports**: CONNECT only to :443 and HTTP only to :80; :8443, :80, :22 for CONNECT and :8080, :443 for HTTP all → 403 with no connection.
- **Destinations**: resolve once per request; non-public answers (RFC 1918, loopback, cloud metadata, mixed, IPv6) → 403 with the host recorded as blocked; an IP-literal CONNECT target → 403 with no lookup.
- **Rebinding**: the proxy connects to the first validated IP and never re-resolves.
- **Caps**: request and byte counting; the request cap and the byte cap each refuse further requests and set their flag.
- **Test mode (proposal test 4)**: an allowlisted host inside 172.30.50.0/24 is served; a non-allowlisted public host, and an allowlisted host resolving to public, another private range, or the outbound subnet, are all refused; with the allowlist set but test mode off, the allowlist is ignored.
- **Conflicts reported for the whole batch (not resolved)**:
  1. **`SCAN_ENABLED` never reaches scanner or egress-proxy.** ADR-0001 §1's environment table and
     the T014 per-service environment allowlists give it to `web` only, yet Amendment 4 says every
     service refuses test mode together with `SCAN_ENABLED=true`. T044 tests the refusal by setting
     the variable directly. In the real Compose topology the check can only fire if the variable
     leaks into those containers. Owner choice: pass `SCAN_ENABLED` to them (changes T014 and the
     ADR table), or keep the check as defence against a stray host variable only.
  2. **Scanner and the allowlist.** ADR Amendment 4 says the scanner reads only
     `ACCESSLENS_TEST_MODE`, but `parseTestModeConfig` (T190) requires the allowlist and subnet
     whenever test mode is on, and the T085 note says the scanner reads test mode "through
     `test-mode.ts`". Either the overlay also gives the scanner both values, or the scanner needs a
     mode-only check. T044's scanner cases therefore omit the "invalid allowlist" case.
  3. **R14's redaction set doesn't list `Proxy-Authorization`**, which carries the per-audit
     credentials. T046 requires it redacted anyway, under "no tokens".
  4. **`pino` is not installed.** T052 (pino logger, research R14 "pino 10") needs a new
     dependency; the decision is left to that task.
  5. **APIs that no document specifies, defined by these tests for review**: the registry methods
     (`recordBlocked`, `markCapped`, `sweep`, the `logger` option); the control routes, the
     `X-Proxy-Control-Token` header, and 201/204/401/404/429; the proxy's 403 for every policy
     refusal; rate-limit parameters (injected); the `hostHash` digest (only "deterministic lowercase
     hex" is asserted); the firewall file format (one CIDR per line, `#` comments).

## Outcome

- ✅ Impact: T043 written test-first; red only for the expected reason.
- 🧪 Tests: see the front matter.
- 📁 Files: see the front matter, plus this PHR.
- 🔁 Next prompts: owner reviews the API shapes and the reported conflicts; then T050.
- 🧠 Reflection: Reusing the shared test-mode parser and destination check in these tests means the proxy can't quietly grow a second policy.

## Evaluation notes (flywheel)

- Failure modes observed: none in the red runs; one leftover no-op `.then((r) => r)` in the control test was cleaned up before running.
- Graders run and results (PASS/FAIL): expected-red runs PASS; G0/T189/T191 unchanged PASS; lint and format PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
