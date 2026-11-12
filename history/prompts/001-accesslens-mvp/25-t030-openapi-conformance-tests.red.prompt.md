---
id: 25
title: T030 OpenAPI Conformance Tests
stage: red
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: T029 review rename, then T030 only (red phase)
labels: ["t029", "t030", "openapi", "ajv", "zod", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - packages/shared/tests/unit/schemas.test.ts
 - packages/shared/tests/unit/openapi-conformance.test.ts
 - packages/shared/tests/support/contract.ts
 - package.json
 - package-lock.json
tests:
 - npx vitest run --project unit packages/shared/tests/unit/openapi-conformance.test.ts: 1 failed suite, no tests collected; Cannot find module '../../src/schemas/audit.ts' (expected red)
 - Scratch check of all 148 samples against the contract with Ajv only: 0 label mismatches
 - npx tsc --noEmit -p packages/shared/tsconfig.json: only TS2307 for the missing schema modules
 - eslint and prettier on the new and changed files: clean
 - schemas.test.ts after the rename: still red for the same missing-module reason
---

## Prompt

T029 review decision:

1. Rename the runtime schema imports/exports expected by the tests to:
   AuditSchema, FindingSchema, ScannerFindingSchema,
   AffectedNodeSchema, SignedEvidenceV1Schema.

2. Keep inferred TypeScript type names as:
   Audit, Finding, ScannerFinding, AffectedNode, SignedEvidenceV1.

3. Do not implement any schemas.
4. Do not modify unrelated files.
5. Now begin T030 only: write the OpenAPI conformance tests specified in tasks.md.
6. Run the focused T030 test and report its expected result.
7. Stop after T030 for review.
8. Do not commit or push.

(Follow-up answer: add ajv 8.20.0 + ajv-formats 3.0.1 as the JSON Schema 2020-12 validator.)

## Response snapshot

- **T029 rename**: imports and uses in `schemas.test.ts` now use the `…Schema` names. The header comment documents the type names.
- **Validator**: owner chose `ajv@8.20.0` and `ajv-formats@3.0.1`, added as exact-pinned root devDependencies.
- **Lockfile drift (`@emnapi`)**:
  - *What changed*: besides adding `ajv`, `ajv-formats`, `fast-uri` and `require-from-string`, and moving ESLint's `ajv@6` into nested `node_modules`, npm 11.6.2 removed two lockfile entries: `node_modules/@emnapi/core` and `node_modules/@emnapi/runtime`, both 1.10.0 and marked `optional`, `peer` and `dev`.
  - *Not caused by this task*: running `npm install --package-lock-only` against the committed `package.json` and lockfile, with no changes, removes the same two entries.
  - *Impact*: they are optional peers of the wasm32 bindings `@unrs/resolver-binding-wasm32-wasi` and `@tailwindcss/oxide-wasm32-wasi`, which install only on wasm32 platforms, not on the Windows or Linux x64 machines used here and in CI. `@emnapi/wasi-threads` and the copy of `@emnapi/runtime` nested under `@img/sharp-wasm32` remain.
  - *Decision (owner, T030 review)*: keep npm's generated lockfile; don't restore the entries by hand.
- **Support module**: `packages/shared/tests/support/contract.ts` loads the contract, validates with Ajv 2020 plus formats, and defines 148 labelled samples covering all 11 components.
- **Test**: `openapi-conformance.test.ts` requires the same verdict from contract and Zod, and checks component coverage.
- **New export names for T032**: `PartialReasonSchema`, `ImpactSchema`, `AuditEventSchema`, `ExplainRequestSchema`, `ExplainResponseSchema`, `ErrorCodeSchema`, `ErrorBodySchema`.
- **Contract/data-model mismatches** avoided in samples and reported: timezone offsets and millisecond precision in date-times; any-scheme `uri` for `helpUrl`.
- No schemas implemented; no commit or push.

## Outcome

- ✅ Impact: T030 written and red for the expected reason; the contract half is verified independently.
- 🧪 Tests: focused run fails to load the missing modules; sample labels 148/148 agree with the contract.
- 📁 Files: 2 new test files, 1 test file renamed in place, package.json and lockfile.
- 🔁 Next prompts: owner reviews export names and the two mismatches, then T031.
- 🧠 Reflection: Keeping samples free of Zod imports made the contract half checkable before any implementation exists.

## Evaluation notes (flywheel)

- Failure modes observed: lockfile relock drops wasm32 optional entries regardless of the change.
- Graders run and results (PASS/FAIL): expected-red run PASS; Ajv sample check PASS; lint and format PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Decide whether the contract should require UTC "Z" date-times and https helpUrls, as the data model does.
