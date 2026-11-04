// Web binding test (task T019; precondition relied on by ADR-0001 §1 / NL-1).
// On the composed stack, `web` must accept TCP on its `public` address and refuse TCP on its
// `scan-ctl` address, so a browser in `scanner` can never open connections to `web`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROBE_IMAGE, PROJECT, assertDocker, compose, dockerGate, sh } from "./docker-support.ts";

const WEB_PUBLIC = "172.30.10.10";
const WEB_SCAN_CTL = "172.30.20.10";
const { available, run } = dockerGate();

function tcpProbe(network: string, host: string): number | null {
  // nc -z exits 0 on a successful TCP connect, non-zero on refusal/timeout.
  const r = sh(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      `${PROJECT}_${network}`,
      PROBE_IMAGE,
      "sh",
      "-c",
      `for i in 1 2 3 4 5 6 7 8 9 10; do nc -z -w 2 ${host} 3000 && exit 0; sleep 2; done; exit 1`,
    ],
    120_000,
  );
  return r.status;
}

describe.skipIf(!run)("web binds only to its public-network address (T019)", () => {
  beforeAll(() => {
    assertDocker(available, "T019");
    const up = compose("up", "-d", "--build", "--wait", "--wait-timeout", "180", "web");
    if (up.status !== 0) throw new Error(`compose up failed:\n${up.stdout}\n${up.stderr}`);
  }, 900_000);

  afterAll(() => {
    compose("down", "-v", "--remove-orphans");
  }, 300_000);

  it("accepts TCP on the public address", () => {
    expect(tcpProbe("public", WEB_PUBLIC)).toBe(0);
  });

  it("refuses TCP on the scan-ctl address", () => {
    const r = sh(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        `${PROJECT}_scan-ctl`,
        PROBE_IMAGE,
        "sh",
        "-c",
        `nc -z -w 3 ${WEB_SCAN_CTL} 3000`,
      ],
      60_000,
    );
    expect(r.status).not.toBe(0);
  });

  it("is reachable through the published host port", async () => {
    let ok = false;
    for (let i = 0; i < 15 && !ok; i++) {
      try {
        const res = await fetch("http://127.0.0.1:3000/");
        ok = res.status === 200;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    expect(ok).toBe(true);
  });
});

describe("Docker availability (T019 prerequisite)", () => {
  it.skipIf(available)(
    "Docker daemon is required to run T019 — currently unavailable (test not executed)",
    () => {
      expect(available).toBe(false);
    },
  );
});
