# ADR-0002: Stateless Server with Browser-Local History and Sealed Evidence

> **Scope**: This ADR covers one decision cluster: where audit data lives, how audit results
> travel, and how the server authorizes on-demand AI calls without storing anything (browser
> persistence, streaming result delivery, sealed evidence for Explain, and in-memory abuse
> limits). These parts depend on each other: removing server storage is what makes sealed
> evidence necessary.

- **Status:** Accepted (2026-10-22, by the project owner). Acceptance approves the design only; OD-6 stays open, and the tests listed below must pass with recorded evidence before implementation is accepted.
- **Date:** 2026-10-22
- **Feature:** 001-accesslens-mvp
- **Context:**
  - **Clarification (spec, Session 2026-10-21)**: the owner chose browser-local storage, 7-day
    retention, user-controlled clearing, and **no server-side audit-history persistence**. This
    replaced an earlier answer (server storage behind unguessable links). The owner also chose
    on-demand AI, one finding at a time, and a self-contained HTML export.
  - **Constitution I**: AI may only explain findings the engine produced.
  - **Constitution IV**: secrets stay server-side.
  - **Constitution IX**: minimize stored content, enforce request/token limits, document
    retention.
  - **Spec FR-022a**: Explain must be refused for altered or fabricated evidence, so it can't be
    used as a general-purpose AI proxy. With no server storage, the server can't look evidence
    up; it has to verify what the client sends.
  - **ADR-0001 (Accepted)** fixes the container topology. This ADR adds no containers or data
    stores. It holds the evidence-signing key only in `web`, consistent with ADR-0001's rule that
    `scanner` and `egress-proxy` hold no AI or signing secrets.

<!-- Significance checklist: Impact YES (data architecture, API contracts, abuse posture);
     Alternatives YES (see below); Scope YES (web API, shared schemas, browser storage, export, AI path). -->

## Decision

1. **No server persistence of audit data**:
   - The web service keeps no database, cache, or file store for audits, findings, evidence, or
     AI output.
   - Audit results exist on the server only in memory during the `/api/audits` stream or the
     `/api/explain` request (spec FR-033).
   - Logs never contain page content, evidence, or AI content (research R14).
2. **Result delivery**: `POST /api/audits` streams NDJSON progress and exactly one terminal
   `result` (complete or partial) or `error` (research R5). There are no job IDs and no polling.
3. **Browser-local history**:
   - IndexedDB (`idb`) holds audits (complete and partial, with sealed evidence) and AI
     annotations (research R8, data-model).
   - `expiresAt = completedAt + 7 days`, purged on every app load. "Clear history" deletes
     everything, after confirmation.
   - If storage is unavailable, the app falls back to memory with a "history not saved" notice.
   - Comparison and HTML export are client-side pure functions (research R9, R10).
4. **Sealed evidence for Explain**:
   - **Payload**: `web` builds `SignedEvidenceV1` for every detected violation. It contains
     exactly the values the AI prompt uses (rule, impact, help, description, WCAG mapping,
     best-practice flag, final URL, ≤ 5 reduced nodes / 6 000 chars, nodes-omitted count) plus
     `v`, `kid`, `auditId`, `findingId`, and `issuedAt`.
   - **MAC**: HMAC-SHA256 over `"accesslens.evidence.v1\n"` + the JCS-subset canonical JSON of the
     payload, encoded base64url. The client stores the evidence verbatim and resends it.
   - **Verification order**: body size → per-IP limit (counts all attempts) → strict schema →
     `v`/`kid` → MAC (`timingSafeEqual`) → expiry (7 days, 60 s skew) → **per-audit cap**
     (Amendment 1) → global daily cap (counts only verified requests) → build the prompt
     **only** from the verified evidence object.
   - **Key rotation**: current and previous keys, selected by `kid`; remove previous after 7 days.
     Rotating without keeping previous makes old evidence invalid; audits stay viewable and the UI
     says "Re-audit to enable explanations".
   - **Replay**: re-sending valid evidence within its validity window is accepted, bounded by the
     limits. It returns a fresh explanation; the server caches nothing.
   - Full specification: research R6, data-model `SignedEvidenceV1`, public contract
     `ExplainRequest`.
5. **Abuse limits are in-memory process state**:
   - Per-IP fixed windows for audits and Explains, and a global daily AI request counter, live
     in the single `web` process (research R11).
   - This counter state isn't audit history, but it **resets when `web` restarts**. See open
     decision OD-6.
   - This requires **exactly one `web` instance** (recorded in ADR-0003).
6. **No-persistence enforcement**:
   - `web` runs with `read_only: true` and `tmpfs` only for `/tmp` and the Next.js runtime cache
     directory.
   - Tests assert that no audit, evidence, or AI data reaches disk or logs.
   - `apps/web` dependencies are checked to exclude database and cache clients.

### Amendment 1 (2026-10-22, from `/sp.analyze` finding C2; owner-approved remediation)

- **Per-audit AI cap**: constitution IX requires per-audit LLM limits, so `web` keeps an in-memory
  count of verified Explain calls per verified `auditId`.
  - The cap is `AI_EXPLAINS_PER_AUDIT`, default 25. Going over it gives
    `AUDIT_AI_LIMIT_REACHED` (429).
  - Each entry expires with its evidence after 7 days. At most 50 000 entries are kept, and the
    oldest is evicted when full.
- **Process state**: like the other limits, the counter is process state, not audit history. It
  resets on restart; OD-6 governs persistence.
- **No new data store**: this amendment adds no data store and doesn't change any other part of
  the decision.

## Consequences

### Positive

- No server-side store of client-site data. That removes breach, retention, and deletion duties
  on the server, and makes Constitution IX easy to show: there is nothing to retain.
- Explain can't be used as an open AI proxy without the signing key. Every value that reaches the
  prompt was produced by the scanner and sealed by the server, which strengthens Constitution I
  and makes prompt inputs auditable.
- Horizontal state is trivial: any request carries everything needed to verify it.
- Users own their history; clearing it is immediate and verifiable (SC-012).

### Negative

- **No cross-device history or shareable links.** Export is the only way to share (accepted
  scope).
- **The client stores evidence twice** (finding nodes plus sealed evidence). That costs more
  storage, but it's bounded.
- **Valid evidence can be replayed** for 7 days to generate repeated AI calls, limited only by
  the per-IP and daily caps.
- **In-memory limits reset on restart and don't scale out.** A restart re-opens the daily AI
  budget, and a second `web` replica would double every limit.
- **Key loss or rotation without the previous key** disables Explain for existing audits until
  re-audit.
- The canonicalization subset must stay exactly in sync between seal and verify. Any change to
  `SignedEvidenceV1` needs a version bump (`v: 2`), with verifiers accepting both during
  transition.

## Alternatives Considered

| Alternative cluster | Why rejected |
|---|---|
| **Server storage behind unguessable links** (DB + 7-day TTL); Explain looks evidence up server-side | Superseded by the owner's clarification. It adds a data store, retention duties, and link-leak risk |
| **Server-side evidence cache** (Redis/in-memory, keyed by audit) with browser history | It's still server persistence (FR-033). In-memory alone loses evidence on restart, which breaks Explain for saved audits |
| **Re-scan on Explain** to regenerate trusted evidence | Slow (up to 60 s per click), multiplies scanner load and target-site traffic, and the page may have changed |
| **Unsigned evidence + rate limits only** | Fails FR-022a: arbitrary text could be laundered through the AI endpoint |
| **Partial signing** (identity fields only) | Leaves prompt inputs (help, description, nodes, URL) attacker-controlled. This was the gap fixed in the 2026-10-21 reconciliation |
| **JWT/JWS envelope** | More format and library surface (algorithm negotiation, header handling) than one fixed HMAC over a fixed canonical form; no benefit with a single issuer and verifier |
| **AEAD-encrypted evidence** | Confidentiality isn't needed, since the client already holds the data. Integrity is the requirement, and an HMAC gives it |
| **Shared rate-limit store** (Redis) | Extra infrastructure for one host. Revisit if `web` ever scales out (ADR-0003) |

## Tests Required Before Implementation Is Accepted

- **Canonical JSON**: JCS examples within the subset; throws on `null`/`undefined`/float; key
  order independence; array order sensitivity; no Unicode normalization.
- **Seal and verify**: round trip; deterministic evidence reduction (5-node / 6 000-char
  boundaries, keeping at least one node, `nodesOmitted`); help/description truncation.
- **Gate G3**: the full tampering suite from research R6. **Every refusal asserts zero provider
  calls.** Positive cases: reordered keys and a previous-key signature.
- **Expiry and skew**: 7 days ± 1 s; future-dated more than 60 s is refused.
- **Rotation**: current verifies; previous verifies; removed previous gives `EVIDENCE_INVALID`.
- **No persistence**: `web` runs with a read-only root filesystem and no writable volume, and
  integration tests assert that no audit, evidence, or AI data is written to disk or logs. A
  dependency check rejects database/cache clients in `apps/web`.
- **Browser storage**: purge at 7 days (fake clock); Clear history leaves zero records (SC-012);
  storage-unavailable fallback (FR-036); partial audits saved and labelled.
- **Per-audit cap** (Amendment 1): the 26th verified Explain for one `auditId` → 429
  `AUDIT_AI_LIMIT_REACHED` with zero provider calls; refused (unverified) attempts don't count;
  entries expire; eviction when at capacity.
- **Limits**: per-IP limiter fail-closed without an IP; the daily cap counts only verified
  requests; behavior after a simulated restart matches whatever OD-6 resolves to.

## Open Decisions (kept explicit)

- **OD-6 — Daily AI cap across restarts.** Options:
  - (a) accept the reset and rely on a provider-side spending limit on the OpenRouter key as the
    hard backstop. OpenRouter's error docs reference key budget limits; the exact setting must be
    confirmed before relying on it;
  - (b) persist only the counter to a small writable volume. That would be operational state,
    not audit data, but it needs an explicit exception to the read-only filesystem;
  - (c) both.

  Not decided.

## References

- Feature Spec: [specs/001-accesslens-mvp/spec.md](../../specs/001-accesslens-mvp/spec.md) (Clarifications; FR-022, FR-022a, FR-026, FR-033–FR-038; SC-012, SC-014)
- Implementation Plan: [specs/001-accesslens-mvp/plan.md](../../specs/001-accesslens-mvp/plan.md) (Request Flows, Delivery Order G3, Open Decisions)
- Research: [specs/001-accesslens-mvp/research.md](../../specs/001-accesslens-mvp/research.md) (R5, R6, R8–R11, R14)
- Data model: [specs/001-accesslens-mvp/data-model.md](../../specs/001-accesslens-mvp/data-model.md) (outcome semantics, `SignedEvidenceV1`, persistence)
- Contracts: [public-api.openapi.yaml](../../specs/001-accesslens-mvp/contracts/public-api.openapi.yaml) (`ExplainRequest`, `SignedEvidenceV1`), [ai-provider.ts](../../specs/001-accesslens-mvp/contracts/ai-provider.ts)
- Related ADRs: [ADR-0001](./0001-scanner-isolation-and-egress-control.md) (secret placement, topology); [ADR-0003](./0003-stack-and-deployment.md) (single `web` instance)
- Evaluator Evidence: [history/prompts/001-accesslens-mvp/7-adr-review-od3-od4-adrs-0002-0003.misc.prompt.md](../prompts/001-accesslens-mvp/7-adr-review-od3-od4-adrs-0002-0003.misc.prompt.md)
