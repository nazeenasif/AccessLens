// Proxy behaviour tests (task T043; implementation T050). ADR-0001 §2 and Amendment 4; research R3.
// The proxy reuses the shared URL policy and test mode: `resolveAndCheck` for every destination
// (IP literals refused, every answer must be public IPv4 or, in test mode, inside the fixture
// subnet) and `parseTestModeConfig` for test mode. It has no range list of its own.
//
// API expected from T050 (services/egress-proxy/src/proxy.ts):
//   createProxyServer(options: {
//     registry: CredentialRegistry;                               // T048
//     testMode: TestModeConfig;                                   // parseTestModeConfig (T190)
//     caps: { maxRequests: number; maxBytes: number };            // SCAN_MAX_REQUESTS / SCAN_MAX_BYTES
//     resolve?: ResolveIPv4;                                      // default resolveIPv4 (resolve4)
//     connect?: (address: string, port: number) => net.Socket;    // default net.connect
//   }): http.Server
// Statuses: 407 without currently registered credentials; 403 for every policy refusal (port,
// destination, test mode, caps). A refused destination is recorded with
// registry.recordBlocked(auditId, host, reason), and a reached cap with registry.markCapped.
//
// No test reaches the internet. `connect` is stubbed to record the validated address and port, then
// open a socket to a local test server instead.
import { once } from "node:events";
import { createServer, request, type Server } from "node:http";
import {
  connect as tcpConnect,
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
} from "node:net";
import { parseTestModeConfig } from "@accesslens/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CredentialRegistry } from "../../src/credentials.ts";
import { createProxyServer } from "../../src/proxy.ts";

const CREDS = { username: "audit-a-user", password: "a".repeat(43) };
const AUTH = `Basic ${Buffer.from(`${CREDS.username}:${CREDS.password}`).toString("base64")}`;
const BODY = "x".repeat(50); // what the local HTTP target serves
const PRODUCTION = parseTestModeConfig({});
const TEST_MODE = parseTestModeConfig({
  ACCESSLENS_TEST_MODE: "true",
  ACCESSLENS_TEST_ALLOWLIST: "fixtures.test",
  ACCESSLENS_TEST_FIXTURE_SUBNET: "172.30.50.0/24",
});

const servers: (Server | TcpServer)[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((done) => s.close(() => done()))),
  );
});

const listen = async <S extends Server | TcpServer>(server: S): Promise<number> => {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
};

let httpTargetPort = 0;
let tcpEchoPort = 0;
beforeEach(async () => {
  httpTargetPort = await listen(createServer((_req, res) => res.end(BODY)));
  tcpEchoPort = await listen(createTcpServer((socket) => socket.pipe(socket)));
});

type Answers = Record<string, string[]>;

async function startProxy(options: {
  answers: Answers | ((host: string, call: number) => string[]);
  testMode?: ReturnType<typeof parseTestModeConfig>;
  caps?: { maxRequests: number; maxBytes: number };
}) {
  const registry = new CredentialRegistry({ ttlMs: 60_000 });
  registry.register("audit-a", CREDS);
  const lookups: string[] = [];
  const connections: { address: string; port: number }[] = [];
  const resolve = async (host: string) => {
    lookups.push(host);
    const answer =
      typeof options.answers === "function"
        ? options.answers(host, lookups.filter((h) => h === host).length)
        : options.answers[host];
    if (!answer) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return answer;
  };
  const connect = (address: string, port: number) => {
    connections.push({ address, port });
    return tcpConnect(port === 80 ? httpTargetPort : tcpEchoPort, "127.0.0.1");
  };
  const proxy = createProxyServer({
    registry,
    testMode: options.testMode ?? PRODUCTION,
    caps: options.caps ?? { maxRequests: 100, maxBytes: 1_000_000 },
    resolve,
    connect,
  });
  const port = await listen(proxy);
  return { port, registry, lookups, connections };
}

/** A CONNECT request through the proxy; resolves with the response status. */
function connectVia(proxyPort: number, target: string, auth: string | undefined = AUTH) {
  return new Promise<{ status: number; echo?: string }>((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "CONNECT",
      path: target,
      headers: auth === undefined ? {} : { "Proxy-Authorization": auth },
    });
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        resolve({ status: res.statusCode ?? 0 });
        return;
      }
      socket.write("ping");
      socket.once("data", (data) => {
        socket.destroy();
        resolve({ status: 200, echo: data.toString() });
      });
    });
    req.on("response", (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on("error", reject);
    req.end();
  });
}

/** A plain-HTTP request through the proxy (absolute URL); resolves with status and body. */
function getVia(proxyPort: number, url: string, auth: string | undefined = AUTH) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: url,
      headers: {
        Host: new URL(url).host,
        ...(auth === undefined ? {} : { "Proxy-Authorization": auth }),
      },
    });
    req.on("response", (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const PUBLIC = { "example.com": ["93.184.216.34"] };

describe("credentials", () => {
  it("CONNECT without credentials → 407, with no lookup and no connection", async () => {
    const p = await startProxy({ answers: PUBLIC });
    expect((await connectVia(p.port, "example.com:443", undefined)).status).toBe(407);
    expect(p.lookups).toEqual([]);
    expect(p.connections).toEqual([]);
  });

  it("plain HTTP without credentials → 407", async () => {
    const p = await startProxy({ answers: PUBLIC });
    expect((await getVia(p.port, "http://example.com/", undefined)).status).toBe(407);
    expect(p.connections).toEqual([]);
  });

  it("revoked credentials → 407", async () => {
    const p = await startProxy({ answers: PUBLIC });
    p.registry.revoke("audit-a");
    expect((await connectVia(p.port, "example.com:443")).status).toBe(407);
  });
});

describe("CONNECT only to :443, HTTP only to :80", () => {
  it("CONNECT example.com:443 is tunnelled to the validated IP", async () => {
    const p = await startProxy({ answers: PUBLIC });
    expect(await connectVia(p.port, "example.com:443")).toEqual({ status: 200, echo: "ping" });
    expect(p.connections).toEqual([{ address: "93.184.216.34", port: 443 }]);
  });

  it("plain HTTP to example.com is forwarded to the validated IP on :80", async () => {
    const p = await startProxy({ answers: PUBLIC });
    expect(await getVia(p.port, "http://example.com/page")).toEqual({ status: 200, body: BODY });
    expect(p.connections).toEqual([{ address: "93.184.216.34", port: 80 }]);
  });

  it.each([
    ["CONNECT to :8443", () => ["connect", "example.com:8443"]],
    ["CONNECT to :80", () => ["connect", "example.com:80"]],
    ["CONNECT to :22", () => ["connect", "example.com:22"]],
    ["HTTP to :8080", () => ["get", "http://example.com:8080/"]],
    ["HTTP to :443", () => ["get", "http://example.com:443/"]],
  ])("%s → 403, no connection", async (_case, target) => {
    const p = await startProxy({ answers: PUBLIC });
    const [kind, where] = target() as [string, string];
    const status =
      kind === "connect"
        ? (await connectVia(p.port, where)).status
        : (await getVia(p.port, where)).status;
    expect(status).toBe(403);
    expect(p.connections).toEqual([]);
  });
});

describe("IPv4-only resolve-once and destination checks", () => {
  it("resolves the host exactly once per request", async () => {
    const p = await startProxy({ answers: PUBLIC });
    await connectVia(p.port, "example.com:443");
    expect(p.lookups).toEqual(["example.com"]);
  });

  it.each([
    ["RFC 1918", { "internal.example": ["10.0.0.5"] }, "internal.example"],
    ["loopback", { "loop.example": ["127.0.0.1"] }, "loop.example"],
    ["cloud metadata", { "meta.example": ["169.254.169.254"] }, "meta.example"],
    [
      "mixed public and private",
      { "mixed.example": ["93.184.216.34", "10.0.0.5"] },
      "mixed.example",
    ],
    ["an IPv6 answer", { "v6.example": ["2606:4700:4700::1111"] }, "v6.example"],
  ])(
    "a %s answer → 403, the host recorded as blocked, no connection",
    async (_case, answers, host) => {
      const p = await startProxy({ answers });
      expect((await connectVia(p.port, `${host}:443`)).status).toBe(403);
      expect(p.registry.usage("audit-a")?.blockedHosts).toContain(host);
      expect(p.connections).toEqual([]);
    },
  );

  it("an IP-literal CONNECT target → 403 without any lookup", async () => {
    const p = await startProxy({ answers: PUBLIC });
    expect((await connectVia(p.port, "10.0.0.1:443")).status).toBe(403);
    expect(p.lookups).toEqual([]);
    expect(p.connections).toEqual([]);
  });

  it("rebinding: the proxy connects to the first validated IP, never re-resolving", async () => {
    const p = await startProxy({
      answers: (_host, call) => (call === 1 ? ["93.184.216.34"] : ["127.0.0.1"]),
    });
    expect((await connectVia(p.port, "rebind.example:443")).status).toBe(200);
    expect(p.lookups).toEqual(["rebind.example"]);
    expect(p.connections).toEqual([{ address: "93.184.216.34", port: 443 }]);
  });
});

describe("per-audit request and byte caps", () => {
  it("counts requests and bytes for the audit", async () => {
    const p = await startProxy({ answers: PUBLIC });
    await getVia(p.port, "http://example.com/");
    expect(p.registry.usage("audit-a")).toMatchObject({ requests: 1 });
    expect(p.registry.usage("audit-a")?.bytes).toBeGreaterThanOrEqual(BODY.length);
  });

  it("the request cap refuses further requests and sets the cap flag", async () => {
    const p = await startProxy({ answers: PUBLIC, caps: { maxRequests: 2, maxBytes: 1_000_000 } });
    expect((await getVia(p.port, "http://example.com/")).status).toBe(200);
    expect((await getVia(p.port, "http://example.com/")).status).toBe(200);
    expect((await getVia(p.port, "http://example.com/")).status).toBe(403);
    expect(p.registry.usage("audit-a")?.capped.requests).toBe(true);
    expect(p.connections).toHaveLength(2);
  });

  it("the byte cap refuses further requests and sets the cap flag", async () => {
    const p = await startProxy({ answers: PUBLIC, caps: { maxRequests: 100, maxBytes: 10 } });
    expect((await getVia(p.port, "http://example.com/")).status).toBe(200);
    expect((await getVia(p.port, "http://example.com/")).status).toBe(403);
    expect(p.registry.usage("audit-a")?.capped.bytes).toBe(true);
  });
});

describe("test mode (ADR-0001 Amendment 4; proposal test 4)", () => {
  it("an allowlisted host resolving inside 172.30.50.0/24 is served", async () => {
    const p = await startProxy({
      answers: { "fixtures.test": ["172.30.50.10"] },
      testMode: TEST_MODE,
    });
    expect((await connectVia(p.port, "fixtures.test:443")).status).toBe(200);
    expect(p.connections).toEqual([{ address: "172.30.50.10", port: 443 }]);
  });

  it("a non-allowlisted PUBLIC host is refused in test mode", async () => {
    const p = await startProxy({ answers: PUBLIC, testMode: TEST_MODE });
    expect((await connectVia(p.port, "example.com:443")).status).toBe(403);
    expect(p.connections).toEqual([]);
  });

  it.each([
    ["a public address", ["93.184.216.34"]],
    ["another private range", ["10.0.0.5"]],
    ["the neighbouring outbound subnet", ["172.30.40.30"]],
  ])("an allowlisted host resolving to %s is refused", async (_case, answer) => {
    const p = await startProxy({ answers: { "fixtures.test": answer }, testMode: TEST_MODE });
    expect((await connectVia(p.port, "fixtures.test:443")).status).toBe(403);
    expect(p.connections).toEqual([]);
  });

  it("outside test mode ACCESSLENS_TEST_ALLOWLIST is ignored", async () => {
    // The allowlist variables are present but test mode is off, so they change nothing.
    const off = parseTestModeConfig({
      ACCESSLENS_TEST_ALLOWLIST: "fixtures.test",
      ACCESSLENS_TEST_FIXTURE_SUBNET: "172.30.50.0/24",
    });
    const p = await startProxy({
      answers: { "fixtures.test": ["172.30.50.10"], ...PUBLIC },
      testMode: off,
    });
    expect((await connectVia(p.port, "fixtures.test:443")).status).toBe(403);
    expect((await connectVia(p.port, "example.com:443")).status).toBe(200);
  });
});
