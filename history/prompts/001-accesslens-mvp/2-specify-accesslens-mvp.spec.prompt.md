---
id: 2
title: Specify AccessLens MVP
stage: spec
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: /sp.specify
labels: ["spec", "mvp", "accessibility-audit", "ssrf", "ai-remediation", "demo"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-accesslens-mvp/spec.md
 - specs/001-accesslens-mvp/checklists/requirements.md
 - .specify/scripts/powershell/create-new-feature.ps1
tests:
 - none (specification stage; quality checklist run — 1 item pending clarifications)
---

## Prompt

Define the MVP for AccessLens, an AI-assisted accessibility audit and remediation tool for freelance web developers and small web agencies.

The core user journey is:

A developer submits a public website URL.

AccessLens safely opens and audits one page using Playwright and axe-core.

The dashboard presents detected issues grouped by severity and category, with the affected element, selector, description, and available evidence.

The AI explains each finding in beginner-friendly language and suggests a contextual HTML, CSS, or ARIA fix.

Findings that require human judgment are explicitly marked for manual review.

The developer can run another audit and compare results to see which findings remain, disappear, or are newly introduced.

The developer can export an audit report.

A guided demo lets portfolio visitors explore sample results without having to submit their own website.

Requirements:

OpenRouter is the primary AI provider, configured through a server-side environment variable and a configurable model identifier.

Design a small provider interface that permits adding Gemini later, but do not integrate two providers unnecessarily in the MVP.

AI output must be structured, validated, tied to actual audit evidence, and treated as an untrusted suggestion.

Never execute AI-generated fixes against a user's website or claim a fix passed without verification.

Clearly state the limitations of automated accessibility testing.

Include safe scanning limits and explicit rejection of localhost, private, link-local, and otherwise prohibited destinations, including unsafe redirect targets.

Include loading, empty, error, timeout, rate-limit, and partial-result states.

Prioritize a polished, accessible, responsive developer dashboard and a compelling guided demo.

Exclude authentication, payments, unrestricted whole-site crawling, automatic production edits, and full compliance certification from the initial MVP.

Focus on user needs, user stories, functional requirements, edge cases, and measurable acceptance criteria. Do not choose the technical architecture in this step. Identify unresolved questions rather than inventing product requirements.

## Response snapshot

Created branch 001-accesslens-mvp and specs/001-accesslens-mvp/spec.md: 5 prioritized user stories (P1 single-page safe audit + dashboard; P2 AI explanation/fix; P3 guided demo; P4 re-audit comparison; P5 export), 33 functional requirements, edge cases (URL encodings, DNS rebinding, redirects, AI failures, comparison selector drift), key entities, out-of-scope list, assumptions (ruleset, default limits as plan-confirmable values), and 11 measurable success criteria. Introduced "No longer detected" wording so comparisons never claim fixes. Quality checklist passes except 3 open clarifications: Q1 audit persistence/retention without accounts, Q2 AI generation automatic vs on demand, Q3 export format. Fixed PowerShell 5.1 incompatibility (3-arg Join-Path) in create-new-feature.ps1.

## Outcome

- ✅ Impact: MVP scope defined and bounded; ready for clarification answers then /sp.plan.
- 🧪 Tests: none (spec); checklist 15/16 passing.
- 📁 Files: spec.md, checklists/requirements.md, create-new-feature.ps1 (one-line fix)
- 🔁 Next prompts: answer Q1–Q3; then /sp.clarify or /sp.plan.
- 🧠 Reflection: No-auth constraint makes persistence/retention the highest-impact open question.

## Evaluation notes (flywheel)

- Failure modes observed: create-new-feature.ps1 used PowerShell 6+ Join-Path syntax on 5.1; branch/spec created but prompts dir and JSON output failed.
- Graders run and results (PASS/FAIL): spec quality checklist — PASS except clarification markers.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
