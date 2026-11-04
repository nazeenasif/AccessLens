// Shared helpers for Docker-backed config tests (T019, T024).
//
// Locally, these tests are SKIPPED (never passed) when the Docker daemon is unavailable.
// In CI, ACCESSLENS_REQUIRE_DOCKER=1 makes them RUN anyway, so a missing daemon FAILS the suite
// instead of skipping it; scripts/assert-required-tests.mjs then double-checks that every
// required test actually executed and passed.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export const PROJECT = "accesslens-m0test";
export const PROBE_IMAGE = "busybox:1.37.0";

// Dummy values for the required secrets so `docker compose` can start; never real credentials.
export const DUMMY_ENV = {
  EVIDENCE_SIGNING_SECRET: "m0-test-dummy-evidence-secret-not-real",
  SCANNER_INTERNAL_TOKEN: "m0-test-dummy-scanner-token-not-real",
  PROXY_CONTROL_TOKEN: "m0-test-dummy-proxy-token-not-real",
  SCAN_ENABLED: "false",
};

export const REQUIRE_DOCKER = process.env.ACCESSLENS_REQUIRE_DOCKER === "1";

export function dockerAvailable(): boolean {
  // Test-only hook (tests/config/ci-strictness.test.ts) to exercise the "Docker missing" path.
  if (process.env.ACCESSLENS_SIMULATE_DOCKER_UNAVAILABLE === "1") return false;
  return (
    spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" }).status ===
    0
  );
}

/** Docker-backed suites run when Docker is up, and also when Docker is required (then they fail). */
export function dockerGate(): { available: boolean; run: boolean } {
  const available = dockerAvailable();
  return { available, run: available || REQUIRE_DOCKER };
}

/** Call at the start of a Docker-backed suite: fails loudly when Docker is required but missing. */
export function assertDocker(available: boolean, task: string): void {
  if (!available) {
    throw new Error(
      `${task}: Docker is REQUIRED (ACCESSLENS_REQUIRE_DOCKER=1) but the daemon is unavailable — ` +
        `refusing to skip in a required run.`,
    );
  }
}

export function sh(cmd: string, args: string[], timeoutMs = 900_000): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, ...DUMMY_ENV },
  });
}

export function compose(...args: string[]): SpawnSyncReturns<string> {
  return sh("docker", ["compose", "-p", PROJECT, ...args]);
}
