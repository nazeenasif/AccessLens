// Scanning-default guard (task T186). Live scanning must be off unless an operator explicitly
// enables it on a host with recorded G0 + G1 evidence (T187/T129).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// A Compose value is safe only if it is literally false, or a variable that defaults to false.
export function isSafeComposeValue(v: unknown): boolean {
  if (v === false) return true;
  if (typeof v !== "string") return false;
  return v === "false" || /^\$\{SCAN_ENABLED:-false\}$/.test(v);
}
// Text that would turn scanning on in scripts or CI config.
const ENABLE_PATTERN = /SCAN_ENABLED\s*[:=]\s*["']?true\b/i;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("SCAN_ENABLED defaults to disabled (T186)", () => {
  it("guard logic rejects unsafe values (self-check)", () => {
    for (const bad of [
      true,
      "true",
      "${SCAN_ENABLED}",
      "${SCAN_ENABLED:-true}",
      "${SCAN_ENABLED:-}",
      "1",
      undefined,
    ]) {
      expect(isSafeComposeValue(bad), String(bad)).toBe(false);
    }
    for (const good of [false, "false", "${SCAN_ENABLED:-false}"]) {
      expect(isSafeComposeValue(good), String(good)).toBe(true);
    }
    expect(ENABLE_PATTERN.test("SCAN_ENABLED=true")).toBe(true);
    expect(ENABLE_PATTERN.test("SCAN_ENABLED: 'true'")).toBe(true);
    expect(ENABLE_PATTERN.test("SCAN_ENABLED=false")).toBe(false);
  });

  it(".env.example sets SCAN_ENABLED=false", () => {
    const lines = readFileSync(".env.example", "utf8")
      .split(/\r?\n/)
      .filter((l) => /^SCAN_ENABLED=/.test(l));
    expect(lines).toEqual(["SCAN_ENABLED=false"]);
  });

  it("no Compose service or profile can enable scanning by default", () => {
    const compose = parse(readFileSync("docker-compose.yml", "utf8"), { merge: true }) as {
      services: Record<string, { environment?: Record<string, unknown> | string[] }>;
    };
    const checked: string[] = [];
    for (const [name, svc] of Object.entries(compose.services)) {
      const env = svc.environment;
      if (!env) continue;
      const value = Array.isArray(env)
        ? env.find((e) => e.startsWith("SCAN_ENABLED="))?.split("=")[1]
        : env.SCAN_ENABLED;
      if (value === undefined) continue;
      checked.push(name);
      expect(isSafeComposeValue(value), `${name}: SCAN_ENABLED=${String(value)}`).toBe(true);
    }
    // Guard against vacuous passes (e.g. YAML merge keys not being resolved).
    expect(checked).toEqual(expect.arrayContaining(["web", "web-dev"]));
  });

  it("scripts and CI config never set SCAN_ENABLED=true", () => {
    const files = [...walk("scripts"), ...walk(".github")];
    const offenders = files.filter((f) => ENABLE_PATTERN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it.skip("web treats anything other than the exact string 'true' as disabled — added with T116 (/api/audits SCAN_ENABLED check)", () => {});
});
