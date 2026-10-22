---
id: 9
title: Generate MVP Tasks
stage: tasks
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: /sp.tasks
labels: ["tasks", "tdd", "gates", "milestones", "ordering-exception"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md, history/adr/0002-stateless-server-signed-evidence.md, history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - specs/001-accesslens-mvp/tasks.md
 - specs/001-accesslens-mvp/plan.md
tests:
 - none executed; tasks.md format validated by script (168 tasks, sequential IDs, story labels, paths)
---

## Prompt

/sp.tasks (no arguments)

Session answer: US3 ordering → "Run US3 last (Recommended)".

## Response snapshot

Generated tasks.md with 168 tasks in execution order:
- **Setup / M0** (T001–T027): workspaces, toolchain with the OD-9 decision, Compose per ADR-0001 with a config test, `web` binding test and the OD-11 conditional, secret scan, non-root images, OD-8a CI decision, CI pipeline, README, gate-evidence ledger.
- **Foundational**:
  - shared schemas and wording (T028–T032);
  - M1 URL policy with the G0 run (T033–T039);
  - M2 egress proxy and network isolation (T040–T064): proxy tests and implementation, browser launch, NL-2 firewall scripts, G1 composed-stack tests, `shm_size` measurement, the G1 runner with evidence logs, OD-8b and OD-10 decisions, the G1 run;
  - M3 scanner, fixtures only (T065–T084): WCAG/interruption/DOM-limit/benchmark fixtures, mapping/config/DOM-measure/outcome/budget/server tests, implementation, benchmark, the G2 run.
- **Stories** (tests first):
  - US1 (T085–T118): includes evidence sealing and the release prerequisites OD-2, OD-7, and per-host G0/G1 before `SCAN_ENABLED=true`;
  - US2 (T119–T137): OD-6 first, the G3 tampering suite with zero provider calls, OpenRouter adapter tests;
  - US4 (T138–T148): includes fixture re-scan verification;
  - US5 (T149–T154);
  - US3 (T155–T162).
- **Polish** (T163–T168).

Plan Delivery Order updated: sealing moved to US1 (the contract requires sealed evidence on violation results); US3 runs last per the owner's decision, recorded as a Principle VII ordering exception. Fixed a self-inconsistency: demo evidence is sealed with a throwaway build-time key so it satisfies the schema.

## Outcome

- ✅ Impact: Executable, gate-aware task list; every open decision is placed before the milestone it blocks.
- 🧪 Tests: none run; format validation passed (168/168).
- 📁 Files: tasks.md (new), plan.md (Delivery Order).
- 🔁 Next prompts: /sp.analyze; then /sp.implement starting at T001.
- 🧠 Reflection: Mapping contracts to stories exposed two plan ordering bugs (sealing placement, the demo's dependency on later stories).

## Evaluation notes (flywheel)

- Failure modes observed: the first format checker only read first lines of multi-line tasks (false "no path" flags); corrected.
- Graders run and results (PASS/FAIL): checkbox/ID/label/path format PASS; sequential IDs PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
