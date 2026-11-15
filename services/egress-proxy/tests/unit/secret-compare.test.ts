// Constant-time secret comparison (review 2026-11-15; T042/T041 follow-up). One helper,
// services/egress-proxy/src/secret-compare.ts, compares every secret in control.ts
// (PROXY_CONTROL_TOKEN) and credentials.ts (per-audit proxy credentials).
//
// API: secretEquals(expected: string, supplied: unknown): boolean
//   hashes both sides to 32 bytes, then compares with crypto.timingSafeEqual.
// Timing can't be measured reliably in a unit test, so the source checks below pin the mechanism:
// the helper must return timingSafeEqual of the two digests, and the callers must use the helper
// and never compare secrets with ===, !==, or .equals( themselves.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { secretEquals } from "../../src/secret-compare.ts";

const SECRET = "s".repeat(48);
const source = (file: string) =>
  readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
/** Source lines without comments. */
const codeLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => !/^\s*(\*|\/\*)/.test(line));

describe("secretEquals", () => {
  it("is true for the same secret", () => {
    expect(secretEquals(SECRET, SECRET)).toBe(true);
    expect(secretEquals("pässwörd-🔑", "pässwörd-🔑")).toBe(true);
  });

  it.each([
    ["a different secret of the same length", "x".repeat(SECRET.length)],
    ["one character different at the end", SECRET.slice(0, -1) + "t"],
    ["a prefix of the secret", SECRET.slice(0, 10)],
    ["the secret plus one character", SECRET + "s"],
    ["empty", ""],
  ])("is false for %s, without throwing", (_case, supplied) => {
    expect(() => secretEquals(SECRET, supplied)).not.toThrow();
    expect(secretEquals(SECRET, supplied)).toBe(false);
  });

  it.each([
    ["undefined (missing header)", undefined],
    ["an array (repeated header)", [SECRET]],
    ["a number", 42],
    ["null", null],
  ])("is false for %s", (_case, supplied) => {
    expect(secretEquals(SECRET, supplied)).toBe(false);
  });
});

describe("source checks: one constant-time helper for every secret comparison", () => {
  it("the helper returns timingSafeEqual of both digests", () => {
    const text = source("secret-compare.ts");
    expect(text).toContain("return timingSafeEqual(digest(expected), digest(supplied));");
    expect(text).not.toContain(".equals(");
    // The only (in)equality operator allowed is the typeof guard on `supplied`.
    const comparisons = codeLines(text).filter((line) => /===|!==/.test(line));
    expect(comparisons.map((l) => l.trim())).toEqual([
      'if (typeof supplied !== "string") return false;',
    ]);
  });

  const SECRET_NAME = /\b(token|password|username|secret|supplied|expected|controlToken)\b/i;

  it.each(["control.ts", "credentials.ts"])(
    "%s imports and uses secretEquals, and compares no secret any other way",
    (file) => {
      const text = source(file);
      expect(text).toContain('import { secretEquals } from "./secret-compare.ts";');
      expect(text).toMatch(/\bsecretEquals\(/);
      expect(text, "timingSafeEqual belongs only in the helper").not.toContain("timingSafeEqual");
      const offending = codeLines(text).filter(
        (line) => SECRET_NAME.test(line) && /===|!==|\.equals\(/.test(line),
      );
      expect(offending, "secret compared with ===, !==, or .equals(").toEqual([]);
    },
  );
});
