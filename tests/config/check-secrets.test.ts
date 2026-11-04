// Build secret-scan test (task T023; research R14, constitution IV).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = "scripts/check-secrets.mjs";
const dirs: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "al-secrets-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}
function run(dir: string) {
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("scripts/check-secrets.mjs (T023)", () => {
  it("passes on a clean static build", () => {
    const r = run(fixtureDir({ "chunks/app.js": "console.log('hello');", "css/a.css": "a{}" }));
    expect(r.status).toBe(0);
  });

  it("fails on an OpenRouter key prefix", () => {
    // Built at runtime so no key-like literal is committed (the gitleaks history scan would flag it).
    const fakeKey = ["sk", "or", "v1", randomBytes(16).toString("hex")].join("-");
    const r = run(fixtureDir({ "chunks/leak.js": `const k="${fakeKey}";` }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("sk-or-");
  });

  it.each([
    "OPENROUTER_API_KEY",
    "EVIDENCE_SIGNING_SECRET",
    "EVIDENCE_SIGNING_SECRET_PREVIOUS",
    "SCANNER_INTERNAL_TOKEN",
    "PROXY_CONTROL_TOKEN",
  ])("fails when the secret variable name %s appears in client output", (name) => {
    const r = run(fixtureDir({ "chunks/x.js": `process.env.${name}` }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(name);
  });

  it("fails closed when the build directory is missing", () => {
    const r = run(join(tmpdir(), "al-secrets-does-not-exist"));
    expect(r.status).toBe(2);
  });
});
