---
id: 26
title: Align Contract UTC and HTTPS Rules
stage: red
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: T030 review decisions (contract alignment)
labels: ["t030", "openapi", "contract", "date-time", "https", "ajv"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-accesslens-mvp/contracts/public-api.openapi.yaml
 - packages/shared/tests/support/contract.ts
 - history/prompts/001-accesslens-mvp/25-t030-openapi-conformance-tests.red.prompt.md
tests:
 - Ajv check of all 167 samples against the updated contract: 0 label mismatches
 - Same samples against the pre-change contract (v1.3.0): exactly the 11 pattern-dependent samples disagree; format-only samples are still rejected
 - npx tsc --noEmit -p packages/shared/tsconfig.json: only the 9 expected TS2307 missing-module errors
 - npx tsc --noEmit (root): rc 0
 - npx eslint on the changed test files: clean
 - npm run format:check: clean (specs/ is prettier-ignored; the YAML was checked by parsing)
 - npx vitest run --project unit openapi-conformance.test.ts: still red, Cannot find module '../../src/schemas/audit.ts' (expected)
---

## Prompt

T030 review decisions:

1. Keep all approved `*Schema` runtime export names.
2. Keep npm 11.6.2's generated package-lock.json. Document the @emnapi lockfile drift in the T030 PHR, without manually restoring entries.
3. Align the OpenAPI contract with the data model:
   - Date-time values must use UTC and end in Z.
   - issuedAt must use second precision with no fractional seconds.
   - helpUrl must use HTTPS.
   - Preserve the existing date-time and URI format validation while adding constraints for these requirements.
4. Add valid and invalid contract samples covering these restrictions.
5. Preserve contract-only limits where the data model is silent.
6. Do not implement Zod schemas.
7. Do not start T031.
8. Run the Ajv contract tests, TypeScript checks, ESLint and formatting checks relevant to the changes.
9. Report every changed file and test result.
10. Stop for review. Do not commit or push.

## Response snapshot

- **Contract** (v1.3.0 → 1.4.0): `format` kept everywhere; patterns added alongside.
  - `startedAt`, `completedAt`, `generatedAt`: `pattern: "Z$"`.
  - `issuedAt`: `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$`.
  - `helpUrl`: `pattern: "^https://"`.
  - Contract-only limits unchanged.
- **Samples**: 19 added (167 total). Valid: second-precision `issuedAt`; fractional seconds on the other date-times. Invalid: `+00:00` and other offsets, lowercase `z`, a missing zone, impossible dates or times, fractional `issuedAt`, http/ftp `helpUrl`, and a malformed https URI.
- **Discrimination**: the pre-change contract accepts exactly the 11 pattern-dependent invalid samples; the 8 format-dependent ones are rejected by both versions.
- **PHR 25**: the `@emnapi` drift and the owner's decision are recorded in detail.
- No Zod schemas, no T031, no commit or push.

## Outcome

- ✅ Impact: The contract now states the data model's UTC, second-precision, and HTTPS rules, and T032's Zod schemas must match them.
- 🧪 Tests: contract samples 167/167; T029/T030 remain red only for the missing schemas.
- 📁 Files: contract, support module, and PHR 25 changed, plus this PHR.
- 🔁 Next prompts: owner reviews; then T031.
- 🧠 Reflection: Running new samples against the old contract shows which constraint each one depends on.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): Ajv sample check PASS; old-contract discrimination PASS; tsc, eslint, format PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
