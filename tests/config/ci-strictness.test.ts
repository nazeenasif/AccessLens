// CI strictness (M0 review): Docker/gitleaks-backed tests may skip locally when the tool is
// missing, but a skip must never make CI green.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { ALLOWED_SKIPS, REQUIRED, evaluate } from "../../scripts/assert-required-tests.mjs";

const VITEST = resolve("node_modules/vitest/vitest.mjs");
const ASSERT = resolve("scripts/assert-required-tests.mjs");
const tmp = mkdtempSync(join(tmpdir(), "al-ci-strict-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Assertion = { title: string; status: string };
const report = (file: string, assertions: Assertion[], failed = 0) => ({
  numFailedTests: failed,
  numFailedTestSuites: 0,
  testResults: [{ name: `/repo/tests/config/${file}`, assertionResults: assertions }],
});
const allRequiredPassed = () => {
  const byFile = new Map<string, Assertion[]>();
  for (const key of REQUIRED as string[]) {
    const [file, title] = key.split(" :: ") as [string, string];
    byFile.set(file, [...(byFile.get(file) ?? []), { title, status: "passed" }]);
  }
  return {
    numFailedTests: 0,
    numFailedTestSuites: 0,
    testResults: [...byFile].map(([f, a]) => ({
      name: `/repo/tests/config/${f}`,
      assertionResults: a,
    })),
  };
};

describe("assert-required-tests evaluate()", () => {
  it("accepts a run where every required test passed", () => {
    expect(evaluate(allRequiredPassed())).toEqual([]);
  });

  it("rejects a required test that was skipped", () => {
    const r = allRequiredPassed();
    r.testResults[0]!.assertionResults[0]!.status = "skipped";
    expect(evaluate(r).join("\n")).toMatch(/required test did not pass \(status: skipped\)/);
  });

  it("rejects a required test that never executed", () => {
    const r = allRequiredPassed();
    r.testResults[0]!.assertionResults.shift();
    expect(evaluate(r).join("\n")).toMatch(/NOT EXECUTED/);
  });

  it("rejects an unexpected skip but tolerates allowlisted ones", () => {
    const [allowedFile, allowedTitle] = (ALLOWED_SKIPS[0] as string).split(" :: ") as [
      string,
      string,
    ];
    const ok = allRequiredPassed();
    ok.testResults.push(
      report(allowedFile, [{ title: allowedTitle, status: "skipped" }]).testResults[0]!,
    );
    expect(evaluate(ok)).toEqual([]);
    const bad = allRequiredPassed();
    bad.testResults.push(
      report("x.test.ts", [{ title: "sneaky", status: "skipped" }]).testResults[0]!,
    );
    expect(evaluate(bad).join("\n")).toMatch(/unexpected skipped test/);
  });

  it("rejects any failure", () => {
    expect(evaluate({ ...allRequiredPassed(), numFailedTests: 1 }).join("\n")).toMatch(/1 failed/);
  });
});

describe("Docker missing: local skip vs. CI failure (nested vitest run of T019)", () => {
  const runT019 = (env: Record<string, string>, out: string) =>
    spawnSync(
      process.execPath,
      [
        VITEST,
        "run",
        "--project",
        "config",
        "tests/config/web-binding.test.ts",
        "--reporter=json",
        `--outputFile=${out}`,
      ],
      { encoding: "utf8", env: { ...process.env, ...env }, timeout: 300_000 },
    );

  it("locally (not required): skips with exit 0 — but the CI audit rejects that run", () => {
    const out = join(tmp, "local.json");
    const r = runT019(
      { ACCESSLENS_SIMULATE_DOCKER_UNAVAILABLE: "1", ACCESSLENS_REQUIRE_DOCKER: "0" },
      out,
    );
    expect(r.status, r.stderr).toBe(0);
    const json = JSON.parse(readFileSync(out, "utf8"));
    expect(json.numPassedTests).toBe(1); // only the inverse "unavailable" branch runs
    const audit = spawnSync(process.execPath, [ASSERT, out], { encoding: "utf8" });
    expect(audit.status).toBe(1);
    expect(audit.stderr).toMatch(
      /required test did not pass \(status: (skipped|pending)\): web-binding\.test\.ts :: accepts TCP on the public address/,
    );
  }, 300_000);

  it("in CI (ACCESSLENS_REQUIRE_DOCKER=1): the suite FAILS instead of skipping", () => {
    const out = join(tmp, "ci.json");
    const r = runT019(
      { ACCESSLENS_SIMULATE_DOCKER_UNAVAILABLE: "1", ACCESSLENS_REQUIRE_DOCKER: "1" },
      out,
    );
    expect(r.status).not.toBe(0);
    const json = JSON.parse(readFileSync(out, "utf8"));
    expect(json.numFailedTests + json.numFailedTestSuites).toBeGreaterThan(0);
  }, 300_000);
});
