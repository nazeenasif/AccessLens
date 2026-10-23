---
id: 14
title: Targeted Task Corrections Pre-Implementation
stage: tasks
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: targeted tasks.md review and corrections (pre-implementation)
labels: ["tasks", "dom-limit", "explain-order", "firewall", "adr-amendment", "scan-enabled", "contract-conformance"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md
  pr: null
files:
 - specs/001-accesslens-mvp/tasks.md
 - specs/001-accesslens-mvp/spec.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/plan.md
 - history/adr/0001-scanner-isolation-and-egress-control.md
tests:
 - none executed; tasks.md integrity check (188 unique IDs, no dangling refs, no checked tasks)
---

## Prompt

Review my existing AccessLens `specs/001-accesslens-mvp/tasks.md` before implementation. Preserve all valid task IDs, architecture, scope, user-story ordering, and test-first requirements. Do not regenerate the entire task list.

Make these targeted corrections:

1. Add a 50,000-element DOM fixture and exact-boundary tests. Define the limit as inclusive: 49,999 and 50,000 are allowed; 50,001 exceeds the limit. Ensure the implementation and spec agree.

2. Align T131, T135, and T148. The Explain route must enforce body-size limits, then apply per-IP rate limiting to every attempt, then validate and verify evidence, then apply per-audit and daily caps only to verified requests, and only then call the AI provider. Add tests for malformed and forged attempts.

3. Review T057 firewall ordering. Ensure prohibited destination drops cannot be bypassed by broad established-connection acceptance rules. Verify the intended packet-processing path and add tests against the running Docker stack.

4. Verify the actual status and contents of ADR-0001, ADR-0002, and ADR-0003. The task-list preamble must not claim all three are Accepted unless their files confirm this. Preserve any unresolved decision as OPEN and identify the tasks blocked by it.

5. Clarify T076 and T090 timeout outcomes: when valid findings exist, eligible interruptions produce a labelled partial audit; when no valid results exist, return an error. Add distinct tests for both outcomes.

6. Verify that SCAN_ENABLED remains false by default and that public scanning is not enabled until the required host-specific G0/G1 evidence is recorded. Do not claim a gate passed without execution evidence.

7. Add scanner OpenAPI conformance testing if needed to ensure the internal contract agrees with the shared schemas and actual scanner behavior.

After editing, report the exact changed task IDs and files, remaining open decisions, and any dependencies affected. Do not implement application code, run the full implementation, mark any gate passed, or silently change accepted architectural decisions.

## Response snapshot

- **1**: inclusive DOM limit made explicit in research R15 and the spec. T070 adds `50000.html` with a count self-check. T074 adds boundary unit tests; T076 adds integration boundary cases; T090 uses "exceeds only".
- **2**: T131 states the canonical order with call-order and short-circuit assertions. T135 adds malformed, forged, and mixed-sequence tests (per-IP counts every attempt; caps count only verified; zero provider calls). T148 is rewritten to the exact order.
- **3**: the accepted ADR-0001 §3 order (ESTABLISHED/RELATED first) allows tracked flows to bypass the drops. Added it as **Proposed Amendment 1** (not silently changed) and new **OD-12** with decision task T185. T057 is rewritten as conditional on T185. New G1 test T184 covers rule order, a packet-path counter, a pre-existing-flow cut, helpers off, and legitimate traffic. T066 now requires T185 and T184.
- **4**: the ADR files confirm all three are Accepted. The preamble lists each ADR's open decisions; OD-8a (GitHub Actions answered but unrecorded) is kept OPEN. Notes now has an OD → blocked-tasks table.
- **5**: T076 has distinct partial vs error tests per interruption; T090 states the mapping.
- **6**: new T186 (M0 guard: default false everywhere; strict `"true"` parsing via T116) and T187 (`check-scan-enable` script requiring host-specific G0+G1 evidence rows); T129 must run T187 first.
- **7**: new T188 scanner contract conformance (both JSON Schema and Zod validation of running-scanner output; tighten the loose 200 schema if needed); T091 must pass it.

Added IDs T184–T188 without renumbering. Updated the M0 checkpoint and the Dependencies section.

## Outcome

- ✅ Impact: The seven correctness gaps are closed in the task list; the accepted architecture is unchanged except for a clearly proposed amendment.
- 🧪 Tests: none run; integrity check passed.
- 📁 Files: tasks.md, spec.md, research.md, plan.md, ADR-0001.
- 🔁 Next prompts: decide OD-12 (T185); resume /sp.implement at T001 (M0).
- 🧠 Reflection: The firewall ordering flaw lived in an accepted ADR, so it had to be raised as an amendment rather than fixed in tasks alone.

## Evaluation notes (flywheel)

- Failure modes observed: a first draft of T186 cited the wrong task IDs (T101/T115); corrected to T116, with T101 as the health assertion.
- Graders run and results (PASS/FAIL): unique IDs PASS; no dangling refs PASS; no checked tasks PASS; no gate claims PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
