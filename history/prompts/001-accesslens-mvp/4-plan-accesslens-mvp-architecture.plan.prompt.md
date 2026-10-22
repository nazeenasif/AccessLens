---
id: 4
title: Plan AccessLens MVP Architecture
stage: plan
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: /sp.plan
labels: ["plan", "architecture", "ssrf", "egress-proxy", "openrouter", "nextjs", "indexeddb"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/data-model.md
 - specs/001-accesslens-mvp/quickstart.md
 - specs/001-accesslens-mvp/contracts/public-api.openapi.yaml
 - specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml
 - specs/001-accesslens-mvp/contracts/ai-provider.ts
 - CLAUDE.md
tests:
 - none (planning stage)
---

## Prompt

/sp.plan (no arguments)

Clarifying answers during the session: Stack = "Next.js + TS (Recommended)"; Hosting = "Docker on one host (Recommended)".

## Response snapshot

Produced the plan and Phase 0/1 artifacts. The stack is a Next.js 16.4 + TypeScript npm-workspaces monorepo (apps/web, services/scanner, packages/shared) on Docker Compose. A separate hardened Playwright 1.64 + axe-core 4.14 scanner container sends all browser traffic through an in-process filtering forward proxy: it resolves DNS once, validates with ipaddr.js, connects to the validated IP, and enforces byte and request caps. Chromium flags remove the loopback bypass and lock the browser's own DNS, QUIC and WebRTC UDP. Audit progress streams as NDJSON. The server is stateless: history lives in browser IndexedDB with a 7-day purge, and Explain is guarded by HMAC-SHA256 signed evidence (7-day validity) plus per-IP and global daily caps. A one-method AiProvider interface has an OpenRouter adapter (json_schema strict, provider.require_parameters, data_collection "deny"; verified against OpenRouter docs) and a strict Zod output with a findingId/ruleId echo and no severity field. Comparison and HTML export are client-side. Concrete limits table in R12. All 10 constitution gates PASS, with two Complexity Tracking items (separate scanner, custom proxy). Three ADR candidates surfaced. The agent-context script added only a BOM to CLAUDE.md; that was reverted and an Active Technologies section was added manually.

## Outcome

- ✅ Impact: Architecture, contracts, data model, limits, and test strategy defined; ready for /sp.tasks.
- 🧪 Tests: none (plan); test layers and commands defined in quickstart.
- 📁 Files: plan.md, research.md, data-model.md, quickstart.md, contracts/*, CLAUDE.md
- 🔁 Next prompts: /sp.adr for the 3 candidates; /sp.tasks.
- 🧠 Reflection: The no-server-storage clarification drove the signed-evidence design; the SSRF design needs proof by security tests, not trust in Chromium flags.

## Evaluation notes (flywheel)

- Failure modes observed: update-agent-context.ps1 found no markers in CLAUDE.md and only prepended a BOM while reporting success.
- Graders run and results (PASS/FAIL): Constitution Check pre/post design PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Make update-agent-context.ps1 fail loudly when markers are missing.
