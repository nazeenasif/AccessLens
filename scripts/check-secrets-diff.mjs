#!/usr/bin/env node
// Diff/history secret scan (tasks T026/T027; ADR-0003 Addendum B) using gitleaks v8.30.1.
// Uses `gitleaks` on PATH if present, otherwise the pinned container image via Docker.
// Exit codes: 0 clean, 1 leaks found, 3 no scanner available (fail closed), 4 scanner error.
// Usage:
//   node scripts/check-secrets-diff.mjs [--repo <path>] [--log-opts "<git log opts>"]
//   node scripts/check-secrets-diff.mjs --probe     (exit 0 if a scanner can run, else 3)
// The commit range defaults to $GITLEAKS_LOG_OPTS, or "--all" (entire history).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const GITLEAKS_VERSION = "8.30.1";
const IMAGE = `ghcr.io/gitleaks/gitleaks:v${GITLEAKS_VERSION}`;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const repo = resolve(flag("--repo") ?? ".");
const logOpts = flag("--log-opts") ?? process.env.GITLEAKS_LOG_OPTS ?? "--all";

const ok = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { encoding: "utf8" }).status === 0;
const hasLocal = () => ok("gitleaks", ["version"]);
const hasDocker = () =>
  ok("docker", ["info"]) &&
  (ok("docker", ["image", "inspect", IMAGE]) || ok("docker", ["pull", "-q", IMAGE]));

function pickRunner() {
  if (hasLocal()) return "local";
  if (hasDocker()) return "docker";
  return null;
}

const runner = pickRunner();
if (args.includes("--probe")) process.exit(runner ? 0 : 3);
if (!runner) {
  console.error(
    `check-secrets-diff: no scanner available. Install gitleaks v${GITLEAKS_VERSION} or start Docker ` +
      `(image ${IMAGE}). Refusing to report a clean result.`,
  );
  process.exit(3);
}

const configInRepo = existsSync(join(repo, ".gitleaks.toml"));
const common = ["git", "--no-banner", "--redact", `--log-opts=${logOpts}`];
let result;
if (runner === "local") {
  const cfg = configInRepo ? ["--config", join(repo, ".gitleaks.toml")] : [];
  result = spawnSync("gitleaks", [...common, ...cfg, repo], { encoding: "utf8" });
} else {
  // The repository is mounted read-only; git's ownership check is relaxed for /repo only.
  const cfg = configInRepo ? "--config /repo/.gitleaks.toml" : "";
  const inner =
    `git config --global --add safe.directory /repo && ` +
    `gitleaks ${common.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")} ${cfg} /repo`;
  result = spawnSync(
    "docker",
    ["run", "--rm", "-v", `${repo}:/repo:ro`, "--entrypoint", "sh", IMAGE, "-c", inner],
    { encoding: "utf8" },
  );
}

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status === 0) {
  console.log(`check-secrets-diff: clean (${runner}, log-opts "${logOpts}")`);
  process.exit(0);
}
if (result.status === 1) {
  console.error(
    `check-secrets-diff: secrets detected (${runner}). See findings above (values redacted).`,
  );
  process.exit(1);
}
console.error(`check-secrets-diff: scanner error (exit ${result.status ?? "signal"})`);
process.exit(4);
