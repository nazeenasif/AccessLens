// Filtering forward proxy (task T050). ADR-0001 §2 and Amendment 4; research R3;
// contracts/internal-egress-proxy.md §2.
// - 407 without currently registered credentials, before any lookup or connection.
// - CONNECT only to :443 and plain HTTP only to :80; everything else is 403.
// - Every destination goes through the shared resolveAndCheck: IP literals are refused before DNS,
//   the host is resolved once (IPv4 only), every answer must be public (or, in test mode, inside
//   the fixture subnet), and the proxy connects to that validated address without re-resolving.
// - Test mode serves only allowlisted hosts.
// - Per-audit request and byte caps; reaching one refuses further requests with 403.
import { createServer, request, type IncomingMessage, type Server } from "node:http";
import { connect as netConnect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import {
  resolveAndCheck,
  resolveIPv4,
  type ResolveIPv4,
  type TestModeConfig,
} from "@accesslens/shared";
import type { CredentialRegistry } from "./credentials.ts";

export type Caps = { maxRequests: number; maxBytes: number };

type Options = {
  registry: CredentialRegistry;
  testMode: TestModeConfig;
  caps: Caps;
  resolve?: ResolveIPv4;
  connect?: (address: string, port: number) => Socket;
};

type Decision =
  { ok: true; auditId: string; host: string; address: string } | { ok: false; status: number };

const STATUS_TEXT: Record<number, string> = {
  403: "Forbidden",
  407: "Proxy Authentication Required",
  502: "Bad Gateway",
};

// Hop-by-hop headers (RFC 9110 §7.6.1) and the proxy's own credentials never go upstream.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const CONNECT_TARGET = /^(.+):([0-9]+)$/;

/** The host of a CONNECT target, or undefined unless the target is host:443. */
function connectHost(target: string | undefined): string | undefined {
  const match = CONNECT_TARGET.exec(target ?? "");
  if (match?.[1] === undefined || match[2] !== "443") return undefined;
  return match[1];
}

/** The host for an absolute-form http:// request on port 80, or undefined otherwise. */
function httpTarget(target: string | undefined): URL | undefined {
  let url: URL;
  try {
    url = new URL(target ?? "");
  } catch {
    return undefined;
  }
  // WHATWG parsing drops the default port, so "" is :80; any explicit port is refused.
  if (url.protocol !== "http:" || url.port !== "" || url.username !== "" || url.password !== "") {
    return undefined;
  }
  return url;
}

export function createProxyServer(options: Options): Server {
  const { registry, testMode, caps } = options;
  const resolve = options.resolve ?? resolveIPv4;
  const connect = options.connect ?? ((address, port) => netConnect({ host: address, port }));
  const allowance = testMode.enabled
    ? { hosts: testMode.allowlist, subnet: testMode.fixtureSubnet }
    : undefined;

  /** Applies the auth, port, cap, and destination rules, in that order. */
  async function decide(req: IncomingMessage, host: string | undefined): Promise<Decision> {
    const auth = registry.authorize(req.headers["proxy-authorization"]);
    if (!auth.ok) return { ok: false, status: 407 };
    const { auditId } = auth;
    if (host === undefined) return { ok: false, status: 403 };

    const usage = registry.usage(auditId);
    if (usage === undefined) return { ok: false, status: 407 };
    if (usage.requests >= caps.maxRequests) {
      registry.markCapped(auditId, "requests");
      return { ok: false, status: 403 };
    }
    if (usage.bytes >= caps.maxBytes) {
      registry.markCapped(auditId, "bytes");
      return { ok: false, status: 403 };
    }

    // Test mode serves only allowlisted hosts (exact match), and never looks the others up.
    if (allowance !== undefined && !allowance.hosts.includes(host)) {
      registry.recordBlocked(auditId, host, "not_allowlisted");
      return { ok: false, status: 403 };
    }

    const check = await resolveAndCheck(host, resolve, allowance);
    if (!check.ok) {
      if (check.code === "TARGET_UNREACHABLE") return { ok: false, status: 502 };
      const reason =
        check.detail?.reason ?? (allowance === undefined ? "non_public" : "outside_fixture_subnet");
      registry.recordBlocked(auditId, host, reason);
      return { ok: false, status: 403 };
    }
    const address = check.addresses[0];
    if (address === undefined) return { ok: false, status: 502 };
    registry.recordRequest(auditId);
    return { ok: true, auditId, host, address };
  }

  /**
   * Counts bytes for the audit and stops the transfer once the byte cap has been reached or the
   * audit's credentials have been revoked or have expired. The chunk that crosses the cap is still
   * delivered, so a cap overshoots by at most one chunk.
   */
  function meter(auditId: string, stop: () => void) {
    return (chunk: Buffer): boolean => {
      const usage = registry.usage(auditId);
      if (usage === undefined || !registry.isActive(auditId)) {
        stop();
        return false;
      }
      if (usage.bytes >= caps.maxBytes) {
        registry.markCapped(auditId, "bytes");
        stop();
        return false;
      }
      registry.recordBytes(auditId, chunk.length);
      return true;
    };
  }

  const server = createServer((req, res) => {
    const url = httpTarget(req.url);
    void decide(req, url?.hostname)
      .then((decision) => {
        if (!decision.ok || url === undefined) {
          const status = decision.ok ? 403 : decision.status;
          res.writeHead(status, {
            "Content-Length": "0",
            Connection: "close",
            ...(status === 407 ? { "Proxy-Authenticate": 'Basic realm="accesslens"' } : {}),
          });
          res.end();
          return;
        }
        const headers: Record<string, string | string[]> = {};
        const listed = String(req.headers.connection ?? "")
          .toLowerCase()
          .split(",")
          .map((h) => h.trim());
        for (const [name, value] of Object.entries(req.headers)) {
          if (value === undefined || HOP_BY_HOP.has(name) || listed.includes(name)) continue;
          headers[name] = value;
        }
        headers.host = url.host;

        const stop = () => {
          upstream.destroy();
          res.destroy();
        };
        const count = meter(decision.auditId, stop);
        const upstream = request({
          method: req.method,
          path: `${url.pathname}${url.search}`,
          headers,
          // Connect to the validated address only; nothing re-resolves the host.
          createConnection: () => connect(decision.address, 80),
        });
        upstream.on("response", (upstreamRes) => {
          const out: Record<string, string | string[]> = {};
          for (const [name, value] of Object.entries(upstreamRes.headers)) {
            if (value !== undefined && !HOP_BY_HOP.has(name)) out[name] = value;
          }
          res.writeHead(upstreamRes.statusCode ?? 502, out);
          upstreamRes.on("data", (chunk: Buffer) => {
            if (count(chunk)) res.write(chunk);
          });
          upstreamRes.on("end", () => res.end());
          upstreamRes.on("error", stop);
        });
        upstream.on("error", () => {
          if (!res.headersSent) res.writeHead(502, { "Content-Length": "0" }).end();
          else res.destroy();
        });
        req.on("data", (chunk: Buffer) => {
          if (count(chunk)) upstream.write(chunk);
        });
        req.on("end", () => upstream.end());
        req.on("error", stop);
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(502, { "Content-Length": "0" }).end();
        else res.destroy();
      });
  });

  server.on("connect", (req: IncomingMessage, client: Duplex, head: Buffer) => {
    client.on("error", () => client.destroy());
    const refuse = (status: number) => {
      const challenge = status === 407 ? 'Proxy-Authenticate: Basic realm="accesslens"\r\n' : "";
      client.end(
        `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\n${challenge}` +
          "Content-Length: 0\r\nConnection: close\r\n\r\n",
      );
    };
    void decide(req, connectHost(req.url))
      .then((decision) => {
        if (!decision.ok) return refuse(decision.status);
        // Connect to the validated address only; nothing re-resolves the host.
        const upstream = connect(decision.address, 443);
        const stop = () => {
          upstream.destroy();
          client.destroy();
        };
        const count = meter(decision.auditId, stop);
        upstream.once("error", () => (upstream.readyState === "opening" ? refuse(502) : stop()));
        upstream.once("connect", () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length > 0 && count(head)) upstream.write(head);
          upstream.on("data", (chunk: Buffer) => {
            if (count(chunk)) client.write(chunk);
          });
          client.on("data", (chunk: Buffer) => {
            if (count(chunk)) upstream.write(chunk);
          });
          upstream.on("end", () => client.end());
          client.on("end", () => upstream.end());
          upstream.on("close", () => client.destroy());
          client.on("close", () => upstream.destroy());
        });
      })
      .catch(() => refuse(502));
  });

  return server;
}
