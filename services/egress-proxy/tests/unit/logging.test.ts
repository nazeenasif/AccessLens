// Proxy logging tests (task T046; implementation T052). Research R14: egress-proxy emits one
// `proxy.audit_summary` per audit (requests, bytes, blocked count, cap flags) and `proxy.blocked`
// (reason, hashed host). The serialized logs contain no URLs, paths, query strings, or tokens.
//
// API expected from T052 (services/egress-proxy/src/logger.ts):
//   createProxyLogger(destination: { write(line: string): void }): ProxyLogger
//     a pino logger writing one JSON object per line, with the R14 redaction set;
//   hostHash(host: string): string
//     HMAC-SHA256 of the host with a random key generated once per process, as lowercase hex
//     (review 2026-11-14). Stable within a process, unlinkable to plain sha256(host).
// Events are emitted by the credential registry (T048), which receives the logger:
//   proxy.audit_summary  { event, auditId, requests, bytes, blocked, capped: { requests, bytes } }
//     exactly once per audit, when it is revoked or expires (sweep);
//   proxy.blocked        { event, auditId, reason, hostHash }  on registry.recordBlocked.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CredentialRegistry } from "../../src/credentials.ts";
import { createProxyLogger, hostHash } from "../../src/logger.ts";

const TTL = 60_000;
const A = { username: "audit-a-user", password: "a".repeat(43) };
const B = { username: "audit-b-user", password: "b".repeat(43) };
const CONTROL_TOKEN = "control-token-" + "c".repeat(40);

function setup() {
  const lines: string[] = [];
  const logger = createProxyLogger({ write: (line: string) => void lines.push(line) });
  let now = 1_000_000;
  const registry = new CredentialRegistry({ ttlMs: TTL, now: () => now, logger });
  const events = () =>
    lines
      .join("")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return {
    logger,
    registry,
    lines,
    events,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ofType = (events: Record<string, unknown>[], type: string) =>
  events.filter((e) => e.event === type);

describe("proxy.audit_summary: exactly one per audit", () => {
  it("is emitted once on revoke, with requests, bytes, blocked count, and cap flags", () => {
    const { registry, events } = setup();
    registry.register("audit-a", A);
    registry.recordRequest("audit-a");
    registry.recordRequest("audit-a");
    registry.recordBytes("audit-a", 300);
    registry.recordBlocked("audit-a", "internal.example", "non_public");
    registry.markCapped("audit-a", "bytes");
    registry.revoke("audit-a");
    const summaries = ofType(events(), "proxy.audit_summary");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      auditId: "audit-a",
      requests: 2,
      bytes: 300,
      blocked: 1,
      capped: { requests: false, bytes: true },
    });
  });

  it("revoking twice still emits only one", () => {
    const { registry, events } = setup();
    registry.register("audit-a", A);
    registry.revoke("audit-a");
    registry.revoke("audit-a");
    expect(ofType(events(), "proxy.audit_summary")).toHaveLength(1);
  });

  it("is emitted once when the audit expires and is swept", () => {
    const { registry, events, advance } = setup();
    registry.register("audit-a", A);
    advance(TTL);
    registry.sweep();
    registry.sweep();
    expect(ofType(events(), "proxy.audit_summary")).toHaveLength(1);
  });

  it("two audits give two summaries, each with its own auditId", () => {
    const { registry, events } = setup();
    registry.register("audit-a", A);
    registry.register("audit-b", B);
    registry.revoke("audit-b");
    registry.revoke("audit-a");
    const ids = ofType(events(), "proxy.audit_summary").map((e) => e.auditId);
    expect(ids.sort()).toEqual(["audit-a", "audit-b"]);
  });
});

describe("proxy.blocked: reason and hashed host", () => {
  it("records the reason and the host hash, never the host", () => {
    const { registry, events, lines } = setup();
    registry.register("audit-a", A);
    registry.recordBlocked("audit-a", "internal.example", "non_public");
    const blocked = ofType(events(), "proxy.blocked");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({
      auditId: "audit-a",
      reason: "non_public",
      hostHash: hostHash("internal.example"),
    });
    expect(lines.join("")).not.toContain("internal.example");
  });

  it("hostHash is a deterministic lowercase hex digest that differs per host", () => {
    expect(hostHash("internal.example")).toMatch(/^[0-9a-f]{16,64}$/);
    expect(hostHash("internal.example")).toBe(hostHash("internal.example"));
    expect(hostHash("internal.example")).not.toBe(hostHash("other.example"));
  });

  // Review 2026-11-14: HMAC-SHA256 with a random per-process key, so a log reader can't confirm a
  // guessed host by hashing it.
  it("hostHash is not plain sha256(host), in full or truncated", () => {
    for (const host of ["internal.example", "example.com", "fixtures.test"]) {
      const plain = createHash("sha256").update(host).digest("hex");
      const hashed = hostHash(host);
      expect(hashed).not.toBe(plain);
      expect(plain.startsWith(hashed)).toBe(false);
    }
  });

  // Review 2026-11-15: the key is random per process, so another process hashes the same host
  // differently (a fixed key would make them equal).
  it("hostHash differs between two separate processes for the same host", () => {
    const logger = new URL("../../src/logger.ts", import.meta.url).href;
    const script = `import { hostHash } from ${JSON.stringify(logger)}; console.log(hostHash("internal.example"));`;
    const run = () => {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    const first = run();
    const second = run();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(hostHash("internal.example")).not.toBe(first);
  }, 40_000); // two process spawns, each allowed 15 s

  it("hostHash stays stable within the process", () => {
    const first = hostHash("internal.example");
    for (let i = 0; i < 5; i++) hostHash(`other-${i}.example`);
    expect(hostHash("internal.example")).toBe(first);
  });
});

describe("serialized logs contain no URLs, paths, query strings, or tokens (R14)", () => {
  it("a full audit's events leak nothing", () => {
    const { registry, lines } = setup();
    registry.register("audit-a", A);
    registry.recordRequest("audit-a");
    registry.recordBytes("audit-a", 10);
    registry.recordBlocked("audit-a", "evil.example", "non_public");
    registry.revoke("audit-a");
    const output = lines.join("");
    for (const forbidden of ["://", "?", "/page", A.username, A.password, "evil.example"]) {
      expect(output, forbidden).not.toContain(forbidden);
    }
  });

  it("the logger redacts authorization headers and tokens", () => {
    const { logger, lines } = setup();
    logger.info(
      {
        authorization: "Bearer secret-bearer",
        PROXY_CONTROL_TOKEN: CONTROL_TOKEN,
        SCANNER_INTERNAL_TOKEN: "scanner-token-secret",
        req: {
          headers: {
            cookie: "session=secret-cookie",
            "proxy-authorization": `Basic ${Buffer.from(`${A.username}:${A.password}`).toString("base64")}`,
          },
        },
      },
      "redaction probe",
    );
    const output = lines.join("");
    for (const secret of [
      "secret-bearer",
      CONTROL_TOKEN,
      "scanner-token-secret",
      "secret-cookie",
      A.password,
    ]) {
      expect(output, secret).not.toContain(secret);
    }
    expect(output).not.toContain(Buffer.from(`${A.username}:${A.password}`).toString("base64"));
  });
});
