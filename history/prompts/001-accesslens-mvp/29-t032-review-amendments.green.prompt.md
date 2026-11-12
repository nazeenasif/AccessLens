---
id: 29
title: T032 Review Amendments
stage: green
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: T032 review amendments (contract 1.4.1, new tests, task check-off)
labels: ["t029", "t030", "t032", "openapi", "zod", "contract", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-accesslens-mvp/contracts/public-api.openapi.yaml
 - packages/shared/src/schemas/audit.ts
 - packages/shared/src/schemas/explain.ts
 - packages/shared/tests/unit/schemas.test.ts
 - packages/shared/tests/support/contract.ts
 - specs/001-accesslens-mvp/tasks.md
tests:
 - Length semantics, 501 code points with one emoji (502 UTF-16 units): Ajv true, Zod true; 502 code points: Ajv false, Zod false
 - Ajv check of 195 contract samples against 1.4.1: 0 label mismatches
 - Zod sampleHosts regex vs contract pattern: identical
 - New T029 tests with each rule disabled: completedAt 1 failed; engine tags 4 failed; sampleHosts 5 failed; all pass after restore
 - T029 + T030: 267 passed
---

## Prompt

T032 review: approved in principle, with amendments. Do not start T033. Do not commit or push.

1. Verify string length semantics: run a 501-code-point AffectedNode.html containing one emoji
   (502 UTF-16 units) through both Ajv and Zod and show the raw output. If they disagree, make Zod
   count code points for every maxLength-backed field, and add T030 valid/invalid samples with
   astral characters at the boundaries (html, failureSummary, selector, help, description).
2. Add T029 tests for: completedAt < startedAt rejected; engine.tags exact R2 set (wrong tag,
   extra tag, duplicate, missing tag rejected; reordered accepted); sampleHosts rejecting scheme,
   port, path, query and userinfo. Show each new test fails when its rule is disabled, then
   restore the rule.
3. Contract → 1.4.1 (patch, no /api/v2): UUID v4 pattern on audit id fields; date-time pattern
   requiring uppercase T and seconds [0-5]\d; engine.tags as enum items + uniqueItems +
   minItems = maxItems = tag count; hostname pattern on sampleHosts; ExplainResponse.findingId
   ^[0-9a-f]{16}$ in both contract and Zod. Add T030 samples for each, so that Ajv and Zod agree
   on every sample.
4. Confirm every contract component has additionalProperties: false; report any that don't
   rather than changing them.
5. Write a PHR covering these amendments. Then run T029/T030, the full unit project, lint,
   format:check, and typecheck, and paste the raw output.
6. Check off T029–T032 in tasks.md only after everything above passes.
Stop for review.

(Follow-ups: "resume", twice, after interrupted sessions.)

## Response snapshot

- **1. Length semantics**: Ajv and Zod both count code points (`{"codePoints":501,"utf16Units":502,"ajv":true,"zod":true}`; 502 → both false). They agree, so no length change and no astral samples were needed.
- **2. T029**: 13 new tests:
  - `completedAt` equal accepted, earlier rejected;
  - R2 tags reordered accepted; wrong, extra, duplicate, and missing rejected;
  - host names, IPv4, and bracketed IPv6 accepted; scheme, port, path, query, and user info rejected.

  With its rule disabled, each rejection test fails (1, 4, and 5 failures); all pass once restored.
- **3. Contract 1.4.1**:
  - UUID v4 pattern on `Audit.id`, `SignedEvidenceV1.auditId`, `ExplainResponse.auditId`;
  - date-time pattern `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-5][0-9](\.[0-9]+)?Z$`; `issuedAt` uses the same form without the fraction;
  - `engine.tags` as an enum of the 6 R2 tags with `uniqueItems`, `minItems: 6`, `maxItems: 6`;
  - a hostname pattern on `sampleHosts`, identical to Zod's;
  - `ExplainResponse.findingId` must be `^[0-9a-f]{16}$` in both.

  27 T030 samples added (195 total); Ajv and Zod agree on all of them.
- **4. additionalProperties**: every object component has `false` except `ErrorBody.detail`, a free-form `{ type: object }` for optional safe context; reported, not changed.
- **Interruption**: an interrupted mutation run left `audit.ts` with the tag rule disabled. It was restored from a backup verified clean and compared byte for byte. The tag mutation was then redone so that it disables the whole check, not part of it.
- No T033; no commit or push.

## Outcome

- ✅ Impact: contract and Zod now agree on the previously reported conflicts; the three data-model rules have tests.
- 🧪 Tests: T029 + T030 267 passed; mutation demonstration as required.
- 📁 Files: contract, two schema files, two test files, tasks.md (check-off), plus this PHR.
- 🔁 Next prompts: owner reviews; then T033.
- 🧠 Reflection: A mutation of the form `false && a || b` disables only part of a check; suppressing the issue call disables exactly one rule.

## Evaluation notes (flywheel)

- Failure modes observed: the session ended mid-mutation and left a source file mutated; YAML double quotes reject `\[`, so patterns use single quotes.
- Graders run and results (PASS/FAIL): length probe PASS (agree); Ajv labels PASS; mutation demonstration PASS; full checks recorded in the final report.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): run mutation checks with a restore trap from the start.
