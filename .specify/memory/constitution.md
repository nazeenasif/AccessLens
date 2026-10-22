<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification. All template placeholders replaced with
AccessLens-specific principles; no prior ratified version existed.

Principles defined (template slot → new title):
  - [PRINCIPLE_1_NAME] → I. Evidence-First Accessibility (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Honest Claims (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Security by Design for Untrusted Targets (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Server-Side Secret Management (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Provider Independence
  - [PRINCIPLE_6_NAME] → VI. Test-Driven Implementation (NON-NEGOTIABLE)
  - (added)            → VII. Small, Reviewable Increments
  - (added)            → VIII. Maintainability and Simplicity
  - (added)            → IX. Privacy and Cost Control
  - (added)            → X. Learning and Documentation

Added sections:
  - Security, Privacy & Operational Constraints (was [SECTION_2_NAME])
  - Development Workflow & Quality Gates (was [SECTION_3_NAME])
  - Governance (filled)

Removed sections: none

Templates / dependent files:
  ✅ .specify/templates/plan-template.md — Constitution Check gates filled;
     stale reference to .specify/templates/commands/plan.md corrected.
  ✅ .specify/templates/tasks-template.md — tests changed from OPTIONAL to
     REQUIRED; security-test and re-scan verification task types added.
  ✅ .specify/templates/spec-template.md — added constitution-mandated
     requirement prompts (finding categories, untrusted-target safety,
     data retention, limits).
  ✅ .claude/commands/sp.tasks.md — "Tests are OPTIONAL" rule replaced with
     constitution-aligned REQUIRED rule.
  ✅ .claude/commands/sp.plan.md — reviewed; already reads constitution and
     fills Constitution Check. No change needed.
  ✅ .claude/commands/sp.analyze.md — reviewed; treats constitution as
     authoritative. No change needed.
  ⚠ README.md / docs/quickstart.md — do not exist yet. Principle X requires
     them; create with the first implemented feature.
  ⚠ .specify/templates/commands/*.md — directory not present in this install;
     command files live in .claude/commands/. Nothing to update.

Deferred TODOs: none. Concrete numeric limits (timeouts, page/byte caps,
token budgets) and retention periods are intentionally delegated to each
feature's plan.md, which MUST state them (see Principle IX).
-->

# AccessLens Constitution

AccessLens is an AI-assisted website accessibility auditing and remediation platform for
freelance web developers and small web agencies. These principles govern every spec,
plan, task, and line of code in this repository.

## Core Principles

### I. Evidence-First Accessibility (NON-NEGOTIABLE)

- Automated findings MUST originate only from the deterministic scan engine
  (Playwright rendering the page + axe-core evaluating it). This is the single source of
  truth for "what was detected".
- LLM output MUST NOT create, delete, merge, or rename findings, and MUST NOT change a
  finding's rule ID, impact/severity, WCAG mapping, or target selector.
- LLM output MAY only be attached to an existing finding (by its stable ID) as an
  explanation or a proposed fix. Any LLM response that references an unknown finding ID,
  or asserts a different severity, MUST be rejected or flagged, never merged silently.
- Raw axe-core results (rule ID, impact, help URL, node selectors, axe version) MUST be
  stored or reproducible alongside any derived report so every claim is traceable.

**Rationale**: Users rely on AccessLens to make real remediation decisions. A hallucinated
or softened finding is worse than no finding.

### II. Honest Claims (NON-NEGOTIABLE)

- AccessLens MUST NOT state or imply that a site is "WCAG compliant", "fully accessible",
  or "passes WCAG" based on automated checks. Reports MUST state that automated testing
  covers only a subset of WCAG success criteria and that manual review is required.
- Every item shown to a user MUST be labelled with exactly one of these categories, and
  the UI/report/API MUST keep them visually and structurally distinct:
  1. **Detected violation** — axe-core `violations` result.
  2. **Needs manual review** — axe-core `incomplete` results and known-untestable criteria.
  3. **AI explanation** — LLM-generated description of an existing finding.
  4. **Proposed fix** — LLM- or rule-generated suggested change; unverified by default.
  5. **Verified outcome** — a proposed fix confirmed by a re-scan in which the original
     rule no longer fails for that target (verification scope stated explicitly).
- AI-generated content MUST be marked as AI-generated wherever it is displayed or exported.

**Rationale**: Overclaiming compliance exposes users and their clients to legal and
reputational risk and undermines trust in the product.

### III. Security by Design for Untrusted Targets (NON-NEGOTIABLE)

Every scanned URL and every byte of scanned content is untrusted input. The scan path MUST:

- **SSRF / private network**: Accept only `http`/`https` URLs. Resolve DNS server-side and
  reject loopback, private (RFC 1918), link-local (incl. cloud metadata `169.254.169.254`),
  CGNAT, multicast, reserved, and IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`,
  IPv4-mapped). Validation MUST apply to the resolved IP actually connected to, defeating
  DNS rebinding.
- **Redirects and subrequests**: Re-validate every redirect hop and every browser-initiated
  request (subresources, fetch/XHR, iframes) against the same policy via request
  interception; cap redirect count.
- **Malicious content**: Never execute, `eval`, or render scanned HTML/JS in the AccessLens
  app origin. Treat page-derived strings (selectors, snippets, titles) as untrusted data:
  escape on output and treat as data, not instructions, when sent to an LLM (prompt-
  injection resistant prompting; outputs validated against a schema).
- **Resource exhaustion**: Enforce navigation and total-scan timeouts, maximum response
  size, maximum DOM/node count processed, maximum pages per audit, concurrent-scan limits,
  and per-user rate limits. Block downloads, popups, and permission prompts.
- **Browser isolation**: Each scan runs in a fresh, non-persistent browser context with no
  shared cookies/storage, no access to host credentials or local files, and runs in a
  sandboxed, least-privilege process/container separate from the web/API server.
  Browser crashes or hangs MUST be contained and cleaned up.
- Each control above MUST have an automated security test (see Principle VI).

**Rationale**: A service that fetches arbitrary URLs on demand is a prime SSRF and abuse
vector; isolation and validation are product requirements, not hardening extras.

### IV. Server-Side Secret Management (NON-NEGOTIABLE)

- OpenRouter, Gemini, and all other credentials MUST be read from server-side environment
  variables or a secret store only.
- Secrets MUST NOT appear in source control, client bundles, client-exposed env prefixes
  (e.g., `NEXT_PUBLIC_*`, `VITE_*`), logs, error messages, traces, API responses, or
  stored reports. Logging MUST redact authorization headers and key-like values.
- The repository MUST include a `.env.example` with placeholder values only, and `.env*`
  files containing real values MUST be git-ignored.
- All LLM calls MUST be made from the server; the client never talks to a provider.

**Rationale**: Leaked provider keys cause direct financial loss and abuse.

### V. Provider Independence

- The audit engine MUST depend only on a small, typed AI-provider interface (e.g., a
  single "generate structured explanation/fix for finding" contract with typed input,
  typed output, and typed errors). No provider SDK types may leak past the adapter.
- OpenRouter is the primary adapter. Adding Gemini (or another provider) MUST require only a
  new adapter plus configuration — zero changes to the scan engine or finding model.
- Provider selection, model IDs, and fallbacks MUST be configuration, not code.
- Provider output MUST be validated against the same schema regardless of provider.
- The scan MUST still produce a complete, valid report when AI is disabled or unavailable.

**Rationale**: Model pricing and availability change frequently; the audit core must not.

### VI. Test-Driven Implementation (NON-NEGOTIABLE)

- Tests are REQUIRED, not optional. For each change, write tests first, confirm they fail,
  then implement (Red → Green → Refactor).
- Required test layers:
  - **Unit**: pure logic (URL validation, finding mapping, schema validation, redaction).
  - **Integration**: scan engine against local fixture pages; provider adapters against
    mocked HTTP; persistence where present.
  - **Security**: SSRF/private-IP/redirect/rebinding cases, limit enforcement, secret
    non-leakage (bundle and log inspection), prompt-injection fixtures.
  - **End-to-end**: primary user journey through the real UI/API.
- A maintained fixture suite of pages with KNOWN accessibility violations (and known-clean
  pages) MUST assert that the expected axe rules are detected — guarding against silent
  regressions in detection.
- Where a proposed fix can be applied to a fixture, tests MUST re-scan and assert the
  targeted rule no longer fails before the outcome may be labelled "verified".
- Tests MUST NOT call live LLM providers or scan live third-party websites in CI.

**Rationale**: The product's value is correctness of findings; that is only credible if
continuously proven.

### VII. Small, Reviewable Increments

- Implement exactly one independently testable user story at a time, in priority order.
  Each story MUST be demonstrable and tested on its own before the next begins.
- Do not build the entire product in one pass. Changes SHOULD be small enough to review in
  a single sitting; unrelated refactors are prohibited within a story.

**Rationale**: Small slices keep risk, review cost, and rework low.

### VIII. Maintainability and Simplicity

- Prefer simple, statically typed, modular code. Types/schemas define boundaries between
  scanner, findings model, AI layer, persistence, and UI.
- Do not introduce multi-agent orchestration, queues, microservices, extra databases, or
  generic abstraction layers unless a current requirement demands it; any such addition
  MUST be justified in the plan's Complexity Tracking table.
- YAGNI: no speculative extension points beyond the provider interface in Principle V.

**Rationale**: A small team (or solo developer) must be able to understand and change
the whole system.

### IX. Privacy and Cost Control

- Store the minimum website content necessary: findings, selectors, and bounded HTML
  snippets — not full page HTML, screenshots, or cookies unless a spec explicitly justifies
  it. Never store credentials or form data from scanned sites.
- Send the minimum content to LLM providers (only the finding and bounded context needed),
  and never send secrets or user PII.
- Enforce per-request, per-user, and per-audit limits on scans and on LLM tokens
  (input and output caps); enforce a cost ceiling configurable by environment.
- Provider failures (timeouts, rate limits, invalid output, quota exhaustion) MUST be
  handled with bounded retries and safe degradation: the report is still delivered with
  AI sections marked unavailable — never fabricated.
- A data-retention policy (what is stored, for how long, how it is deleted) MUST be
  documented before any feature persists scan data. Each plan states its concrete limits
  and retention values.

**Rationale**: Users scan their clients' sites; minimizing data and spend protects them
and keeps the service viable.

### X. Learning and Documentation

- Significant architectural decisions MUST be recorded as ADRs in `history/adr/` with
  options considered and trade-offs.
- The repository MUST maintain: setup instructions (README/quickstart), a complete
  `.env.example`, and exact commands to run each test layer. These are updated in the same
  change that alters them.
- Plans and code SHOULD explain *why* for non-obvious decisions so the project remains a
  learning resource.

**Rationale**: Documentation that drifts from code is a defect.

## Security, Privacy & Operational Constraints

- **Trust boundaries**: (1) user → AccessLens API, (2) AccessLens → scanned website,
  (3) AccessLens → AI provider. Each plan MUST identify which boundaries a feature crosses
  and the controls applied.
- **Limits are explicit**: every feature that scans or calls an LLM MUST list its
  timeouts, size caps, concurrency, rate limits, and token caps in `plan.md`.
- **Failure taxonomy**: user-facing errors MUST distinguish invalid/blocked URL,
  target unreachable/timeout, limit exceeded, scan engine failure, and AI unavailable —
  without exposing internal details or secrets.
- **Observability**: structured logs for scan lifecycle and provider calls (duration,
  token usage, outcome) with secrets and page content redacted.
- **Dependencies**: Playwright, browser binaries, and axe-core versions MUST be pinned;
  the axe-core version is recorded with each scan result.

## Development Workflow & Quality Gates

- **Flow**: `/sp.specify` → `/sp.clarify` (as needed) → `/sp.plan` → `/sp.tasks` →
  `/sp.implement`, one user story at a time. A Prompt History Record is created for each
  interaction under `history/prompts/`.
- **Plan gate**: every `plan.md` MUST pass the Constitution Check (Principles I–X) before
  research and again after design; violations require Complexity Tracking justification.
- **Merge gate** — a change is mergeable only when:
  - [ ] All unit, integration, security, and relevant e2e tests pass.
  - [ ] Known-violation fixture suite passes (no detection regressions).
  - [ ] No secrets in diff, bundle, or logs (automated check where available).
  - [ ] Report/UI wording reviewed against Principle II (no compliance overclaims).
  - [ ] Docs, `.env.example`, and test commands updated if affected.
  - [ ] Scope limited to a single user story; no unrelated changes.

## Governance

- This constitution supersedes all other practices, templates, and guidance in this
  repository. Where a template or command conflicts with it, the constitution wins and the
  template MUST be corrected.
- **Amendments** require: a written proposal stating the change and its motivation, an
  updated Sync Impact Report at the top of this file, propagation to dependent templates
  in `.specify/templates/` and `.claude/commands/`, and an ADR when the change is
  architecturally significant.
- **Versioning** (semantic):
  - MAJOR — removal or backward-incompatible redefinition of a principle or gate.
  - MINOR — new principle/section or materially expanded guidance.
  - PATCH — clarifications and wording fixes without semantic change.
- **Compliance review**: `/sp.plan` evaluates the Constitution Check; `/sp.analyze` treats
  constitution violations as CRITICAL; every review verifies the merge-gate checklist.
  Runtime agent guidance lives in `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-21 | **Last Amended**: 2026-10-21
