// Destination check on DNS answers (task T039): spec FR-002, FR-003; ADR-0001 §2 and §3 with
// Amendment 3; research R3 items 3-5 and R5.
// The host is resolved once, every answer must be a canonical public IPv4 address, and the
// validated addresses are returned so the caller connects to one of them and never re-resolves
// (this defeats DNS rebinding).
// An IP-literal host (IPv4 in any form, or IPv6) is refused before any lookup, as validateUrl
// does for URLs (spec FR-001 as amended). This matters for callers that skip the URL policy,
// such as the egress proxy checking a connect target.
import { promises as dns } from "node:dns";
import ipaddr from "ipaddr.js";
import { isPublicIPv4 } from "./ip-classify.ts";

/** Resolves a host name to all of its IPv4 addresses. Rejects with a DNS error code otherwise. */
export type ResolveIPv4 = (hostname: string) => Promise<string[]>;

export type DestinationCheck =
  | { ok: true; addresses: string[] }
  | {
      ok: false;
      code: "BLOCKED_DESTINATION" | "TARGET_UNREACHABLE";
      detail?: { reason: "ip_literal" };
    };

/**
 * Test mode only (task T192; ADR-0001 Amendment 4). For a host on `hosts`, every answer must lie
 * inside `subnet`, the fixture subnet, and any other answer blocks the host. Hosts not on the
 * list get the normal rules. Callers pass an allowance only when test mode is on.
 */
export type TestAllowance = { hosts: readonly string[]; subnet: string };

const DOTTED_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * True if the host is an IP address rather than a name: anything with a colon or brackets (IPv6;
 * a DNS name never contains either), anything ipaddr.js parses as an address, or anything the
 * WHATWG host parser turns into dotted IPv4 (decimal, hex, octal, short, and trailing-dot forms).
 */
export function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":") || hostname.startsWith("[")) return true;
  if (ipaddr.isValid(hostname)) return true;
  try {
    return DOTTED_IPV4.test(new URL(`http://${hostname}/`).hostname);
  } catch {
    return false;
  }
}

/**
 * The real resolver: an IPv4-only DNS query (A records) returning every address. Unlike the OS
 * lookup (dns.lookup), it can't return IPv6 or entries from the hosts file.
 */
export const resolveIPv4: ResolveIPv4 = (hostname) => dns.resolve4(hostname);

const hasDnsErrorCode = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  typeof (error as { code?: unknown }).code === "string";

/** True only for a canonical dotted-quad IPv4 address inside the subnet. */
function insideSubnet(address: string, subnet: string): boolean {
  if (!ipaddr.IPv4.isValidFourPartDecimal(address)) return false;
  const ip = ipaddr.IPv4.parse(address);
  return ip.toString() === address && ip.match(ipaddr.IPv4.parseCIDR(subnet));
}

export async function resolveAndCheck(
  hostname: string,
  resolve: ResolveIPv4 = resolveIPv4,
  allowance?: TestAllowance,
): Promise<DestinationCheck> {
  if (isIpLiteral(hostname)) {
    return { ok: false, code: "BLOCKED_DESTINATION", detail: { reason: "ip_literal" } };
  }

  let answers: string[];
  try {
    answers = await resolve(hostname);
  } catch (error) {
    // No address (ENOTFOUND, ENODATA) or any other DNS failure: the target can't be reached.
    // Errors without a DNS code are programming errors and are rethrown.
    if (hasDnsErrorCode(error)) return { ok: false, code: "TARGET_UNREACHABLE" };
    throw error;
  }

  // TARGET_UNREACHABLE only when the IPv4 lookup returns no addresses (an IPv6-only host).
  if (answers.length === 0) return { ok: false, code: "TARGET_UNREACHABLE" };
  // Test mode: an allowlisted host (exact match only) must have ALL answers in the fixture subnet.
  if (allowance !== undefined && allowance.hosts.includes(hostname)) {
    if (!answers.every((answer) => insideSubnet(answer, allowance.subnet))) {
      return { ok: false, code: "BLOCKED_DESTINATION" };
    }
    return { ok: true, addresses: [...answers] };
  }
  // Any answer that isn't a canonical public IPv4 address, IPv6 included, blocks the host.
  if (!answers.every(isPublicIPv4)) return { ok: false, code: "BLOCKED_DESTINATION" };
  return { ok: true, addresses: [...answers] };
}
