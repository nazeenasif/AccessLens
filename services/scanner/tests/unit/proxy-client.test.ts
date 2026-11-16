// Proxy-client tests (task T054; implementation T056). ADR-0001 §2: before each audit the scanner
// registers a fresh random credential pair with the egress-proxy control endpoint, the audit's
// context uses it, and the scanner revokes it when the context closes; it reads cap breaches and
// blocked hosts from the same endpoint. contracts/internal-egress-proxy.md §1 (routes, statuses,
// control port 3129).
//
// The client is tested against the egress-proxy's real control handler and credential registry
// (services/egress-proxy/src), so the two sides of the contract can't drift apart.
//
// API expected from T056 (services/scanner/src/proxy-client.ts):
//   export type ProxyCredentials = { username: string; password: string };
//   export type ProxyUsage = {
//     auditId: string; requests: number; bytes: number; blockedHosts: string[];
//     capped: { requests: boolean; bytes: boolean };
//   };
//   export function controlUrlFrom(egressProxyAddr: string): string;
//     // "172.30.30.30:3128" → "http://172.30.30.30:3129" (contract §1 dated addition)
//   export function createProxyClient(options: { controlUrl: string; token: string }): {
//     register(auditId: string): Promise<ProxyCredentials>;  // generates a fresh random pair
//     revoke(auditId: string): Promise<void>;
//     usage(auditId: string): Promise<ProxyUsage>;
//   };
//   export function runWithAuditProxy<T>(client, auditId: string, steps: {
//     run(credentials: ProxyCredentials): Promise<T>;        // opens the context, runs the audit
//     terminal(outcome: { result?: T; error?: unknown; usage?: ProxyUsage }): Promise<void> | void;
//   }): Promise<void>;
//     // Order: register → run → usage → terminal, then revoke in `finally`.
//     // register fails → run is never called; terminal gets the error; revoke still runs.
//     // run fails → usage is still read and terminal gets { error, usage }.
//     // usage fails → terminal still runs, without usage.
//     // revoke runs even if terminal throws; a failed revoke doesn't reject (the proxy also
//     // expires the credentials after SCAN_TOTAL_TIMEOUT_MS).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createControlHandler } from "../../../egress-proxy/src/control.ts";
import { CredentialRegistry } from "../../../egress-proxy/src/credentials.ts";
import {
  controlUrlFrom,
  createProxyClient,
  runWithAuditProxy,
  type ProxyCredentials,
  type ProxyUsage,
} from "../../src/proxy-client.ts";

const TOKEN = "t".repeat(48);
const basic = (c: ProxyCredentials) =>
  `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`;

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

/** The real egress-proxy control endpoint on a local port. */
async function startControl(token = TOKEN) {
  const registry = new CredentialRegistry({ ttlMs: 60_000 });
  server = createServer(
    createControlHandler({ token, registry, rateLimit: { max: 1000, windowMs: 60_000 } }),
  );
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", () => done()));
  const controlUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  return { registry, controlUrl, client: createProxyClient({ controlUrl, token: TOKEN }) };
}

describe("controlUrlFrom", () => {
  it("uses the proxy's fixed IP with the control port 3129", () => {
    expect(controlUrlFrom("172.30.30.30:3128")).toBe("http://172.30.30.30:3129");
  });
});

describe("register", () => {
  it("registers a fresh pair that the proxy then accepts", async () => {
    const { client, registry } = await startControl();
    const creds = await client.register("audit-a");
    expect(registry.authorize(basic(creds))).toEqual({ ok: true, auditId: "audit-a" });
  });

  it("generates random credentials: at least 32 random bytes of password, a new pair each time", async () => {
    const { client } = await startControl();
    const a = await client.register("audit-a");
    const b = await client.register("audit-b");
    expect(a.password).toMatch(/^[A-Za-z0-9_-]{43,}$/); // base64url of ≥ 32 bytes
    expect(a.username).not.toContain(":");
    expect(a.username).not.toBe(b.username);
    expect(a.password).not.toBe(b.password);
  });

  it("rejects when the proxy refuses, without exposing the token or the password", async () => {
    const { controlUrl } = await startControl("x".repeat(48)); // the proxy expects another token
    const client = createProxyClient({ controlUrl, token: TOKEN });
    const error = await client.register("audit-a").then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain("401");
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  // Review 2026-11-16: the request itself fails (nothing listens on the port), so fetch rejects
  // before any HTTP status exists. Neither the error nor anything it carries contains the token.
  it("rejects when the control endpoint can't be reached, without exposing the token", async () => {
    const closed = createServer();
    await new Promise<void>((done) => closed.listen(0, "127.0.0.1", () => done()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((done) => closed.close(() => done()));
    const client = createProxyClient({ controlUrl: `http://127.0.0.1:${port}`, token: TOKEN });
    for (const call of [
      () => client.register("audit-a"),
      () => client.revoke("audit-a"),
      () => client.usage("audit-a"),
    ]) {
      const error = await call().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      // inspect() includes the message, the stack and any `cause` chain.
      expect(inspect(error, { depth: 10 })).not.toContain(TOKEN);
    }
  });
});

describe("revoke and usage", () => {
  it("revoke makes the proxy refuse the pair", async () => {
    const { client, registry } = await startControl();
    const creds = await client.register("audit-a");
    await client.revoke("audit-a");
    expect(registry.authorize(basic(creds))).toEqual({ ok: false, status: 407 });
  });

  it("usage returns the proxy's per-audit view", async () => {
    const { client, registry } = await startControl();
    await client.register("audit-a");
    registry.recordRequest("audit-a");
    registry.recordBytes("audit-a", 2048);
    registry.recordBlocked("audit-a", "internal.example", "non_public");
    registry.markCapped("audit-a", "requests");
    expect(await client.usage("audit-a")).toEqual({
      auditId: "audit-a",
      requests: 1,
      bytes: 2048,
      blockedHosts: ["internal.example"],
      capped: { requests: true, bytes: false },
    });
  });

  it("usage of an unknown audit rejects", async () => {
    const { client } = await startControl();
    await expect(client.usage("never-registered")).rejects.toThrow();
  });
});

/** A fake client that records the order of calls; each step can be made to fail. */
function recordingClient(fail: Partial<Record<"register" | "usage" | "revoke", boolean>> = {}) {
  const calls: string[] = [];
  const usage: ProxyUsage = {
    auditId: "audit-a",
    requests: 3,
    bytes: 100,
    blockedHosts: [],
    capped: { requests: false, bytes: false },
  };
  const client = {
    register: async (id: string) => {
      calls.push(`register:${id}`);
      if (fail.register) throw new Error("register failed");
      return { username: "u", password: "p".repeat(43) };
    },
    usage: async (id: string) => {
      calls.push(`usage:${id}`);
      if (fail.usage) throw new Error("usage failed");
      return usage;
    },
    revoke: async (id: string) => {
      calls.push(`revoke:${id}`);
      if (fail.revoke) throw new Error("revoke failed");
    },
  };
  return { client, calls, usage };
}

describe("runWithAuditProxy: register before the context, revoke in finally, counters before the terminal event", () => {
  it("runs register → run → usage → terminal → revoke, and run gets the registered pair", async () => {
    const { client, calls, usage } = recordingClient();
    let seen: ProxyCredentials | undefined;
    let outcome: unknown;
    await runWithAuditProxy(client, "audit-a", {
      run: async (credentials) => {
        calls.push("run");
        seen = credentials;
        return "result";
      },
      terminal: (o) => {
        calls.push("terminal");
        outcome = o;
      },
    });
    expect(calls).toEqual([
      "register:audit-a",
      "run",
      "usage:audit-a",
      "terminal",
      "revoke:audit-a",
    ]);
    expect(seen).toEqual({ username: "u", password: "p".repeat(43) });
    expect(outcome).toEqual({ result: "result", usage });
  });

  it("when the audit fails, counters are still read before the terminal event, then revoke", async () => {
    const { client, calls, usage } = recordingClient();
    const failure = new Error("navigation failed");
    let outcome: { error?: unknown; usage?: ProxyUsage } | undefined;
    await runWithAuditProxy(client, "audit-a", {
      run: async () => {
        calls.push("run");
        throw failure;
      },
      terminal: (o) => {
        calls.push("terminal");
        outcome = o;
      },
    });
    expect(calls).toEqual([
      "register:audit-a",
      "run",
      "usage:audit-a",
      "terminal",
      "revoke:audit-a",
    ]);
    expect(outcome?.error).toBe(failure);
    expect(outcome?.usage).toEqual(usage);
  });

  it("when register fails, the context is never opened; terminal gets the error; revoke still runs", async () => {
    const { client, calls } = recordingClient({ register: true });
    let outcome: { error?: unknown } | undefined;
    await runWithAuditProxy(client, "audit-a", {
      run: async () => {
        calls.push("run");
        return "result";
      },
      terminal: (o) => {
        calls.push("terminal");
        outcome = o;
      },
    });
    expect(calls).not.toContain("run");
    expect(calls.at(-1)).toBe("revoke:audit-a");
    expect(calls.indexOf("terminal")).toBeGreaterThan(-1);
    expect(outcome?.error).toBeInstanceOf(Error);
  });

  it("when reading the counters fails, the terminal event is still emitted, then revoke", async () => {
    const { client, calls } = recordingClient({ usage: true });
    let outcome: { usage?: ProxyUsage; result?: unknown } | undefined;
    await runWithAuditProxy(client, "audit-a", {
      run: async () => "result",
      terminal: (o) => {
        calls.push("terminal");
        outcome = o;
      },
    });
    expect(calls).toEqual(["register:audit-a", "usage:audit-a", "terminal", "revoke:audit-a"]);
    expect(outcome?.usage).toBeUndefined();
    expect(outcome?.result).toBe("result");
  });

  it("revokes even if the terminal step throws", async () => {
    const { client, calls } = recordingClient();
    await runWithAuditProxy(client, "audit-a", {
      run: async () => "result",
      terminal: () => {
        throw new Error("emit failed");
      },
    }).catch(() => undefined);
    expect(calls.at(-1)).toBe("revoke:audit-a");
  });

  it("a failed revoke doesn't reject (the proxy also expires the pair)", async () => {
    const { client } = recordingClient({ revoke: true });
    await expect(
      runWithAuditProxy(client, "audit-a", {
        run: async () => "result",
        terminal: () => undefined,
      }),
    ).resolves.toBeUndefined();
  });

  it("end to end: the pair works during the run and is refused after", async () => {
    const { client, registry } = await startControl();
    let during: unknown;
    let creds: ProxyCredentials | undefined;
    await runWithAuditProxy(client, "audit-a", {
      run: async (c) => {
        creds = c;
        during = registry.authorize(basic(c));
        return "result";
      },
      terminal: () => undefined,
    });
    expect(during).toEqual({ ok: true, auditId: "audit-a" });
    expect(registry.authorize(basic(creds!))).toEqual({ ok: false, status: 407 });
  });
});
