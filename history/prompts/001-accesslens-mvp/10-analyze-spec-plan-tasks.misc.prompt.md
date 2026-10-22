---
id: 10
title: Analyze Spec Plan Tasks
stage: misc
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: /sp.analyze
labels: ["analyze", "consistency", "constitution", "coverage"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - none modified (read-only analysis)
tests:
 - none
---

## Prompt

/sp.analyze (no arguments)

## Response snapshot

Read-only cross-artifact analysis of spec.md, plan.md, and tasks.md against the constitution. It found 3 CRITICAL issues:
- **C1**: Constitution III controls without automated tests — popups, permission prompts, dialogs, no navigation beyond one page, no state shared between audits.
- **C2**: Constitution IX / FR-021 per-audit LLM token limit is missing from the plan and tasks.
- **C3**: Constitution VII "in priority order" conflicts with the US3-last ordering exception. Recommended fix: re-prioritize in the spec rather than make an exception.

Also 5 HIGH issues:
- no-persistence and SC-012 server tests absent;
- undefined behavior and missing tests for HTTP errors, non-HTML, and unreachable targets;
- T061 placed in M2 but needs M3 artifacts;
- SC-005 has no task;
- AI-call observability missing.

Plus MEDIUM/LOW items (login detection, per-target abuse, screen-reader walkthrough, OD-6 restart test, diff secret scan, plan structure drift, seal/sign terminology, a busy state missing from FR-015). Coverage: 56/57 requirements have ≥1 task (98%); 6 are only partially covered.

## Outcome

- ✅ Impact: Identified blockers before /sp.implement.
- 🧪 Tests: none.
- 📁 Files: none modified.
- 🔁 Next prompts: approve remediation edits for C1–C3 and H1–H5, then re-run /sp.analyze.
- 🧠 Reflection: The owner-approved US3 ordering exception still conflicts with a constitution MUST; adjusting spec priorities resolves it without diluting the principle.

## Evaluation notes (flywheel)

- Failure modes observed: the PowerShell prerequisite call first failed because the working directory was the specs folder; re-run with an absolute path.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
