#!/usr/bin/env node
// Prints this container's IPv4 address inside the given CIDR (task T020). Exits 1 if none, so
// the entrypoint fails closed instead of falling back to binding on all interfaces.
// Usage: node public-ip.mjs 172.30.10.0/24
import { networkInterfaces } from "node:os";

export function toInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function inCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 32)
    throw new Error(`invalid CIDR: ${cidr}`);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

export function pickAddress(interfaces, cidr) {
  const matches = Object.values(interfaces)
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal && inCidr(a.address, cidr))
    .map((a) => a.address);
  return matches.length === 1 ? matches[0] : null;
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("public-ip.mjs");
if (isMain) {
  const cidr = process.argv[2];
  if (!cidr) {
    console.error("usage: public-ip.mjs <cidr>");
    process.exit(2);
  }
  const ip = pickAddress(networkInterfaces(), cidr);
  if (!ip) {
    console.error(`public-ip: no unique IPv4 interface in ${cidr}`);
    process.exit(1);
  }
  process.stdout.write(ip);
}
