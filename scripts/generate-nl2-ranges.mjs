// Generates ops/firewall/nonpublic-ipv4.txt from NON_PUBLIC_IPV4_RANGES (task T057, file part
// only). ADR-0001 §3 with Amendment 3: the shared list is the single source of truth, and the
// T045 sync test keeps the file equal to it. This script only writes the file; it never runs or
// installs firewall rules.
import { writeFileSync } from "node:fs";
import { NON_PUBLIC_IPV4_RANGES } from "../packages/shared/src/url-policy/ip-classify.ts";

const FILE = new URL("../ops/firewall/nonpublic-ipv4.txt", import.meta.url);

const lines = [
  "# Generated from NON_PUBLIC_IPV4_RANGES (packages/shared/src/url-policy/ip-classify.ts)",
  "# by scripts/generate-nl2-ranges.mjs. Do not edit by hand; the T045 test checks it.",
  ...NON_PUBLIC_IPV4_RANGES,
];
writeFileSync(FILE, `${lines.join("\n")}\n`, "utf8");
console.log(`wrote ${NON_PUBLIC_IPV4_RANGES.length} ranges to ops/firewall/nonpublic-ipv4.txt`);
