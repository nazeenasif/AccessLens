// IPv4 classification (task T038): spec FR-002; ADR-0001 §3 with Amendment 3.
// NON_PUBLIC_IPV4_RANGES is the single source of truth for both the egress proxy's check and the
// NL-2 firewall rules (kept equal by the T045 sync test). ipaddr.js is used for parsing only;
// its own range() verdict is never used.
import ipaddr from "ipaddr.js";

/** Every IPv4 range that is never a scan destination (ADR-0001 §3, as amended 2026-11-13). */
export const NON_PUBLIC_IPV4_RANGES: readonly string[] = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  // Amendment 3: ranges ipaddr.js treats as non-unicast that §3 originally omitted.
  "192.88.99.0/24",
  "192.31.196.0/24",
  "192.175.48.0/24",
  "192.52.193.0/24",
];

const PARSED_RANGES = NON_PUBLIC_IPV4_RANGES.map((cidr) => ipaddr.IPv4.parseCIDR(cidr));

// Canonical dotted-quad only: four decimal octets 0-255, no leading zeros, nothing else.
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const CANONICAL_IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);

/**
 * True only for a public IPv4 address written in canonical dotted-quad form. Anything else is
 * false (fail closed): non-public ranges, encoded forms (even of public addresses), IPv6, and
 * input that isn't an address.
 */
export function isPublicIPv4(address: string): boolean {
  if (!CANONICAL_IPV4.test(address)) return false;
  const ip = ipaddr.IPv4.parse(address);
  return !PARSED_RANGES.some(([network, prefix]) => ip.match(network, prefix));
}
