---
id: 11
title: Remediate Analyze Critical High
stage: tasks
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: remediation of /sp.analyze findings C1–C3, H1–H5
labels: ["remediation", "constitution", "tasks", "security", "observability"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0002-stateless-server-signed-evidence.md
  pr: null
files:
 - specs/001-accesslens-mvp/spec.md
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/quickstart.md
 - specs/001-accesslens-mvp/tasks.md
 - specs/001-accesslens-mvp/contracts/public-api.openapi.yaml
 - history/adr/0002-stateless-server-signed-evidence.md
tests:
 - none executed; tasks.md format/renumber validation (181 tasks, sequential, phase ranges match); OpenAPI YAML parse
---

## Prompt

yes, suggest and apply fixes for C1–C3 and H1–H5

## Response snapshot

- **C1**: added a page-controls policy table to research R4 (popups, dialogs, permissions, downloads, navigation away, form submission, no state between audits); new fixtures, a security test, and a `page-controls.ts` task in M3.
- **C2**: per-audit Explain cap (`AI_EXPLAINS_PER_AUDIT=25`, in-memory, 7-day expiry, 50k entries) added to research R6/R12, ADR-0002 Amendment 1, the contract (`AUDIT_AI_LIMIT_REACHED`, v1.3.0), quickstart, spec FR-021, and US2 test/impl tasks.
- **C3**: spec re-prioritized (US4→P3, US5→P4, US3→P5) so delivery order equals priority order; the ordering exception was removed from plan and tasks.
- **H1**: `web` read-only filesystem plus tmpfs added to the Compose tasks; ADR-0002 §6; no-persistence security test in US1.
- **H2**: R5 rows for `TARGET_UNREACHABLE`, `TARGET_HTTP_ERROR` (4xx/5xx not audited), and `NOT_HTML`; spec edge-case resolution; fixtures and tests; states test updated.
- **H3**: `shm_size` measurement moved from M2 to M3 (provisional value in M2).
- **H4**: SC-005 usability study task in Polish.
- **H5**: R14 observability events; logging tests and implementation for proxy, scanner, and AI calls.

Renumbered tasks.md to 181 sequential IDs with every cross-reference remapped.

## Outcome

- ✅ Impact: All 3 CRITICAL and 5 HIGH findings addressed in the artifacts.
- 🧪 Tests: none run; validation scripts passed.
- 📁 Files: 7 documents updated.
- 🔁 Next prompts: re-run /sp.analyze; then /sp.implement from T001.
- 🧠 Reflection: Re-prioritizing in the spec fixed the constitution conflict without diluting Principle VII.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): sequential IDs PASS; phase-range consistency PASS; no unknown task refs PASS; YAML parse PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
