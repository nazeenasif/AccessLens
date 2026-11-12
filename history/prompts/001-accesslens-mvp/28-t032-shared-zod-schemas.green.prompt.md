---
id: 28
title: T032 Shared Zod Schemas
stage: green
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T032 only (Zod schemas)
labels: ["t032", "schemas", "zod", "openapi", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - packages/shared/src/schemas/primitives.ts
 - packages/shared/src/schemas/evidence.ts
 - packages/shared/src/schemas/finding.ts
 - packages/shared/src/schemas/audit.ts
 - packages/shared/src/schemas/errors.ts
 - packages/shared/src/schemas/events.ts
 - packages/shared/src/schemas/explain.ts
 - packages/shared/src/index.ts
tests:
 - T029 schemas.test.ts and T030 openapi-conformance.test.ts: 227 passed, 0 failed
 - Mutation check, 20 single-rule mutations: 17 caught; 3 uncaught (data-model-only rules no test covers)
 - Scratch probes of those 3 rules: 13/13 as intended
 - Ajv vs Zod probe of suspected conflicts: 6 confirmed divergences (Zod stricter)
 - npx vitest run --project unit: 227 passed; wording.test.ts still red (T033, expected)
 - non-Docker config tests: 35 passed, 1 skipped (allowlisted T116 skip)
 - npm run lint, npm run format:check, npx tsc --noEmit -p tsconfig.json: pass
 - npm run typecheck: only error is TS2307 for src/wording.ts (T033)
---

## Prompt

The test-first foundation review is complete.

Approved:
- T029 schema tests and the approved *Schema export names.
- T030 OpenAPI conformance tests, including the OpenAPI 1.4.0 contract, UTC date-time constraints, second-precision issuedAt, and case-sensitive HTTPS helpUrl.
- T031 wording tests, including the limitations statement, partial-reason explanations, banned-claim detection, verbatim axe text handling, and self-checks.

Begin implementation with T032 only.

Instructions:
1. Read tasks.md, data-model.md, public-api.openapi.yaml, the relevant tests, research.md, and the applicable ADRs.
2. Implement the Zod schemas using the exact exports expected by T029 and T030.
3. Ensure all Zod schemas enforce the applicable OpenAPI constraints and data-model requirements.
4. Preserve the distinction between scanner findings and web findings.
5. Enforce exact UTC, second-precision, and case-sensitive HTTPS behavior.
6. Do not weaken tests or change expected behavior merely to make them pass.
7. Do not implement T033 wording yet.
8. Run the focused T029 and T030 tests, package TypeScript checks, ESLint, formatting, and relevant existing tests.
9. Report any contract/schema conflicts instead of silently resolving them.
10. Stop after T032 for review.

Do not commit or push.

(Follow-up: "resume" after an interruption while writing the schema files.)

## Response snapshot

- **Schemas**: `audit.ts`, `finding.ts`, `evidence.ts`, `events.ts`, `explain.ts` and `errors.ts`, plus a `primitives.ts` for shared fields (avoids a finding↔evidence import cycle). The package entry re-exports them. Types use the names without `Schema`.
- **Scanner vs web findings**: discriminated unions on `kind`. A scanner violation has no evidence keys (strict); a web violation requires both evidence and signature; manual review never has them.
- **UTC and HTTPS**: `z.iso.datetime()` (Z only) and `{ precision: 0 }` for `issuedAt`. `helpUrl` requires a lowercase `https://` prefix plus RFC 3986 characters, because `z.url()` alone accepts `HTTPS://` and spaces.
- **Results**: no test changed; 227/227 pass.
- **Mutation check**: 3 data-model rules have no test (completedAt ≥ startedAt, exact R2 tags, hosts-only sampleHosts); scratch probes show they behave as intended.
- **Conflicts reported, not resolved**: the contract accepts non-v4/nil/urn UUIDs, lowercase `t` or a space as separator, and leap seconds, where Zod rejects; `ExplainResponse.findingId` follows the contract (any string).
- No T033; no commit or push.

## Outcome

- ✅ Impact: T029 and T030 green; the shared model is implemented.
- 🧪 Tests: 227 passed; 17/20 mutations caught; the rest documented.
- 📁 Files: 7 new schema files, index.ts updated, plus this PHR.
- 🔁 Next prompts: owner decides on tests for the 3 uncovered rules and the reported conflicts; then T033.
- 🧠 Reflection: A first-run green needed the mutation check to show which rules the tests actually constrain.

## Evaluation notes (flywheel)

- Failure modes observed: an expected length-unit conflict (code points vs UTF-16 units) turned out not to exist; a boundary probe settled it.
- Graders run and results (PASS/FAIL): T029/T030 PASS; mutations 17/20; lint, format, typecheck PASS apart from T033's expected red.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add T029 cases for the three uncovered data-model rules.
