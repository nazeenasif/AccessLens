// Control-endpoint tests (task T042; implementation T049). ADR-0001 §2: the scanner registers and
// revokes per-audit credentials and reads cap breaches and blocked hosts here. The browser shares
// the scanner's network namespace and can reach this endpoint, so it is protected by the token
// (constant-time compare), rate limiting, and read-only per-audit views that never expose any
// audit's credentials.
//
// API expected from T049 (services/egress-proxy/src/control.ts):
//   createControlHandler(options: {
//     token: string;                                   // PROXY_CONTROL_TOKEN
//     registry: CredentialRegistry;                    // T048
//     rateLimit: { max: number; windowMs: number };    // every request counts, authenticated or not
//     now?: () => number;
//   }): (req: http.IncomingMessage, res: http.ServerResponse) => void
// Routes (token in the `X-Proxy-Control-Token` header):
//   POST   /audits/{auditId}/credentials  body { username, password }  → 201
//   DELETE /audits/{auditId}/credentials                               → 204
//   GET    /audits/{auditId}  → 200 { auditId, requests, bytes, blockedHosts, capped }; 404 if unknown
// Any other route → 404. Missing or wrong token → 401. Over the rate limit → 429.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createControlHandler } from "../../src/control.ts";
import { CredentialRegistry } from "../../src/credentials.ts";

const TOKEN = "t".repeat(48);
const A = { username: "audit-a-user", password: "a".repeat(43) };
const B = { username: "audit-b-user", password: "b".repeat(43) };

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

async function start(rateLimit = { max: 1000, windowMs: 60_000 }) {
  let now = 1_000_000;
  const registry = new CredentialRegistry({ ttlMs: 60_000, now: () => now });
  const handler = createControlHandler({ token: TOKEN, registry, rateLimit, now: () => now });
  server = createServer(handler);
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", () => done()));
  const port = (server!.address() as AddressInfo).port;
  const call = (method: string, path: string, options: { token?: string; body?: unknown } = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(options.token === undefined ? {} : { "X-Proxy-Control-Token": options.token }),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  return {
    registry,
    call,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("PROXY_CONTROL_TOKEN", () => {
  it.each([
    ["missing", undefined],
    ["wrong, same length", "x".repeat(TOKEN.length)],
    ["wrong, shorter", "short"],
    ["wrong, longer", TOKEN + "x"],
    ["empty", ""],
  ])("a %s token → 401 on every route", async (_case, token) => {
    const { call } = await start();
    const opts = token === undefined ? {} : { token };
    expect((await call("POST", "/audits/audit-a/credentials", { ...opts, body: A })).status).toBe(
      401,
    );
    expect((await call("DELETE", "/audits/audit-a/credentials", opts)).status).toBe(401);
    expect((await call("GET", "/audits/audit-a", opts)).status).toBe(401);
  });

  it("the correct token is accepted", async () => {
    const { call } = await start();
    const res = await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    expect(res.status).toBe(201);
  });

  it("the token is compared in constant time (crypto.timingSafeEqual)", () => {
    const source = readFileSync(new URL("../../src/control.ts", import.meta.url), "utf8");
    expect(source).toContain("timingSafeEqual");
  });
});

describe("registration through the endpoint", () => {
  it("registers and revokes credentials in the registry", async () => {
    const { call, registry } = await start();
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    const header = `Basic ${Buffer.from(`${A.username}:${A.password}`).toString("base64")}`;
    expect(registry.authorize(header)).toEqual({ ok: true, auditId: "audit-a" });
    expect((await call("DELETE", "/audits/audit-a/credentials", { token: TOKEN })).status).toBe(
      204,
    );
    expect(registry.authorize(header)).toEqual({ ok: false, status: 407 });
  });
});

describe("read-only per-audit views", () => {
  it("returns the audit's usage, blocked hosts, and cap flags", async () => {
    const { call, registry } = await start();
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    registry.recordRequest("audit-a");
    registry.recordBytes("audit-a", 512);
    registry.recordBlocked("audit-a", "internal.example", "non_public");
    registry.markCapped("audit-a", "bytes");
    const res = await call("GET", "/audits/audit-a", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      auditId: "audit-a",
      requests: 1,
      bytes: 512,
      blockedHosts: ["internal.example"],
      capped: { requests: false, bytes: true },
    });
  });

  it("never returns any audit's credentials, its own included", async () => {
    const { call } = await start();
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    await call("POST", "/audits/audit-b/credentials", { token: TOKEN, body: B });
    for (const id of ["audit-a", "audit-b"]) {
      const text = await (await call("GET", `/audits/${id}`, { token: TOKEN })).text();
      for (const secret of [A.username, A.password, B.username, B.password]) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it("a view shows only its own audit", async () => {
    const { call, registry } = await start();
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    await call("POST", "/audits/audit-b/credentials", { token: TOKEN, body: B });
    registry.recordBlocked("audit-a", "only-a.example", "non_public");
    const view = (await (await call("GET", "/audits/audit-b", { token: TOKEN })).json()) as {
      auditId: string;
      blockedHosts: string[];
    };
    expect(view.auditId).toBe("audit-b");
    expect(view.blockedHosts).not.toContain("only-a.example");
  });

  it("reading a view changes nothing", async () => {
    const { call, registry } = await start();
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    registry.recordRequest("audit-a");
    const first = await (await call("GET", "/audits/audit-a", { token: TOKEN })).json();
    const second = await (await call("GET", "/audits/audit-a", { token: TOKEN })).json();
    expect(second).toEqual(first);
  });

  it.each([
    ["an unknown audit", "GET", "/audits/never-registered"],
    ["a list of audits", "GET", "/audits"],
    ["the credentials themselves", "GET", "/audits/audit-a/credentials"],
    ["an unknown route", "GET", "/"],
  ])("%s → 404", async (_case, method, path) => {
    const { call } = await start();
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    expect((await call(method, path, { token: TOKEN })).status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("refuses requests over the limit with 429, wrong-token attempts included", async () => {
    const { call } = await start({ max: 3, windowMs: 1_000 });
    for (let i = 0; i < 3; i++) {
      expect((await call("GET", "/audits/audit-a", { token: "wrong" })).status).toBe(401);
    }
    // The fourth request is refused even with the correct token: guessing burns the budget.
    expect((await call("GET", "/audits/audit-a", { token: TOKEN })).status).toBe(429);
  });

  it("allows requests again once the window has passed", async () => {
    const { call, advance } = await start({ max: 1, windowMs: 1_000 });
    await call("POST", "/audits/audit-a/credentials", { token: TOKEN, body: A });
    expect((await call("GET", "/audits/audit-a", { token: TOKEN })).status).toBe(429);
    advance(1_000);
    expect((await call("GET", "/audits/audit-a", { token: TOKEN })).status).toBe(200);
  });
});
