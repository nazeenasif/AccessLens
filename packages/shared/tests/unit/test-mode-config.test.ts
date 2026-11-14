// Test-mode config tests (task T189; ADR-0001 Amendment 4, proposal test 1).
// Test mode is a setting separate from SCAN_ENABLED. It is read by web, scanner, and
// egress-proxy, and lets an end-to-end stack reach only allowlisted test pages inside the fixture
// subnet. Startup refusals (test mode together with SCAN_ENABLED, test variables without test
// mode, NODE_ENV) are covered by T044 and T193, not here.
//
// Export expected from T190 (packages/shared/src/test-mode.ts):
//   parseTestModeConfig(env: Record<string, string | undefined>):
//     | { enabled: false }
//     | { enabled: true; allowlist: string[]; fixtureSubnet: string }
//   Throws an Error whose message names the offending variable when test mode is on and the
//   allowlist or fixture subnet is missing or invalid.
import { describe, expect, it } from "vitest";
import { parseTestModeConfig } from "../../src/test-mode.ts";

const MODE = "ACCESSLENS_TEST_MODE";
const ALLOWLIST = "ACCESSLENS_TEST_ALLOWLIST";
const SUBNET = "ACCESSLENS_TEST_FIXTURE_SUBNET";

// The four production Compose subnets (docker-compose.yml; ADR-0001 §1).
const PRODUCTION_SUBNETS = [
  "172.30.10.0/24", // public
  "172.30.20.0/24", // scan-ctl
  "172.30.30.0/24", // scan-egress
  "172.30.40.0/24", // outbound
];

/** A copy of `env` without `key`. */
const without = (env: Record<string, string>, key: string) =>
  Object.fromEntries(Object.entries(env).filter(([k]) => k !== key));

const VALID = {
  [MODE]: "true",
  [ALLOWLIST]: "fixtures.test",
  [SUBNET]: "172.30.50.0/24",
};

describe("ACCESSLENS_TEST_MODE: only the exact string 'true' enables test mode", () => {
  it("'true' enables it, with the allowlist and subnet parsed", () => {
    expect(parseTestModeConfig(VALID)).toEqual({
      enabled: true,
      allowlist: ["fixtures.test"],
      fixtureSubnet: "172.30.50.0/24",
    });
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["uppercase", "TRUE"],
    ["title case", "True"],
    ["1", "1"],
    ["yes", "yes"],
    ["on", "on"],
    ["leading space", " true"],
    ["trailing space", "true "],
    ["false", "false"],
  ])("%s → disabled", (_case, value) => {
    expect(parseTestModeConfig({ [MODE]: value })).toEqual({ enabled: false });
  });

  it("an empty environment is disabled", () => {
    expect(parseTestModeConfig({})).toEqual({ enabled: false });
  });
});

describe("ACCESSLENS_TEST_ALLOWLIST: entries must be exact host names", () => {
  it("accepts several host names", () => {
    const config = parseTestModeConfig({ ...VALID, [ALLOWLIST]: "fixtures.test,pages.test" });
    expect(config).toEqual({
      enabled: true,
      allowlist: ["fixtures.test", "pages.test"],
      fixtureSubnet: "172.30.50.0/24",
    });
  });

  it.each([
    ["an IPv4 address", "172.30.50.10"],
    ["IPv4 loopback", "127.0.0.1"],
    ["an encoded IPv4 address", "2130706433"],
    ["an IPv6 address", "::1"],
    ["a bracketed IPv6 address", "[::1]"],
    ["a wildcard", "*.test"],
    ["a bare wildcard", "*"],
    ["a port", "fixtures.test:8080"],
    ["a scheme", "http://fixtures.test"],
    ["a path", "fixtures.test/page"],
    ["an empty entry", "fixtures.test,,pages.test"],
    ["a trailing empty entry", "fixtures.test,"],
    ["an empty list", ""],
  ])("rejects %s (%j)", (_case, value) => {
    expect(() => parseTestModeConfig({ ...VALID, [ALLOWLIST]: value })).toThrow(ALLOWLIST);
  });

  // T190 review (2026-11-14): the error must name the port problem. A colon must not be
  // misreported as an IP address.
  it("rejects an entry with a port, naming the port problem", () => {
    let message = "";
    try {
      parseTestModeConfig({ ...VALID, [ALLOWLIST]: "fixtures.test:8080" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(ALLOWLIST);
    expect(message).toMatch(/\bport\b/);
    expect(message).not.toMatch(/IP address/);
  });

  it("rejects a missing allowlist when test mode is on", () => {
    expect(() => parseTestModeConfig(without(VALID, ALLOWLIST))).toThrow(ALLOWLIST);
  });
});

// Owner decision (T189 review, 2026-11-13): entries must already be canonical. Nothing is
// trimmed or lowercased, and international names must be given in their xn-- form.
describe("ACCESSLENS_TEST_ALLOWLIST: entries must already be canonical", () => {
  it("accepts an international name in xn-- form", () => {
    const config = parseTestModeConfig({
      ...VALID,
      [ALLOWLIST]: "fixtures.test,xn--bcher-kva.test",
    });
    expect(config).toEqual({
      enabled: true,
      allowlist: ["fixtures.test", "xn--bcher-kva.test"],
      fixtureSubnet: "172.30.50.0/24",
    });
  });

  it.each([
    ["a leading space", " fixtures.test"],
    ["a trailing space", "fixtures.test "],
    ["a space after the comma", "fixtures.test, pages.test"],
    ["an inner space", "fix tures.test"],
    ["a tab", "fixtures.test\t"],
    ["an uppercase letter", "Fixtures.test"],
    ["all uppercase", "FIXTURES.TEST"],
    ["a trailing dot", "fixtures.test."],
    ["a Unicode host name", "bücher.test"],
  ])("rejects %s (%j) instead of normalising it", (_case, value) => {
    expect(() => parseTestModeConfig({ ...VALID, [ALLOWLIST]: value })).toThrow(ALLOWLIST);
  });
});

describe("ACCESSLENS_TEST_FIXTURE_SUBNET: must parse and must not overlap production subnets", () => {
  it("accepts 172.30.50.0/24 (ADR-0001 Amendment 4)", () => {
    expect(parseTestModeConfig(VALID)).toMatchObject({ fixtureSubnet: "172.30.50.0/24" });
  });

  it("accepts another non-overlapping IPv4 subnet", () => {
    expect(parseTestModeConfig({ ...VALID, [SUBNET]: "10.99.0.0/16" })).toMatchObject({
      fixtureSubnet: "10.99.0.0/16",
    });
  });

  it.each([
    ["not a CIDR", "fixtures"],
    ["an address without a prefix", "172.30.50.0"],
    ["a prefix above 32", "172.30.50.0/33"],
    ["an IPv6 subnet", "fd00::/64"],
    ["an empty value", ""],
  ])("rejects %s (%j)", (_case, value) => {
    expect(() => parseTestModeConfig({ ...VALID, [SUBNET]: value })).toThrow(SUBNET);
  });

  it.each(PRODUCTION_SUBNETS)("rejects %s itself (a production subnet)", (subnet) => {
    expect(() => parseTestModeConfig({ ...VALID, [SUBNET]: subnet })).toThrow(SUBNET);
  });

  it.each([
    ["a supernet of every production subnet", "172.30.0.0/16"],
    ["a subnet inside the outbound network", "172.30.40.128/25"],
    ["a subnet inside scan-ctl", "172.30.20.0/28"],
  ])("rejects %s (%s)", (_case, subnet) => {
    expect(() => parseTestModeConfig({ ...VALID, [SUBNET]: subnet })).toThrow(SUBNET);
  });

  it("rejects a missing subnet when test mode is on", () => {
    expect(() => parseTestModeConfig(without(VALID, SUBNET))).toThrow(SUBNET);
  });
});
