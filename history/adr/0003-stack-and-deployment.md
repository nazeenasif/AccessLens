# ADR-0003: Application Stack and Deployment

> **Scope**: This ADR covers one decision cluster: the language, frameworks, repository layout,
> test tooling, packaging, and deployment shape for the MVP. Security topology (containers,
> networks, firewall, sandbox) is **not** decided here; it belongs to
> [ADR-0001](./0001-scanner-isolation-and-egress-control.md), and this ADR must satisfy it.

- **Status:** Accepted (2026-10-22, by the project owner). Acceptance approves the design only; OD-2, OD-7, OD-8 and OD-9 stay open, and the M0 tests below must pass with recorded evidence.
- **Addenda:**
  - A — OD-9 resolved 2026-10-23: `typescript@5.9.3`, the accepted fallback (see Addendum A
    below).
  - B — OD-8a resolved 2026-10-23: CI on GitHub Actions; the diff secret scan uses gitleaks
    v8.30.1 (see Addendum B below).
  - C — scanner base images pinned by digest, Node from the official image, 2026-11-04 (see
    Addendum C below).
  - OD-2, OD-7, and OD-8b (where G1 runs) remain open.
- **Date:** 2026-10-22
- **Feature:** 001-accesslens-mvp
- **Context:**
  - **Stakeholder choices during `/sp.plan`**: Next.js + TypeScript, and Docker on one host.
  - **Fixed by the spec**: Playwright + axe-core are mandated for scanning; OpenRouter is the
    only AI provider.
  - **ADR-0001 (Accepted)** requires:
    - three containers (`web`, `scanner`, `egress-proxy`);
    - `web` bound only to its public-network address;
    - live scanning only on a Linux VM/VPS where the operator controls Docker Engine and the host
      firewall.
  - **ADR-0002 (Accepted)** keeps abuse limits in process memory, which needs a single `web`
    instance.
  - **Constitution VIII**: simple, typed, modular, no unnecessary infrastructure.
    **Constitution X**: setup and test commands documented.
  - **Versions** were checked against the npm registry on 2026-10-21:
    - Node v24.18.0 (local), Next.js 16.4.2, React 19.3.1, TypeScript 7.0.2;
    - Playwright 1.64.1, axe-core / @axe-core/playwright 4.14.0;
    - Zod 4.6.7, Vitest 5.0.5, Tailwind CSS 4.3.3, idb 8.0.4, pino 10.4.0, ipaddr.js 2.5.0.

<!-- Significance checklist: Impact YES (language, framework, platform); Alternatives YES;
     Scope YES (every workspace, CI, deployment). -->

## Decision

1. **Language and runtime**: TypeScript everywhere on **Node.js 24 LTS**, pinned in `.nvmrc`
   and the `engines` field.
   - TypeScript **7.0** is the target, with **5.9.x as the fallback** if the M0 compatibility
     check fails (OD-9).
2. **Web app**: Next.js **16.4** (App Router, `runtime = "nodejs"` route handlers,
   `output: "standalone"`), React 19.3, Tailwind CSS 4.3, and Radix UI primitives for
   accessible widgets.
3. **Shared model**: Zod 4.6 schemas in `packages/shared` are the single source for Audit,
   Finding, `SignedEvidenceV1`, events, and the URL policy. TypeScript types are inferred from
   them, and the OpenAPI contracts mirror them.
4. **Repository layout**: an npm-workspaces monorepo with **four** workspaces:
   - `apps/web`;
   - `services/scanner`: Playwright 1.64 + @axe-core/playwright 4.14;
   - `services/egress-proxy`: plain Node, no browser;
   - `packages/shared`.

   There is no Turborepo/Nx; npm scripts orchestrate.
5. **Testing toolchain**: Vitest 5 (unit, integration, security), Playwright Test 1.64 +
   @axe-core/playwright (e2e and self-audit), and msw (AI HTTP mocks), with fixture pages under
   `fixtures/` (research R2, R5, R13, R15).
6. **Packaging**:
   - One image per service, multi-stage, non-root at runtime, pinned base images:
     - `scanner`: `mcr.microsoft.com/playwright:v1.64.1-noble`;
     - `web` and `egress-proxy`: Node 24 slim images, exact tags fixed at M0.
   - Lockfile-based reproducible builds (`npm ci`).
7. **Deployment shape**:
   - Docker Compose on **one Linux VM/VPS** (ADR-0001 §5), with **exactly one replica of each
     service**. The single `web` replica is required by ADR-0002's in-memory limits.
   - A TLS-terminating reverse proxy sits in front of `web`. Which one is open (OD-7).
   - **Deploy**: build images in CI, then pull a tagged release on the host and run
     `docker compose up -d`.
   - **Rollback**: re-deploy the previous image tag.
   - **Post-deploy smoke**: `/api/health`, plus the G1 evidence run whenever `SCAN_ENABLED=true`
     (ADR-0001 §6).
   - Managed PaaS targets may host only a `SCAN_ENABLED=false` deployment (demo + history).
8. **Configuration**: everything comes from environment variables (quickstart §2). Secrets go
   only to the services named in ADR-0001. `.env.example` holds placeholders only.

## Consequences

### Positive

- One language end to end, with shared schemas. Contract drift between scanner, API, and UI is
  caught by the type checker and by schema tests.
- Playwright and axe-core have first-class Node support. No cross-language bridge.
- A standalone Next.js build plus Compose gives the same artifacts locally, in CI, and on the
  host. Rollback is just an image tag.
- Minimal infrastructure: no database, queue, Kubernetes, or build orchestrator (Constitution
  VIII).

### Negative

- **Single host, single `web` replica**: no high availability. A host outage takes everything
  down, including the demo. Acceptable for a portfolio/small-agency MVP; revisit with a shared
  limit store before scaling out.
- **Hosting is limited** to VM/VPS providers that allow host firewall control for live scanning
  (inherited from ADR-0001). That rules out managed serverless/PaaS for the full product.
- **TypeScript 7.0 is new** (native compiler). Next.js type-checking and lint plugins may lag,
  which is why the fallback exists.
- **Next.js couples UI and API in one process**, so a heavy UI build or regression affects the
  API. This is mitigated by the scanner already being separate.
- npm workspaces without a build orchestrator means slower CI as the repo grows. Acceptable at
  four workspaces.

## Alternatives Considered

| Alternative cluster | Why rejected |
|---|---|
| **Vite React SPA + Fastify API** (TypeScript) + same Compose topology | Two web servers to run and secure, with no benefit over Next.js route handlers at this scale. Offered to and declined by the stakeholder |
| **React + Python FastAPI** with Playwright for Python | Two languages and no shared schemas (Constitution I/VIII drift risk). Declined by the stakeholder |
| **Vercel (web) + separate container host (scanner + proxy)** | Two platforms. The scanner control channel would cross the public internet, conflicting with ADR-0001's internal-only `scan-ctl`. In-memory limits don't fit serverless instances |
| **Managed container PaaS for everything** | Can't apply the NL-2 host firewall (ADR-0001). Allowed only for `SCAN_ENABLED=false` deployments |
| **Kubernetes** (NetworkPolicies instead of host firewall) | It could express NL-1/NL-2 natively, but it's far more operational weight than a single-host MVP needs. Candidate if scanning is scaled out |
| **pnpm + Turborepo/Nx** | Faster at scale, but extra tooling to learn and maintain for four workspaces |

## Tests Required Before Implementation Is Accepted (milestone M0)

- **Toolchain compatibility (resolves OD-9)**: `next build` type-check, ESLint, and Vitest run
  clean with TypeScript 7.0 on a minimal skeleton; otherwise pin 5.9.x and record it in research
  R13.
- **Compose configuration test** (automated, parses the Compose file):
  - `scanner` and `egress-proxy` have no `ports`;
  - `scan-ctl` and `scan-egress` are `internal: true`;
  - `outbound` has `enable_ipv6: false` and a fixed subnet;
  - `egress-proxy` has a fixed IP on `scan-egress`;
  - the scanner has `init: true`, `shm_size` set, and no `ipc: host`;
  - per-service environment allowlists match ADR-0001;
  - exactly one `web` replica.
- **Binding test**: in the composed stack, `web` accepts connections on its `public` address and
  refuses them on its `scan-ctl` address. This is the precondition ADR-0001 relies on; if it
  fails, ADR-0001's fallback path applies.
- **Images**: every service runs as a non-root UID; base image tags are pinned; `npm ci` builds
  reproducibly from the lockfile.
- **Hygiene**: secret scan of `.next/static` passes; Node version is enforced (`engines`
  check); `/api/health` reports `scanning: disabled` by default.

## Open Decisions (kept explicit)

| ID | Decision | Notes |
|---|---|---|
| OD-2 | VM/VPS provider and region | Must satisfy ADR-0001 §5 (Docker Engine + host firewall control). Not chosen. |
| OD-7 | TLS reverse proxy (e.g., Caddy, nginx, Traefik) | Must forward exactly one hop (`TRUSTED_PROXY_HOPS=1`) and not log request bodies. Not chosen. |
| OD-8 | CI platform and where G1 runs | The repository has no remote yet. G1 needs a Linux host with the firewall rules applied; whether a CI runner can provide that, or G1 runs on a staging host, is undecided. |
| OD-9 | TypeScript 7.0 vs 5.9.x | Decided by the M0 compatibility test above. **Resolved 2026-10-23 → 5.9.3 (Addendum A).** |

### Addendum A — OD-9 resolved (2026-10-23, task T005)

- **Decision**: pin `typescript@5.9.3` (exact) in every workspace. This applies Decision §1's
  accepted fallback, so no other part of this ADR changes.
- **Evidence** (full method and results in research R13): an isolated probe on the exact
  pinned stack (Node 24.18.0, npm 11.6.2, Next.js 16.4.2, React 19.3.1, `eslint-config-next`
  16.4.2, `typescript-eslint` 8.72.0, Vitest 5.0.5).
  - **`typescript@7.0.2`**: fails normal npm resolution (`ERESOLVE`), because `typescript-eslint`
    declares `typescript >=4.8.4 <6.1.0` and `eslint-config-next` depends on it. When forced, the
    type-aware lint fails ("typescript-eslint does not support TS 7.0").
  - **`typescript@5.9.3`**: passes `tsc --noEmit`, `next build`, type-aware ESLint, and Vitest,
    and catches a planted type error in both `tsc` and `next build`.
- **Alternative verified, not chosen**: `typescript@6.0.3` passed the same checks. It isn't one of
  this ADR's accepted options (7.0 or the 5.9.x fallback), so adopting it would need a separate
  amendment.
- **Revisit trigger**: `typescript-eslint` supports TypeScript ≥ 7 and `eslint-config-next` depends
  on that release. Re-run the R13 probe first.
- **Not a gate result**: the M0 tests listed above still run in-repo during M0.

### Addendum B — OD-8a resolved (2026-10-23, task T025)

- **Decision**: the owner chose this on 2026-10-22; it is recorded here on 2026-10-23.
  - **CI**: GitHub Actions, with the workflow at `.github/workflows/ci.yml`.
  - **Diff and history secret scan**: **gitleaks v8.30.1**, run from the official pinned image
    `ghcr.io/gitleaks/gitleaks:v8.30.1` through `npm run check:secrets:diff`, identically in CI and
    locally. The config is `.gitleaks.toml`: the default rules, plus rules for the `sk-or-` prefix
    and base64 secrets of 32 bytes or more.
- **Why the binary, not `gitleaks-action`**: the action's README states it needs a
  `GITLEAKS_LICENSE` for organization-owned repositories. Running the pinned binary avoids
  that dependency, and the same command runs on a developer machine.
- **Pinned action versions** (latest releases on 2026-10-23): `actions/checkout@v7.0.1` and
  `actions/setup-node@v7.1.0`.
- **Constraint**: the repository has **no git remote** yet, so the workflow **can't run** until
  one is added. "CI green" for the M0 checkpoint stays unverified until then.
- **Still open**: **OD-8b**, where G1 runs (a Linux host with the firewall rules applied), stays
  open; it is task T047.

### Addendum C — Scanner base images (2026-11-04, CI failure fix)

- **Why**: Decision §6 pinned the scanner to the tag `v1.64.1-noble`, assuming a version tag was
  stable. Upstream republished that tag (digest `47b510dd…` → `2f05f8a7…`), changing its bundled
  Node from 24.22.1 to 26.13.0. CI pulled the new image and `npm ci` failed with `EBADENGINE`, while
  local builds passed on a cached copy.
- **Decision**: `services/scanner/Dockerfile` pins both bases by digest. Dependencies install on
  `node:24.22.1-bookworm-slim`. The runtime stays the Playwright image, for its browsers and system
  libraries, with its own Node and package managers removed and the exact Node 24.22.1 binary copied
  in. The rest of Decision §6 is unchanged.
- **Trade-off**: digests don't receive upstream OS updates, so they must be re-resolved deliberately.
- **Not covered**: the `web` and `egress-proxy` images still use the exact-version tag
  `node:24.22.1-bookworm-slim`, which fixes their Node version but can receive OS-layer rebuilds.

## References

- Feature Spec: [specs/001-accesslens-mvp/spec.md](../../specs/001-accesslens-mvp/spec.md) (Dependencies & Fixed Constraints)
- Implementation Plan: [specs/001-accesslens-mvp/plan.md](../../specs/001-accesslens-mvp/plan.md) (Technical Context, Project Structure, Delivery Order M0)
- Research: [specs/001-accesslens-mvp/research.md](../../specs/001-accesslens-mvp/research.md) (R1, R4, R13)
- Quickstart: [specs/001-accesslens-mvp/quickstart.md](../../specs/001-accesslens-mvp/quickstart.md)
- Related ADRs: [ADR-0001](./0001-scanner-isolation-and-egress-control.md) (topology and hosting constraint, which this ADR must satisfy); [ADR-0002](./0002-stateless-server-signed-evidence.md) (single `web` instance requirement)
- Evaluator Evidence: [history/prompts/001-accesslens-mvp/7-adr-review-od3-od4-adrs-0002-0003.misc.prompt.md](../prompts/001-accesslens-mvp/7-adr-review-od3-od4-adrs-0002-0003.misc.prompt.md)
