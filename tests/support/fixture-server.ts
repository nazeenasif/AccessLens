// Test-only fixture server (task T071; research R13, ADR-0001 Amendment 4, ADR-0003 Addendum D).
// It serves the local test pages in fixtures/ plus the redirect and slow endpoints used by the
// redirect-policy (T063) and interruption (T069) tests. It is never part of a deployment: it runs
// only in docker-compose.test.yml on the `test-fixtures` network (172.30.50.0/24), where only
// egress-proxy can reach it, under the allowlisted host name fixtures.test.
//
// Routes (GET and HEAD only; anything else → 405):
//   /fixtures/<path>         a file under fixtures/ (no traversal, no dotfiles, no directories)
//   /ok                      a tiny, accessible HTML page
//   /redirect/chain/<n>      302 to /redirect/chain/<n-1>, and /redirect/chain/0 → /ok
//                            (n ≤ 50; more than 10 hops must end in TOO_MANY_REDIRECTS)
//   /redirect/to-private     302 to http://169.254.169.254/ (must end in BLOCKED_REDIRECT)
//   /redirect/to-host/<host> 302 to http://<host>/ok (<host> must be a plain host name)
//   /slow/delay/<ms>         HTML sent after <ms> (≤ 120 000)
//   /slow/hang               accepts the request and never responds
//   /slow/load               the document commits, but `load` never fires (an image that hangs)
//   /healthz                 200 "ok"
// Hanging requests are tracked, so close() always ends them.
//
// Run directly: `node tests/support/fixture-server.ts` listens on 0.0.0.0:$FIXTURE_PORT (default
// 80) and serves $FIXTURE_ROOT (default: the repository's fixtures/ directory).
import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("../../fixtures/", import.meta.url));
const MAX_CHAIN = 50;
const MAX_DELAY_MS = 120_000;
const HOST_NAME =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

const OK_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OK</title></head>' +
  "<body><main><h1>OK</h1><p>Fixture page.</p></main></body></html>";

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8",
) {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": String(Buffer.byteLength(body)),
    "Cache-Control": "no-store",
  });
  res.end(res.req.method === "HEAD" ? undefined : body);
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { Location: location, "Content-Length": "0", "Cache-Control": "no-store" });
  res.end();
}

/** Resolves a /fixtures/ path to a regular file inside root, or undefined. */
function fixtureFile(root: string, urlPath: string): string | undefined {
  let relative: string;
  try {
    relative = decodeURIComponent(urlPath.slice("/fixtures/".length));
  } catch {
    return undefined;
  }
  if (relative === "" || relative.includes("\0")) return undefined;
  // No dotfiles or dot-directories at any level (this also rules out "..").
  if (relative.split("/").some((part) => part === "" || part.startsWith("."))) return undefined;
  const base = resolve(root);
  const file = resolve(base, relative);
  if (!file.startsWith(base + sep)) return undefined;
  try {
    return statSync(file).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

export function createFixtureServer(options: { root?: string } = {}): Server {
  const root = options.root ?? DEFAULT_ROOT;
  const sockets = new Set<Socket>();

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
    const path = new URL(req.url ?? "/", "http://fixtures.test").pathname;

    if (path === "/healthz") return send(res, 200, "ok");
    if (path === "/ok") return send(res, 200, OK_PAGE, TYPES[".html"]);

    if (path.startsWith("/fixtures/")) {
      const file = fixtureFile(root, path);
      if (file === undefined) return send(res, 404, "not found");
      const size = statSync(file).size;
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": String(size),
        "Cache-Control": "no-store",
      });
      if (req.method === "HEAD") return res.end();
      createReadStream(file)
        .on("error", () => res.destroy())
        .pipe(res);
      return;
    }

    const chain = /^\/redirect\/chain\/(\d{1,3})$/.exec(path);
    if (chain?.[1] !== undefined) {
      const n = Number(chain[1]);
      if (n > MAX_CHAIN) return send(res, 400, `chain length must be ≤ ${MAX_CHAIN}`);
      return redirect(res, n === 0 ? "/ok" : `/redirect/chain/${n - 1}`);
    }
    if (path === "/redirect/to-private") return redirect(res, "http://169.254.169.254/");
    const toHost = /^\/redirect\/to-host\/([^/]+)$/.exec(path);
    if (toHost?.[1] !== undefined) {
      if (!HOST_NAME.test(toHost[1])) return send(res, 400, "not a plain host name");
      return redirect(res, `http://${toHost[1]}/ok`);
    }

    const delay = /^\/slow\/delay\/(\d{1,6})$/.exec(path);
    if (delay?.[1] !== undefined) {
      const ms = Number(delay[1]);
      if (ms > MAX_DELAY_MS) return send(res, 400, `delay must be ≤ ${MAX_DELAY_MS} ms`);
      const timer = setTimeout(() => send(res, 200, OK_PAGE, TYPES[".html"]), ms);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    if (path === "/slow/hang") return; // never responds; close() ends it
    if (path === "/slow/load") {
      const body =
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Slow load</title></head>' +
        '<body><main><h1>Slow load</h1><img src="/slow/hang" alt="never loads"></main></body></html>';
      return send(res, 200, body, TYPES[".html"]);
    }

    return send(res, 404, "not found");
  };

  const server = createServer(handle);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  // End hanging requests too, so close() never waits on them.
  const close = server.close.bind(server);
  server.close = ((callback?: (err?: Error) => void) => {
    close(callback);
    for (const socket of sockets) socket.destroy();
    return server;
  }) as Server["close"];
  return server;
}

// Entry point: `node tests/support/fixture-server.ts`.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.FIXTURE_PORT ?? "80");
  const root = process.env.FIXTURE_ROOT ?? DEFAULT_ROOT;
  const server = createFixtureServer({ root });
  server.listen(port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "fixtures.started", port, root: join(root) }));
  });
  const stop = () => server.close();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
