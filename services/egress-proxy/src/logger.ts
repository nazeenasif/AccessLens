// egress-proxy logging (task T052). Research R14: pino with the shared redaction set; the proxy
// logs counts, reasons, and a keyed hash of the host, never URLs, paths, query strings,
// credentials, or tokens. Events: contracts/internal-egress-proxy.md §3.
import { createHmac, randomBytes } from "node:crypto";
import { pino, type Logger } from "pino";

export type ProxyLogger = Logger;

/**
 * Research R14 redaction set, plus `PROXY_CONTROL_TOKEN`, `SCANNER_INTERNAL_TOKEN`, and
 * `Proxy-Authorization` (R14 notes). Header names are lowercase, as Node delivers them.
 */
export const REDACT_PATHS = [
  "authorization",
  "*.apiKey",
  "*.evidenceSignature",
  "PROXY_CONTROL_TOKEN",
  "SCANNER_INTERNAL_TOKEN",
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["proxy-authorization"]',
  'req.headers["x-proxy-control-token"]',
];

/** One JSON object per line, written to `destination` (stdout in production). */
export function createProxyLogger(
  destination: { write(line: string): void },
  level = "info",
): ProxyLogger {
  return pino({ level, base: { service: "egress-proxy" }, redact: REDACT_PATHS }, destination);
}

// Generated once per process and never logged or exported, so a log reader can't confirm a
// guessed host by hashing it (review 2026-11-14).
const HOST_HASH_KEY = randomBytes(32);

/** HMAC-SHA256 of the host with the per-process key, as lowercase hex. */
export function hostHash(host: string): string {
  return createHmac("sha256", HOST_HASH_KEY).update(host).digest("hex");
}
