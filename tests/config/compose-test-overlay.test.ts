// Test-mode Compose overlay (task T195; ADR-0001 Amendment 4, ADR-0003 Addendum D, proposal
// test 6). `docker-compose.test.yml` is used only as
// `docker compose -f docker-compose.yml -f docker-compose.test.yml …` for local and CI test runs.
// It adds the `test-fixtures` network and the fixture server (T071) and switches the scan path
// to test mode, without ever weakening the production shape:
//   - `test-fixtures` is 172.30.50.0/24;
//   - only the fixture server and egress-proxy attach to it; scanner keeps internal networks only;
//   - scanner and egress-proxy get NODE_ENV=test;
//   - no published ports for scanner or egress-proxy;
//   - no SCAN_ENABLED setting.
// Review 2026-11-16 (owner decisions):
//   - per-service test variables: scanner gets ACCESSLENS_TEST_MODE only (it refuses the other
//     two, T044/T198); egress-proxy gets all three; web gets none or all three (T193/T194).
//     Values are checked with the shared test-mode parser;
//   - the fixture server runs non-root, with cap_drop ALL, no added capabilities, on port 80
//     (the URL policy refuses non-default ports).
// Also (T014 note, proposal test 6): the base docker-compose.yml mentions no ACCESSLENS_TEST_*
// variable. Every test here is required in test:assert.
//
// The checks run on the merged view (base + overlay) the way Compose merges these keys:
// environment maps are merged with the overlay winning, network attachments and ports add up.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  isTestModeEnabled,
  parseTestModeConfig,
  TEST_ALLOWLIST_VAR,
  TEST_FIXTURE_SUBNET_VAR,
  TEST_MODE_VAR,
} from "../../packages/shared/src/test-mode.ts";

const BASE = "docker-compose.yml";
const OVERLAY = "docker-compose.test.yml";
const FIXTURE_SUBNET = "172.30.50.0/24";
const SCAN_PATH = ["scanner", "egress-proxy"] as const;
const TEST_VARS = [TEST_ALLOWLIST_VAR, TEST_FIXTURE_SUBNET_VAR, TEST_MODE_VAR].sort();

type Env = Record<string, string | number | boolean | null> | string[];
type Service = {
  command?: string | string[];
  entrypoint?: string | string[];
  networks?: Record<string, unknown> | string[];
  environment?: Env;
  ports?: unknown[];
  expose?: (string | number)[];
  user?: string | number;
  cap_drop?: string[];
  cap_add?: string[];
};
type Network = { internal?: boolean; ipam?: { config?: { subnet?: string }[] } };
type Compose = { services?: Record<string, Service>; networks?: Record<string, Network> };

const load = (file: string): Compose =>
  (parse(readFileSync(file, "utf8"), { merge: true }) as Compose | null) ?? {};
const overlay = () => {
  expect(existsSync(OVERLAY), `${OVERLAY} must exist`).toBe(true);
  return load(OVERLAY);
};

const envMap = (env: Env | undefined): Record<string, unknown> => {
  if (env === undefined) return {};
  if (!Array.isArray(env)) return env;
  return Object.fromEntries(
    env.map((e) => {
      const i = e.indexOf("=");
      return i < 0 ? [e, undefined] : [e.slice(0, i), e.slice(i + 1)];
    }),
  );
};
const netNames = (svc: Service | undefined): string[] => {
  const n = svc?.networks;
  if (n === undefined) return [];
  return Array.isArray(n) ? n : Object.keys(n);
};

/** The merged view of one service: environment overlay-wins, networks and ports added up. */
function merged(name: string) {
  const b = load(BASE).services?.[name];
  const o = overlay().services?.[name];
  return {
    env: { ...envMap(b?.environment), ...envMap(o?.environment) },
    networks: [...new Set([...netNames(b), ...netNames(o)])],
    ports: [...(b?.ports ?? []), ...(o?.ports ?? [])],
  };
}
const allNetworks = (): Record<string, Network> => ({
  ...(load(BASE).networks ?? {}),
  ...(overlay().networks ?? {}),
});
const allServiceNames = () => [
  ...new Set([...Object.keys(load(BASE).services ?? {}), ...Object.keys(overlay().services ?? {})]),
];
const runs = (svc: Service | undefined, text: RegExp) =>
  [svc?.command, svc?.entrypoint]
    .flat()
    .some((part) => typeof part === "string" && text.test(part));
/** The service attached to test-fixtures besides egress-proxy: the fixture server. */
const fixtureServer = () =>
  allServiceNames().find(
    (name) => name !== "egress-proxy" && merged(name).networks.includes("test-fixtures"),
  );
/** A service's ACCESSLENS_TEST_* variables (merged view), as strings. */
const testVars = (name: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(merged(name).env)
      .filter(([k]) => k.startsWith("ACCESSLENS_TEST_"))
      .map(([k, v]) => [k, String(v)]),
  );
/** All three variables, test mode on, accepted by the shared parser, subnet 172.30.50.0/24. */
const expectFullTestMode = (name: string) => {
  const vars = testVars(name);
  expect(Object.keys(vars).sort(), `${name} test variables`).toEqual(TEST_VARS);
  const config = parseTestModeConfig(vars); // throws, naming the variable, if invalid
  expect(config.enabled, `${name} ${TEST_MODE_VAR}`).toBe(true);
  if (config.enabled) expect(config.fixtureSubnet).toBe(FIXTURE_SUBNET);
};

describe("docker-compose.test.yml (T195; ADR-0003 Addendum D)", () => {
  it("defines the test-fixtures network as 172.30.50.0/24", () => {
    const net = overlay().networks?.["test-fixtures"];
    expect(net, "networks.test-fixtures").toBeDefined();
    expect(net?.ipam?.config?.map((c) => c.subnet)).toEqual([FIXTURE_SUBNET]);
  });

  it("attaches only the fixture server and egress-proxy to test-fixtures", () => {
    const attached = allServiceNames().filter((name) =>
      merged(name).networks.includes("test-fixtures"),
    );
    expect(attached).toHaveLength(2);
    expect(attached).toContain("egress-proxy");
    const fixtureServer = attached.find((name) => name !== "egress-proxy");
    const svc = overlay().services?.[fixtureServer ?? ""];
    expect(runs(svc, /fixture-server/), `${fixtureServer} must run the T071 fixture server`).toBe(
      true,
    );
  });

  it("keeps scanner on internal networks only", () => {
    const networks = allNetworks();
    const scannerNets = merged("scanner").networks;
    expect(scannerNets.length).toBeGreaterThan(0);
    expect(scannerNets).not.toContain("test-fixtures");
    for (const name of scannerNets) {
      expect(networks[name]?.internal, `scanner network ${name} must be internal`).toBe(true);
    }
  });

  it("sets NODE_ENV=test for scanner and egress-proxy", () => {
    for (const name of SCAN_PATH) {
      expect(merged(name).env.NODE_ENV, `${name} NODE_ENV`).toBe("test");
    }
  });

  it("publishes no ports for scanner or egress-proxy", () => {
    for (const name of SCAN_PATH) expect(merged(name).ports, `${name} ports`).toEqual([]);
  });

  it("has no SCAN_ENABLED setting", () => {
    for (const [name, svc] of Object.entries(overlay().services ?? {})) {
      expect(Object.keys(envMap(svc.environment)), `${name} environment`).not.toContain(
        "SCAN_ENABLED",
      );
    }
    expect(readFileSync(OVERLAY, "utf8")).not.toMatch(/SCAN_ENABLED/);
  });

  // Review 2026-11-16: each service gets exactly the test variables it reads.
  it("gives scanner ACCESSLENS_TEST_MODE=true and no other test variable", () => {
    const vars = testVars("scanner");
    expect(Object.keys(vars), "scanner test variables").toEqual([TEST_MODE_VAR]);
    expect(isTestModeEnabled(vars)).toBe(true);
  });

  it("gives egress-proxy all three test variables, valid, with the fixture subnet", () => {
    expectFullTestMode("egress-proxy");
  });

  it("gives web either no test variable or all three, valid, with the fixture subnet (T194)", () => {
    if (Object.keys(testVars("web")).length === 0) return;
    expectFullTestMode("web");
  });

  // Review 2026-11-16: hardened like the other services; port 80 because the URL policy refuses
  // non-default ports. Docker lets an unprivileged process bind port 80 inside a container.
  it("runs the fixture server non-root, with cap_drop ALL, no added capabilities, on port 80", () => {
    const name = fixtureServer();
    expect(name, "a fixture server attached to test-fixtures").toBeDefined();
    const svc = overlay().services?.[name ?? ""] ?? {};
    expect(svc.user, `${name} user`).toBeDefined();
    expect(String(svc.user), `${name} must not run as root`).not.toMatch(/^(root|0)(:|$)/);
    expect(svc.cap_drop, `${name} cap_drop`).toContain("ALL");
    expect(svc.cap_add ?? [], `${name} cap_add`).toEqual([]);
    expect((svc.expose ?? []).map(String), `${name} expose`).toContain("80");
  });
});

describe("docker-compose.yml stays production-shaped (T014 note; proposal test 6)", () => {
  it("the base docker-compose.yml mentions no ACCESSLENS_TEST_* variable", () => {
    expect(readFileSync(BASE, "utf8")).not.toMatch(/ACCESSLENS_TEST_/);
  });
});
