---
id: 30
title: T033 Shared Wording
stage: green
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Implement T033 only (wording.ts)
labels: ["t033", "wording", "banned-claims", "fr-013", "fr-014", "sc-006", "green"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - packages/shared/src/wording.ts
 - packages/shared/src/index.ts
 - specs/001-accesslens-mvp/tasks.md
 - packages/shared/tests/unit/wording.test.ts (review amendment)
tests:
 - wording.test.ts: 39 passed
 - npx vitest run --project unit: 306 passed, 3 files, exit 0
 - npm run lint, npm run format:check, npm run typecheck (root + 4 workspaces): exit 0
 - New PartialReason added temporarily: tsc TS2741 in wording.ts; restored, tsc exit 0
 - Mutation check: 7/7 phrase removals and 3/3 normalisation steps caught; word boundaries off not caught (before the review)
 - Review: 4 boundary cases added; with boundaries off, exactly those 4 fail (4 failed | 39 passed); restored 43 passed
 - Review: findBannedClaims over axe-core 4.14.0 help and description (105 rules, 210 texts): 0 hits
 - Review: axe-core 4.14.0 rules tagged wcag22a/wcag22aa or a new-in-2.2 criterion: target-size only (wcag22aa, wcag258)
---

## Prompt

T032 review is complete and approved. Begin T033 only. Do not commit or push.

1. Read wording.test.ts, the FR-013 requirement, and the PartialReason schema before writing code.
2. Create packages/shared/src/wording.ts exporting LIMITATIONS_STATEMENT,
   PARTIAL_REASON_EXPLANATIONS (typed as Record<PartialReason, string>, so a new reason fails
   typecheck), and findBannedClaims(text): string[]. Re-export from src/index.ts.
3. findBannedClaims: normalise case, hyphens, line breaks, and repeated whitespace before
   matching. Use word boundaries, so "certificate" and "accessible" alone don't match.
4. Axe exception: "meets WCAG" is not a banned phrase, so verbatim axe text should pass by
   default. Do not add a general bypass (no skipping text that mentions axe, no broad allowlist).
   If an exemption turns out to be necessary, it must match exact known axe strings only, and
   you must explain why.
5. Don't add negation handling beyond what the tests require. Word LIMITATIONS_STATEMENT and the
   explanations so they pass the detector naturally (e.g. "do not certify WCAG conformance"
   rather than "not WCAG compliant").
6. Repeat the mutation check: disable each banned phrase, the normalisation steps, and the word
   boundaries in turn, with automatic restore. Report what the tests catch and what they miss.
   Afterwards, confirm git status shows no scratch or backup files.
7. Run the wording tests, the full unit project, lint, format:check, and the root + workspace
   typecheck. Paste the raw output. Every check should now pass with exit 0.
8. Check off T033 in tasks.md only if all of that passes. Write the PHR, then stop for review.

## Response snapshot

- **wording.ts**: the limitations statement is four sentences, one per FR-013 point plus the WCAG 2.2 gap. It says "do not certify WCAG conformance", which uses neither banned form. There are five partial-reason explanations from the data-model meanings, typed `Record<PartialReason, string>`.
- **findBannedClaims**: lowercase, hyphens (including U+2010/U+2011) to spaces, collapse whitespace; then 7 word-bounded patterns: compliant, full compliance, fully accessible, 100% accessible, certified, conformant, passes WCAG. Results are returned in order of appearance.
- **Axe text**: "meets WCAG" isn't listed, so axe text passes with no exemption and no allowlist. No negation handling.
- **Mutation check**: all phrase and normalisation mutations are caught. Removing the word boundaries leaves all 39 tests passing. Probes show the boundaries prevent false flags on "noncompliant", "uncertified", "1100% accessible", and "surpasses WCAG", none of which the tests contain.
- **Repo**: git status shows only `index.ts`, `wording.ts`, and `tasks.md` changes; no scratch files.
- **Tooling note**: a `‐` escape in tool input was decoded into a literal character once; it was fixed and the file verified ASCII-only.

## Review amendments (2026-11-12)

Prompt (verbatim):

```text
T033 review: approved with two small amendments. Do not commit or push.

1. Run findBannedClaims over every rule's description and help text from the pinned
   axe-core version (one-off script, not a new cross-package test). Report any hits.
   Expected: zero. If there are hits, report them; don't add an exemption.
2. Check research.md for the "only 2.5.8 Target Size" claim. If it's documented, confirm
   it against the pinned axe-core rule tags (wcag22a/wcag22aa) and show the output. If it
   isn't documented, rewrite the sentence generically ("Automated checks cover only a small
   part of WCAG 2.2."). Either way, the T031 sentence tests and self-check must still pass.
3. Add T031 must-not-flag cases: "noncompliant", "uncertified", "1100% accessible",
   "surpasses WCAG 2 AA". Show they fail with word boundaries disabled, then restore.
4. In the T033 PHR, record that "surpasses/exceeds WCAG" are deliberately out of scope and
   that "non-compliant" is a deliberate over-flag.
5. Run the full pre-push suite, matching what CI runs: npm test, npm run test:assert, lint,
   format:check, typecheck, build and the secret scan. Paste the raw output and git status --short.
Stop for review.
```

- **Axe text**: 0 banned-claim hits across all 105 rules (210 help and description strings) in axe-core 4.14.0. No exemption exists or was added.
- **WCAG 2.2 claim**: documented in research R2 and confirmed against axe-core 4.14.0. `target-size` (`wcag22aa`, `wcag258`) is the only rule tagged `wcag22a`/`wcag22aa`, and no rule carries another new-in-2.2 criterion tag. The statement is unchanged.
- **Boundary cases**: four must-not-flag cases added to T031 ("noncompliant", "uncertified", "1100% accessible", "surpasses WCAG 2 AA"). They fail with word boundaries disabled and pass once restored.
- **Decisions**:
  - **Deliberately out of scope**: "surpasses WCAG" and "exceeds WCAG" are not banned phrases. Neither was in FR-014's list or the approved equivalents. "surpasses WCAG 2 AA" is now a must-not-flag test, so adding these phrases later is a deliberate test change.
  - **Deliberate over-flag**: "non-compliant" is flagged, because normalising the hyphen leaves the word "compliant". AccessLens doesn't produce that wording, and erring toward flagging is the safe side for SC-006. Unhyphenated "noncompliant" isn't flagged.

- **Pre-push suite: lockfile regression found (not fixed; awaiting owner decision)**:
  - *Symptom*: lint, format, typecheck, web build, and all secret scans pass. Every Docker-backed config test fails, because `npm ci` inside the image build rejects the lockfile: `Missing: @emnapi/core@1.11.3 … @emnapi/runtime@1.10.0 from lock file`. `test:assert` fails as a result.
  - *Cause*: the lockfile committed in `5134bbb`, generated by host npm 11.6.2 when ajv was added in T030, lacks the `@emnapi` entries. npm 11.19.1, the version bundled with the pinned Node 24.22.1 and used by Docker and CI, requires them.
  - *Evidence*: `npm ci --dry-run` on Linux with npm 11.19.1 passes on `ae9ea3e` and fails on `5134bbb` and on the working tree.
  - *Correction to PHR 25*: PHR 25 said Linux x64 CI wouldn't need the dropped entries. That was wrong.
  - *Status*: `5134bbb` is not pushed (branch ahead 1), so remote CI hasn't run it.
  - *Candidate fix (tested in scratch only)*: a lockfile regenerated with npm 11.19.1 in the pinned Node image passes `npm ci --dry-run` on Linux (npm 11.19.1) and on Windows (npm 11.6.2). It restores the `@emnapi` entries at in-range patch versions; nothing else changes.

## Outcome

- ✅ Impact: T031 green; every check exits 0; T033 checked off.
- 🧪 Tests: 306 unit tests pass; type-level guard demonstrated.
- 📁 Files: wording.ts (new), index.ts, tasks.md, plus this PHR.
- 🔁 Next prompts: owner reviews the review amendments; then T034 (M1).
- 🧠 Reflection: The mutation check showed that the word boundaries, which the requirements call out, aren't pinned by any test.

## Evaluation notes (flywheel)

- Failure modes observed: backslash-u sequences in tool input were decoded twice (source file, then mutation script); building them from chr(92) avoided it.
- Graders run and results (PASS/FAIL): all requested checks PASS; mutation check 10/11 caught.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): add T031 cases such as "noncompliant" and "uncertified" that only the word boundaries keep clean.
