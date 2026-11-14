// Test-mode configuration (task T190; ADR-0001 Amendment 4, ADR-0003 Addendum D).
// Test mode is separate from SCAN_ENABLED. When on, an end-to-end stack may reach only
// allowlisted test-page host names that resolve inside the fixture subnet. This parser only
// reads and validates the settings. Refusing stray test variables, or test mode together with
// SCAN_ENABLED=true, is the services' startup job (T044, T193).
import ipaddr from "ipaddr.js";
import { isIpLiteral } from "./url-policy/resolve-and-check.ts";

export const TEST_MODE_VAR = "ACCESSLENS_TEST_MODE";
export const TEST_ALLOWLIST_VAR = "ACCESSLENS_TEST_ALLOWLIST";
export const TEST_FIXTURE_SUBNET_VAR = "ACCESSLENS_TEST_FIXTURE_SUBNET";

export type TestModeConfig =
  { enabled: false } | { enabled: true; allowlist: string[]; fixtureSubnet: string };

/** The four production Compose subnets (docker-compose.yml; ADR-0001 §1). */
const PRODUCTION_SUBNETS = ["172.30.10.0/24", "172.30.20.0/24", "172.30.30.0/24", "172.30.40.0/24"];

// A canonical host name: lowercase ASCII letter-digit-hyphen labels, no trailing dot. Nothing is
// trimmed or lowercased, so whitespace, uppercase, a trailing dot, non-ASCII (international names
// must be given in xn-- form), wildcards, ports, schemes, and paths all fail this pattern.
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const CANONICAL_HOST = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})*$`);
// "name:port" (exactly one colon, digits after it), so a port is reported as a port. Bare IPv6
// such as "::1" has more than one colon and is reported as an IP address instead.
const HOST_WITH_PORT = /^[^:]+:[0-9]+$/;

const fail = (variable: string, problem: string): never => {
  throw new Error(`${variable}: ${problem}`);
};

function parseAllowlist(value: string | undefined): string[] {
  if (value === undefined) return fail(TEST_ALLOWLIST_VAR, "required when test mode is on");
  return value.split(",").map((entry) => {
    if (HOST_WITH_PORT.test(entry)) {
      fail(TEST_ALLOWLIST_VAR, `${JSON.stringify(entry)} includes a port; give the host name only`);
    }
    if (!CANONICAL_HOST.test(entry)) {
      fail(TEST_ALLOWLIST_VAR, `${JSON.stringify(entry)} is not a canonical host name`);
    }
    if (isIpLiteral(entry)) {
      fail(TEST_ALLOWLIST_VAR, `${JSON.stringify(entry)} is an IP address, not a host name`);
    }
    return entry;
  });
}

const overlaps = ([a, aBits]: [ipaddr.IPv4, number], [b, bBits]: [ipaddr.IPv4, number]) =>
  a.match(b, Math.min(aBits, bBits));

function parseFixtureSubnet(value: string | undefined): string {
  if (value === undefined) return fail(TEST_FIXTURE_SUBNET_VAR, "required when test mode is on");
  let subnet: [ipaddr.IPv4, number];
  try {
    subnet = ipaddr.IPv4.parseCIDR(value);
  } catch {
    return fail(TEST_FIXTURE_SUBNET_VAR, `${JSON.stringify(value)} is not an IPv4 CIDR`);
  }
  for (const production of PRODUCTION_SUBNETS) {
    if (overlaps(subnet, ipaddr.IPv4.parseCIDR(production))) {
      fail(TEST_FIXTURE_SUBNET_VAR, `${value} overlaps the production subnet ${production}`);
    }
  }
  return value;
}

/** Reads the test-mode settings. Throws, naming the variable, if test mode is on and invalid. */
export function parseTestModeConfig(env: Record<string, string | undefined>): TestModeConfig {
  // Only the exact string "true" enables test mode.
  if (env[TEST_MODE_VAR] !== "true") return { enabled: false };
  return {
    enabled: true,
    allowlist: parseAllowlist(env[TEST_ALLOWLIST_VAR]),
    fixtureSubnet: parseFixtureSubnet(env[TEST_FIXTURE_SUBNET_VAR]),
  };
}
