---
id: 24
title: T029 Shared Schema Tests
stage: red
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T029 only (schema tests, red phase)
labels: ["t029", "schemas", "zod", "tdd", "red"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - packages/shared/tests/unit/schemas.test.ts
tests:
 - npx vitest run --project unit packages/shared/tests/unit/schemas.test.ts: 1 failed suite, no tests collected; Cannot find module '../../src/schemas/audit.ts' (expected red)
 - npx tsc --noEmit -p packages/shared/tsconfig.json: 3 errors, all TS2307 for the missing schema modules
 - npx eslint packages/shared/tests/unit/schemas.test.ts: clean
 - npx prettier --check packages/shared/tests/unit/schemas.test.ts: clean
---

## Prompt

We are starting the next phase of AccessLens after successfully completing and pushing M0.

First, read:
- `specs/001-accesslens-mvp/tasks.md`
- `specs/001-accesslens-mvp/data-model.md`
- `specs/001-accesslens-mvp/contracts/public-api.openapi.yaml`
- `specs/001-accesslens-mvp/plan.md`
- `specs/001-accesslens-mvp/spec.md`
- `history/adr/0001-scanner-isolation-and-egress-control.md`
- `history/adr/0002-data-retention-and-ai-cost.md`
- `history/adr/0003-stack-and-deployment.md`

We are following the task order exactly.

Start with **T029 only**:
- Write schema tests in `packages/shared/tests/unit/schemas.test.ts`.
- Cover every requirement listed under T029 in tasks.md.
- Follow the existing Vitest conventions and strict TypeScript configuration.
- Do not implement schemas yet.
- Do not modify unrelated files.
- Run the focused test and demonstrate that it fails for the expected reason because the implementation does not exist yet.
- Report the files changed, test results, and any blockers.

Stop after T029. Do not proceed to T030 or implementation without my review.

Preserve all existing security decisions and project architecture. Do not commit or push.

## Response snapshot

- **Test file**: `packages/shared/tests/unit/schemas.test.ts` has 57 cases covering every T029 bullet. Each rule is checked against a valid baseline.
- **Export contract for T032**: `Audit` (`schemas/audit.ts`); `Finding`, `ScannerFinding`, `AffectedNode` (`schemas/finding.ts`); `SignedEvidenceV1` (`schemas/evidence.ts`). Only `ScannerFinding` isn't an entity name in the data model; the scanner contract requires the unsigned form.
- **Red**: the suite fails to load because `src/schemas/audit.ts` doesn't exist.
- **Not yet executed**: the assertions haven't run; they first run when T032 exists.
- **ADR-0002 path**: the requested path doesn't exist; the file is `0002-stateless-server-signed-evidence.md`.
- No schemas implemented; no commit or push.

## Outcome

- ✅ Impact: T029 tests written; red for the expected reason.
- 🧪 Tests: focused run fails to load the missing module; lint and format clean.
- 📁 Files: 1 new test file, plus this PHR.
- 🔁 Next prompts: owner reviews the export names, then T030.
- 🧠 Reflection: Real `sha256(kind:ruleId)` ids and the R2 tag set in fixtures keep the baselines valid under a stricter T032.

## Evaluation notes (flywheel)

- Failure modes observed: none; the export names had to be chosen because no document specifies them.
- Graders run and results (PASS/FAIL): expected-red run PASS; lint PASS; format PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run T029 against T032 and confirm every baseline passes before checking rejections.
