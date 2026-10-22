---
id: 7
title: ADR Review OD3 OD4 New ADRs
stage: misc
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: architecture review continuation (ADR-0001 review, OD-3/OD-4, ADR-0002/0003)
labels: ["adr", "review", "egress", "dom-limit", "analysis-budget", "signed-evidence", "stack"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0001-scanner-isolation-and-egress-control.md, history/adr/0002-stateless-server-signed-evidence.md, history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - history/adr/0001-scanner-isolation-and-egress-control.md
 - history/adr/0002-stateless-server-signed-evidence.md
 - history/adr/0003-stack-and-deployment.md
 - specs/001-accesslens-mvp/plan.md
 - specs/001-accesslens-mvp/research.md
 - specs/001-accesslens-mvp/quickstart.md
 - specs/001-accesslens-mvp/spec.md
 - specs/001-accesslens-mvp/data-model.md
 - specs/001-accesslens-mvp/contracts/public-api.openapi.yaml
 - specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml
tests:
 - none executed (documentation only); OpenAPI YAML parse check passed
---

## Prompt

Continue the AccessLens architecture review. Do not implement application code or generate tasks yet.

First, review `history/adr/0001-scanner-isolation-and-egress-control.md` against the current constitution, plan, research, contracts, and quickstart.

If ADR-0001 is accepted, update `specs/001-accesslens-mvp/research.md` and `quickstart.md` to match its three-container architecture. Remove contradictory descriptions of an in-process proxy. Preserve `SCAN_ENABLED=false` until G0 and G1 pass. Keep deployment claims conditional on tests of the actual Docker stack and host firewall.

Then resolve OD-3 and OD-4 explicitly:
- OD-3: propose a 20-second axe-analysis budget within the 60-second total deadline, with bounded timeout behavior and benchmark requirements.
- OD-4: propose a configurable 50,000-DOM-element limit, with defined measurement, enforcement, and over-limit behavior. Preserve valid findings as a labelled partial audit only when the existing partial-audit rules permit it.

Next, create and review the two remaining architecture decisions:
- `stateless-server-signed-evidence`
- `stack-and-deployment`

For each, inspect existing decisions first, avoid duplicating or contradicting ADR-0001, document alternatives and trade-offs, and identify tests required before implementation. Keep unresolved choices explicitly open.

Finish by reporting changed files, ADR statuses, remaining open decisions, and any contradictions. Do not generate `tasks.md` or claim a security gate has passed without execution evidence.

(Session answer: ADR-0001 → "Accept (Recommended)".)

## Response snapshot

- **ADR-0001 review** found 8 issues:
  1. incomplete firewall drop list;
  2. the "proxy has no secrets" claim contradicted the needed control token;
  3. the browser can reach the control endpoint (shared network namespace);
  4. the proxy hostname needed DNS;
  5. possible Docker embedded-DNS leakage;
  6. proxy authentication was unspecified;
  7. the quickstart dev workflow couldn't reach an unpublished scanner;
  8. constitution III "via request interception" wording.

  Fixes 1–6 were folded into the ADR; the owner accepted it; fix 7 went into the quickstart and
  issue 8 is reported only.
- **research.md**: R3/R4 rewritten to the three-container design; R5 OD-3 budget table; new R15
  for the DOM limit; R12–R14 updated.
- **quickstart.md**: rewritten with an architecture diagram, `PROXY_CONTROL_TOKEN`, new limit
  env vars, a dev profile inside Compose, Docker Desktop limited to `SCAN_ENABLED=false`,
  `test:g1`, and required production controls.
- **OD-3 resolved**: `t0` at slot acquisition; nav 30 s, analysis 20 s, teardown 5 s, total
  60 s; analysis timeout → `AUDIT_TIMEOUT` (no partial, because axe is all-or-nothing); one
  browser per slot; benchmark p95 ≤ 15 s at 50k.
- **OD-4 resolved**: 50 000 elements (configurable 1k–200k), measured across all evaluable
  frames plus open shadow roots with early stop and a 2 s bound; over → `DOM_TOO_LARGE`, no
  axe run, no partial (FR-007a not satisfied), enum unchanged. Spec, data model, and public
  contract updated.
- **ADR-0002** (Proposed): stateless server + browser history + sealed evidence + in-memory
  limits. Alternatives listed, tests required, OD-6 open.
- **ADR-0003** (Proposed): Node 24 / TS 7 (5.9 fallback) / Next 16.4 / four workspaces / Compose
  on one Linux VM/VPS / one replica each. Alternatives listed, M0 tests, OD-2/7/8/9 open.
- **plan.md** rewritten: ADR table, OD-1…OD-11 statuses, structure with
  `services/egress-proxy`, "no gate has passed".

## Outcome

- ✅ Impact: The architecture is consistent across all documents and 3 ADRs; OD-1/3/4/5 are
  resolved; the remaining choices are explicit.
- 🧪 Tests: none executed; G0–G3 not run, and no gate claimed as passed.
- 📁 Files: 3 ADRs and 7 spec documents.
- 🔁 Next prompts: accept/revise ADR-0002 and ADR-0003; decide OD-6; optionally amend the
  constitution III wording (PATCH); then /sp.tasks and /sp.analyze.
- 🧠 Reflection: Reviewing the accepted topology end to end exposed a real conflict — the shared
  network namespace between browser and scanner means the proxy control channel can only be
  protected by a token.

## Evaluation notes (flywheel)

- Failure modes observed: none blocking; the earlier ADR draft overstated "no secrets" for the
  proxy.
- Graders run and results (PASS/FAIL): ADR checklist (clustered, alternatives, pros/cons,
  concise) PASS for 0001–0003; stale-term sweep PASS; YAML parse PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add an automated check that every OD-n referenced
  in the docs has a status row in plan.md.
