# AccessLens

AI-assisted accessibility audits for freelance web developers and small agencies. AccessLens
audits **one public page per audit** with Playwright and axe-core, shows engine-detected
findings with evidence, and adds clearly labelled, unverified AI explanations and suggested
fixes. Automated testing covers only part of WCAG. AccessLens never claims compliance or
certification.

> **Status: M0 (project setup).** No auditing, AI, or demo features exist yet. Live scanning is
> **disabled** (`SCAN_ENABLED=false`) and must stay disabled until security gates G0 and G1 have
> recorded passing evidence for the host (see
> [`gate-evidence.md`](specs/001-accesslens-mvp/gate-evidence.md)). No gate has been run yet.

## Architecture

There are three containers on segmented Docker networks
([ADR-0001](history/adr/0001-scanner-isolation-and-egress-control.md)):

```text
 browser ──▶ web (:3000) ──scan-ctl──▶ scanner (Chromium + axe) ──scan-egress──▶ egress-proxy ──outbound──▶ internet
```

- **`web`** (Next.js): the UI, the public API, evidence sealing, and AI calls. It is the only
  service with a published port.
- **`scanner`**: attached only to internal networks, with no route except the egress proxy, and
  runs a sandboxed non-root Chromium.
- **`egress-proxy`**: the only part of the scan path with an outbound route. It is filtered by
  the proxy's own checks and by host firewall rules.

The server stores no audit history. History lives in the user's browser for 7 days
([ADR-0002](history/adr/0002-stateless-server-signed-evidence.md)). Stack and deployment are in
[ADR-0003](history/adr/0003-stack-and-deployment.md): Node 24, TypeScript 5.9.3, Next.js 16.4,
npm workspaces, and Docker Compose on one Linux VM/VPS.

Specs, plan, and tasks: [`specs/001-accesslens-mvp/`](specs/001-accesslens-mvp/).

## Setup

```bash
nvm use            # Node 24 (see .nvmrc)
npm ci             # installs all four workspaces
cp .env.example .env   # placeholders only; fill in locally, never commit .env
```

| Variable group                                   | Service                | Notes                                                                             |
| ------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------- |
| `SCAN_ENABLED`                                   | web                    | Defaults to `false`. Keep it `false` until G0 + G1 evidence exists for this host. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `AI_*` | web                    | Server-side only; never `NEXT_PUBLIC_`. Empty key = AI disabled.                  |
| `EVIDENCE_SIGNING_SECRET(_PREVIOUS)`             | web                    | 32+ random bytes (`openssl rand -base64 48`).                                     |
| `SCANNER_INTERNAL_TOKEN`                         | web + scanner          | 32+ random bytes, same value in both.                                             |
| `PROXY_CONTROL_TOKEN`                            | scanner + egress-proxy | 32+ random bytes. Never given to web.                                             |
| `SCAN_*` limits                                  | scanner / egress-proxy | Defaults in `.env.example`.                                                       |

The full variable reference is in
[`quickstart.md`](specs/001-accesslens-mvp/quickstart.md) §2.

## Run

```bash
docker compose up --build                                       # production-like stack
docker compose --profile dev up --build web-dev scanner egress-proxy   # hot reload, inside Compose
```

The scanner and proxy are placeholders in M0. The web app shows a setup page.

## Test and check commands

| Command                                   | What it runs                                                                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                            | ESLint, including the security rules (no `dangerouslySetInnerHTML`, no `eval`, no `NEXT_PUBLIC_*` secrets).                                                                                                                                      |
| `npm run typecheck`                       | `tsc --noEmit` for the root and all workspaces.                                                                                                                                                                                                  |
| `npm test`                                | Unit, integration, security, and config test projects.                                                                                                                                                                                           |
| `npm run test:config`                     | Compose configuration, secret scans, scanning-default guard, image and binding tests. Locally, Docker/gitleaks-backed tests are **skipped** (not passed) if the tool is unavailable.                                                             |
| `npm run test:ci` + `npm run test:assert` | CI mode: with `ACCESSLENS_REQUIRE_DOCKER=1` and `ACCESSLENS_REQUIRE_GITLEAKS=1`, a missing tool **fails** the suite; `test:assert` then rejects the run unless all 10 required tool-backed tests passed and only allowlisted tests were skipped. |
| `npm run check:secrets`                   | Scans the built client bundle (`apps/web/.next/static`) for secret names and keys.                                                                                                                                                               |
| `npm run check:secrets:diff`              | gitleaks v8.30.1 scan of git history or a commit range. It uses `gitleaks` on PATH or Docker, and exits 3 (fail closed) if neither is available.                                                                                                 |

CI runs in GitHub Actions (`.github/workflows/ci.yml`). It never calls live AI providers or
external websites.

## Data retention

The server stores **no audit history**. Audits, AI explanations, and comparisons are stored only
in the user's browser and are removed after 7 days or through "Clear history". Logs never
contain page content, AI content, or secrets.
