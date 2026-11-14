// egress-proxy startup safety tests (task T044; implementation T051). ADR-0001 Amendment 4,
// proposal test 3. The process must refuse to start, exiting non-zero on its own (not by timeout),
// with a message naming the offending variables. Cases: tests/support/startup-refusal-cases.ts.
// Required in CI: scripts/assert-required-tests.mjs lists every case's title.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STARTUP_REFUSAL_CASES,
  startupTitle,
} from "../../../../tests/support/startup-refusal-cases.ts";

const SERVICE = "egress-proxy";
const MAIN = fileURLToPath(new URL("../../src/main.ts", import.meta.url));
// Variables the cases control are never inherited from the environment running the tests.
const CONTROLLED =
  /^(NODE_ENV|SCAN_ENABLED|PROXY_CONTROL_TOKEN|SCANNER_INTERNAL_TOKEN|ACCESSLENS_TEST_.*|EGRESS_TEST_ALLOWLIST)$/;

function start(env: Record<string, string>) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !CONTROLLED.test(k)),
  );
  return spawnSync(process.execPath, [MAIN], {
    env: { ...inherited, ...env },
    encoding: "utf8",
    timeout: 8_000,
  });
}

describe(`${SERVICE} refuses unsafe startup configurations`, () => {
  it.each(STARTUP_REFUSAL_CASES[SERVICE].map((c) => [startupTitle(SERVICE, c), c] as const))(
    "%s",
    (_title, c) => {
      const result = start(c.env);
      // A timeout kill would leave `status` null and set `signal`: that is not a refusal.
      expect(
        result.signal,
        "the process must exit on its own, not be killed by the timeout",
      ).toBeNull();
      expect(result.status).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      for (const name of c.mentions) expect(output).toContain(name);
    },
  );
});
