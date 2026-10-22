---
id: 1
title: Ratify AccessLens Constitution
stage: constitution
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: none
branch: master
user: Nazeen Asif
command: /sp.constitution
labels: ["constitution", "governance", "security", "accessibility", "testing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - .specify/memory/constitution.md
 - .specify/templates/plan-template.md
 - .specify/templates/spec-template.md
 - .specify/templates/tasks-template.md
 - .claude/commands/sp.tasks.md
tests:
 - none (governance docs only; placeholder-token validation passed)
---

## Prompt

Create the governing principles for AccessLens, an AI-assisted website accessibility auditing and remediation platform for freelance web developers and small web agencies.

Establish these non-negotiable principles:

Evidence-first accessibility: Playwright and axe-core produce the authoritative automated findings. LLM output must never invent audit results or silently alter severity.

Honest claims: Never claim full WCAG compliance from automated checks alone. Clearly distinguish detected violations, AI explanations, proposed fixes, manual-review items, and verified outcomes.

Security by design: Treat scanned websites as untrusted. Define protections against SSRF, private-network access, unsafe redirects, malicious page content, resource exhaustion, and browser isolation failures.

Secret management: Keep OpenRouter and Gemini API keys server-side and out of source control, client bundles, logs, and public responses.

Provider independence: Use a small, typed AI-provider interface so OpenRouter can be the primary provider and Gemini can be added without changing the audit engine.

Test-driven implementation: Include unit, integration, security, and end-to-end tests. Test known accessibility violations and verify proposed fixes through re-scanning where feasible.

Small, reviewable increments: Implement one independently testable user story at a time. Do not build the entire product in one pass.

Maintainability: Prefer simple, typed, modular code over unnecessary agents, abstractions, or infrastructure.

Privacy and cost control: Minimize stored website content, enforce request and token limits, handle provider failures safely, and document data retention.

Learning and documentation: Explain major architectural decisions and maintain setup instructions, environment-variable examples, and test commands.

Write the constitution into the correct Spec Kit Plus project location. Inspect the existing repository and installed command conventions first. Do not implement application features yet.

## Response snapshot

Inspected repo (fresh Spec Kit Plus template; PowerShell scripts only; commands in .claude/commands/). Ratified constitution v1.0.0 at .specify/memory/constitution.md with 10 principles (I–X), a Security/Privacy/Operational Constraints section, a Development Workflow & Quality Gates section (merge-gate checklist), and Governance (amendment, semver, compliance review). Five-category finding taxonomy defined (detected / manual review / AI explanation / proposed fix / verified outcome). Propagated: plan-template Constitution Check gates + fixed stale command path; tasks-template and sp.tasks.md changed tests from OPTIONAL to REQUIRED with security and re-scan task types; spec-template gained constitution-mandated requirement prompts. Concrete numeric limits and retention periods delegated to each plan.md. No application code written.

## Outcome

- ✅ Impact: Project governance established; templates aligned so specs/plans/tasks enforce the principles.
- 🧪 Tests: None applicable; validated no unresolved placeholder tokens and version/date consistency.
- 📁 Files: constitution.md, plan-template.md, spec-template.md, tasks-template.md, .claude/commands/sp.tasks.md
- 🔁 Next prompts: /sp.specify for the first P1 user story (e.g., single-URL scan with safe URL validation); /sp.adr for stack/sandbox choice during planning.
- 🧠 Reflection: Default template's "tests optional" conflicted with the TDD principle and had to be changed in two places (template + command).

## Evaluation notes (flywheel)

- Failure modes observed: create-phr.sh not installed (PowerShell-only install); used agent-native PHR creation.
- Graders run and results (PASS/FAIL): placeholder scan PASS; version line matches report PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add an automated check that fails if "WCAG compliant" wording appears in report templates.
