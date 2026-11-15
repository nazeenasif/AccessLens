// egress-proxy configuration and startup refusals (task T051; cases from T044). ADR-0001 §1 and
// Amendment 4; contracts/internal-egress-proxy.md §5. Problems name variables, never values.
import {
  parseTestModeConfig,
  TEST_ALLOWLIST_VAR,
  TEST_FIXTURE_SUBNET_VAR,
  TEST_MODE_VAR,
  type TestModeConfig,
} from "@accesslens/shared";

export type ProxyConfig = {
  controlToken: string;
  logLevel: string;
  caps: { maxRequests: number; maxBytes: number };
  totalTimeoutMs: number;
  testMode: TestModeConfig;
};

export type ConfigResult = { ok: true; config: ProxyConfig } | { ok: false; problems: string[] };

/** ADR-0001 §1: PROXY_CONTROL_TOKEN is at least 32 random bytes. */
const MIN_TOKEN_LENGTH = 32;
const TEST_VARS = [TEST_MODE_VAR, TEST_ALLOWLIST_VAR, TEST_FIXTURE_SUBNET_VAR];
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

/** A positive decimal integer, or the default when unset (the Compose defaults). */
function positiveInt(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  problems: string[],
): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    problems.push(`${name} must be a positive integer`);
    return fallback;
  }
  return Number(raw);
}

export function loadProxyConfig(env: Record<string, string | undefined>): ConfigResult {
  const problems: string[] = [];

  const controlToken = env.PROXY_CONTROL_TOKEN;
  if (controlToken === undefined || controlToken === "") {
    problems.push("PROXY_CONTROL_TOKEN is required");
  } else if (controlToken.length < MIN_TOKEN_LENGTH) {
    problems.push(`PROXY_CONTROL_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  }

  const logLevel = env.LOG_LEVEL ?? "info";
  if (!LOG_LEVELS.includes(logLevel))
    problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}`);

  const caps = {
    maxRequests: positiveInt(env, "SCAN_MAX_REQUESTS", 300, problems),
    maxBytes: positiveInt(env, "SCAN_MAX_BYTES", 15_728_640, problems),
  };
  const totalTimeoutMs = positiveInt(env, "SCAN_TOTAL_TIMEOUT_MS", 60_000, problems);

  // Test-mode variables exist only in docker-compose.test.yml, which sets NODE_ENV=test.
  let testMode: TestModeConfig = { enabled: false };
  const strays = TEST_VARS.filter((name) => env[name] !== undefined);
  if (env.NODE_ENV !== "test") {
    for (const name of strays) problems.push(`${name} is set but NODE_ENV is not "test"`);
  } else {
    try {
      testMode = parseTestModeConfig(env);
    } catch (error) {
      // The shared parser's message starts with the variable name and never echoes a token.
      problems.push(error instanceof Error ? error.message : `${TEST_MODE_VAR} is invalid`);
    }
    // SCAN_ENABLED is web-only (ADR-0001 §1); refusing it here guards against a stray variable.
    if (env[TEST_MODE_VAR] === "true" && env.SCAN_ENABLED === "true") {
      problems.push(`${TEST_MODE_VAR}=true cannot be combined with SCAN_ENABLED=true`);
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: { controlToken: controlToken ?? "", logLevel, caps, totalTimeoutMs, testMode },
  };
}
