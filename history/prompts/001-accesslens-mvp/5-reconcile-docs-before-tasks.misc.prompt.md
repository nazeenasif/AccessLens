---
id: 5
title: Reconcile Docs Before Tasks
stage: misc
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: documentation reconciliation (pre-/sp.tasks)
labels: ["reconciliation", "partial-audits", "evidence-signing", "egress", "wcag-tags", "milestones"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-accesslens-mvp/spec.md
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/data-model.md
 - specs/001-accesslens-mvp/quickstart.md
 - specs/001-accesslens-mvp/contracts/public-api.openapi.yaml
 - specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml
 - specs/001-accesslens-mvp/contracts/ai-provider.ts
tests:
 - none run (documentation only); both OpenAPI files parse as YAML; static axe-core 4.14.0 rule/tag extraction
---

## Prompt

Review and reconcile the AccessLens documentation before `/sp.tasks`. Do not implement application code, change runtime configuration, or generate `tasks.md` yet.

Read the current files:
- `.specify/memory/constitution.md`
- `specs/001-accesslens-mvp/spec.md`
- `specs/001-accesslens-mvp/plan.md`
- `specs/001-accesslens-mvp/research.md`
- `specs/001-accesslens-mvp/data-model.md`
- `specs/001-accesslens-mvp/contracts/ai-provider.ts`
- `specs/001-accesslens-mvp/contracts/public-api.openapi.yaml`
- `specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml`

Apply these decisions consistently across the relevant documents:

1. Partial scans: If valid findings exist when a recoverable interruption occurs, preserve, display, and locally save a clearly labelled partial audit. Record its reason or reasons and explain incomplete coverage. If no valid results exist, return an appropriate error. Keep scanner status independent of AI availability.

2. Evidence signing: The signed, versioned canonical payload must cover every field consumed by the AI prompt, plus audit identity, finding identity, and issue time. Resolve the current unsigned `help` and `description` gap. The server must verify evidence before building the AI prompt and must not trust altered client-supplied fields. Specify canonical serialization, expiry, tampering tests, and key-rotation behavior if retained.

3. Foundational milestones: Make project setup, URL/destination policy, proxy/network isolation and its security tests, and the scanner separate ordered milestones. Arbitrary public-URL scanning must not be enabled until URL-policy and network-boundary tests pass. Treat network-level egress restrictions and proxy-bypass prevention as production security requirements, not optional hardening.

4. WCAG tags: Verify the supported tags against the pinned axe-core version, document the exact selected tags, and add fixture-based tests proving the intended WCAG 2.0, 2.1, and 2.2 A/AA coverage. Keep best-practice findings distinguishable from WCAG-mapped findings.

Also reconcile these existing issues:
- Resolve the spec's three open questions consistently with research: browser-local IndexedDB with seven-day retention and clear-history support; on-demand AI explanations, one finding at a time; self-contained HTML export with an accessible print stylesheet.
- Align `partialReasons` with timeout and limit behavior in the data model and public API contract.
- Align the public explain request's node limit with the provider's five-node/6,000-character AI input limits, or explicitly define server-side bounded reduction.
- Ensure the signature binds all AI-consumed values, including URL context and node evidence.
- Align OpenAPI required fields and count constraints with the data model.
- Keep scanner status complete/partial/error semantics consistent across the spec, data model, API contracts, and UI requirements.
- Keep security secrets server-side; the internal scanner must not be publicly exposed or receive unnecessary AI/signing secrets.
- Do not add Gemini integration, authentication, payments, whole-site crawling, automatic production fixes, or compliance certification to the MVP.

Preserve the current product scope and constitution. Make documentation-only changes. Do not invent unsupported implementation details: mark unresolved decisions explicitly rather than silently choosing them.

After editing:
1. List each changed file and summarize the change.
2. Report any unresolved contradictions or security risks.
3. Verify that all three spec clarifications are resolved and that the spec, plan, research, data model, and contracts agree.
4. Run `/sp.analyze` if available, but do not run `/sp.tasks` yet.
5. Confirm that no application code, tests, runtime configuration, or task-generation output was changed.

## Response snapshot

Reconciled eight documentation files.
- **Outcomes**: one three-way model (complete / partial with reasons / error with no Audit), set only by the scanner. A new PartialReason enum (navigation_timeout, request_limit_reached, byte_limit_reached, frames_not_inspected, subresources_blocked) has an interruption→outcome table in research R5. The error+partialAudit shape was removed.
- **Evidence (SignedEvidenceV1)**: covers every prompt input (incl. help, description, finalUrl, wcag, nodes), plus kid/auditId/findingId/issuedAt. Server-side deterministic reduction to ≤5 nodes / 6000 chars. JCS-subset canonicalization, HMAC with a domain-separation prefix, a fixed verification order before prompt construction, 7-day expiry with 60 s skew, kid-based two-key rotation, and an enumerated tampering suite (zero provider calls on refusal). ExplainRequest is now {evidence, evidenceSignature} only.
- **Milestones and gates**: M0 setup, M1 URL policy (G0), M2 proxy + network isolation (G1), M3 scanner fixtures-only (G2), then US1–US5. SCAN_ENABLED stays false until G0/G1 pass. Network-level NL-1/NL-2 are production requirements, with the mechanism OPEN (OD-1).
- **WCAG tags**: verified statically against axe-core 4.14.0. The tags are wcag2a/2aa/21a/21aa/22aa/best-practice, giving 91 effective rules. wcag22a has no rules; target-size is disabled by default but runs via tag. The experimental/deprecated exclusions are listed. Fixtures F-20A…F-INV plus a rule-inventory snapshot test; FR-010a covers best-practice labelling.
- **Contracts**: OpenAPI required fields and minimums aligned; if/then rules for partialReasons and violation impact/evidence; SCAN_DISABLED added; the scanner stays unpublished with only the internal token.
- **Open decisions** recorded: OD-1 egress mechanism, OD-2 host, OD-3 analysis reserve, OD-4 DOM cap (constitution gap), OD-5 sandbox.
- **/sp.analyze** not run: its prerequisite is tasks.md. A manual cross-artifact sweep was performed instead.

## Outcome

- ✅ Impact: Spec, plan, research, data model, quickstart, and contracts agree on outcomes, evidence, limits, tags, and gating; unresolved items are explicit.
- 🧪 Tests: none run; YAML parse check passed; axe tag inventory extracted statically from the 4.14.0 tarball.
- 📁 Files: 8 documentation files under specs/001-accesslens-mvp/.
- 🔁 Next prompts: /sp.adr scanner-isolation-and-egress-control (resolves OD-1, OD-5); decide OD-3/OD-4; then /sp.tasks; /sp.analyze after tasks.md exists.
- 🧠 Reflection: The verification found two facts the earlier plan missed: WCAG 2.2 coverage is a single disabled-by-default rule, and the constitution's DOM-size cap was never planned.

## Evaluation notes (flywheel)

- Failure modes observed: the first static parser misread `enabled` flags across rule boundaries; corrected with an indentation-anchored parser and raw-source checks.
- Graders run and results (PASS/FAIL): stale-term sweep PASS; partial-reason enum consistency PASS; node-limit consistency PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add a docs-lint script that cross-checks enum values between data-model.md and the OpenAPI files.
