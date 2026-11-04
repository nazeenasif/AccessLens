// Diff/history secret-scan verification (task T027; constitution merge gate "no secrets in diff").
// Fake secrets are generated at runtime so no key-like literal exists in this repository's source.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/check-secrets-diff.mjs");
const CONFIG = resolve(".gitleaks.toml");

// In CI, ACCESSLENS_REQUIRE_GITLEAKS=1 makes the T027 suite run (and fail) when no scanner is
// available, instead of skipping. ACCESSLENS_SIMULATE_SCANNER_UNAVAILABLE is a test-only hook.
const REQUIRE_GITLEAKS = process.env.ACCESSLENS_REQUIRE_GITLEAKS === "1";
function scannerAvailable(): boolean {
  if (process.env.ACCESSLENS_SIMULATE_SCANNER_UNAVAILABLE === "1") return false;
  const r = spawnSync(process.execPath, [SCRIPT, "--probe"], { encoding: "utf8" });
  return r.status === 0;
}
function git(repo: string, ...args: string[]) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
function newRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "al-gitleaks-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "user.name", "T027 Test");
  git(repo, "config", "commit.gpgsign", "false");
  copyFileSync(CONFIG, join(repo, ".gitleaks.toml"));
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "config");
  return repo;
}
function commit(repo: string, file: string, body: string) {
  writeFileSync(join(repo, file), body);
  git(repo, "add", file);
  git(repo, "commit", "-q", "-m", `add ${file}`);
}
function scan(repo: string) {
  return spawnSync(process.execPath, [SCRIPT, "--repo", repo], { encoding: "utf8" });
}

const available = scannerAvailable();
const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe.skipIf(!(available || REQUIRE_GITLEAKS))("npm run check:secrets:diff (T027)", () => {
  let clean = "";
  beforeAll(() => {
    if (!available) {
      throw new Error(
        "T027: gitleaks is REQUIRED (ACCESSLENS_REQUIRE_GITLEAKS=1) but no scanner is available — refusing to skip.",
      );
    }
    clean = newRepo();
    repos.push(clean);
    commit(clean, "app.ts", "export const greeting = 'hello';\n");
    copyFileSync(".env.example", join(clean, ".env.example"));
    git(clean, "add", ".env.example");
    git(clean, "commit", "-q", "-m", "env example");
  });

  it("passes on a clean history, including .env.example placeholders", () => {
    const r = scan(clean);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("fails on a committed OpenRouter-style key", () => {
    const repo = newRepo();
    repos.push(repo);
    const fakeKey = ["sk", "or", "v1", randomBytes(24).toString("hex")].join("-");
    commit(repo, "leak.ts", `export const k = "${fakeKey}";\n`);
    const r = scan(repo);
    expect(r.status, r.stdout + r.stderr).toBe(1);
  });

  it("fails on a committed 48-byte base64 secret", () => {
    const repo = newRepo();
    repos.push(repo);
    const b64 = randomBytes(48).toString("base64");
    commit(repo, "config.env", `EVIDENCE_SIGNING_SECRET=${b64}\n`);
    const r = scan(repo);
    expect(r.status, r.stdout + r.stderr).toBe(1);
  });
});

describe("scanner availability (T027 prerequisite)", () => {
  it.skipIf(available)(
    "gitleaks (on PATH or via Docker) is required to run T027 — currently unavailable",
    () => {
      const r = spawnSync(process.execPath, [SCRIPT, "--repo", "."], { encoding: "utf8" });
      // Fails closed (exit 3) rather than reporting a clean scan when no scanner can run.
      expect(r.status).toBe(3);
    },
  );
});
