---
id: 13
title: Fix Medium Analysis Findings
stage: tasks
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: remediation of /sp.analyze findings M8, M10, M4, M5, M6
labels: ["remediation", "tasks", "consistency", "secrets", "storage"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-accesslens-mvp/spec.md
 - specs/001-accesslens-mvp/data-model.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/tasks.md
tests:
 - none executed; tasks.md renumber/format validation (183 tasks, sequential, ranges match)
---

## Prompt

yes, suggest and apply fixes for M8, M10, M4, M5, M6

## Response snapshot

- **M8**: spec FR-015 now lists "page returned an error (status)", "not a web page", "scanner busy", and the AI rate-limited and per-audit-limit sub-states. The data-model error-state list was aligned (L4).
- **M10**: the AI-panel test (T138) and implementation (T149) now include the distinct `AUDIT_AI_LIMIT_REACHED` state.
- **M4**: new daily-cap test task T133 (verified-only counting, 501st → `AI_BUDGET_EXHAUSTED` with zero provider calls, 00:00 UTC reset, env override, restart behavior per the T130/OD-6 decision). T146 now makes it pass. Research R12 defines the UTC window.
- **M5**: the CI task T026 adds a diff/history secret scan (`check:secrets:diff`, with the tool chosen alongside the CI platform). New test T027 proves it catches fake keys and passes clean commits. Added to the M0 checkpoint.
- **M6**: the storage test (T103) asserts the stored shape (schema-strict; html ≤ 501, summary ≤ 1001; no screenshots, cookies, headers, or form values; ≤ 25 nodes).

Renumbered to 183 tasks; all references remapped.

## Outcome

- ✅ Impact: 5 MEDIUM findings plus L4 resolved; remaining: M1, M2 (product decisions), M3, M9, L1–L3, L5.
- 🧪 Tests: none run; validation passed.
- 📁 Files: spec.md, data-model.md, research.md, tasks.md.
- 🔁 Next prompts: optionally decide M1/M2; /sp.implement from T001.
- 🧠 Reflection: Adding state names to FR-015 keeps the spec as the single list that the UI tests trace to.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): sequential IDs PASS; phase ranges PASS; no unknown refs PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
