---
id: 6
title: ADR Scanner Isolation Egress
stage: misc
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: /sp.adr scanner-isolation-and-egress-control
labels: ["adr", "security", "ssrf", "egress", "docker", "sandbox"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - specs/001-accesslens-mvp/plan.md
tests:
 - none (documentation)
---

## Prompt

/sp.adr scanner-isolation-and-egress-control

## Response snapshot

Created ADR-0001 "Scanner Isolation and Egress Control" with Status: Proposed (it recommends resolutions for OD-1 and OD-5, which the owner must accept). Proposed cluster:
- **Containers**: three containers — `web`, `scanner` (internal-only networks), and `egress-proxy` (the only scan-path component with an outbound route, IPv4-only, no secrets).
- **NL-1**: enforced by Docker internal networks; web binds only to its public-network address.
- **App-layer filtering**: proxy logic moved into `egress-proxy`, with per-audit proxy credentials for accounting; Chromium flags kept as defense in depth.
- **NL-2**: host `DOCKER-USER` + `INPUT` rules on a fixed `outbound` subnet, which must be persistent and re-checked after restarts.
- **Sandbox**: non-root `pwuser` + Playwright seccomp profile, sandbox on, no `--no-sandbox`, no `--ipc=host` (`shm_size` + `init` instead).
- **Hosting**: live scanning only on a VM/VPS with firewall control.
- **G1 test list**: composed-stack checks of NL-1, NL-2, secrets, and sandbox status.

Alternatives table (B-only, A-only, C, off-the-shelf proxy, microVM, Playwright defaults) with reasons. Verified Playwright Docker and Docker DOCKER-USER/internal-network docs on 2026-10-22; recorded the documentation gaps (rule persistence, IPv6). Updated the plan's OD-1/OD-2/OD-5 and Complexity Tracking rows to reference the ADR while keeping them open until acceptance.

## Outcome

- ✅ Impact: The SSRF boundary design is documented with layered, testable controls; hosting constraint made explicit.
- 🧪 Tests: none (docs); G1 test list defined.
- 📁 Files: ADR-0001; plan.md (4 table rows).
- 🔁 Next prompts: accept/revise ADR-0001; then update research R3/R4, data flow, and quickstart §5 to match; decide OD-3/OD-4; /sp.adr for the remaining two candidates; /sp.tasks.
- 🧠 Reflection: Checking the Playwright docs surfaced a conflict the plan missed: Playwright recommends `--ipc=host`, but that breaks isolation.

## Evaluation notes (flywheel)

- Failure modes observed: no create-adr script in this install (PowerShell-only); ADR written agent-natively.
- Graders run and results (PASS/FAIL): clustered decision PASS; alternatives with rationale PASS; positive and negative consequences PASS; concise with references PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
