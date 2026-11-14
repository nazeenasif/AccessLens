// Credential-registry tests (task T041; implementation T048). ADR-0001 §2: before each audit the
// scanner registers a fresh random credential pair; every request without currently registered
// credentials gets 407; credentials expire after the total audit timeout (SCAN_TOTAL_TIMEOUT_MS);
// requests and bytes are attributed per audit.
//
// API expected from T048 (services/egress-proxy/src/credentials.ts):
//   export type Credentials = { username: string; password: string };
//   export type Usage = {
//     requests: number; bytes: number; blockedHosts: string[];
//     capped: { requests: boolean; bytes: boolean };
//   };
//   export class CredentialRegistry {
//     constructor(options: { ttlMs: number; now?: () => number; logger?: ProxyLogger });
//     register(auditId: string, credentials: Credentials): void;
//     revoke(auditId: string): void;
//     authorize(proxyAuthorization: string | undefined):
//       { ok: true; auditId: string } | { ok: false; status: 407 };
//     recordRequest(auditId: string): void;
//     recordBytes(auditId: string, bytes: number): void;
//     recordBlocked(auditId: string, host: string, reason: string): void; // used by T043/T046
//     markCapped(auditId: string, cap: "requests" | "bytes"): void;       // used by T043/T046
//     usage(auditId: string): Usage | undefined;
//     sweep(): void; // drops expired credentials (main.ts runs it on a timer)
//   }
// `ttlMs` is SCAN_TOTAL_TIMEOUT_MS, wired by main.ts (T051).
import { describe, expect, it } from "vitest";
import { CredentialRegistry } from "../../src/credentials.ts";

const TTL = 60_000;
const basic = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

function registry(start = 1_000_000) {
  let now = start;
  const reg = new CredentialRegistry({ ttlMs: TTL, now: () => now });
  return {
    reg,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const A = { username: "audit-a-user", password: "a".repeat(43) };
const B = { username: "audit-b-user", password: "b".repeat(43) };

describe("register and authorize", () => {
  it("authorizes registered credentials and returns their audit", () => {
    const { reg } = registry();
    reg.register("audit-a", A);
    expect(reg.authorize(basic(A.username, A.password))).toEqual({ ok: true, auditId: "audit-a" });
  });

  it("keeps audits apart", () => {
    const { reg } = registry();
    reg.register("audit-a", A);
    reg.register("audit-b", B);
    expect(reg.authorize(basic(B.username, B.password))).toEqual({ ok: true, auditId: "audit-b" });
  });
});

describe("unknown, wrong, or malformed credentials → 407", () => {
  it.each([
    ["no Proxy-Authorization header", undefined],
    ["an empty header", ""],
    ["an unknown user", basic("nobody", A.password)],
    ["a wrong password", basic(A.username, "wrong")],
    ["another audit's password", basic(A.username, B.password)],
    ["a scheme other than Basic", `Bearer ${A.password}`],
    ["undecodable base64", "Basic %%%"],
    ["no colon in the decoded value", `Basic ${Buffer.from(A.username).toString("base64")}`],
  ])("%s", (_case, header) => {
    const { reg } = registry();
    reg.register("audit-a", A);
    reg.register("audit-b", B);
    expect(reg.authorize(header)).toEqual({ ok: false, status: 407 });
  });
});

describe("revocation", () => {
  it("revoked credentials get 407", () => {
    const { reg } = registry();
    reg.register("audit-a", A);
    reg.revoke("audit-a");
    expect(reg.authorize(basic(A.username, A.password))).toEqual({ ok: false, status: 407 });
  });

  it("revoking one audit leaves the others authorized", () => {
    const { reg } = registry();
    reg.register("audit-a", A);
    reg.register("audit-b", B);
    reg.revoke("audit-a");
    expect(reg.authorize(basic(B.username, B.password))).toEqual({ ok: true, auditId: "audit-b" });
  });

  it("revoking an unknown audit is harmless", () => {
    const { reg } = registry();
    expect(() => reg.revoke("never-registered")).not.toThrow();
  });
});

describe("auto-expiry after SCAN_TOTAL_TIMEOUT_MS", () => {
  it("credentials still work just before the timeout", () => {
    const { reg, advance } = registry();
    reg.register("audit-a", A);
    advance(TTL - 1);
    expect(reg.authorize(basic(A.username, A.password))).toEqual({ ok: true, auditId: "audit-a" });
  });

  it("credentials get 407 once the timeout has passed", () => {
    const { reg, advance } = registry();
    reg.register("audit-a", A);
    advance(TTL);
    expect(reg.authorize(basic(A.username, A.password))).toEqual({ ok: false, status: 407 });
  });

  it("sweep drops expired audits", () => {
    const { reg, advance } = registry();
    reg.register("audit-a", A);
    advance(TTL);
    reg.sweep();
    expect(reg.usage("audit-a")).toBeUndefined();
  });
});

describe("per-audit request and byte counters", () => {
  it("count requests and bytes for the audit", () => {
    const { reg } = registry();
    reg.register("audit-a", A);
    reg.recordRequest("audit-a");
    reg.recordRequest("audit-a");
    reg.recordRequest("audit-a");
    reg.recordBytes("audit-a", 100);
    reg.recordBytes("audit-a", 50);
    expect(reg.usage("audit-a")).toMatchObject({ requests: 3, bytes: 150 });
  });

  it("start at zero and never mix audits", () => {
    const { reg } = registry();
    reg.register("audit-a", A);
    reg.register("audit-b", B);
    reg.recordRequest("audit-a");
    reg.recordBytes("audit-a", 999);
    expect(reg.usage("audit-b")).toMatchObject({ requests: 0, bytes: 0 });
    expect(reg.usage("audit-a")).toMatchObject({ requests: 1, bytes: 999 });
  });

  it("an unknown audit has no usage", () => {
    const { reg } = registry();
    expect(reg.usage("never-registered")).toBeUndefined();
  });
});
