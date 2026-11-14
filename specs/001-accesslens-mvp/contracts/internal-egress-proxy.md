# Internal contract: egress-proxy (control endpoint, proxy refusals, log events, firewall list)

**Status**: draft, 2026-11-14. Pinned by the M2 test tasks T041–T046; implemented by T048–T052,
T057 and T198.
**Scope**: internal only. Nothing here is reachable from the public network.

The proxy's behaviour is set by ADR-0001 §2 and §3 (with Amendments 3 and 4). This file fixes the
interface details that those documents leave open. If this file and an ADR disagree, the ADR wins
and this file is corrected.

## 1. Control endpoint

- **Listener**: on `egress-proxy`'s `scan-egress` address (`172.30.30.30`), separate from the
  proxy listener `172.30.30.30:3128` (`EGRESS_PROXY_ADDR`). The control port is chosen in T051 and
  recorded here then.
- **Callers**: only the scanner. The browser shares the scanner's network namespace and can reach
  this listener too, so it is protected by the token, the rate limit, and read-only views, not by
  network placement (ADR-0001 §2).
- **Authentication**: every request carries `X-Proxy-Control-Token: <PROXY_CONTROL_TOKEN>`. The
  comparison is constant-time (`crypto.timingSafeEqual`) and safe for any length of supplied value.

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/audits/{auditId}/credentials` | `{ "username": string, "password": string }` | `201` | Registers the audit's credential pair. The scanner generates the pair; the proxy only stores it. |
| `DELETE` | `/audits/{auditId}/credentials` | — | `204` | Revokes the pair. Emits `proxy.audit_summary` (§3). |
| `GET` | `/audits/{auditId}` | — | `200` | Read-only view: `{ "auditId", "requests", "bytes", "blockedHosts": string[], "capped": { "requests": boolean, "bytes": boolean } }`. Never includes any audit's username or password, its own included, and never shows another audit's data. |

| Status | When |
|---|---|
| `201` / `204` / `200` | As above. |
| `401` | `X-Proxy-Control-Token` missing, empty, or wrong (any length), on every route. |
| `404` | Unknown audit; any route not listed above, including `GET /audits` (no listing) and `GET /audits/{auditId}/credentials` (credentials are never readable). |
| `429` | Over the rate limit. |

**Rate limit**:
- **What counts**: a fixed window that counts **every** request, authenticated or not, and is
  checked before the token, so guessing the token uses up the same budget.
- **When it applies**: once the window's budget is spent, every request gets `429` until the window
  has passed, even with the correct token.
- **Values**: the window length and budget come from configuration chosen in T049/T051; the tests
  inject them.

## 2. Proxy listener

- **Authentication**: `Proxy-Authorization: Basic base64(username:password)` with currently
  registered credentials. Unregistered, revoked, or expired credentials (after
  `SCAN_TOTAL_TIMEOUT_MS`), or a missing or malformed header → **`407`**. No DNS lookup or upstream
  connection happens.
- **Allowed requests**: `CONNECT host:443` and plain HTTP to port `80` (absolute-form request
  target). Any other port or method → **`403`**.
- **Destination check**: the shared `resolveAndCheck` (`packages/shared`). IP-literal hosts are
  refused before DNS. Otherwise the host is resolved once, IPv4 only (`dns.resolve4`), and every
  answer must be public IPv4 per `NON_PUBLIC_IPV4_RANGES`. The proxy then connects to that
  validated address and never re-resolves. Refusal → **`403`**.
- **Test mode** (ADR-0001 Amendment 4; only with `ACCESSLENS_TEST_MODE=true` and `NODE_ENV=test`):
  only `ACCESSLENS_TEST_ALLOWLIST` hosts are served, and all their answers must lie in
  `ACCESSLENS_TEST_FIXTURE_SUBNET`. Every other host, public ones included → **`403`**.
- **Caps**: per audit, `SCAN_MAX_REQUESTS` and `SCAN_MAX_BYTES`. Once a cap is reached, further
  requests → **`403`** and the cap flag is set (`capped.requests` / `capped.bytes`).
- **Recording**: every refused destination is recorded for the audit (`blockedHosts`) and logged
  as `proxy.blocked` (§3).

So a policy refusal is always `403`, and an authentication problem is always `407`.

## 3. Log events (research R14)

One JSON object per line (pino), emitted by the credential registry with the R14 redaction set.

| Event | Fields | When |
|---|---|---|
| `proxy.audit_summary` | `event`, `auditId`, `requests`, `bytes`, `blocked` (count), `capped: { requests, bytes }` | Exactly once per audit: on revoke or on expiry, never twice. |
| `proxy.blocked` | `event`, `auditId`, `reason`, `hostHash` | Each refused destination. |

- **`hostHash`**: HMAC-SHA256 of the host with a random key generated once per process, as
  lowercase hex. It is stable within a process and can't be matched against plain `sha256(host)`.
  The host itself is never logged.
- **Never logged**: URLs, paths, query strings, credentials, or tokens.
- **Redacted**: `authorization`, `Proxy-Authorization`, `PROXY_CONTROL_TOKEN`,
  `SCANNER_INTERNAL_TOKEN`, and cookies (research R14, with the 2026-11-14 note).

## 4. Firewall range file

`ops/firewall/nonpublic-ipv4.txt`, generated by T057 from `NON_PUBLIC_IPV4_RANGES`:
- one IPv4 CIDR per line;
- blank lines and lines starting with `#` are ignored (for example a "generated from …" header);
- it must contain exactly the same ranges as `NON_PUBLIC_IPV4_RANGES`, with no duplicates. The T045
  test enforces this.

## 5. Startup refusals

`egress-proxy` (T051) and `scanner` (T198) exit non-zero at startup, naming the offending
variables, for the cases in `tests/support/startup-refusal-cases.ts` (T044, required in
`test:assert`).
- **Both services**: `PROXY_CONTROL_TOKEN` missing; test mode together with `SCAN_ENABLED=true`.
  `SCAN_ENABLED` is web-only, so this guards only against a stray variable. An `ACCESSLENS_TEST_*`
  variable without `NODE_ENV=test` is also refused.
- **Scanner only**: it reads only `ACCESSLENS_TEST_MODE` (`isTestModeEnabled`), and refuses
  whenever `ACCESSLENS_TEST_ALLOWLIST` or `ACCESSLENS_TEST_FIXTURE_SUBNET` is set at all.
