// Constant-time secret comparison (review 2026-11-15), shared by control.ts (PROXY_CONTROL_TOKEN)
// and credentials.ts (per-audit proxy credentials). Nothing else in those files compares secrets.
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * True only if `supplied` is a string equal to `expected`. Both sides are hashed to 32 bytes
 * first, so the comparison takes the same time for any length or content and never throws on a
 * length mismatch. A non-string `supplied` (a missing or repeated header) is never equal.
 */
export function secretEquals(expected: string, supplied: unknown): boolean {
  if (typeof supplied !== "string") return false;
  return timingSafeEqual(digest(expected), digest(supplied));
}
