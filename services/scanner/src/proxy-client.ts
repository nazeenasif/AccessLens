// egress-proxy control client (task T056; tests T054). ADR-0001 §2: before each audit the scanner
// registers a fresh random credential pair, the audit's browser context uses it, and the scanner
// revokes it when the context closes; it reads cap breaches and blocked hosts from the same
// endpoint. Routes, statuses and the control port: contracts/internal-egress-proxy.md §1.
//
// The token is sent only in the X-Proxy-Control-Token header. It is never logged, never put in an
// error message, and never returned.
import { randomBytes } from "node:crypto";

export type ProxyCredentials = { username: string; password: string };
export type ProxyUsage = {
  auditId: string;
  requests: number;
  bytes: number;
  blockedHosts: string[];
  capped: { requests: boolean; bytes: boolean };
};
export type ProxyClient = {
  register(auditId: string): Promise<ProxyCredentials>;
  revoke(auditId: string): Promise<void>;
  usage(auditId: string): Promise<ProxyUsage>;
};

/** Contract §1, dated addition 2026-11-14. */
const CONTROL_PORT = 3129;
const TOKEN_HEADER = "X-Proxy-Control-Token";
/** Control calls are local; anything slower than this is treated as a failure. */
const CONTROL_TIMEOUT_MS = 5_000;

/** "172.30.30.30:3128" (EGRESS_PROXY_ADDR) → "http://172.30.30.30:3129". */
export function controlUrlFrom(egressProxyAddr: string): string {
  const host = egressProxyAddr.slice(0, egressProxyAddr.lastIndexOf(":"));
  if (host === "") throw new Error("EGRESS_PROXY_ADDR must be host:port");
  return `http://${host}:${CONTROL_PORT}`;
}

/** A fresh random pair: base64url, so no ":" (Basic auth splits at the first colon). */
function newCredentials(): ProxyCredentials {
  return {
    username: `audit-${randomBytes(16).toString("base64url")}`,
    password: randomBytes(32).toString("base64url"),
  };
}

const isUsage = (value: unknown, auditId: string): value is ProxyUsage => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const capped = v.capped as Record<string, unknown> | null | undefined;
  return (
    v.auditId === auditId &&
    typeof v.requests === "number" &&
    typeof v.bytes === "number" &&
    Array.isArray(v.blockedHosts) &&
    v.blockedHosts.every((h) => typeof h === "string") &&
    typeof capped === "object" &&
    capped !== null &&
    typeof capped.requests === "boolean" &&
    typeof capped.bytes === "boolean"
  );
};

export function createProxyClient(options: { controlUrl: string; token: string }): ProxyClient {
  const { controlUrl, token } = options;

  /** Errors name the method, route and status only. */
  const call = async (method: string, path: string, expected: number, body?: unknown) => {
    let res: Response;
    try {
      res = await fetch(`${controlUrl}${path}`, {
        method,
        headers: {
          [TOKEN_HEADER]: token,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      throw new Error(`egress-proxy control ${method} ${path}: request failed (${reason})`);
    }
    if (res.status !== expected) {
      await res.body?.cancel();
      throw new Error(`egress-proxy control ${method} ${path}: status ${res.status}`);
    }
    return res;
  };
  const route = (auditId: string, suffix = "") => `/audits/${encodeURIComponent(auditId)}${suffix}`;

  return {
    async register(auditId) {
      const credentials = newCredentials();
      await call("POST", route(auditId, "/credentials"), 201, credentials);
      return credentials;
    },

    async revoke(auditId) {
      await call("DELETE", route(auditId, "/credentials"), 204);
    },

    async usage(auditId) {
      const res = await call("GET", route(auditId), 200);
      const view: unknown = await res.json();
      if (!isUsage(view, auditId)) {
        throw new Error("egress-proxy control GET: unexpected view shape");
      }
      return {
        auditId: view.auditId,
        requests: view.requests,
        bytes: view.bytes,
        blockedHosts: [...view.blockedHosts],
        capped: { requests: view.capped.requests, bytes: view.capped.bytes },
      };
    },
  };
}

/**
 * Runs one audit with its own proxy credentials, in this order: register → run → read counters
 * → terminal event, then revoke in `finally`.
 * - If register fails, the context is never opened; `terminal` gets the error.
 * - If the audit fails, the counters are still read and `terminal` gets `{ error, usage }`.
 * - If reading the counters fails, `terminal` still runs, without `usage`.
 * - Revoke always runs, even if `terminal` throws. A failed revoke doesn't reject: the proxy also
 *   expires the pair after SCAN_TOTAL_TIMEOUT_MS.
 */
export async function runWithAuditProxy<T>(
  client: ProxyClient,
  auditId: string,
  steps: {
    run(credentials: ProxyCredentials): Promise<T>;
    terminal(outcome: { result?: T; error?: unknown; usage?: ProxyUsage }): Promise<void> | void;
  },
): Promise<void> {
  try {
    let credentials: ProxyCredentials;
    try {
      credentials = await client.register(auditId);
    } catch (error) {
      await steps.terminal({ error });
      return;
    }
    const outcome: { result?: T; error?: unknown; usage?: ProxyUsage } = {};
    try {
      outcome.result = await steps.run(credentials);
    } catch (error) {
      outcome.error = error;
    }
    try {
      outcome.usage = await client.usage(auditId);
    } catch {
      // The counters are unavailable; the terminal event is still emitted.
    }
    await steps.terminal(outcome);
  } finally {
    await client.revoke(auditId).catch(() => undefined);
  }
}
