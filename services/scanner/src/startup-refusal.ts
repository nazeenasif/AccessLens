// Scanner startup refusal (task T198; cases from T044). ADR-0001 Amendment 4 with the 2026-11-14
// note: the scanner reads only ACCESSLENS_TEST_MODE, through the mode-only isTestModeEnabled, and
// refuses to start if either other test-mode variable is set at all. T085's config keeps these
// rules. Problems name variables, never values.
import {
  isTestModeEnabled,
  TEST_ALLOWLIST_VAR,
  TEST_FIXTURE_SUBNET_VAR,
  TEST_MODE_VAR,
} from "@accesslens/shared";

const REQUIRED_TOKENS = ["SCANNER_INTERNAL_TOKEN", "PROXY_CONTROL_TOKEN"];

/** The reasons the scanner must not start; empty when it may. */
export function startupProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_TOKENS) {
    if (env[name] === undefined || env[name] === "") problems.push(`${name} is required`);
  }
  // The proxy reads these; the scanner never does, in any mode.
  for (const name of [TEST_ALLOWLIST_VAR, TEST_FIXTURE_SUBNET_VAR]) {
    if (env[name] !== undefined) problems.push(`${name} must not be set for the scanner`);
  }
  if (env[TEST_MODE_VAR] !== undefined && env.NODE_ENV !== "test") {
    problems.push(`${TEST_MODE_VAR} is set but NODE_ENV is not "test"`);
  }
  // SCAN_ENABLED is web-only (ADR-0001 §1); refusing it here guards against a stray variable.
  if (env.NODE_ENV === "test" && isTestModeEnabled(env) && env.SCAN_ENABLED === "true") {
    problems.push(`${TEST_MODE_VAR}=true cannot be combined with SCAN_ENABLED=true`);
  }
  return problems;
}
