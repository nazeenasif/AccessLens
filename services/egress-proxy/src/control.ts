// Control endpoint (task T049). ADR-0001 §2; contracts/internal-egress-proxy.md §1. The scanner
// registers and revokes per-audit credentials and reads per-audit views here. The browser shares
// the scanner's network namespace, so the endpoint relies on the token (constant-time compare),
// a rate limit that counts every request before the token check, and read-only views that never
// expose credentials.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialRegistry } from "./credentials.ts";
import { secretEquals } from "./secret-compare.ts";

export type RateLimit = { max: number; windowMs: number };

const TOKEN_HEADER = "x-proxy-control-token";
const AUDIT_ID = "[A-Za-z0-9_-]{1,128}";
const CREDENTIALS_ROUTE = new RegExp(`^/audits/(${AUDIT_ID})/credentials$`);
const VIEW_ROUTE = new RegExp(`^/audits/(${AUDIT_ID})$`);
const MAX_BODY_BYTES = 4096;
const MAX_FIELD_LENGTH = 256;

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status, { "Content-Length": "0" }).end();
    return;
  }
  const text = JSON.stringify(body);
  res
    .writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(text)),
      "Cache-Control": "no-store",
    })
    .end(text);
}

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(undefined);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(undefined));
  });
}

const validField = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_LENGTH;

function parseCredentials(text: string | undefined) {
  if (text === undefined) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) return undefined;
  const { username, password } = body as Record<string, unknown>;
  // Basic auth splits at the first colon, so a username can't contain one.
  if (!validField(username) || username.includes(":") || !validField(password)) return undefined;
  return { username, password };
}

export function createControlHandler(options: {
  token: string;
  registry: CredentialRegistry;
  rateLimit: RateLimit;
  now?: () => number;
}): (req: IncomingMessage, res: ServerResponse) => void {
  const { token, registry, rateLimit } = options;
  const now = options.now ?? Date.now;
  let windowStart = now();
  let count = 0;

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    // Fixed window, counted before anything else: wrong-token attempts use the same budget.
    const t = now();
    if (t - windowStart >= rateLimit.windowMs) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    if (count > rateLimit.max) return send(res, 429);

    if (!secretEquals(token, req.headers[TOKEN_HEADER])) return send(res, 401);

    const path = req.url ?? "";
    const credentials = CREDENTIALS_ROUTE.exec(path);
    if (credentials?.[1] !== undefined) {
      const auditId = credentials[1];
      if (req.method === "POST") {
        const parsed = parseCredentials(await readBody(req));
        if (parsed === undefined) return send(res, 400);
        try {
          registry.register(auditId, parsed);
        } catch {
          return send(res, 400);
        }
        return send(res, 201);
      }
      if (req.method === "DELETE") {
        registry.revoke(auditId);
        return send(res, 204);
      }
      return send(res, 404);
    }

    const view = VIEW_ROUTE.exec(path);
    if (view?.[1] !== undefined && req.method === "GET") {
      const auditId = view[1];
      const usage = registry.usage(auditId);
      if (usage === undefined) return send(res, 404);
      return send(res, 200, {
        auditId,
        requests: usage.requests,
        bytes: usage.bytes,
        blockedHosts: usage.blockedHosts,
        capped: usage.capped,
      });
    }
    return send(res, 404);
  };

  return (req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500);
      else res.destroy();
    });
  };
}
