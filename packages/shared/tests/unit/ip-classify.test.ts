// IP classification tests (task T035): spec FR-002; ADR-0001 §3 with Amendment 3 (one range list
// for the proxy and the firewall; ipaddr.js for parsing only); research R3.
//
// Exports expected from T038 (packages/shared/src/url-policy/ip-classify.ts):
//   NON_PUBLIC_IPV4_RANGES  readonly string[]   CIDR strings; the single source of truth
//   isPublicIPv4(address)   boolean             true only for a public IPv4 address written
//                                               in canonical dotted-quad form (T035 review,
//                                               2026-11-13). Anything else is false (fail
//                                               closed): encoded forms, even of public
//                                               addresses, IPv6, and unparsable input.
import ipaddr from "ipaddr.js";
import { describe, expect, it } from "vitest";
import { isPublicIPv4, NON_PUBLIC_IPV4_RANGES } from "../../src/url-policy/ip-classify.ts";

// ADR-0001 §3 (14 ranges) plus Amendment 3 (4 ranges).
const ADR_0001_RANGES = [
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
  "192.88.99.0/24",
  "192.31.196.0/24",
  "192.175.48.0/24",
  "192.52.193.0/24",
];

const covers = (cidr: string, address: ipaddr.IPv4, bits = 32) => {
  const [network, prefix] = ipaddr.IPv4.parseCIDR(cidr);
  return bits >= prefix && address.match(network, prefix);
};
const coveredByList = (address: ipaddr.IPv4, bits = 32) =>
  NON_PUBLIC_IPV4_RANGES.some((cidr: string) => covers(cidr, address, bits));

describe("NON_PUBLIC_IPV4_RANGES", () => {
  it("is exactly the ADR-0001 §3 list, as amended", () => {
    expect([...NON_PUBLIC_IPV4_RANGES].sort()).toEqual([...ADR_0001_RANGES].sort());
  });

  it.each(ADR_0001_RANGES)("%s is a valid CIDR on its network boundary", (cidr) => {
    expect(ipaddr.IPv4.isValidCIDR(cidr)).toBe(true);
    expect(ipaddr.IPv4.networkAddressFromCIDR(cidr).toString()).toBe(cidr.split("/")[0]);
  });

  it("covers every non-unicast IPv4 range ipaddr.js knows about (cross-check)", () => {
    // SpecialRanges isn't in ipaddr.js's type declarations, but it is the table range() uses.
    const special = (
      ipaddr.IPv4.prototype as unknown as {
        SpecialRanges: Record<string, [ipaddr.IPv4, number] | [ipaddr.IPv4, number][]>;
      }
    ).SpecialRanges;
    const uncovered: string[] = [];
    for (const [name, value] of Object.entries(special)) {
      if (name === "unicast") continue;
      const ranges = Array.isArray(value[0]) ? (value as [ipaddr.IPv4, number][]) : [value];
      for (const [network, prefix] of ranges as [ipaddr.IPv4, number][]) {
        if (!coveredByList(network, prefix)) uncovered.push(`${name} ${network}/${prefix}`);
      }
    }
    expect(uncovered.join("\n"), "ranges ipaddr.js treats as non-unicast").toBe("");
  });
});

describe("isPublicIPv4: every listed range is non-public, end to end", () => {
  const toInt = (a: ipaddr.IPv4) => a.toByteArray().reduce((n, byte) => n * 256 + byte, 0);
  const fromInt = (n: number) =>
    ipaddr.fromByteArray([24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256));
  // The first, middle, and last address of each range.
  const points = ADR_0001_RANGES.flatMap((cidr) => {
    const first = toInt(ipaddr.IPv4.networkAddressFromCIDR(cidr));
    const last = toInt(ipaddr.IPv4.broadcastAddressFromCIDR(cidr));
    return [first, Math.floor((first + last) / 2), last].map(
      (n) => [cidr, fromInt(n).toString()] as const,
    );
  });

  it.each(points)("%s: %s is not public", (_cidr, address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });
});

describe("isPublicIPv4: public addresses", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "151.101.1.69"])("%s is public", (address) => {
    expect(isPublicIPv4(address)).toBe(true);
  });

  it.each([
    "9.255.255.255",
    "11.0.0.0",
    "100.63.255.255",
    "100.128.0.0",
    "126.255.255.255",
    "128.0.0.0",
    "169.253.255.255",
    "169.255.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.167.255.255",
    "192.169.0.0",
    "198.17.255.255",
    "198.20.0.0",
    "223.255.255.255",
  ])("%s, just outside a listed range, is public", (address) => {
    expect(coveredByList(ipaddr.IPv4.parse(address))).toBe(false);
    expect(isPublicIPv4(address)).toBe(true);
  });
});

describe("isPublicIPv4: IPv6 is never a public IPv4 address", () => {
  it.each([
    ["IPv6 loopback", "::1"],
    ["unique local (fc00::/7)", "fc00::1"],
    ["unique local (fd00::/8)", "fd12:3456:789a::1"],
    ["link-local (fe80::/10)", "fe80::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped public", "::ffff:8.8.8.8"],
    ["a public IPv6 address", "2606:4700:4700::1111"],
  ])("%s (%s) is not public", (_case, address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });
});

describe("isPublicIPv4: alternate encodings of non-public addresses", () => {
  it.each([
    ["decimal loopback", "2130706433"],
    ["hex loopback", "0x7f000001"],
    ["octal loopback", "0177.0.0.1"],
    ["mixed hex loopback", "0x7f.0.0.1"],
    ["short loopback", "127.1"],
    ["octal cloud metadata", "0251.0376.0251.0376"],
    ["hex cloud metadata", "0xa9fea9fe"],
  ])("%s (%s) is not public", (_case, address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });
});

describe("isPublicIPv4: canonical dotted-quad only (non-canonical forms are not public)", () => {
  it.each([
    ["hex 8.8.8.8", "0x08080808"],
    ["decimal 8.8.8.8", "134744072"],
    ["octal 8.8.8.8", "010.010.010.010"],
    ["a leading zero in one octet", "8.8.8.08"],
    ["a leading zero on a public octet", "093.184.216.34"],
    ["hex octets", "0x8.0x8.0x8.0x8"],
    ["short form of 8.0.0.8", "8.8"],
    ["a trailing dot", "8.8.8.8."],
  ])("%s (%s) is not public", (_case, address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });

  it("the canonical form of the same address is public", () => {
    expect(isPublicIPv4("8.8.8.8")).toBe(true);
    expect(isPublicIPv4("93.184.216.34")).toBe(true);
  });
});

describe("isPublicIPv4: fails closed on input that isn't an IP address", () => {
  it.each(["", "localhost", "example.com", "999.1.1.1", "1.2.3", "1.2.3.4.5", " 8.8.8.8"])(
    "%j is not public",
    (input) => {
      expect(isPublicIPv4(input)).toBe(false);
    },
  );
});
