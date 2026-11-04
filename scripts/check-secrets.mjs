#!/usr/bin/env node
// Build secret scan (task T023; research R14, constitution IV).
// Greps the Next.js client build output for secret env var names and the OpenRouter key prefix.
// Exit codes: 0 clean, 1 secret found, 2 build directory missing (fail closed).
// Usage: node scripts/check-secrets.mjs [dir]   (default: apps/web/.next/static)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SECRET_NAMES = [
  "OPENROUTER_API_KEY",
  "EVIDENCE_SIGNING_SECRET",
  "SCANNER_INTERNAL_TOKEN",
  "PROXY_CONTROL_TOKEN",
];
// `redact`: show only a short prefix for values that could be real keys; variable names are not
// secret and are reported in full.
const PATTERNS = [
  ...SECRET_NAMES.map((name) => ({
    label: name,
    re: new RegExp(`\\b${name}\\w*`, "g"),
    redact: false,
  })),
  { label: "sk-or- (OpenRouter key prefix)", re: /sk-or-[A-Za-z0-9-_]{8,}/g, redact: true },
];

const dir = process.argv[2] ?? "apps/web/.next/static";
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`check-secrets: build directory not found: ${dir} (run the web build first)`);
  process.exit(2);
}

function* walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const hits = [];
for (const file of walk(dir)) {
  const text = readFileSync(file, "utf8");
  for (const { label, re, redact } of PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      const shown = redact ? `${m[0].slice(0, 8)}…` : m[0];
      hits.push(`${relative(process.cwd(), file)}: ${label} (${shown})`);
    }
  }
}

if (hits.length) {
  console.error(`check-secrets: ${hits.length} potential secret(s) in client output:`);
  for (const h of hits) console.error(`  - ${h}`);
  process.exit(1);
}
console.log(`check-secrets: clean (${dir})`);
