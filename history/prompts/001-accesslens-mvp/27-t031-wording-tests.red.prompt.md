---
id: 27
title: T031 Wording Tests
stage: red
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: T030 final review decisions, then T031 only (red phase)
labels: ["t030", "t031", "wording", "banned-claims", "fr-013", "fr-014", "sc-006", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - packages/shared/tests/support/contract.ts
 - packages/shared/tests/unit/wording.test.ts
tests:
 - Ajv check of all 168 contract samples: 0 label mismatches (uppercase HTTPS:// rejected by the pattern; format uri alone accepts it)
 - Contract YAML parseDocument: 0 errors, 0 warnings, version 1.4.0
 - npx vitest run --project unit packages/shared/tests/unit/wording.test.ts: 1 failed suite, no tests collected; Cannot find module '../../src/wording.ts' (expected red)
 - Scratch probe of the statement predicates: each check fails only when its own point is removed
 - npx tsc --noEmit -p packages/shared/tsconfig.json: wording.test.ts adds only TS2307 for src/wording.ts
 - eslint and npm run format:check: clean
---

## Prompt

T030 final review decisions:

1. Keep OpenAPI version 1.4.0. Do not revert it or introduce /api/v2.
2. Add an invalid contract sample for uppercase HTTPS:// in helpUrl. The contract's ^https:// requirement is case-sensitive, and Zod must reproduce that exact behavior.
3. Preserve all existing UTC and second-precision requirements.
4. Do not implement Zod schemas.
5. Do not modify unrelated files.
6. Run the focused Ajv contract tests and relevant formatting/YAML validation.
7. Then begin T031 only, following tasks.md exactly.
8. Write the T031 wording tests first; do not implement wording yet.
9. Run the focused T031 test and demonstrate that it fails for the expected reason.
10. Report changed files and results. Stop for review.
11. Do not commit or push.

## Response snapshot

- **T030**: added an invalid `HTTPS://` helpUrl sample (168 samples, all agree with the contract). The contract file is unchanged in this round and stays at v1.4.0.
- **T031**: `packages/shared/tests/unit/wording.test.ts`, 39 cases:
  - the limitations statement covers each FR-013 point, each in a single sentence: automated testing finds only a subset of issues; manual testing with assistive technology is required; no WCAG conformance certification; the WCAG 2.2 gap;
  - every contract PartialReason has a non-empty explanation, with no extra keys;
  - `findBannedClaims` flags compliant/fully accessible/certified and equivalents, in any case or spacing, and doesn't flag product labels, "accessible" or "certificate" alone, or verbatim axe text;
  - the statement and explanations themselves pass `findBannedClaims`.
- **Export names for T033**: `LIMITATIONS_STATEMENT`, `PARTIAL_REASON_EXPLANATIONS`, `findBannedClaims(text): string[]`.
- No wording implemented; no commit or push.

## Outcome

- ✅ Impact: T031 written and red for the expected reason; T030 samples extended.
- 🧪 Tests: focused T031 run fails to load `src/wording.ts`; predicate probes discriminate.
- 📁 Files: 1 new test file, 1 support file extended, plus this PHR.
- 🔁 Next prompts: owner reviews the T033 export names and the axe-text and self-scan cases, then T032.
- 🧠 Reflection: Probing the predicates found a gap: the WCAG 2.2 sentence alone could satisfy the general coverage check. Requiring "issues" closed it.

## Evaluation notes (flywheel)

- Failure modes observed: a sed edit to the scratch probe silently didn't apply; caught by checking the replacement count.
- Graders run and results (PASS/FAIL): Ajv samples PASS; YAML PASS; expected-red run PASS; predicate probes PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
