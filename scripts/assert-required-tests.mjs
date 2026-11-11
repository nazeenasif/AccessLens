#!/usr/bin/env node
// CI guard (M0 review): fail unless every REQUIRED tool-backed test actually executed and passed,
// and no test was skipped except the explicit allowlist below. A skipped test never counts as green.
// Usage: node scripts/assert-required-tests.mjs <vitest-json-report>
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

// Docker- and gitleaks-backed tests that MUST run and pass in CI (file :: exact test title).
export const REQUIRED = [
  "web-binding.test.ts :: accepts TCP on the public address",
  "web-binding.test.ts :: refuses TCP on the scan-ctl address",
  "web-binding.test.ts :: is reachable through the published host port",
  "images-nonroot.test.ts :: builds all service images",
  "images-nonroot.test.ts :: accesslens/web:local runs with a non-root UID",
  "images-nonroot.test.ts :: accesslens/scanner:local runs with a non-root UID",
  "images-nonroot.test.ts :: accesslens/egress-proxy:local runs with a non-root UID",
  "images-nonroot.test.ts :: accesslens/web:local runs the pinned Node version",
  "images-nonroot.test.ts :: accesslens/scanner:local runs the pinned Node version",
  "images-nonroot.test.ts :: accesslens/egress-proxy:local runs the pinned Node version",
  "images-nonroot.test.ts :: accesslens/scanner:local contains exactly one Node binary and no package managers",
  "scanner-sandbox.test.ts :: Chromium launches with chromiumSandbox: true and renders a page",
  "scanner-sandbox.test.ts :: the renderer runs inside the sandbox (nested PID namespace, seccomp filter)",
  "scanner-sandbox.test.ts :: no Chromium process was started with a sandbox-disabling flag",
  "scanner-sandbox.test.ts :: the scanner process is non-root with no effective capabilities; SYS_CHROOT is only in its bounding set",
  "diff-secret-scan.test.ts :: passes on a clean history, including .env.example placeholders",
  "diff-secret-scan.test.ts :: fails on a committed OpenRouter-style key",
  "diff-secret-scan.test.ts :: fails on a committed 48-byte base64 secret",
];

// The ONLY tests allowed to be skipped: inverse "tool unavailable" branches (skipped precisely
// because the tool IS available) and one check explicitly deferred to task T116.
export const ALLOWED_SKIPS = [
  "web-binding.test.ts :: Docker daemon is required to run T019 — currently unavailable (test not executed)",
  "images-nonroot.test.ts :: Docker daemon is required for the built-image checks — currently unavailable (not executed)",
  "diff-secret-scan.test.ts :: gitleaks (on PATH or via Docker) is required to run T027 — currently unavailable",
  "scanner-sandbox.test.ts :: Docker daemon is required for the sandbox check — currently unavailable (not executed)",
  "scan-enabled-default.test.ts :: web treats anything other than the exact string 'true' as disabled — added with T116 (/api/audits SCAN_ENABLED check)",
];

export function evaluate(report, required = REQUIRED, allowedSkips = ALLOWED_SKIPS) {
  const problems = [];
  const status = new Map();
  for (const file of report.testResults ?? []) {
    const name = basename(String(file.name).replace(/\\/g, "/"));
    for (const a of file.assertionResults ?? []) status.set(`${name} :: ${a.title}`, a.status);
  }
  if ((report.numFailedTests ?? 0) > 0 || (report.numFailedTestSuites ?? 0) > 0) {
    problems.push(
      `${report.numFailedTests ?? 0} failed test(s), ${report.numFailedTestSuites ?? 0} failed suite(s)`,
    );
  }
  for (const key of required) {
    const s = status.get(key);
    if (s !== "passed")
      problems.push(`required test did not pass (status: ${s ?? "NOT EXECUTED"}): ${key}`);
  }
  for (const [key, s] of status) {
    if (s !== "passed" && s !== "failed" && !allowedSkips.includes(key)) {
      problems.push(`unexpected ${s} test (not allowlisted): ${key}`);
    }
  }
  return problems;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/assert-required-tests.mjs");
if (isMain) {
  const path = process.argv[2];
  if (!path || !existsSync(path)) {
    console.error(`assert-required-tests: report not found: ${path ?? "(missing argument)"}`);
    process.exit(2);
  }
  const problems = evaluate(JSON.parse(readFileSync(path, "utf8")));
  if (problems.length) {
    console.error(`assert-required-tests: FAIL (${problems.length} problem(s))`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `assert-required-tests: OK (${REQUIRED.length} required tests passed; only allowlisted skips)`,
  );
}
