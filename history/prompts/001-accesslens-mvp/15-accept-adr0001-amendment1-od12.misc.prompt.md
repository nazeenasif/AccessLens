---
id: 15
title: Accept ADR-0001 Amendment 1 OD-12
stage: misc
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: ADR amendment acceptance (OD-12 / T185)
labels: ["adr", "firewall", "nl-2", "decision", "g1"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/quickstart.md
 - specs/001-accesslens-mvp/tasks.md
tests:
 - none executed; integrity checks (188 tasks, only T185 checked, no dangling refs, original ADR text preserved, no gate-pass or scan-enable claims)
---

## Prompt

Accept ADR-0001 Amendment 1 for OD-12 and resolve T185. Preserve the original accepted ADR text and record the amendment as a traceable decision. Ensure the firewall implementation is scoped to the correct Docker/host traffic paths, avoids unnecessary disruption to unrelated connections, and is validated by T184 against the live stack. Do not mark G1 passed or enable scanning without actual passing evidence. Update the decision/task status consistently, then report the changed files and remaining open decisions. Do not start application implementation yet.

## Response snapshot

- **ADR-0001**: original §3 kept verbatim. Amendment 1 is marked ACCEPTED 2026-10-23 (supersedes only the "order" bullet), with an Amendments line in the header. Added a packet-path table:
  - FORWARD → DOCKER-USER, before masquerade;
  - DNAT hairpin to published ports;
  - INPUT for host addresses;
  - embedded DNS unaffected.

  Added scoping rules: every rule `-s <outbound>`, `accesslens-nl2` comment tag, idempotent tagged-only install/uninstall, no `-F`, no policy changes, no Docker-owned chain edits, conntrack flush scoped to `outbound`, fail closed on a non-iptables backend, subnet mismatch, or helpers on. Validation is via T184; G1 only via T066.
- **plan.md**: OD-12 Resolved.
- **research.md R3** and **quickstart §5**: amended order and scoping.
- **tasks.md**:
  - T185 `[X]` with resolution;
  - T057 rewritten (pre-checks, tagged drops, INPUT at position 1, no ESTABLISHED accept, scope guarantees, idempotent replace, scoped flush, new `uninstall-nl2.sh`);
  - T184 extended (scope/`iptables-save` diff, counter deltas including the DNAT hairpin, unrelated-connection survival, idempotence and clean removal, fail-closed, evidence in the T064 log);
  - T066, the Dependencies section, the preamble, and the Notes OD table updated.

## Outcome

- ✅ Impact: OD-12 resolved traceably; the firewall design is scoped to the intended packet paths with live-stack validation defined.
- 🧪 Tests: none run; G1 not passed; SCAN_ENABLED unchanged (default false).
- 📁 Files: ADR-0001, plan.md, research.md, quickstart.md, tasks.md.
- 🔁 Next prompts: commit docs; resume /sp.implement at M0 (T001) when the owner chooses.
- 🧠 Reflection: Scoping every rule by source subnet and tag is what makes "no disruption to unrelated connections" testable.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): ADR original text preserved PASS; only T185 checked PASS; no gate claims PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
