// URL policy check (task T037): spec FR-001 (amended 2026-11-13), FR-004, "Ports" and "Missing
// scheme" edge cases; research R3. Runs in `web` as a fast pre-check and again in the scanner.
// DNS answers are checked separately by resolve-and-check.ts (T039).
import type { ErrorCode } from "../schemas/errors.ts";
import { normalizeUrl } from "./normalize.ts";

export type UrlCheck =
  { ok: true; url: string } | { ok: false; code: ErrorCode; detail?: { reason: "ip_literal" } };

export const MAX_URL_LENGTH = 2048;

// After WHATWG parsing, every IPv4 encoding has been rewritten to dotted form, and IPv6 hosts
// keep their brackets.
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const refuse = (code: ErrorCode): UrlCheck => ({ ok: false, code });

export function validateUrl(input: string): UrlCheck {
  if (input.length > MAX_URL_LENGTH) return refuse("INVALID_URL");

  const normalized = normalizeUrl(input);
  if (!normalized.ok) return refuse(normalized.code);
  const { url } = normalized;

  if (url.protocol !== "http:" && url.protocol !== "https:") return refuse("UNSUPPORTED_SCHEME");
  if (url.username !== "" || url.password !== "") return refuse("CREDENTIALS_IN_URL");
  // The parser drops a scheme's default port, so any port left is not http:80 or https:443.
  if (url.port !== "") return refuse("PORT_NOT_ALLOWED");
  if (url.hostname.startsWith("[") || IPV4_HOST.test(url.hostname)) {
    return { ok: false, code: "BLOCKED_DESTINATION", detail: { reason: "ip_literal" } };
  }

  const href = url.href;
  if (href.length > MAX_URL_LENGTH) return refuse("INVALID_URL");
  return { ok: true, url: href };
}
