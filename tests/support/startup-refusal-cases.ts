// Startup refusal cases (task T044; ADR-0001 Amendment 4, proposal test 3). Shared by
// services/egress-proxy/tests/security/startup.test.ts and services/scanner/tests/security/startup.test.ts,
// and imported by scripts/assert-required-tests.mjs, which requires every case's test in CI.
// Keep it free of runtime imports.
//
// Each case is an environment that must make the service exit non-zero at startup, with a message
// that names every variable in `mentions`.
//
// Review 2026-11-14:
// - SCAN_ENABLED stays web-only (ADR-0001 §1, T014). The scanner and proxy refusal of test mode
//   together with SCAN_ENABLED=true is kept as protection against a stray variable.
// - The scanner reads only ACCESSLENS_TEST_MODE, through the mode-only check in test-mode.ts. It
//   refuses to start if ACCESSLENS_TEST_ALLOWLIST or ACCESSLENS_TEST_FIXTURE_SUBNET is set at all.

export type Service = "egress-proxy" | "scanner";
export type StartupCase = { name: string; env: Record<string, string>; mentions: string[] };

const TOKEN = "t".repeat(48);
const MODE_ON = { ACCESSLENS_TEST_MODE: "true" };
const PROXY_TEST_CONFIG = {
  ...MODE_ON,
  ACCESSLENS_TEST_ALLOWLIST: "fixtures.test",
  ACCESSLENS_TEST_FIXTURE_SUBNET: "172.30.50.0/24",
};

/** A production-shaped environment that is otherwise valid for the service. */
export const BASE_ENV: Record<Service, Record<string, string>> = {
  "egress-proxy": { NODE_ENV: "production", PROXY_CONTROL_TOKEN: TOKEN },
  scanner: { NODE_ENV: "production", PROXY_CONTROL_TOKEN: TOKEN, SCANNER_INTERNAL_TOKEN: TOKEN },
};

const withoutToken = (service: Service) =>
  Object.fromEntries(
    Object.entries(BASE_ENV[service]).filter(([k]) => k !== "PROXY_CONTROL_TOKEN"),
  );

const proxy = BASE_ENV["egress-proxy"];
const scanner = BASE_ENV.scanner;

export const STARTUP_REFUSAL_CASES: Record<Service, StartupCase[]> = {
  "egress-proxy": [
    {
      name: "PROXY_CONTROL_TOKEN is missing",
      env: withoutToken("egress-proxy"),
      mentions: ["PROXY_CONTROL_TOKEN"],
    },
    {
      name: "ACCESSLENS_TEST_ALLOWLIST is set outside NODE_ENV=test",
      env: { ...proxy, ACCESSLENS_TEST_ALLOWLIST: "fixtures.test" },
      mentions: ["ACCESSLENS_TEST_ALLOWLIST", "NODE_ENV"],
    },
    {
      name: "ACCESSLENS_TEST_MODE is set outside NODE_ENV=test",
      env: { ...proxy, ...MODE_ON },
      mentions: ["ACCESSLENS_TEST_MODE", "NODE_ENV"],
    },
    {
      name: "ACCESSLENS_TEST_FIXTURE_SUBNET is set outside NODE_ENV=test",
      env: { ...proxy, ACCESSLENS_TEST_FIXTURE_SUBNET: "172.30.50.0/24" },
      mentions: ["ACCESSLENS_TEST_FIXTURE_SUBNET", "NODE_ENV"],
    },
    {
      name: "ACCESSLENS_TEST_MODE=true is combined with SCAN_ENABLED=true",
      env: { ...proxy, NODE_ENV: "test", ...PROXY_TEST_CONFIG, SCAN_ENABLED: "true" },
      mentions: ["ACCESSLENS_TEST_MODE", "SCAN_ENABLED"],
    },
    {
      // egress-proxy reads the allowlist (ADR-0001 Amendment 4) and validates it with the shared
      // parser.
      name: "test mode has an invalid ACCESSLENS_TEST_ALLOWLIST",
      env: {
        ...proxy,
        NODE_ENV: "test",
        ...PROXY_TEST_CONFIG,
        ACCESSLENS_TEST_ALLOWLIST: "127.0.0.1",
      },
      mentions: ["ACCESSLENS_TEST_ALLOWLIST"],
    },
  ],
  scanner: [
    {
      name: "PROXY_CONTROL_TOKEN is missing",
      env: withoutToken("scanner"),
      mentions: ["PROXY_CONTROL_TOKEN"],
    },
    {
      name: "ACCESSLENS_TEST_MODE is set outside NODE_ENV=test",
      env: { ...scanner, ...MODE_ON },
      mentions: ["ACCESSLENS_TEST_MODE", "NODE_ENV"],
    },
    {
      // Test mode only: the scanner must not be refusing for an allowlist reason here.
      name: "ACCESSLENS_TEST_MODE=true is combined with SCAN_ENABLED=true",
      env: { ...scanner, NODE_ENV: "test", ...MODE_ON, SCAN_ENABLED: "true" },
      mentions: ["ACCESSLENS_TEST_MODE", "SCAN_ENABLED"],
    },
    {
      name: "ACCESSLENS_TEST_ALLOWLIST is set outside NODE_ENV=test",
      env: { ...scanner, ACCESSLENS_TEST_ALLOWLIST: "fixtures.test" },
      mentions: ["ACCESSLENS_TEST_ALLOWLIST"],
    },
    {
      name: "ACCESSLENS_TEST_FIXTURE_SUBNET is set outside NODE_ENV=test",
      env: { ...scanner, ACCESSLENS_TEST_FIXTURE_SUBNET: "172.30.50.0/24" },
      mentions: ["ACCESSLENS_TEST_FIXTURE_SUBNET"],
    },
    {
      name: "ACCESSLENS_TEST_ALLOWLIST is set, even in test mode (the scanner never reads it)",
      env: { ...scanner, NODE_ENV: "test", ...MODE_ON, ACCESSLENS_TEST_ALLOWLIST: "fixtures.test" },
      mentions: ["ACCESSLENS_TEST_ALLOWLIST"],
    },
    {
      name: "ACCESSLENS_TEST_FIXTURE_SUBNET is set, even in test mode (the scanner never reads it)",
      env: {
        ...scanner,
        NODE_ENV: "test",
        ...MODE_ON,
        ACCESSLENS_TEST_FIXTURE_SUBNET: "172.30.50.0/24",
      },
      mentions: ["ACCESSLENS_TEST_FIXTURE_SUBNET"],
    },
  ],
};

/** The test title for a case; the CI audit requires each of these titles to pass. */
export const startupTitle = (service: Service, c: StartupCase) =>
  `${service}: exits non-zero when ${c.name}`;
