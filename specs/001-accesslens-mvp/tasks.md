---

description: "Task list for AccessLens MVP (001-accesslens-mvp)"
---

# Tasks: AccessLens MVP — Single-Page Accessibility Audit & AI Remediation

**Input**: Design documents from `/specs/001-accesslens-mvp/` (plan.md, spec.md, research.md R1–R15,
data-model.md, contracts/, quickstart.md) and the ADRs.
**ADR status, verified from the files on 2026-10-23**:
- ADR-0001: Accepted; Amendment 1 (firewall rule order and scoping) **Accepted 2026-10-23**
  (OD-12 resolved by T185).
- ADR-0002: Accepted, plus Amendment 1 (per-audit cap); **OD-6 OPEN**.
- ADR-0003: Accepted, plus Addendum A (OD-9 resolved 2026-10-23 → `typescript@5.9.3`, task
  T005); **OD-2, OD-7, OD-8 OPEN**. The owner chose GitHub Actions and
  gitleaks for OD-8a on 2026-10-22, but that choice isn't recorded in the ADR yet, so it stays
  OPEN until T025 records it.

The tasks blocked by each open decision are listed in **Notes**.
**Prerequisites**: plan.md, spec.md (both present).

**Tests**: REQUIRED (constitution Principle VI). Each story's test tasks come first and must be
confirmed **failing** before implementation. No test calls a live AI provider or a live
third-party site. Scanner tests use local fixtures through the test-only allowlist
(`EGRESS_TEST_ALLOWLIST`, honored only when `NODE_ENV=test`).
*Note 2026-11-13:* test mode is now a separate setting (ADR-0001 Amendment 4).
- **Variables**: `ACCESSLENS_TEST_MODE`, `ACCESSLENS_TEST_ALLOWLIST`, and
  `ACCESSLENS_TEST_FIXTURE_SUBNET` (`172.30.50.0/24`); `EGRESS_TEST_ALLOWLIST` is renamed.
- **Where it lives**: only in `docker-compose.test.yml` (ADR-0003 Addendum D).
- **Scope**: it reaches only allowlisted test pages, and is refused in production.

**Gates**: G0 (URL policy), G1 (network boundary, run on a firewall-equipped Linux host), G2
(scanner fixtures and benchmark), and G3 (evidence tampering). A gate passes **only** when its
run is recorded with evidence in `specs/001-accesslens-mvp/gate-evidence.md`. **No gate has
passed at the time of writing.** `SCAN_ENABLED` stays `false` in every environment until G0 and
G1 evidence exists for that host.

**Execution order = priority order** (constitution VII): Setup → Foundational (M1, M2, M3) →
US1 (P1) → US2 (P2) → US4 (P3) → US5 (P4) → US3 (P5) → Polish. The stories were re-prioritized
on 2026-10-22 because the demo tour (US3) covers comparison (US4) and export (US5). US1 also
includes evidence **sealing**, because the public contract requires `evidence` and
`evidenceSignature` on every violation in `/api/audits` results; US2 keeps verification and
Explain.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (user-story phases only)
- Paths are relative to the repository root `D:\Naz\Projects\AccessLens\`

---

## Phase 1: Setup — Milestone M0 (Shared Infrastructure)

**Purpose**: Monorepo, toolchain, Compose skeleton per ADR-0001, the M0 tests from ADR-0003, and
CI.

- [X] T001 Create root `package.json`:
  - npm workspaces `apps/web`, `services/scanner`, `services/egress-proxy`, `packages/shared`;
  - `"engines": { "node": ">=24 <25" }`;
  - scripts `test`, `test:unit`, `test:integration`, `test:security`, `test:g1`, `test:wcag`,
    `bench:axe`, `test:e2e`, `check:secrets`, `typecheck`, `lint`;
  - also create `.nvmrc` containing `24`.
- [X] T002 [P] Create `.gitignore` covering `node_modules/`, `.next/`, `coverage/`,
  `test-results/`, `.env`, `.env.*`, and `!.env.example`.
- [X] T003 [P] Create `.env.example` with a placeholder for every variable in quickstart §2:
  - no real values;
  - `SCAN_ENABLED=false`, `AI_PROVIDER=openrouter`;
  - comment lines naming which service receives each variable, per the ADR-0001 secret table.
- [X] T004 [P] Create `specs/001-accesslens-mvp/gate-evidence.md` with an empty ledger table:
  Gate, Date, Host/Runner, Commit, Command, Result, Evidence link.
- [X] T005 **Decision OD-9 (TypeScript version)**: **resolved 2026-10-23 → pin
  `typescript@5.9.3`** (exact).
  - **How it was checked**: a minimal Next.js 16.4.2 skeleton in an isolated scratchpad probe
    (not committed; no application code), using the T006 strict compiler options, was run with
    `next build` type-checking, type-aware ESLint (`eslint-config-next@16.4.2` +
    `typescript-eslint@8.72.0`), Vitest 5.0.5, and `tsc --noEmit`, each with a planted type error.
  - **Result**:
    - `typescript@7.0.2` failed npm peer resolution (`ERESOLVE`, `typescript-eslint` peer
      `<6.1.0`), and when forced, type-aware ESLint refused it;
    - `typescript@5.9.3` (ADR-0003's accepted fallback) passed every check and caught the
      planted error;
    - `6.0.3` also passed, but it isn't an accepted option.
  - **Recorded in**: `specs/001-accesslens-mvp/research.md` R13 (method and results table),
    `specs/001-accesslens-mvp/plan.md` (Technical Context and the OD-9 row, Resolved), and
    `history/adr/0003-stack-and-deployment.md` Addendum A.
  - **Not a gate or project-test result**: the in-repo M0 tests still have to run.
- [X] T006 [P] Configure strict TypeScript in `tsconfig.base.json` (`strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), with a
  `tsconfig.json` in each workspace extending it. Add `typescript` pinned **exactly** to
  `5.9.3` (the T005 decision) as a root devDependency, so every workspace resolves the same
  compiler.
- [X] T007 [P] Configure ESLint (flat config) in `eslint.config.mjs`:
  - forbid `react/no-danger` (`dangerouslySetInnerHTML`), `no-eval`, and `no-implied-eval`;
  - a `no-restricted-syntax` rule rejecting `process.env.NEXT_PUBLIC_*` names containing `KEY`,
    `SECRET`, or `TOKEN`;
  - also add Prettier config in `.prettierrc`.
  - *Done 2026-10-23*: `eslint@9.39.5` (latest 9.x). npm marks ESLint 9 "no longer supported", but ESLint 10 is incompatible because `eslint-config-next@16.4.2`'s `eslint-plugin-react`, `-import`, and `-jsx-a11y` declare ESLint ≤ 9. The rules were verified to fire on sample violations. **Owner review.**
- [X] T008 [P] Configure Vitest projects (unit, integration, security per workspace) in
  `vitest.workspace.ts`.
  - *Done 2026-10-23*: projects are defined in **`vitest.config.ts` (`test.projects`)** instead of `vitest.workspace.ts`, because Vitest deprecated the workspace file in 3.2. `passWithNoTests` is on while layers are still empty.
- [X] T009 [P] Scaffold `packages/shared/package.json` (exact `zod@4.6.7`, `ipaddr.js@2.5.0`) and
  `packages/shared/src/index.ts`.
- [X] T010 [P] Scaffold `services/egress-proxy/package.json` (no browser dependencies) and
  `services/egress-proxy/src/main.ts` (placeholder entrypoint).
- [X] T011 [P] Scaffold `services/scanner/package.json` (exact `playwright@1.64.1`,
  `@axe-core/playwright@4.14.0`, `axe-core@4.14.0`) and `services/scanner/src/main.ts`.
- [X] T012 [P] Scaffold the Next.js 16.4 app in `apps/web/`:
  - App Router, `output: "standalone"` in `apps/web/next.config.ts`;
  - React 19.3, Tailwind CSS 4.3, Radix UI primitives;
  - `apps/web/src/app/layout.tsx` with `lang="en"`.
- [X] T013 [P] Vendor Playwright's seccomp profile from
  `microsoft/playwright` `utils/docker/seccomp_profile.json` at tag `v1.64.1` into
  `ops/seccomp/playwright-seccomp-profile.json`, recording the source URL and commit SHA in
  `ops/seccomp/SOURCE.md`.
- [X] T014 Write the Compose configuration test in `tests/config/compose.test.ts`. It parses
  `docker-compose.yml` and asserts every item in ADR-0003's "Compose configuration test" list:
  - no `ports` on `scanner` or `egress-proxy`;
  - `scan-ctl`/`scan-egress` are `internal: true`;
  - `outbound` has `enable_ipv6: false` and a fixed subnet;
  - fixed `egress-proxy` IP on `scan-egress`;
  - scanner `init: true`, `shm_size` set, no `ipc: host`, `read_only`, `cap_drop: [ALL]`,
    `no-new-privileges`, seccomp profile path;
  - *Added 2026-11-08 (OD-13, ADR-0001 Amendment 2)*: the scanner's `cap_add` is exactly
    `[SYS_CHROOT]`; no other service has `cap_add`; every service keeps `cap_drop: [ALL]`;
  - per-service env allowlists match ADR-0001;
  - `web` has `read_only: true` with `tmpfs` only for `/tmp` and the Next.js runtime cache, and
    no volumes (ADR-0002 §6);
  - one replica each.

  Confirm it fails.
  - *Note 2026-11-13 (test mode, ADR-0001 Amendment 4)*: extend with the proposal test 6 checks: the base `docker-compose.yml` mentions no `ACCESSLENS_TEST_*` variable. The overlay itself is checked by T195. **Add these checks to the `test:assert` required list when written.**
- [X] T015 [P] Create `apps/web/Dockerfile` (multi-stage, pinned Node 24 slim tag, non-root
  runtime user, standalone output).
  - *Created and statically checked (pinned bases, non-root `USER`). Not yet built*: the build is verified by T024, which is pending Docker.
  - *M0 review 2026-10-23*: base image aligned to **`node:24.22.1-bookworm-slim`**. That's the latest Node 24 LTS, a security release dated 2026-10-20. (Corrected 2026-11-04: the Playwright image's bundled Node isn't fixed; see T016.) Rebuilt; it runs v24.22.1 as UID 1000.
- [X] T016 [P] Create `services/scanner/Dockerfile` (`FROM
  mcr.microsoft.com/playwright:v1.64.1-noble`, runtime `USER pwuser`).
  - *Created; not yet built (T024 pending Docker)*.
  - *Fixed 2026-11-04 (CI `EBADENGINE`)*: upstream republished `v1.64.1-noble` with Node 26.13.0. Both bases are now pinned by digest: dependencies install on `node:24.22.1-bookworm-slim`, and the Playwright runtime has its own Node and package managers removed and the exact Node binary copied in (ADR-0003 Addendum C).
- [X] T017 [P] Create `services/egress-proxy/Dockerfile` (multi-stage, pinned Node 24 slim tag,
  non-root runtime user, no browser).
  - *Created; not yet built (T024 pending Docker)*.
  - *M0 review 2026-10-23*: aligned to **`node:24.22.1-bookworm-slim`** (same reason as T015). Rebuilt; it runs v24.22.1 as UID 1000.
- [X] T018 Create `docker-compose.yml` per ADR-0001 §1/§4 so that T014 passes:
  - networks `public`, `scan-ctl` (internal), `scan-egress` (internal, fixed subnet), and
    `outbound` (fixed IPv4 subnet, `enable_ipv6: false`);
  - `web` publishes 3000, with `read_only: true`, `tmpfs` for `/tmp` and the Next.js runtime
    cache, and no volumes;
  - scanner hardening (non-root, seccomp profile from T013, `init`, `shm_size: 1g` provisional
    until T093, read-only rootfs + `tmpfs /tmp`, resource limits);
  - `egress-proxy` with a fixed IP;
  - env allowlists per service.
  - *Note 2026-11-13*: `docker-compose.yml` stays production-shaped. Test mode goes only in `docker-compose.test.yml` (T196, ADR-0003 Addendum D).
- [X] T019 Write the `web` binding test in `tests/config/web-binding.test.ts`. On the composed
  stack it asserts that `web` accepts TCP on its `public` address and refuses TCP on its
  `scan-ctl` address. Confirm it fails.
  - *Done 2026-10-23 (Docker Desktop 29.2.0)*: **negative control first**. A temporary override binding `web` to `0.0.0.0` made the test **fail** on "refuses TCP on the scan-ctl address". With the T020 entrypoint: **3/3 pass** (public accepted, scan-ctl refused, host port 3000 → 200). The socket table shows a single listener, 172.30.10.10:3000.
- [X] T020 Configure `web`'s listener to bind only to its `public`-network address (Next.js
  standalone `HOSTNAME`, set from the container's `public` interface at start) in
  `apps/web/docker-entrypoint.sh` and `docker-compose.yml`, making T019 pass.
  - *Done and verified 2026-10-23*: T019 passes, and the entrypoint logs `binding web to 172.30.10.10:3000`. The selector unit test passes 4/4.
- [X] T021 **Decision OD-11 (conditional)**: only if T019 can't pass, write a superseding ADR in
  `history/adr/0004-scanner-control-network-fallback.md` choosing between a separate control
  network and a reversed control connection, and update `docker-compose.yml`. Otherwise mark
  OD-11 "not needed" in `specs/001-accesslens-mvp/plan.md`.
  - *Resolved 2026-10-23: **not needed***. T019 passed, including the published host port, so no fallback ADR is required. OD-11 is marked not needed in `plan.md`.
- [X] T022 [P] Add a `dev` Compose profile in `docker-compose.yml` that runs `web` with `next
  dev` and a source bind-mount **inside** Compose, with no scanner or proxy ports published.
  Record the exact command in `specs/001-accesslens-mvp/quickstart.md` §3.
  - *Run and verified 2026-10-23*: the first run served HTTP 500 because `tsconfig.base.json` wasn't mounted. Fixed (read-only mount), and `NODE_ENV=development` was set for `web-dev`. Re-run: HTTP 200, bound to 172.30.10.11, scan-ctl refused, no scanner or proxy ports.
- [X] T023 [P] Write the build secret-scan script `scripts/check-secrets.mjs` (greps
  `apps/web/.next/static` for secret env var names and the `sk-or-` prefix; non-zero exit on a
  hit) and its test `tests/config/check-secrets.test.ts`.
- [X] T024 [P] Write the image-user test `tests/config/images-nonroot.test.ts`: builds each
  image and asserts its runtime UID ≠ 0 and base image tags are pinned (no `latest`).
  - *Updated 2026-11-04 after a CI failure*: rebuilt with `--pull --no-cache`. Checks now also cover the exact Node version in every image, a single Node binary and no package managers in the scanner, and a real Chromium launch under the Compose hardening; later checks fail explicitly if the build failed, so they can't pass on stale images. **Results are local; the GitHub Actions re-run is pending.** The Chromium launch proves availability only; the sandbox is OD-13.
  - *Updated 2026-11-08 (OD-13 resolved)*: the launch check moved to `tests/config/scanner-sandbox.test.ts`, which launches with `chromiumSandbox: true` under the real Compose scanner service, renders a page, and checks the renderer's nested PID namespace, the absence of sandbox-disabling flags, and the scanner's capability sets. Removing `SYS_CHROOT` makes it fail. **Local result only (Docker Desktop on WSL2), not production-host evidence**; see T062.
- [X] T186 [P] Write the scanning-default guard test `tests/config/scan-enabled-default.test.ts`:
  - `.env.example` sets `SCAN_ENABLED=false`;
  - no service or profile in `docker-compose.yml` sets `SCAN_ENABLED` to anything but `false`,
    and none sets it from an un-defaulted variable that could resolve to `true`;
  - `scripts/` and the CI config (once T026 exists) never set `SCAN_ENABLED=true`;
  - the `SCAN_ENABLED` check added in US1 (T116, also asserted by the T101 health test) treats
    an unset or empty value, or anything other than the exact string `true`, as **disabled**.
    This assertion is added when T116 lands; until then it is skipped with a reason naming
    T116.

  Runs in the `config` project.
  - *Done*: 4 passed, plus 1 skip reserved for T116 as specified. A mutation check (default flipped to `true`) made it fail.
  - *Note 2026-11-13 (test mode, proposal test 6)*: extend the guard to **every** `docker-compose*.yml`, so no Compose file, including `docker-compose.test.yml`, may set `SCAN_ENABLED=true`. The existing rule stays intact. **Add the extended check to the `test:assert` required list when written.**
- [X] T025 **Decision OD-8a (CI platform)**: choose the CI platform (the repository needs a
  remote) and record it as an addendum in `history/adr/0003-stack-and-deployment.md` and in the
  OD-8 row of `specs/001-accesslens-mvp/plan.md`. Where G1 runs is decided separately in T047.
- [X] T026 Create the CI pipeline config at the path the T025 platform requires. It runs
  `npm ci`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:security`,
  `check:secrets`, the `tests/config` suite, and a **diff/history secret scan**
  (`npm run check:secrets:diff`). That scan checks every pushed commit range for key-like
  values, including the `sk-or-` prefix, base64 secrets of 32 bytes or more, and private keys.
  The scanner tool is chosen together with the T025 CI platform and recorded in the same
  ADR-0003 addendum. The pipeline runs with no live AI and no external sites.
  - *Created at `.github/workflows/ci.yml` (actions pinned by SHA). **Not executed***: the repository has no remote, so "CI green" is unverified.
  - *M0 review 2026-10-23*: CI now runs every project once in **required mode** (`ACCESSLENS_REQUIRE_DOCKER=1`, `ACCESSLENS_REQUIRE_GITLEAKS=1`; a missing tool fails instead of skipping), followed by `npm run test:assert` (`scripts/assert-required-tests.mjs`, `if: always()`). The audit requires the named tool-backed tests to pass (18 as of 2026-11-08) and allows only 5 allowlisted skips. Both behaviours are proven by `tests/config/ci-strictness.test.ts`. Verified locally in CI mode: 47 passed / 4 allowlisted skips / 0 failed; audit OK. **Still not executed on GitHub** (no remote).
- [X] T027 Write the diff secret-scan verification test `tests/config/diff-secret-scan.test.ts`:
  - it creates a temporary git repository with a commit containing a fake `sk-or-` key and a
    fake 48-byte base64 secret, and asserts `npm run check:secrets:diff` fails on it;
  - a clean commit and `.env.example` placeholders pass;
  - add the `check:secrets:diff` script to the root `package.json`.

  This closes the constitution merge-gate item "no secrets in diff".
  - *Done*: 3/3 passed with gitleaks v8.30.1 (checksum-verified release binary on PATH). Full-history scan of this repo: no leaks.
- [X] T028 [P] Create the root `README.md` (purpose, architecture summary linking ADR-0001–0003,
  setup, env vars, test commands, `SCAN_ENABLED=false` notice, data retention) from
  `specs/001-accesslens-mvp/quickstart.md`.

**Checkpoint M0** — *status 2026-10-23: all M0 tasks done and verified locally; the "CI green" criterion is **pending**, because the repository has no git remote, so the GitHub Actions workflow has never run.* Criteria: CI green; T005, T014, T019, T023, T024, T027, and T186 pass; `/api/health` isn't built
yet.

---

## Phase 2: Foundational (Blocking Prerequisites) — Shared Model, M1, M2, M3

**⚠️ CRITICAL**: No user-story work starts until this phase is complete. Public scanning stays
disabled throughout.

### 2a. Shared schemas and wording (used by every story)

- [X] T029 [P] Write schema tests in `packages/shared/tests/unit/schemas.test.ts` covering:
  - `Audit`: `partialReasons` non-empty iff `status="partial"`; summary counts equal recomputed
    findings;
  - `Finding`: non-null `impact` for violations; `evidence`/`evidenceSignature` present iff
    violation (web output) and absent in scanner output; `wcag` empty when `isBestPractice`;
    16-hex `id`;
  - `AffectedNode` length limits (501/1001);
  - `SignedEvidenceV1` field limits (≤ 5 nodes, selector ≤ 500, help ≤ 500,
    description ≤ 1000).
  - *Done 2026-11-12*: 70 tests, green against T032. The T032 review added cases for `completedAt` ≥ `startedAt`, the exact R2 tag set, and hosts-only `sampleHosts`; each fails when its rule is disabled.
- [X] T030 [P] Write the OpenAPI conformance test `packages/shared/tests/unit/openapi-conformance.test.ts`.
  Using a JSON Schema 2020-12 validator, it checks that valid and invalid sample payloads produce
  the same verdict from the Zod schemas and from
  `specs/001-accesslens-mvp/contracts/public-api.openapi.yaml` components.
  - *Done 2026-11-12*: Ajv 8.20.0 + ajv-formats 3.0.1 (exact-pinned devDependencies). 195 samples across all 11 components; Zod and the contract agree on every one. The contract was aligned with the data model along the way (now **1.4.1**): strict UTC date-times, second-precision `issuedAt`, case-sensitive HTTPS `helpUrl`, UUID v4 ids, the exact R2 tag set, hosts-only `sampleHosts`, and a 16-hex `ExplainResponse.findingId`.
- [X] T031 [P] Write wording tests in `packages/shared/tests/unit/wording.test.ts`:
  - the limitations statement mentions automated coverage limits, manual testing with assistive
    technology, no conformance certification, and the WCAG 2.2 gap;
  - every `PartialReason` has an explanation;
  - `findBannedClaims()` flags "compliant", "fully accessible", "certified", and equivalents.
  - *Written 2026-11-11 (39 tests); red until T033*: the suite fails only because `src/wording.ts` doesn't exist yet, so `npm test` and the `@accesslens/shared` typecheck stay red until T033.
- [X] T032 Implement the Zod schemas in `packages/shared/src/schemas/`:
  - `audit.ts`, `finding.ts`, `evidence.ts`, `events.ts` (NDJSON `AuditEvent`), `explain.ts`;
  - `errors.ts`: the `ErrorCode` enum, including `DOM_TOO_LARGE`, `SCAN_DISABLED`, and every
    Explain code;
  - match `specs/001-accesslens-mvp/data-model.md` so that T029–T030 pass.
  - *Done 2026-11-12*: T029 + T030 pass (267 tests). Shared field schemas live in `primitives.ts`, so `finding.ts` and `evidence.ts` don't import each other. Scanner and web findings are separate discriminated unions on `kind`. The 6 000-character evidence node total is left to the evidence verifier, as the contract says.
- [X] T033 Implement `packages/shared/src/wording.ts` (limitations statement, partial-reason
  explanations, banned-claims list and `findBannedClaims()`), making T031 pass.
  - *Done 2026-11-12*: T031 passes (39 tests); unit project 306 passed. `findBannedClaims` lowercases, turns hyphens into spaces, and collapses whitespace before matching 7 word-bounded patterns. "meets WCAG" isn't banned, so verbatim axe text passes with no exemption. `PARTIAL_REASON_EXPLANATIONS` is a `Record<PartialReason, string>`, so a new reason fails typecheck (TS2741, demonstrated). Mutation check: each phrase, each normalisation step, and the word boundaries are caught (the boundary cases were added in the T033 review). No banned-claim hits in axe-core 4.14.0 rule text (210 help/description strings); the WCAG 2.2 sentence matches R2 (`target-size` is the only rule tagged `wcag22aa`/`wcag258`; no rule is tagged `wcag22a`).

### 2b. Milestone M1 — URL / destination policy (Gate G0)

- [X] T034 [P] Write normalization tests in `packages/shared/tests/unit/url-normalize.test.ts`:
  - a missing scheme becomes `https://`; fragments are stripped; IDN becomes punycode;
  - length > 2048 → `INVALID_URL`;
  - non-http(s) → `UNSUPPORTED_SCHEME`;
  - `user:pass@` → `CREDENTIALS_IN_URL`;
  - ports other than 80/443 → `PORT_NOT_ALLOWED`.
  - *Done 2026-11-13*: written test-first (committed in `7b8ef93`) and passing at `6bad306`: 54 tests, including the review additions (IP-literal detail, http:80/https:443, scheme-less input, raw-length case).
- [X] T035 [P] Write IP classification tests in `packages/shared/tests/unit/ip-classify.test.ts`:
  - every range in ADR-0001 §3, plus `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped IPv6;
  - decimal, octal, and hex IPv4 encodings;
  - public examples are allowed.
  - *Done 2026-11-13*: written test-first (`7b8ef93`) and passing at `6bad306`: 123 tests, including the ipaddr.js cross-check and canonical-dotted-quad cases (ADR-0001 Amendment 3).
- [X] T036 [P] Write the G0 destination case list in
  `packages/shared/tests/security/destination-cases.ts` (the published SC-003 list: direct,
  encoded, DNS-resolved, and redirect-target cases) and the suite
  `packages/shared/tests/security/g0-destination.test.ts`. The suite uses a stub resolver and
  asserts:
  - any non-public answer → `BLOCKED_DESTINATION`;
  - a mixed public + private answer is blocked;
  - an IPv6-only answer → `TARGET_UNREACHABLE` (IPv4-only egress per ADR-0001).
  - *Done 2026-11-13*: written test-first (`7b8ef93`) and passing at `6bad306`: 74 G0 tests (67 published cases plus 7 checks), all required by `test:assert`. Gate G0 recorded under T040.
- [X] T037 Implement `packages/shared/src/url-policy/normalize.ts` and
  `packages/shared/src/url-policy/validate-url.ts` (T034 passes).
  - *Done 2026-11-13*: T034 54/54. Covers the scheme rule, http:80 / https:443 only, credentials, IP-literal hosts (`BLOCKED_DESTINATION`, detail `ip_literal`), and the 2048 limit on raw and normalised input. Mutation check: every rule is caught. The raw-length check needed a case that shrinks when normalised (a 2049-character URL that is mostly a fragment); it was added in the review and fails when that check is disabled.
- [X] T038 Implement `packages/shared/src/url-policy/ip-classify.ts`, exporting the single
  `NON_PUBLIC_IPV4_RANGES` list and `isPublicIPv4()` (T035 passes).
  - *Done 2026-11-13*: T035 123/123. The 18 ranges come from ADR-0001 §3 with Amendment 3. Only canonical dotted-quad input is classified, and ipaddr.js is used for parsing only. Mutation check: removing any of the 18 ranges, or relaxing the canonical check, is caught.
- [X] T039 Implement `packages/shared/src/url-policy/resolve-and-check.ts` (injectable resolver,
  IPv4 `all: true`; any non-public → block), making T036 pass.
  - *Done 2026-11-13*: G0 suite 60/60. The real resolver is `dns.promises.resolve4`: IPv4 A records only, all addresses, no OS lookup. The host is resolved once, and the validated addresses are returned. Not-found and other DNS failures, or an empty answer, give `TARGET_UNREACHABLE`; any answer that isn't canonical public IPv4 gives `BLOCKED_DESTINATION`. An IP-literal host (IPv4 in any form, or IPv6) passed straight to `resolveAndCheck` is refused with detail `ip_literal` before any lookup (review, 2026-11-13; 13 G0 host cases). Mutation check: all caught. **G0 is not passed**: that is T040, which needs a green CI run recorded in gate-evidence.md.
  - *Note 2026-11-13*: an optional test allowance will be added by T192 (test-first in T191). Without it, behaviour, and the G0 suite, are unchanged.
- [X] T040 **Run Gate G0**: run `npm run test:security -- g0` and `npm run test:unit` in CI,
  then record the run in `specs/001-accesslens-mvp/gate-evidence.md` (commit, run link,
  result).
  - *Done 2026-11-13*: **G0 passed.** CI run [43438828829](https://github.com/nazeenasif/AccessLens/actions/runs/43438828829) on `6bad306` (ubuntu-24.04) concluded `success`: G0 suite 74 tests, `test:assert` 92 required. Recorded in gate-evidence.md. **G1 is not passed; `SCAN_ENABLED` stays `false`.**

**Checkpoint G0**: passed only if T040 recorded a green run.

### 2c. Milestone M2 — Egress proxy and network isolation (Gate G1)

- [X] T189 [P] Write test-mode config tests in `packages/shared/tests/unit/test-mode-config.test.ts`
  (ADR-0001 Amendment 4; proposal test 1):
  - only the exact string `true` enables `ACCESSLENS_TEST_MODE`;
  - `ACCESSLENS_TEST_ALLOWLIST` entries must be exact host names (an IP, wildcard, port, or
    empty entry → config error);
  - `ACCESSLENS_TEST_FIXTURE_SUBNET` must parse and must not overlap the four production subnets.
  - *Done 2026-11-13*: written test-first (committed in `ec138cf`); 52 tests, including the canonical-entry cases from the review. Green with T190.
- [X] T190 Implement `packages/shared/src/test-mode.ts` (config parsing shared by web, scanner, and
  egress-proxy), making T189 pass.
  - *Done 2026-11-13*: `parseTestModeConfig`, exported from the package index. Only the exact `true` enables test mode. Allowlist entries must be canonical host names (lowercase ASCII labels, no trailing dot, nothing trimmed or lowercased) and not IP addresses. The subnet must be an IPv4 CIDR overlapping none of the four production subnets. Test mode on with either value missing is an error naming the variable. T189 52/52. Mutation check: 16/17 caught. A port entry is still rejected, but by the IP-literal check (colon), so its error message calls it an IP address (see PHR 44). *Review 2026-11-14*: a dedicated port rule now runs first: `name:digits` with exactly one colon → "includes a port; give the host name only". A new T189 case asserts the message names the port and not an IP address, and it fails with the port rule disabled. T189 53/53.
- [X] T191 [P] Write test-allowance tests in `packages/shared/tests/security/test-allowance.test.ts`
  (proposal test 2):
  - an allowlisted host resolving inside `172.30.50.0/24` → allowed;
  - public, other private, or mixed answers → `BLOCKED_DESTINATION`;
  - non-allowlisted hosts are unaffected;
  - with no allowance, results are identical to the G0 suite.
  - *Done 2026-11-13*: written test-first (`ec138cf`); 51 tests. Green with T192.
- [X] T192 Add the optional test allowance to
  `packages/shared/src/url-policy/resolve-and-check.ts`, making T191 pass. The G0 suite must stay
  green and unchanged.
  - *Done 2026-11-13*: optional third argument `allowance?: TestAllowance`. With no allowance the code path is unchanged. An allowlisted host, matched exactly, must have ALL answers as canonical IPv4 inside the fixture subnet; IP-literal hosts are still refused before DNS. `isIpLiteral` is now exported for T190. T191 51/51; G0 74/74. Mutation check: every allowance rule is caught, including a test allowance leaking into the no-allowance path.
- [ ] T041 [P] Write credential-registry tests in
  `services/egress-proxy/tests/unit/credentials.test.ts`: register/revoke; unknown or revoked →
  407; auto-expiry after `SCAN_TOTAL_TIMEOUT_MS`; per-audit byte and request counters.
- [ ] T042 [P] Write control-endpoint tests in `services/egress-proxy/tests/unit/control.test.ts`:
  - a missing or wrong `PROXY_CONTROL_TOKEN` → 401 (constant-time compare);
  - read-only per-audit views; no other audit's credentials are ever returned;
  - rate-limited.
- [ ] T043 [P] Write proxy behavior tests in
  `services/egress-proxy/tests/integration/proxy.test.ts`:
  - `CONNECT` only to :443, HTTP only to :80;
  - IPv4-only resolve-once;
  - any non-public answer → refusal, with the blocked host recorded;
  - **rebinding**: a stub resolver changes its answer after the first lookup, and the proxy
    still connects to the first validated IP;
  - request and byte caps → further requests refused and the cap flag set.
  - *Note 2026-11-13 (test mode, proposal test 4)*: also cover:
    - in test mode, a non-allowlisted **public** host is refused;
    - an allowlisted host resolving outside `172.30.50.0/24` is refused;
    - outside test mode, `ACCESSLENS_TEST_ALLOWLIST` is ignored.
- [ ] T044 [P] Write startup safety tests in `services/egress-proxy/tests/security/startup.test.ts`
  and `services/scanner/tests/security/startup.test.ts`: the process exits non-zero if
  `EGRESS_TEST_ALLOWLIST` is set outside `NODE_ENV=test`, or if `PROXY_CONTROL_TOKEN` is missing.
  - *Note 2026-11-13 (test mode, proposal test 3)*: the variable is renamed `ACCESSLENS_TEST_ALLOWLIST`. Also: exit non-zero when `ACCESSLENS_TEST_MODE=true` together with `SCAN_ENABLED=true`, and when any `ACCESSLENS_TEST_*` variable is set without `NODE_ENV=test`. **Add these startup-refusal tests to the `test:assert` required list when written** (the web half is T193).
- [ ] T045 [P] Write the range-sync test `packages/shared/tests/unit/firewall-sync.test.ts`:
  `ops/firewall/nonpublic-ipv4.txt` equals `NON_PUBLIC_IPV4_RANGES` from T038.
- [ ] T046 [P] Write proxy logging tests in `services/egress-proxy/tests/unit/logging.test.ts`:
  one `proxy.audit_summary` per audit (requests, bytes, blocked count, cap flags) and
  `proxy.blocked` (reason, hashed host). The serialized logs contain no URLs, paths, query
  strings, or tokens (research R14).
- [ ] T047 **Decision OD-8b (where G1 runs)**: choose and provision the Linux host or runner
  (Docker Engine plus iptables control) for G1, and record it in
  `specs/001-accesslens-mvp/plan.md` (the OD-8 row) and in the ADR-0003 addendum.
- [ ] T048 Implement `services/egress-proxy/src/credentials.ts` (T041).
- [ ] T049 Implement `services/egress-proxy/src/control.ts` (T042).
- [ ] T050 Implement `services/egress-proxy/src/proxy.ts`:
  - uses `isPublicIPv4`/`resolve-and-check` from `packages/shared`;
  - connects to the validated IP;
  - 80/443 only;
  - 407 without credentials;
  - per-audit accounting;
  - test allowlist honored only in test mode.

  Makes T043 pass.
  - *Note 2026-11-13*: the test allowlist is `ACCESSLENS_TEST_ALLOWLIST`. In test mode the proxy serves **only** allowlisted hosts resolving into `ACCESSLENS_TEST_FIXTURE_SUBNET`, using the T192 allowance. Every other host is refused (ADR-0001 Amendment 4).
- [ ] T051 Implement `services/egress-proxy/src/main.ts` (config validation from T044, starts
  the proxy and control listeners on the `scan-egress` address).
  - *Note 2026-11-13*: config validation uses `packages/shared/src/test-mode.ts` (T190) and applies the T044 startup refusals.
- [ ] T052 Implement `services/egress-proxy/src/logger.ts` (pino with the R14 redaction set) and
  emit the R14 proxy events from `proxy.ts`/`credentials.ts`, making T046 pass.
- [ ] T053 [P] Write browser-launch tests in `services/scanner/tests/unit/browser.test.ts`:
  - launch args include `--proxy-bypass-list=<-loopback>`,
    `--host-resolver-rules=MAP * ~NOTFOUND`, `--disable-quic`, and
    `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`;
  - never `--no-sandbox` or `--disable-sandbox`;
  - the launch sets `chromiumSandbox: true` (ADR-0001 Amendment 2; Playwright leaves the sandbox
    off otherwise);
  - one browser per concurrency slot;
  - recycle after 50 audits;
  - each context gets per-audit proxy credentials, `acceptDownloads: false`,
    `serviceWorkers: "block"`, and a 1280×800 viewport.
- [ ] T054 [P] Write proxy-client tests in `services/scanner/tests/unit/proxy-client.test.ts`:
  register before the context opens; revoke in `finally`; counters read before the terminal
  event.
- [ ] T055 Implement `services/scanner/src/browser.ts` (T053).
- [ ] T056 Implement `services/scanner/src/proxy-client.ts` (T054).
- [X] T185 **Decision OD-12 (NL-2 firewall rule order)**: **resolved 2026-10-23**. The owner
  accepted ADR-0001 Amendment 1, which covers:
  - drop-first, state-independent drops scoped to `-s <outbound subnet>`;
  - no broad ESTABLISHED/RELATED accept;
  - the `INPUT` drop at position 1;
  - tagged, idempotent rules;
  - rules installed before `egress-proxy` starts, plus a conntrack flush scoped to `outbound`;
  - conntrack helpers off;
  - fail closed on a non-iptables backend.

  The decision is recorded in `history/adr/0001-scanner-isolation-and-egress-control.md` (the
  original §3 text is preserved; Amendment 1 supersedes its "order" bullet) and in the OD-12
  row of `specs/001-accesslens-mvp/plan.md`. This unblocks T057 and T184. **It doesn't pass
  G1**: T066 still requires recorded evidence.
- [ ] T057 [P] Write the NL-2 firewall scripts per ADR-0001 §3 **as amended by Amendment 1**:
  - `ops/firewall/nonpublic-ipv4.txt` (generated from T038);
  - `ops/firewall/install-nl2.sh`:
    - **Pre-checks, failing closed with a non-zero exit and no partial rule set**: Docker's
      firewall backend is iptables (`DOCKER-USER` exists); the `outbound` subnet equals the
      fixed value in `docker-compose.yml`; `net.netfilter.nf_conntrack_helper=0`; `conntrack`
      is installed.
    - **DOCKER-USER**: insert at the **top**
      `-s <outbound subnet> -d <prohibited range or Docker bridge subnet> -m comment --comment
      accesslens-nl2 -j DROP` for every listed range and every Docker bridge subnet on the
      host, with **no** conntrack-state match.
    - **INPUT**: insert at **position 1**
      `-s <outbound subnet> -d <each host address> -m comment --comment accesslens-nl2 -j DROP`.
      This covers the bridge gateways, LAN and public IPs, and `docker-proxy` listeners.
    - **No** ESTABLISHED/RELATED ACCEPT is added anywhere.
    - **Scope guarantees**: every rule matches `-s <outbound subnet>`; no chain flush (`-F`);
      no policy change; Docker-owned chains (`DOCKER`, `DOCKER-FORWARD`, `DOCKER-ISOLATION-*`)
      are never modified.
    - **Idempotent replace**: delete existing `accesslens-nl2`-tagged rules, then insert, so a
      re-run produces an identical rule set.
    - **After install**: run `conntrack -D -s <outbound subnet>` only; never a global flush.
  - `ops/firewall/uninstall-nl2.sh`: removes **only** `accesslens-nl2`-tagged rules.
  - `ops/firewall/verify-nl2.sh`;
  - `ops/firewall/accesslens-nl2.service`: a systemd unit with `After=docker.service` that is
    ordered **before** the unit that starts the Compose stack, so the rules exist before
    `egress-proxy` opens any connection; it re-applies the rules and the conntrack flush at
    every boot.
- [ ] T058 [P] Write G1 test `tests/g1/nl1-no-direct-route.test.ts`: from inside `scanner`, a
  direct TCP connection to a public IP fails, and connections to `169.254.169.254` and RFC 1918
  targets fail.
- [ ] T059 [P] Write G1 test `tests/g1/nl1-web-unreachable.test.ts`: from inside `scanner`, a TCP
  connection to `web`'s `scan-ctl` address is refused.
- [ ] T060 [P] Write G1 test `tests/g1/nl2-raw-probes.test.ts`: from inside `egress-proxy`, raw
  TCP probes (bypassing proxy logic) to `169.254.169.254`, each RFC 1918 block, a Docker bridge
  subnet, and the host's own address are dropped by the host firewall.
- [ ] T184 [P] Write G1 test `tests/g1/nl2-rule-order.test.ts` against the **running** Docker
  stack on the G1 host, validating ADR-0001 Amendment 1 (unblocked by T185). It asserts:
  - **Rule order**: in `iptables -S DOCKER-USER`, every tagged `-s <outbound> -d <prohibited>
    -j DROP` rule comes before any `ACCEPT`, has no `--ctstate` match, and there is no broad
    `ESTABLISHED,RELATED` accept. The tagged `INPUT` drop for the host's own addresses is at
    position 1.
  - **Scope**: every `accesslens-nl2` rule contains `-s <outbound subnet>`. No untagged rule was
    added or removed, and chain policies and Docker-owned chains are byte-identical
    (`iptables-save`) before and after install, apart from the tagged rules.
  - **Packet path**: using **counter deltas** (read before and after; never zero chain counters
    of unrelated rules), a probe from inside `egress-proxy` to each prohibited range, to
    another container's IP, to the host-published `web:3000` via the host IP (the DNAT hairpin
    case), and to the host's own addresses increments exactly the expected tagged
    `DOCKER-USER` or `INPUT` DROP counter. This proves the packets traverse the intended chain.
  - **Pre-existing flow**: with the NL-2 rules temporarily removed, open a long-lived TCP
    connection from `egress-proxy` to a private test listener on the G1 host. Then run
    `install-nl2.sh` and assert the connection is cut and can't be re-established. Rules are
    restored even if the test fails.
  - **Helpers**: `nf_conntrack_helper` is 0 and no conntrack helper is attached to `outbound`
    flows.
  - **Legitimate traffic still works**: an HTTPS request from `egress-proxy` to a public test
    endpoint completes, so return traffic isn't dropped. Name resolution inside `egress-proxy`
    still works through Docker's embedded DNS.
  - **No disruption to unrelated connections**: across install, re-install, and the scoped
    conntrack flush:
    - a pre-opened TCP session to the host from outside the `outbound` subnet (simulating the
      operator's SSH) stays connected;
    - a long-lived outbound connection from `web` on the `public` network stays connected;
    - `conntrack -L` entries whose source isn't the `outbound` subnet are still present.
  - **Idempotence and clean removal**: running `install-nl2.sh` twice yields an identical
    tagged rule set; `uninstall-nl2.sh` removes all and only `accesslens-nl2` rules.
  - **Fail closed**: on a test host or VM configured with Docker's non-iptables backend, or with
    a mismatched `outbound` subnet, `install-nl2.sh` exits non-zero and leaves no tagged rules.
  - **Evidence**: results are written into the T064 evidence log. This test passing is a
    precondition for T066 but doesn't record G1 by itself.
- [ ] T061 [P] Write G1 test `tests/g1/proxy-vectors.test.ts`. Through the production-config
  proxy it covers:
  - loopback (`127.0.0.1`, `[::1]`, `localhost`), RFC 1918, metadata, and the container
    addresses;
  - encoded IPs and IPv4-mapped IPv6;
  - a non-80/443 port;
  - WebRTC and DNS-prefetch attempts from a page;
  - 407 without credentials and after revocation;
  - control endpoint 401 without the token.
- [ ] T062 [P] Write G1 test `tests/g1/dns-and-sandbox.test.ts`: external DNS resolution from
  inside `scanner` fails; Chromium reports its sandbox enabled; the `scanner` and `egress-proxy`
  environments contain no `OPENROUTER_*` or `EVIDENCE_SIGNING_*` variables.
  - *OD-13 (ADR-0001 Amendment 2)*: "sandbox enabled" means, on the actual Ubuntu 24.04 G1 host and
    under the production-config scanner service: launch with `chromiumSandbox: true` and render a
    page; the renderer is in a nested PID namespace; no process has a sandbox-disabling flag. The
    evidence log records the kernel version and `kernel.apparmor_restrict_unprivileged_userns`.
    `tests/config/scanner-sandbox.test.ts` passing on WSL2 or in CI doesn't satisfy this. If the
    host's restrictions stop the sandbox, keep `SCAN_ENABLED=false` and ask the owner; never add
    `--no-sandbox`.
  - *Note 2026-11-13 (test mode, proposal test 8)*: also assert that no production-config container has any `ACCESSLENS_TEST_*` variable.
- [ ] T063 [P] Write integration test `services/scanner/tests/integration/redirect-policy.test.ts`
  (test mode, allowlisted fixture server): a public-fixture → private redirect stops with
  `BLOCKED_REDIRECT`; more than 10 redirects → `TOO_MANY_REDIRECTS`.
- [ ] T064 Add the `test:g1` runner `scripts/run-g1.mjs`: it brings up the production-config
  stack, checks that `verify-nl2.sh` passes, runs `tests/g1/*`, and writes a timestamped
  evidence log to `ops/evidence/g1-<host>-<date>.log`.
  - *Note 2026-11-13*: the production-config stack is `docker-compose.yml` alone, never with `docker-compose.test.yml`.
- [ ] T065 **Decision OD-10 (conditional)**: if T062's DNS check shows external resolution,
  choose a mitigation, implement it in `docker-compose.yml`, and add an addendum to
  `history/adr/0001-scanner-isolation-and-egress-control.md`. Otherwise mark OD-10 "not needed"
  in `specs/001-accesslens-mvp/plan.md`.
- [ ] T066 **Run Gate G1** on the T047 host with `ops/firewall/install-nl2.sh` applied. It
  requires T185 (OD-12, resolved) and T184 included and passing in `tests/g1/`. Run
  `npm run test:g1` and record the evidence log in `specs/001-accesslens-mvp/gate-evidence.md`.
  Re-run after any daemon or host restart.

**Checkpoint G1**: passed only if T066 recorded a green run on that host.
*Note 2026-11-13*: the G1 run is a release gate, not a build blocker (see Dependencies, M3).

### 2d. Milestone M3 — Scanner service, fixtures only (Gate G2)

- [ ] T067 [P] Create the WCAG fixture pages and expectations in `fixtures/pages/wcag/`:
  `f-20a.html`, `f-20aa.html`, `f-21a.html`, `f-21aa.html`, `f-22aa.html`, `f-bp.html`,
  `f-obs.html`, `f-clean.html`, each with a `*.expected.json` (must-report / must-not-report
  rules per research R2).
- [ ] T068 [P] Create the rule-inventory snapshot `fixtures/axe/rule-inventory.4.14.0.json` (91
  effective rule IDs plus tags, per research R2).
- [ ] T069 [P] Create the interruption fixtures in `fixtures/pages/interruptions/`:
  - a slow-`load` page (document commits, `load` never fires);
  - a no-document page (server never responds);
  - request-heavy (> 300 requests);
  - byte-heavy (> 15 MB);
  - a cross-origin frame page;
  - a blocked-subresource page (subresource on a non-80/443 port);
  - a slow-axe page.
- [ ] T070 [P] Create the DOM-limit fixtures in `fixtures/pages/dom-limit/`:
  - `49999.html`, **`50000.html`**, and `50001.html`. Each has an exact element count (counted
    across all frames and open shadow roots, per research R15), asserted by a fixture
    self-check script `fixtures/pages/dom-limit/verify-counts.mjs`;
  - `two-frames-30k-30k.html`;
  - `shadow-root-large.html`.
- [ ] T071 [P] Create the test-only fixture server `tests/support/fixture-server.ts`, serving
  `fixtures/` and the redirect/slow endpoints for T063 and T069.
  - *Note 2026-11-13*: the fixture server runs on the `test-fixtures` network (`172.30.50.0/24`) in `docker-compose.test.yml` (T196), under a host name listed in `ACCESSLENS_TEST_ALLOWLIST`.
- [ ] T195 [P] Write the overlay config test `tests/config/compose-test-overlay.test.ts`
  (proposal test 6; ADR-0003 Addendum D):
  - `docker-compose.test.yml` defines `test-fixtures` as `172.30.50.0/24`;
  - only the fixture server and `egress-proxy` attach to it, and `scanner` keeps internal networks only;
  - `scanner` and `egress-proxy` get `NODE_ENV=test`;
  - no published ports for `scanner` or `egress-proxy`;
  - no `SCAN_ENABLED` setting.
  **Add this test to the `test:assert` required list when written.**
- [ ] T196 Create `docker-compose.test.yml` per ADR-0003 Addendum D (fixture server from T071,
  test-mode variables, `test-fixtures` network), making T195 pass. T150 later adds the mock
  OpenRouter to this file.
- [ ] T072 [P] Write mapping unit tests in `services/scanner/tests/unit/map-axe.test.ts`:
  - violations → `violation`; incomplete → `manual_review`;
  - category from `cat.*`; `isBestPractice` rule;
  - WCAG parse (`wcag1410` → `1.4.10`);
  - truncation to 500/1000 + "…";
  - 25-node cap and `omittedNodeCount`; finding `id` = sha256(kind:ruleId)[0..16];
  - `impact` null only for `manual_review`.
- [ ] T073 [P] Write config tests in `services/scanner/tests/unit/config.test.ts`:
  - startup is rejected when nav + analysis + teardown > total;
  - `SCAN_MAX_DOM_ELEMENTS` must be within 1 000–200 000;
  - the defaults are 30/20/5/60 s and 50 000.
- [ ] T074 [P] Write DOM-measure unit tests in `services/scanner/tests/unit/dom-measure.test.ts`:
  - **inclusive boundary** with the default limit: 49 999 → within, 50 000 → within, 50 001 →
    exceeds;
  - the same boundary holds for a custom `SCAN_MAX_DOM_ELEMENTS` (e.g. 1 000 / 1 001);
  - counting stops at limit + 1;
  - open shadow roots are counted;
  - a running total across frames (30k + 30k exceeds);
  - the 2 s measurement timeout → treated as exceeding.
- [ ] T075 [P] Write WCAG coverage integration tests in
  `services/scanner/tests/integration/wcag-fixtures.test.ts`:
  - each F-20A … F-CLEAN page yields exactly its must-report rules and none of its must-not-report
    rules;
  - F-INV: the effective rule set equals `fixtures/axe/rule-inventory.4.14.0.json`;
  - engine `tags` equal the R2 set.
- [ ] T076 [P] Write outcome-mapping integration tests in
  `services/scanner/tests/integration/outcomes.test.ts`, one per research R5 table row. Each
  eligible interruption gets **two distinct tests**: one where valid findings exist and one
  where no valid results exist.
  - **Partial (valid findings exist)**: each asserts a terminal `result` with
    `status: "partial"`, exactly the expected `partialReasons`, and a non-empty `findings` list
    from the evaluated document:
    - slow-`load` page (document committed, `load` not reached) → `navigation_timeout`;
    - request cap reached after the document committed → `request_limit_reached`;
    - byte cap reached after the document committed → `byte_limit_reached`;
    - `frames_not_inspected`; `subresources_blocked`.
  - **Error (no valid results)**: each asserts a terminal `error` with the code and **no**
    Audit object:
    - no document committed within the navigation limit → `NAVIGATION_TIMEOUT`;
    - cap reached before a document → `LIMIT_EXCEEDED`;
    - analysis exceeds the 20 s budget on the slow-axe page → `AUDIT_TIMEOUT` (axe is
      all-or-nothing, so it's never partial);
    - `DOM_TOO_LARGE` on `50001.html` with axe **not** invoked;
    - `SCANNER_FAILURE` on a crash.
  - **Boundary**: `49999.html` and `50000.html` produce `complete` (or `partial` only for
    another reason) audits with axe invoked.
  - **Invariant**: `partialReasons` is non-empty iff `status = "partial"`.
- [ ] T077 [P] Create the target-response fixtures in `fixtures/pages/target-responses/` and the
  fixture-server routes in `tests/support/fixture-server.ts`: a 404 page, a 500 page, a PDF
  (`application/pdf`), a `Content-Disposition: attachment` HTML response, a connection-refused
  port, and a stub-resolver NXDOMAIN host.
- [ ] T078 [P] Write target-response integration tests in
  `services/scanner/tests/integration/target-responses.test.ts` (research R5 rows):
  - 404/500 → `TARGET_HTTP_ERROR` with `detail.httpStatus` and axe **not** invoked;
  - PDF or attachment → `NOT_HTML`;
  - NXDOMAIN, refused, or TLS failure → `TARGET_UNREACHABLE`;
  - no Audit object for any of these.
- [ ] T079 [P] Create the page-control fixtures in `fixtures/pages/controls/`, one page each
  for:
  - `window.open` popup, and a scripted `target=_blank` click;
  - `alert`/`confirm`/`prompt`/`beforeunload`;
  - geolocation, notifications, and camera permission requests;
  - an auto-download link;
  - `location.href` change after load, and a meta-refresh to another page;
  - auto-submitting form;
  - a page that sets a cookie and `localStorage` marker.
- [ ] T080 [P] Write page-control security tests in
  `services/scanner/tests/security/page-controls.test.ts` (research R4 table, constitution III,
  FR-006/FR-008). For each T079 fixture, assert:
  - popups are closed and only one page is ever audited;
  - dialogs are dismissed;
  - permissions are denied;
  - no download is written;
  - no second main-frame document request reaches the proxy (navigation away and form
    submission are blocked);
  - the audit completes on the original document, with the "navigated away" / popup notes in
    `limitations`;
  - the cookie and `localStorage` marker set in audit N are absent in audit N+1.
- [ ] T081 [P] Write scanner logging tests in `services/scanner/tests/unit/logging.test.ts`:
  `audit.slot_acquired`, `audit.navigation_done`, `audit.dom_measured`, `audit.axe_done`, and
  `audit.outcome` are emitted with durations and codes, and contain no HTML, URLs, evidence, or
  tokens (research R14).
- [ ] T082 [P] Write `/scan` server tests in `services/scanner/tests/integration/server.test.ts`:
  - 401 without `X-Scanner-Token`;
  - re-validates the URL (rejects private destinations even when `web` is bypassed);
  - NDJSON event order `queued` → `loading` → `analyzing` → exactly one terminal event;
  - queue full → 503 `SCANNER_BUSY`;
  - findings carry no `evidence`.
- [ ] T188 [P] Write scanner contract conformance tests in
  `services/scanner/tests/integration/scanner-contract.test.ts`, using a JSON Schema 2020-12
  validator against `specs/001-accesslens-mvp/contracts/scanner-api.openapi.yaml` and
  `public-api.openapi.yaml`:
  - `/scan` request bodies: valid ones are accepted, and unknown keys or a URL > 2048 chars are
    rejected;
  - every NDJSON line emitted by the **running** scanner, across all T076, T077, and DOM-limit
    fixtures, validates against `AuditEvent`, minus the `evidence`/`evidenceSignature` fields
    the scanner contract excludes, **and** against the shared Zod scanner-output schema
    (T032), so both validators agree;
  - 401/503 bodies and `/healthz` 200/503 match the contract.

  If the scanner contract's 200 schema is too loose to validate (`type: object`), tighten it to
  reference the shared `AuditEvent` without evidence in the same change, and record the
  contract version bump.
- [ ] T083 [P] Write budget tests in `services/scanner/tests/integration/budget.test.ts`:
  - `t0` starts at slot acquisition (queue wait excluded);
  - an analysis timeout emits `AUDIT_TIMEOUT` before teardown;
  - a hung context is killed after 5 s and only its slot's browser is relaunched, while the other
    slot's audit completes.
- [ ] T084 [P] Create the benchmark fixtures in `fixtures/pages/benchmark/` (≈1k, 10k, 25k, and
  50k elements, contrast-heavy, multi-frame).
- [ ] T085 Implement `services/scanner/src/config.ts` (T073).
  - *Note 2026-11-13*: the scanner config reads `ACCESSLENS_TEST_MODE` through `test-mode.ts` (T190) and enforces the T044 refusals.
- [ ] T086 Implement `services/scanner/src/map-axe.ts` (T072).
- [ ] T087 Implement `services/scanner/src/dom-measure.ts` (TreeWalker per frame, early stop,
  2 s bound), making T074 pass.
- [ ] T088 Implement `services/scanner/src/logger.ts` (pino with the R14 redaction set) for the
  scanner lifecycle events.
- [ ] T089 Implement `services/scanner/src/page-controls.ts`, applied by `scan.ts` to every
  audit context (research R4 table):
  - close pages other than the audited one;
  - dismiss dialogs;
  - `permissions: []`;
  - `acceptDownloads: false`;
  - `page.route` aborts any main-frame document request after the initial navigation settles,
    and records limitation notes.
- [ ] T090 Implement `services/scanner/src/scan.ts`:
  - navigation with redirect counting;
  - target-response classification (`TARGET_UNREACHABLE`, `TARGET_HTTP_ERROR`, `NOT_HTML`)
    before analysis;
  - DOM measure → `DOM_TOO_LARGE` **only when the count exceeds** `SCAN_MAX_DOM_ELEMENTS`
    (inclusive limit, research R15);
  - axe with the exact R2 tags under the 20 s budget;
  - read proxy counters;
  - R5 outcome mapping: when an eligible interruption happens and axe completed on a committed
    document, emit a `result` with `status: "partial"` and every applicable reason; when no
    valid axe results exist (no document, cap before the document, analysis timeout, DOM over
    the limit, crash), emit an `error` with no Audit;
  - lifecycle events through T088;
  - revoke credentials and tear down within 5 s.

  Makes T075, T076, T083, T063, T078, T080, and T081 pass.
- [ ] T091 Implement `services/scanner/src/server.ts` (`/scan` NDJSON, `/healthz`, token auth,
  slot pool and queue), making T082 and T188 pass.
- [ ] T092 Implement the benchmark `services/scanner/bench/axe-bench.ts` and the `bench:axe`
  script: 20 runs per T084 fixture in the hardened container; writes p50/p95 to
  `fixtures/benchmark/results-4.14.0.json`; fails if p95 at 50k > 15 s.
- [ ] T093 Measure the final `shm_size` (moved from M2 because it needs the T084 fixtures and the
  T090 scanner): run the benchmark and heavy fixtures in the hardened scanner container and set
  the final `shm_size` in `docker-compose.yml` (M2 used a provisional `1g`). Record the value
  and method in `specs/001-accesslens-mvp/research.md` R4.
- [ ] T094 **Run Gate G2**: run `npm run test:wcag`, the scanner integration tests, and
  `npm run bench:axe`, then record the results in `specs/001-accesslens-mvp/gate-evidence.md`.
  If the benchmark misses, stop and amend the plan (lower `SCAN_MAX_DOM_ELEMENTS` or raise the
  budget). Defaults are not silently changed.

**Checkpoint G2**: foundation ready. User stories can begin. Public scanning is still disabled.

---

## Phase 3: User Story 1 — Audit one public page and review findings (Priority: P1) 🎯 MVP

**Goal**: Submit a URL, see progress, then a dashboard of engine findings with evidence,
manual-review items, best-practice labelling, and every outcome state. Audits are saved locally,
and each violation carries sealed evidence.

**Independent Test**: In test mode, submit the seeded fixture URL and check:
- the expected findings, severities, categories, selectors, and evidence appear;
- manual review is separated and best-practice findings are labelled;
- a private-network URL is refused before any load;
- each outcome state renders;
- the saved audit survives a reload.

### Tests for User Story 1 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T095 [P] [US1] Canonical JSON tests in `packages/shared/tests/unit/canonical-json.test.ts`:
  RFC 8785 examples within the subset; throws on `null`/`undefined`/float; key-order
  independence; array-order sensitivity; no Unicode normalization.
- [ ] T096 [P] [US1] Evidence reduction tests in `packages/shared/tests/unit/evidence-reduce.test.ts`:
  - at most 5 nodes, node text ≤ 6 000 chars, at least one node kept;
  - `failureSummary` trimmed to fit;
  - `nodesOmitted` includes `omittedNodeCount`;
  - selector ≤ 500, help ≤ 500, description ≤ 1000;
  - deterministic output.
- [ ] T097 [P] [US1] Sealing tests in `apps/web/tests/unit/evidence-seal.test.ts`:
  - MAC = HMAC-SHA256 over `"accesslens.evidence.v1\n"` + canonical JSON, base64url, 43 chars;
  - `kid` = first 8 hex chars of SHA-256(key);
  - `issuedAt` in UTC at second precision;
  - only violations are sealed.
- [ ] T098 [P] [US1] Client-IP and rate-limit tests in `apps/web/tests/unit/rate-limit.test.ts`:
  socket IP by default; `X-Forwarded-For` honored only per `TRUSTED_PROXY_HOPS`; fail-closed
  without an IP; 5 audits per 10 min → `RATE_LIMITED` with `Retry-After`.
- [ ] T099 [P] [US1] Logger redaction tests in `apps/web/tests/unit/logger.test.ts`:
  `authorization`, `*.apiKey`, `*.evidenceSignature`, the tokens, and cookies are redacted; no
  page content or evidence is logged.
- [ ] T100 [P] [US1] Contract tests for `POST /api/audits` in
  `apps/web/tests/integration/api-audits.test.ts`, with a stubbed scanner stream:
  - NDJSON events validate against `AuditEvent`;
  - URL-policy errors arrive as stream `error` events;
  - `SCAN_ENABLED=false` → 503 `SCAN_DISABLED`;
  - 429 with `Retry-After`;
  - complete, partial, and error results are relayed;
  - every violation carries valid `evidence` and `evidenceSignature`; manual-review findings
    carry none.
  - *Note 2026-11-13 (test mode, proposal test 5)*: also cover, with `SCAN_ENABLED=false`:
    - test mode with an allowlisted test page → `result`;
    - test mode with any other URL → `SCAN_DISABLED`;
    - neither setting → `SCAN_DISABLED`.
- [ ] T193 [P] [US1] Write web startup safety tests in `apps/web/tests/security/startup.test.ts`
  (proposal test 3, web half). The process exits non-zero when:
  - `ACCESSLENS_TEST_MODE=true` and `SCAN_ENABLED=true` are both set;
  - `ACCESSLENS_TEST_ALLOWLIST` or `ACCESSLENS_TEST_FIXTURE_SUBNET` is set without test mode.
  **Add these tests to the `test:assert` required list when written.**
- [ ] T101 [P] [US1] Health contract test in `apps/web/tests/integration/api-health.test.ts`:
  `{status, scanning, scanner, ai}`; `scanning: "disabled"` by default; no secrets or key ids.
  - *Note 2026-11-13 (owner decision)*: `/api/health` does **not** report test mode; the contract is unchanged.
- [ ] T102 [P] [US1] NDJSON reader tests in `apps/web/tests/unit/audit-stream.test.ts`: split
  lines across chunks; malformed lines; exactly one terminal event.
- [ ] T103 [P] [US1] Local storage tests in `apps/web/tests/unit/storage.test.ts` (with
  `fake-indexeddb`):
  - complete and partial audits are saved with `expiresAt = completedAt + 7d`;
  - errors are never saved;
  - in-memory fallback with `historyAvailable=false` when IndexedDB throws;
  - **stored-shape assertions (FR-032)**: every persisted record validates against the shared
    schema with no extra keys; no field holds full page HTML (each `html` ≤ 501 chars, each
    `failureSummary` ≤ 1001); no screenshot or binary data, cookies, request headers, or form
    values; at most 25 nodes per finding.
- [ ] T104 [P] [US1] Dashboard component tests in `apps/web/tests/unit/dashboard.test.tsx`:
  - severity grouping and summary counts (incl. `bestPractice`, `manualReview`);
  - category filter;
  - best-practice label "Best practice — not a WCAG requirement" with no WCAG mapping;
  - a "not mapped" WCAG state;
  - a separate manual-review section not counted as violations;
  - snippets rendered as inert text;
  - the limitations notice is always present.
- [ ] T105 [P] [US1] State component tests in `apps/web/tests/unit/states.test.tsx`. Each FR-015
  state renders distinct text: idle, validating, auditing with progress, complete, empty ("No
  automated violations detected" + limitations), partial with every reason explanation, timeout
  with retry, blocked destination, blocked redirect, unreachable, page returned an error (shows
  the status), not a web page, page too large, rate-limited, scanning disabled, busy. None uses
  banned wording.
- [ ] T106 [P] [US1] No-persistence security test in
  `apps/web/tests/security/no-persistence.test.ts` (ADR-0002 §6, FR-033, SC-012 server side).
  Against the composed stack in test mode, run an audit and an Explain, then assert:
  - no files changed in the `web` container outside its `tmpfs` mounts;
  - `web` logs contain no snippet, evidence, or AI text;
  - `apps/web/package.json` contains no database or cache client dependencies (denylist check).
  - *Note 2026-11-13*: "test mode" here means the `docker-compose.test.yml` overlay (ADR-0001 Amendment 4).
- [ ] T107 [P] [US1] Security test in `apps/web/tests/security/headers.test.ts`: the CSP blocks
  inline scripts and external origins; no `dangerouslySetInnerHTML` in the build (lint
  assertion); `server-only` modules aren't in the client bundle.
- [ ] T108 [P] [US1] E2E test in `e2e/us1-audit.spec.ts`, against Compose in test mode with the
  fixture server and the allowlist:
  - submit `f-20a`; see progress; see expected findings and evidence; the saved audit persists
    after reload;
  - a private URL is refused;
  - the partial (slow-load), page-too-large, and timeout fixtures show their states.
  - *Changed 2026-11-13*: the "`/demo` stays reachable while scanning is disabled" assertion moved
    to T176, because the demo page is only built in US3. Keeping it here would make US1 depend on US3.
  - *Note 2026-11-13*: runs against `docker-compose.yml` plus `docker-compose.test.yml`. `SCAN_ENABLED` stays `false`; test mode enables the allowlisted test pages.
- [ ] T109 [P] [US1] Self-audit and responsive E2E in `e2e/us1-a11y.spec.ts`: axe (WCAG A/AA)
  finds zero violations on the form, progress, dashboard, finding detail, and every state; the
  flow works keyboard-only; status changes are announced through `aria-live`; no horizontal
  scroll at 320 px; reduced motion is respected.

### Implementation for User Story 1

- [ ] T110 [P] [US1] Implement `packages/shared/src/canonical-json.ts` (T095).
- [ ] T111 [P] [US1] Implement `packages/shared/src/evidence-reduce.ts` (T096).
- [ ] T112 [US1] Implement `apps/web/src/server/evidence-seal.ts` (`server-only`; current key
  from `EVIDENCE_SIGNING_SECRET`; startup fails if the key is missing or < 32 bytes), making T097
  pass.
- [ ] T113 [P] [US1] Implement `apps/web/src/server/logger.ts` (pino with the redaction paths
  from research R14), making T099 pass.
- [ ] T114 [P] [US1] Implement `apps/web/src/server/client-ip.ts` and
  `apps/web/src/server/rate-limit.ts` (in-memory fixed window, fail-closed), making T098 pass.
- [ ] T115 [P] [US1] Implement `apps/web/src/server/scanner-client.ts` (POSTs `/scan` over
  `SCANNER_URL` with `X-Scanner-Token`, parses NDJSON, validates each event with the shared
  schema).
- [ ] T194 [US1] Implement web startup config validation (using `test-mode.ts` from T190) so the
  server refuses to start in the T193 cases, making T193 pass.
- [ ] T116 [US1] Implement `apps/web/src/app/api/audits/route.ts` (Node runtime):
  - checks `SCAN_ENABLED` → `SCAN_DISABLED`;
  - applies the rate limit;
  - runs the URL policy (T037–T039);
  - relays the scanner stream;
  - seals every violation with T111/T112 before relaying the `result`.

  Makes T100 pass.
  - *Note 2026-11-13 (test mode)*: check order:
    1. `SCAN_ENABLED=true` → production path;
    2. otherwise, `ACCESSLENS_TEST_MODE=true` and the URL's host exactly on `ACCESSLENS_TEST_ALLOWLIST` → proceed with the T192 allowance;
    3. anything else → `SCAN_DISABLED`.
- [ ] T117 [P] [US1] Implement `apps/web/src/app/api/health/route.ts` (T101).
- [ ] T118 [P] [US1] Implement `apps/web/src/lib/audit-stream.ts` (T102).
- [ ] T119 [P] [US1] Implement `apps/web/src/lib/storage.ts`: IndexedDB `accesslens` v1 with
  `audits` and `aiAnnotations` stores; save; purge expired audits on app start; memory
  fallback (T103).
- [ ] T120 [P] [US1] Implement the dashboard components in `apps/web/src/components/dashboard/`:
  `Summary.tsx`, `FindingGroups.tsx`, `CategoryFilter.tsx`, `ManualReview.tsx`,
  `LimitationsNotice.tsx`, and `PartialBanner.tsx` (reasons + coverage explanations from
  `wording.ts`) (T104).
- [ ] T121 [P] [US1] Implement `apps/web/src/components/finding-detail/FindingDetail.tsx` (rule,
  severity, category, description, selectors, inert snippet, failure summary, guidance link, WCAG
  or "not mapped", best-practice label).
- [ ] T122 [P] [US1] Implement the state components in `apps/web/src/components/states/`, one
  file per FR-015 state with `aria-live` announcements (T105).
- [ ] T123 [US1] Implement `apps/web/src/app/page.tsx`: URL form showing the normalized URL;
  live audit view through `audit-stream`; saves complete/partial audits; navigates to the saved
  audit view.
- [ ] T124 [US1] Implement `apps/web/src/app/audits/[id]/page.tsx`: reads the audit from
  IndexedDB and renders the dashboard and finding detail, with a "history not saved" notice when
  storage is unavailable.
- [ ] T125 [US1] Configure security headers and a nonce-based CSP in `apps/web/next.config.ts`
  and `apps/web/src/middleware.ts` (T107).
- [ ] T126 [US1] Update `README.md` and `specs/001-accesslens-mvp/quickstart.md` with the
  verified US1 commands.
  - *Note 2026-11-13*: the test-mode commands and renamed variables are covered by T197.

### Release prerequisites for User Story 1 (public scanning)

- [ ] T197 [US1] Update `specs/001-accesslens-mvp/quickstart.md` and `README.md` for test mode: the
  `docker compose -f docker-compose.yml -f docker-compose.test.yml` commands, and the renamed
  variables (quickstart still names `EGRESS_TEST_ALLOWLIST`).
- [ ] T127 [US1] **Decision OD-2 (VM/VPS provider and region)**: choose a provider that
  satisfies ADR-0001 §5 and record it in the ADR-0003 addendum and the OD-2 row of
  `specs/001-accesslens-mvp/plan.md`.
- [ ] T128 [US1] **Decision OD-7 (TLS reverse proxy)**: choose one, record it in the ADR-0003
  addendum, and add its config under `ops/reverse-proxy/`. It must forward one hop
  (`TRUSTED_PROXY_HOPS=1`) and must not log request bodies.
- [ ] T187 [US1] Write the scan-enable guard `scripts/check-scan-enable.mjs <host>` and its test
  `tests/config/check-scan-enable.test.ts`. The script exits non-zero unless
  `specs/001-accesslens-mvp/gate-evidence.md` has a **G0** row and a **G1** row for that exact
  host, each with:
  - result `pass`;
  - a commit SHA that is an ancestor of the deployed commit;
  - an evidence link or log path that exists.

  Test cases: missing G1, a G1 row for a different host, a `fail` result, and a missing evidence
  file each fail; a complete record passes.
  - *Note 2026-11-13 (test mode, proposal test 7)*: the script also refuses a host whose environment has **any** `ACCESSLENS_TEST_*` variable. **Add this test to the `test:assert` required list when written.**
- [ ] T129 [US1] Deploy to the T127 host:
  - install `ops/firewall/accesslens-nl2.service`;
  - run `npm run test:g1` there and record G0 + G1 evidence for **that host** in
    `specs/001-accesslens-mvp/gate-evidence.md`;
  - run `node scripts/check-scan-enable.mjs <host>` (T187); **only if it passes**, set
    `SCAN_ENABLED=true` in that host's environment. Writing this task or the tests doesn't
    count as passing any gate.

**Checkpoint US1**: US1 is fully functional. MVP is deliverable once T129's evidence is recorded.

---

## Phase 4: User Story 2 — AI explanation and suggested fix (Priority: P2)

**Goal**: On-demand "Explain" for one detected violation, built only from verified sealed
evidence. The output is strictly validated and labelled as AI-generated and unverified, and
there is a graceful unavailable state.

**Independent Test**: With a stored audit of the seeded page and OpenRouter mocked:
- "Explain" shows the labelled explanation and fix;
- tampered, expired, or forged evidence is refused with zero provider calls;
- invalid output or an outage shows "AI explanation unavailable" while the findings remain
  usable.

- [ ] T130 [US2] **Decision OD-6 (daily AI cap across restarts)**: choose (a) a provider-side key
  spending limit (confirm OpenRouter's setting first), (b) a persisted counter, or (c) both.
  Record it as an addendum in `history/adr/0002-stateless-server-signed-evidence.md` and in the
  OD-6 row of `specs/001-accesslens-mvp/plan.md`.

### Tests for User Story 2 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T131 [P] [US2] Verification-order unit tests in `apps/web/tests/unit/evidence-verify.test.ts`.
  The **canonical order** (research R6, contract, ADR-0002) is:
  1. body size ≤ 64 KB;
  2. **per-IP rate limit, counting every attempt** (including malformed and forged ones);
  3. strict schema;
  4. `v`/`kid`;
  5. MAC (`timingSafeEqual`);
  6. expiry/skew;
  7. **then** the per-audit cap and daily cap, both consumed **only** by verified requests;
  8. **then** the provider call.

  Each test spies on the stage functions and asserts **call order** and **short-circuit**: a
  failure at stage N calls no later stage. Also covers current and previous key, a removed
  previous key → `EVIDENCE_INVALID`, 7 days ± 1 s, and future-dated > 60 s.
- [ ] T132 [P] [US2] Per-audit AI cap tests in `apps/web/tests/unit/audit-cap.test.ts` (research
  R6 step 7, ADR-0002 Amendment 1, constitution IX):
  - the 26th verified Explain for one `auditId` → `AUDIT_AI_LIMIT_REACHED` with zero provider
    calls;
  - other audits are unaffected;
  - refused (unverified) attempts don't count;
  - entries expire after 7 days (fake clock);
  - the oldest entry is evicted at 50 000 entries;
  - `AI_EXPLAINS_PER_AUDIT` overrides the default.
- [ ] T133 [P] [US2] Daily AI cap tests in `apps/web/tests/unit/daily-cap.test.ts` (research
  R12, ADR-0002, OD-6 via T130):
  - only verified requests count;
  - request 501 of the day → `AI_BUDGET_EXHAUSTED` with zero provider calls;
  - the window resets at 00:00 UTC (fake clock);
  - `AI_DAILY_REQUEST_CAP` overrides the default;
  - **restart behavior matches the T130 decision**: for a persisted counter, a simulated `web`
    restart keeps the count; for a provider-side limit only, the test asserts the documented
    reset and checks that the deployment checklist in `README.md` requires the provider key
    limit to be set.
- [ ] T134 [P] [US2] **G3 tampering suite** in `apps/web/tests/security/explain-tampering.test.ts`.
  Every case in research R6 is refused, and the provider mock records **zero calls** for each:
  - each top-level and nested field altered;
  - an added or removed field;
  - node reorder, add, or remove;
  - a Unicode-equivalent string;
  - a truncated signature;
  - another finding's signature;
  - `v: 2`;
  - expired and future-dated evidence.

  Positive cases: reordered keys and a previous-key signature are accepted.
- [ ] T135 [P] [US2] Contract tests for `POST /api/explain` in
  `apps/web/tests/integration/api-explain.test.ts`: request and response validate against the
  contract; 400/403/413/429/502/503 with the correct codes, including 429
  `AUDIT_AI_LIMIT_REACHED`; `AI_PROVIDER=none` → `AI_DISABLED`.
  - **Malformed attempts** (invalid JSON, unknown keys, wrong types, > 64 KB):
    - each gets 413 or 400;
    - each except the oversized body increments the per-IP counter;
    - none consumes the per-audit or daily cap;
    - the provider mock records zero calls.
  - **Forged attempts** (bad MAC, unknown `kid`, altered `help`/`description`/node, expired,
    future-dated):
    - each gets 403;
    - each increments the per-IP counter;
    - none consumes the per-audit or daily cap;
    - zero provider calls.
  - **Mixed sequence**: 20 forged attempts from one IP leave the 21st (valid) request refused
    with `EXPLAIN_RATE_LIMITED`, while the per-audit and daily counters for that `auditId` stay
    at 0.
  - **Verified requests**: only these increment the per-audit and daily counters, and exactly
    one provider call is made each.
- [ ] T136 [P] [US2] OpenRouter adapter tests in `apps/web/tests/integration/openrouter.test.ts`,
  with `msw`:
  - request to `https://openrouter.ai/api/v1/chat/completions` with Bearer auth, `model`,
    `max_tokens`, `response_format.json_schema` with `strict: true`,
    `provider.require_parameters: true`, `provider.data_collection: "deny"`, and the attribution
    headers;
  - error mapping: 429/503 retried at most once only if `Retry-After` ≤ 5 s; 402 not retried;
    401/403 → `config_error`; 408 or abort → `timeout`; 502; a 200 with an `error` body →
    `invalid_output`;
  - every call emits one `explain.call` log event (provider, model, duration, prompt and
    completion tokens, outcome or error kind, retry count) with no evidence or AI text (research
    R14).
- [ ] T137 [P] [US2] Output validation tests in `apps/web/tests/unit/ai-output.test.ts`: the
  `findingId`/`ruleId` echo must match; extra keys are rejected; length limits apply; there is
  no severity field.
- [ ] T138 [P] [US2] Prompt-injection test in `apps/web/tests/security/prompt-injection.test.ts`:
  sealed evidence whose snippet contains instructions aimed at the AI. The prompt keeps evidence
  as JSON data separate from the instructions; mocked malicious outputs are discarded; engine
  data is unchanged.
- [ ] T139 [P] [US2] AI panel component tests in `apps/web/tests/unit/ai-panel.test.tsx`:
  - "Explain" is shown only on violations; no AI request on load;
  - a loading state;
  - "AI-generated" and "Unverified suggestion" labels;
  - code shown as inert text in a language-labelled block;
  - unavailable/retry and rate-limited states;
  - a distinct per-audit "AI explanation limit reached for this audit" state on
    `AUDIT_AI_LIMIT_REACHED` (FR-021), with no retry offered and engine data still usable;
  - the cached annotation is reused.
- [ ] T140 [P] [US2] Storage tests for annotations in `apps/web/tests/unit/storage-annotations.test.ts`:
  only `available` annotations are persisted; they are deleted with their audit.
- [ ] T141 [P] [US2] E2E test in `e2e/us2-explain.spec.ts`, against Compose with a mock
  OpenRouter in test mode: the Explain flow; an outage keeps the findings usable; an expired
  signature shows "Re-audit to enable explanations"; self-axe on the AI panel.
  - *Note 2026-11-13*: runs against `docker-compose.yml` plus `docker-compose.test.yml`.

### Implementation for User Story 2

- [ ] T142 [US2] Implement `apps/web/src/server/evidence-verify.ts` (verification order, key
  selection by `kid`, `EVIDENCE_SIGNING_SECRET_PREVIOUS`), making T131 and T134 pass.
- [ ] T143 [P] [US2] Implement `apps/web/src/server/ai/provider.ts` (types per
  `contracts/ai-provider.ts`) and `apps/web/src/server/ai/factory.ts` (`AI_PROVIDER`:
  `openrouter` | `none`).
- [ ] T144 [P] [US2] Implement `apps/web/src/server/ai/prompt.ts`: system prompt treating
  evidence as untrusted data; `ExplainInput` built only from verified evidence (T138).
- [ ] T145 [US2] Implement `apps/web/src/server/ai/openrouter.ts` (request shape, timeout via
  `AbortSignal`, error mapping, Zod re-validation), making T136 and T137 pass. The test-mode
  base-URL override is honored only when `NODE_ENV=test`.
  - *Note 2026-11-13*: the base-URL override must follow `ACCESSLENS_TEST_MODE`, not `NODE_ENV=test`. Next.js inlines `NODE_ENV` at build time, so a `NODE_ENV` check can't work in `web` (ADR-0001 Amendment 4).
- [ ] T146 [US2] Implement `apps/web/src/server/ai/daily-cap.ts` per the T130 decision, making
  T133 pass.
- [ ] T147 [US2] Implement `apps/web/src/server/ai/audit-cap.ts` (in-memory per-`auditId`
  counter with 7-day expiry and a 50 000-entry bound), making T132 pass.
- [ ] T148 [US2] Implement `apps/web/src/app/api/explain/route.ts` in exactly the canonical
  order from T131:
  1. body size ≤ 64 KB (else 413);
  2. per-IP limit on **every** attempt (else 429 `EXPLAIN_RATE_LIMITED`);
  3. strict schema (else 400);
  4. `v`/`kid`, MAC, expiry/skew (else 403);
  5. per-audit cap (else 429 `AUDIT_AI_LIMIT_REACHED`);
  6. daily cap (else 429 `AI_BUDGET_EXHAUSTED`), with both caps counting verified requests
     only;
  7. build `ExplainInput` from the verified evidence;
  8. provider call → validated response.

  It emits `explain.refused` with the code at each refusal and `explain.call` for the provider
  call, making T131 (route-level wiring) and T135 pass.
- [ ] T149 [P] [US2] Implement `apps/web/src/components/ai-panel/AiPanel.tsx` (including the
  per-audit limit-reached state) and annotation persistence in `apps/web/src/lib/storage.ts`
  (T139, T140).
- [ ] T150 [US2] Add a mock-OpenRouter service (test profile only) to `docker-compose.yml` for
  e2e, and update `specs/001-accesslens-mvp/quickstart.md` with the US2 commands.
  - *Note 2026-11-13*: the mock OpenRouter goes in `docker-compose.test.yml` (ADR-0003 Addendum D), not in a profile of `docker-compose.yml`.
- [ ] T151 [US2] **Run Gate G3**: run the T134 suite in CI and record it in
  `specs/001-accesslens-mvp/gate-evidence.md`.

**Checkpoint US2**: US1 and US2 work independently. Explain requires a G3 record before release.

---

## Phase 5: User Story 4 — Re-audit and compare results (Priority: P3)

**Goal**: A local history view with 7-day expiry and Clear history, plus re-audit of a saved URL
with a Remaining / No longer detected / New comparison and comparability warnings.

**Independent Test**: Audit fixture version A, then version B (two issues removed, one added).
The comparison shows 2 "no longer detected", 1 "new", and the rest "remaining". Clear history
leaves zero records.

### Tests for User Story 4 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T152 [P] [US4] Create comparison fixtures `fixtures/pages-v2/compare-a.html` and
  `fixtures/pages-v2/compare-b.html` (B fixes two A violations and adds one), each with
  `*.expected.json`.
- [ ] T153 [P] [US4] Compare unit tests in `packages/shared/tests/unit/compare.test.ts`:
  - occurrence key `kind|ruleId|selector`; each occurrence in exactly one group;
  - per-group counts by severity;
  - warnings `final_url_differs`, `partial_audit`, `engine_version_differs`;
  - selector-change pairs appear as both "no longer detected" and "new".
- [ ] T154 [P] [US4] Fixture re-scan verification test in
  `services/scanner/tests/integration/rescan-verification.test.ts`: scanning `compare-b` confirms
  the two fixed rules no longer fail for their targets (constitution VI re-scan verification on
  fixtures only).
- [ ] T155 [P] [US4] History storage tests in `apps/web/tests/unit/history.test.ts`: purge at
  7 days with a fake clock; Clear history removes all audits and annotations (SC-012); deleting a
  single audit; re-audit comparison only against locally saved audits.
- [ ] T156 [P] [US4] Comparison view tests in `apps/web/tests/unit/comparison-view.test.tsx`:
  "No longer detected" wording with no "fixed" or "verified" claims; warnings rendered;
  banned-wording check.
- [ ] T157 [P] [US4] E2E test in `e2e/us4-compare.spec.ts`:
  - re-audit flow with `compare-a` → `compare-b` (SC-010);
  - Clear history shows the empty state (SC-012);
  - an expired or cleared baseline explains that there is nothing to compare;
  - the history page shows removal dates and the local-only notice (FR-037);
  - self-axe and 320 px.

### Implementation for User Story 4

- [ ] T158 [US4] Implement `packages/shared/src/compare.ts` (T153).
- [ ] T159 [P] [US4] Implement `apps/web/src/components/comparison/ComparisonView.tsx` (T156).
- [ ] T160 [P] [US4] Implement `apps/web/src/app/history/page.tsx`: list of saved audits with
  removal dates; confirmed Clear history; per-audit delete; local-only notice.
- [ ] T161 [US4] Add "Re-audit" to `apps/web/src/app/audits/[id]/page.tsx`. It runs a new audit
  of the same URL and renders `ComparisonView` against the saved baseline.
- [ ] T162 [US4] Extend `apps/web/src/lib/storage.ts` with delete-one, clear-all, and
  list-by-URL (T155).

**Checkpoint US4**: US1, US2, and US4 work independently.

---

## Phase 6: User Story 5 — Export an audit report (Priority: P4)

**Goal**: A downloadable, self-contained, accessible HTML report with an accessible print
stylesheet.

**Independent Test**: Export the seeded audit and check:
- every dashboard finding, the limitations statement, AI labels, and partial notes are present;
- the file opens offline with zero network requests and has no scripts;
- the print layout is readable;
- there is no compliance wording.

### Tests for User Story 5 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T163 [P] [US5] Export unit tests in `apps/web/tests/unit/export.test.ts`:
  - output has a `<!doctype html>`, the CSP meta `default-src 'none'; style-src 'unsafe-inline'`,
    zero `<script>`, and no external resource URLs (help links are plain anchors);
  - all findings, manual review, the limitations statement, partial reasons, "AI-generated" /
    "Unverified suggestion" labels (only for generated annotations), and the comparison when
    present;
  - no secrets, provider names, or internal identifiers beyond the audit reference (FR-027);
  - page-derived strings are escaped.
- [ ] T164 [P] [US5] Banned-wording test on exports in `apps/web/tests/security/export-wording.test.ts`
  (SC-006), using `findBannedClaims()`.
- [ ] T165 [P] [US5] E2E test in `e2e/us5-export.spec.ts`:
  - download the report and open it with network disabled; zero requests (SC-011);
  - axe on the report finds zero A/AA violations;
  - `emulateMedia({ media: "print" })`: no navigation chrome, code blocks wrap, severity shown as
    text, logical heading order, link URLs printed.

### Implementation for User Story 5

- [ ] T166 [P] [US5] Implement `apps/web/src/components/report/ReportDocument.tsx` (static, no
  client JS) and `apps/web/src/components/report/report.css` (screen and accessible `@media print`
  rules).
- [ ] T167 [US5] Implement `apps/web/src/lib/export.ts`: `renderToStaticMarkup`, inline CSS,
  CSP meta, Blob download; makes T163 and T164 pass.
- [ ] T168 [US5] Add an "Export report" action to `apps/web/src/app/audits/[id]/page.tsx`,
  including the comparison when one is shown.

**Checkpoint US5**: US1, US2, US4, and US5 work independently.

---

## Phase 7: User Story 3 — Guided demo (Priority: P5)

*(P5 because the tour covers comparison (US4) and export (US5).)*

**Goal**: A demo with realistic, clearly labelled sample data and an accessible guided tour. It
makes no URL submission and no live audit or AI call, and works with scanning and AI disabled.

**Independent Test**: With `SCAN_ENABLED=false` and `AI_PROVIDER=none`, complete the tour
keyboard-only. Every step renders sample data, the "Sample data" label stays visible, and no
`/api/*` request is made.

### Tests for User Story 3 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T169 [P] [US3] Demo data validation test in `apps/web/tests/unit/demo-data.test.ts`: every
  demo audit and annotation validates against the shared schemas; AI annotations are labelled
  AI-generated; there is no banned wording.
- [ ] T170 [P] [US3] Tour component tests in `apps/web/tests/unit/tour.test.tsx`:
  - step order: summary → finding evidence → AI explanation and fix → manual review → comparison
    → export;
  - skip, exit, and revisit;
  - focus moves to each step target and returns on exit;
  - step changes are announced through `aria-live`;
  - reduced motion is respected.
- [ ] T171 [P] [US3] E2E test in `e2e/us3-demo.spec.ts`, with scanning and AI disabled:
  - route interception asserts zero `/api/*` requests;
  - keyboard-only tour completion;
  - the persistent "Sample data" label;
  - the URL form isn't usable inside the demo;
  - phone viewport (320 px);
  - self-axe zero violations;
  - tour completion time recorded for SC-009.

### Implementation for User Story 3

- [ ] T172 [P] [US3] Create the AccessLens-owned demo source page `fixtures/demo-site/index.html`
  with seeded issues that cover a manual-review item and a best-practice finding, plus a fixed
  variant `fixtures/demo-site/index-v2.html` for the comparison.
- [ ] T173 [US3] Implement `scripts/build-demo-data.ts`: scans `fixtures/demo-site/*` through the
  scanner in test mode and writes `apps/web/src/demo/data/audits.json` (two audits). Evidence is
  sealed with a **throwaway random key generated at build time and never saved**, so the data
  satisfies the shared schema, while the server would refuse it with `EVIDENCE_INVALID` (unknown
  `kid`). Explain is disabled in the demo.
  - *Note 2026-11-13*: "test mode" means the `docker-compose.test.yml` overlay (ADR-0001 Amendment 4).
- [ ] T174 [US3] Create `apps/web/src/demo/data/annotations.json`, AI annotations for selected
  demo findings, **reviewed by a human for accuracy** before commit. Record the reviewer and date
  in `apps/web/src/demo/data/REVIEW.md`.
- [ ] T175 [P] [US3] Implement `apps/web/src/components/tour/Tour.tsx` and
  `apps/web/src/components/tour/steps.ts` (T170).
- [ ] T176 [US3] Implement `apps/web/src/app/demo/page.tsx`: loads the bundled demo data; renders
  the dashboard, `AiPanel` (read-only, no Explain requests), `ComparisonView`, and export of the
  sample report; shows the "Sample data" label; no network calls (T171).
  - `/demo` stays reachable while scanning is disabled (`SCAN_ENABLED=false`); verified by the
    T171 e2e test, which already runs with scanning and AI disabled.
  - *Changed 2026-11-13*: this assertion moved here from T108 (US1), which can't check a page built in US3.

**Checkpoint US3**: all five stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T177 [P] Repo-wide banned-wording scan `scripts/check-wording.mjs` over UI strings, demo
  data, and report templates (SC-006), added to CI in the T026 pipeline config.
- [ ] T178 [P] Large-result performance test in `e2e/perf-large-results.spec.ts`: a fixture
  with 500+ findings keeps the dashboard interactive (collapsed groups or virtualized lists); the
  time to results is recorded for SC-001.
- [ ] T179 [P] Dependency and image audit: `npm audit --omit=dev` plus a pinned-version check
  across all four workspaces, documented in `README.md`.
- [ ] T180 [P] Optional governance follow-up: propose a constitution PATCH clarifying Principle
  III "via request interception" to include proxy/network-layer enforcement, via
  `/sp.constitution` (owner approval required).
- [ ] T181 SC-005 usability study:
  - write the protocol in `specs/001-accesslens-mvp/usability/sc-005-protocol.md`: at least 5
    developers new to accessibility; each reads the AI explanation for 3 fixed demo findings and
    then states the problem and the next step in their own words; the pass rule is ≥ 80%
    correct, scored against a rubric agreed before the sessions;
  - run the sessions on the demo;
  - record anonymized results and the pass/fail verdict in
    `specs/001-accesslens-mvp/usability/sc-005-results.md`;
  - if it fails, open follow-up tasks to revise the explanation prompt or UI.
- [ ] T182 Validate `specs/001-accesslens-mvp/quickstart.md` end to end on a clean checkout, and
  promote the final setup, env, and test commands into `README.md`.
- [ ] T183 Final gate review: confirm `specs/001-accesslens-mvp/gate-evidence.md` contains G0,
  G1 (per host), G2, and G3 records, and that `SCAN_ENABLED=true` exists only on hosts with
  G0 + G1 evidence.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (M0, T001–T028)**: none. T005 (OD-9) comes before T006. T014 → T018 → T019 → T020/T021.
  T025 → T026.
- **Foundational**: depends on Setup.
  - 2a (T029–T033) comes before everything else.
  - M1 (T034–T040) → G0.
  - M2 (T041–T066) depends on M1, because the proxy reuses the URL policy. T047 must precede
    T064/T066. T065 runs after T062 results. M2 uses a provisional `shm_size`. T185 (OD-12)
    is resolved (ADR-0001 Amendment 1 Accepted), so T057, T184, and T066 are unblocked by it;
    G1 is still **not passed**.
  - *Note 2026-11-13 (owner decision)*: the **G1 run (T066) is a release gate, not a build
    blocker**. M3 may start once M2's implementation tasks are done (T041–T046, T048–T057).
    T063 needs M3's fixture server (T071), so it completes during M3. The G1 tests (T058–T062,
    T184), the runner (T064), and the host steps (T047, T065, T066) can finish later. Nothing
    changes for release: `SCAN_ENABLED=true` still requires recorded G0 **and** G1 evidence
    from the deployment host itself (T129, checked by T187).
  - M3 (T067–T094) depends on M2 (the scanner runs through the proxy). T093 (final `shm_size`)
    needs the T084 fixtures and T090, and must finish before T094.
  - T188 (scanner contract conformance) is part of M3 and must pass for G2.
- **US1 (T095–T129)**: depends on G2. T127–T129 (public release) also require G0 + G1 evidence
  on the target host. T187 must pass before T129 sets `SCAN_ENABLED=true`.
- **US2 (T130–T151)**: depends on US1 (sealed evidence, stored audits). T130 comes first.
- **US4 (T152–T162)**: depends on US1. Independent of US2.
- **US5 (T163–T168)**: depends on US1. It includes AI annotations (US2) and comparison (US4)
  when present.
- **US3 (T169–T176)**: depends on US1, US2 (`AiPanel`), US4 (`ComparisonView`), and US5
  (export). It is P5, so the priority order already places it after them.
- **Polish (T177–T183)**: depends on all stories. T181 (usability) needs the finished demo
  (US3) and US2 explanations.

### Within Each Story

Tests → confirm failing → shared/pure modules → server modules → routes → UI → docs. Each
story ends at a checkpoint.

## Parallel Opportunities

- **Setup**: T002–T004, T006–T013, T015–T017, T022–T024, and T028 are [P].
- **M2**: test files T041–T045, T046, and T053–T054 in parallel; then G1 tests T058–T063 in
  parallel.
- **M3**: fixtures T067–T071, T077, T079, and T084, plus tests T072–T083, T078, T080, and T081,
  all in parallel.
- **US1**: tests T095–T109 in parallel; T110/T111, T113–T115, and T117–T122 in parallel.

### Parallel Example: User Story 1

```bash
# Launch all US1 tests together (they must fail first):
Task: "T095 canonical JSON tests in packages/shared/tests/unit/canonical-json.test.ts"
Task: "T096 evidence reduction tests in packages/shared/tests/unit/evidence-reduce.test.ts"
Task: "T100 /api/audits contract tests in apps/web/tests/integration/api-audits.test.ts"
Task: "T104 dashboard tests in apps/web/tests/unit/dashboard.test.tsx"
Task: "T108 e2e in e2e/us1-audit.spec.ts"

# Then independent implementation files together:
Task: "T110 packages/shared/src/canonical-json.ts"
Task: "T111 packages/shared/src/evidence-reduce.ts"
Task: "T113 apps/web/src/server/logger.ts"
Task: "T120 apps/web/src/components/dashboard/*"
```

## Implementation Strategy

### MVP first (User Story 1)

1. Setup (M0), then Foundational: shared model, M1/G0, M2/G1, M3/G2.
2. US1 → **stop and validate** with the T108/T109 e2e tests in test mode.
3. Public MVP only after T127–T129: provider, reverse proxy, firewall, and G0 + G1 evidence on
   that host, then `SCAN_ENABLED=true`.

### Incremental delivery

US1 (P1) → US2 (P2, with the G3 record) → US4 (P3) → US5 (P4) → US3 (P5; the demo showcases
finished features).
Polish follows. Each increment is demoable on its own, and none weakens a gate.

## Notes

- **Open decisions and the tasks they block** (as of 2026-10-23):

  | OD | Decision task | Blocks |
  |---|---|---|
  | OD-8a CI platform (owner answered GitHub Actions + gitleaks on 2026-10-22; **not yet recorded**) | T025 | T026, T027, T040 (G0 runs in CI) |
  | OD-8b where G1 runs | T047 | T064, T066, T184 |
  | OD-10 Docker DNS leakage (conditional) | T065 | T066 |
  | OD-2 VM/VPS provider | T127 | T129, T187 (host name) |
  | OD-7 TLS reverse proxy | T128 | T129 |
  | OD-6 daily AI cap across restarts | T130 | T133, T146, T151 (G3 sign-off) |

  **Not needed**: OD-11, the `web` binding fallback (T019 passed; T021 `[X]`).
  **Resolved**: OD-9, the TypeScript version → `typescript@5.9.3` (ADR-0003 Addendum A, task T005
  `[X]`, evidence in research R13), which unblocks T006–T008. Also resolved: OD-12, the NL-2
  firewall rule order and scoping (ADR-0001 Amendment 1,
  Accepted 2026-10-23, task T185 `[X]`). It unblocks T057 and T184; T066 (G1) still requires
  recorded passing evidence. Also resolved: OD-13, `cap_drop: [ALL]` vs. the Chromium sandbox →
  scanner `cap_add: [SYS_CHROOT]` only (ADR-0001 Amendment 2, Accepted 2026-11-08). It unblocks
  T055 and T062; T066 (G1) still requires recorded passing evidence, including Ubuntu 24.04
  user-namespace compatibility on the actual host.

- **IDs T189–T197 were added on 2026-11-13 without renumbering** (test mode, ADR-0001 Amendment 4):
  T189–T192 run before T041 (M2); T195–T196 run before T072 (M3, after the fixture server T071);
  T193 runs before T101, T194 before T116, and T197 before T127 (US1).
- **IDs T184–T188 were added on 2026-10-23 without renumbering**, to keep existing task IDs
  stable. Each runs at the position where it appears in its phase, not in numeric order:
  T186 after T024 (M0), T185 before T057 and T184 after T060 (M2), T188 after T082 (M3), and
  T187 before T129 (US1).
- A gate task records evidence. Writing code or tests never counts as passing a gate.
- Commit after each task or logical group, and create a PHR for each implementation session.
