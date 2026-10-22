# Quickstart: AccessLens MVP

> Planned developer workflow. Commands become real as tasks are implemented. This file is
> validated at the end of each milestone/user story (constitution Principle X) and is later
> promoted to the root `README.md`. Nothing here claims that a security gate has passed; gates
> pass only with recorded execution evidence.

## Architecture at a glance (ADR-0001, Accepted)

```text
            public network                         internal-only networks
 browser ──▶ web (:3000) ──scan-ctl──▶ scanner (Chromium + axe) ──scan-egress──▶ egress-proxy ──outbound──▶ internet
                 │                       no published ports,                     only scan-path
                 └──▶ OpenRouter         no route except proxy                   component with a route
```

- **`web`**: UI, public API, evidence sealing, AI calls.
- **`scanner`**: no published ports; secrets `SCANNER_INTERNAL_TOKEN` and `PROXY_CONTROL_TOKEN`
  only.
- **`egress-proxy`**: no published ports; secret `PROXY_CONTROL_TOKEN` only; IPv4 outbound only.

## Prerequisites

- Node.js 24 LTS (`.nvmrc`), npm 11
- Docker 29+ with Compose v2+ (all three services run in Docker)
- An OpenRouter API key (optional — without it, AI is disabled and everything else works)
- **For live scanning only**: a Linux host where you control Docker Engine and the host
  firewall (§5). Docker Desktop on Windows/macOS is supported for development with
  `SCAN_ENABLED=false` and fixture-based tests. It isn't a supported live-scanning host,
  because the NL-2 firewall rules can't be applied and verified there in the documented way.

## 1. Install

```bash
git clone <repo> accesslens && cd accesslens
nvm use              # Node 24
npm ci               # installs all workspaces
npx playwright install chromium   # only for the host-side e2e test runner, never for scanning
```

## 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Used by | Required | Example / default | Notes |
|---|---|---|---|---|
| `OPENROUTER_API_KEY` | web (server only) | No | `sk-or-...` | Leave empty to run with AI disabled. Never prefix with `NEXT_PUBLIC_`. |
| `OPENROUTER_MODEL` | web | If key set | *(choose a model that supports structured outputs)* | Configurable without code changes. |
| `AI_PROVIDER` | web | No | `openrouter` | `none` = AI kill switch. Future (post-MVP): `gemini`. |
| `SCAN_ENABLED` | web | No | `false` | Live scanning of arbitrary URLs. MUST stay `false` in every environment until G0 + G1 have passed **with recorded evidence on that same host** and the §5 controls are installed. `false` also serves as the kill switch (scanning-disabled state; demo still works). |
| `AI_MAX_OUTPUT_TOKENS` | web | No | `900` | |
| `AI_TIMEOUT_MS` | web | No | `20000` | |
| `AI_DAILY_REQUEST_CAP` | web | No | `500` | Global cost ceiling. |
| `AI_EXPLAINS_PER_AUDIT` | web | No | `25` | Per-audit cap on verified Explain calls (constitution IX). |
| `EVIDENCE_SIGNING_SECRET` | web | **Yes** | 32+ random bytes, base64 | `openssl rand -base64 48` |
| `EVIDENCE_SIGNING_SECRET_PREVIOUS` | web | No | | Rotation only: move the old current value here, then remove it after 7 days (research R6). |
| `SCANNER_URL` | web | Yes | `http://scanner:4001` | Reached over the internal `scan-ctl` network. |
| `SCANNER_INTERNAL_TOKEN` | web + scanner | **Yes** | 32+ random bytes | Same value in both. |
| `PROXY_CONTROL_TOKEN` | scanner + egress-proxy | **Yes** | 32+ random bytes | Authenticates scanner → proxy control calls. Never given to `web`. |
| `TRUSTED_PROXY_HOPS` | web | No | `0` | Set to `1` behind one reverse proxy. |
| `RL_AUDITS_PER_10M` / `RL_EXPLAINS_PER_10M` | web | No | `5` / `20` | |
| `SCAN_NAV_TIMEOUT_MS` / `SCAN_ANALYSIS_BUDGET_MS` / `SCAN_TEARDOWN_MS` / `SCAN_TOTAL_TIMEOUT_MS` | scanner | No | `30000` / `20000` / `5000` / `60000` | The scanner refuses to start if nav + analysis + teardown > total (research R5). |
| `SCAN_MAX_DOM_ELEMENTS` | scanner | No | `50000` | Allowed range 1 000–200 000 (research R15). |
| `SCAN_MAX_BYTES` / `SCAN_MAX_REQUESTS` | egress-proxy (enforced) + scanner (reported) | No | `15728640` / `300` | |
| `SCAN_CONCURRENCY` / `SCAN_QUEUE` | scanner | No | `2` / `4` | One browser process per concurrency slot. |
| `LOG_LEVEL` | all | No | `info` | Logs are redacted; page content is never logged. |

`.env` is git-ignored. `.env.example` contains placeholders only. `EGRESS_TEST_ALLOWLIST` is
test-only and must never appear in `.env`; the services refuse to start outside test mode if it
is set.

## 3. Run

```bash
docker compose up --build        # web on http://localhost:3000; scanner and egress-proxy unpublished
```

- **Hot reload for UI work** runs `web` **inside** Compose, through a development profile that
  bind-mounts the source and runs `next dev`, so the internal-network topology is preserved. No
  profile ever publishes the scanner or proxy ports. The exact profile name and command are
  defined at M0 and recorded here.
- Open `http://localhost:3000/demo` for the guided demo (no AI key or scanner needed).
- `http://localhost:3000` shows the scanning-disabled state while `SCAN_ENABLED=false`, which is
  the default and is required on Docker Desktop. Scanner development uses local fixtures
  (`npm run test:integration`).

## 4. Test

| Layer | Command | Notes |
|---|---|---|
| All (CI) | `npm test` | Runs unit + integration + security (everything that doesn't need the firewall-equipped G1 host). |
| Unit | `npm run test:unit` | Vitest; shared schemas, URL policy, IP-range sync with firewall list, compare, canonical JSON, sealing, DOM-count early stop, redaction. |
| Integration | `npm run test:integration` | Scanner + egress-proxy against `fixtures/pages/*` through the test-only allowlist; AI adapter with `msw`. |
| Security | `npm run test:security` | URL policy (G0), proxy SSRF vectors, evidence tampering (G3), limits, secret leakage, prompt injection. |
| Network boundary (G1) | `npm run test:g1` | **Runs only on a Linux host with the §5 firewall rules applied**, against the production-config Compose stack: NL-1, NL-2 raw probes, proxy 407, control-token check, DNS-leak check, sandbox check. Writes an evidence log. |
| WCAG + limits (G2) | `npm run test:wcag` / `npm run bench:axe` | Fixtures F-20A … F-INV, interruption and DOM-limit fixtures; the axe benchmark records p50/p95 per fixture (research R5). |
| E2E | `npm run test:e2e` | Playwright Test against the Compose stack with mocked AI and fixture targets; includes axe checks of AccessLens's own pages. |
| Secret scan of build | `npm run check:secrets` | Greps `.next/static` for key names/prefixes. |
| Types / lint | `npm run typecheck && npm run lint` | Lint bans `dangerouslySetInnerHTML` and `NEXT_PUBLIC_*` secrets. |

CI never calls live AI providers or external websites.

## 5. Required production network controls (ADR-0001)

These are **requirements**, not optional hardening. Live scanning (`SCAN_ENABLED=true`) is not
permitted on a host until all of the following are in place **and** `npm run test:g1` has passed
on that host with its evidence log kept.

- **NL-1**: provided by the Compose topology. `scanner` is attached only to `internal: true`
  networks, `web` binds only to its `public`-network address, and the proxy is addressed by a
  fixed IP.
- **NL-2**: host `DOCKER-USER` rules (ESTABLISHED/RELATED accept first) dropping traffic from
  the `outbound` subnet to every non-public IPv4 range listed in ADR-0001 §3 and to all Docker
  bridge subnets. Plus an `INPUT` rule dropping traffic from the `outbound` subnet to the host's
  own addresses. IPv6 is off on `outbound` (`enable_ipv6: false`).
- **Persistence**: Docker doesn't document whether `DOCKER-USER` rules survive restarts, so
  install them through a persistent mechanism and re-run `npm run test:g1` after every Docker
  daemon or host restart. The exact install script is written at M2.
- **Sandbox**: the scanner runs Chromium as `pwuser` with Playwright's seccomp profile. If the
  G1 sandbox check fails, keep `SCAN_ENABLED=false`.
- Put `web` behind a TLS-terminating reverse proxy and set `TRUSTED_PROXY_HOPS=1`. The reverse
  proxy choice is open (see ADR-0003).

## 6. Data retention (for users and operators)

- The server stores **no audit history**. Audit results exist on the server only while an audit or
  Explain request is in progress.
- Audits (complete and partial), AI explanations, and comparisons are stored only in the user's
  browser (IndexedDB). They are removed automatically after 7 days, or immediately through
  "Clear history".
- Logs contain no page content, AI content, or secrets. Log retention is set by the hosting
  platform; the recommendation is ≤ 14 days.
