// Unit check for the T020 bind-address selector (runs without Docker).
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { inCidr, pickAddress } from "../../apps/web/scripts/public-ip.mjs";

const iface = (address: string, internal = false) => ({ address, family: "IPv4", internal });

describe("public-ip.mjs (T020)", () => {
  it("matches addresses inside the CIDR only", () => {
    expect(inCidr("172.30.10.10", "172.30.10.0/24")).toBe(true);
    expect(inCidr("172.30.20.10", "172.30.10.0/24")).toBe(false);
    expect(inCidr("10.0.0.1", "0.0.0.0/0")).toBe(true);
  });

  it("picks the public-network address and ignores scan-ctl and loopback", () => {
    const ifs = {
      lo: [iface("127.0.0.1", true)],
      eth0: [iface("172.30.20.10")], // scan-ctl
      eth1: [iface("172.30.10.10")], // public
    };
    expect(pickAddress(ifs, "172.30.10.0/24")).toBe("172.30.10.10");
  });

  it("returns null (fail closed) when no interface or more than one matches", () => {
    expect(pickAddress({ eth0: [iface("172.30.20.10")] }, "172.30.10.0/24")).toBeNull();
    expect(
      pickAddress({ a: [iface("172.30.10.10")], b: [iface("172.30.10.11")] }, "172.30.10.0/24"),
    ).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(() => inCidr("172.30.10", "172.30.10.0/24")).toThrow();
    expect(() => inCidr("172.30.10.10", "172.30.10.0/33")).toThrow();
  });
});
