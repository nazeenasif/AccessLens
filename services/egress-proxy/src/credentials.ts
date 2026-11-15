// Per-audit credential registry (task T048). ADR-0001 §2: before each audit the scanner registers
// a fresh random credential pair; a request without currently registered credentials gets 407;
// credentials expire after the total audit timeout (SCAN_TOTAL_TIMEOUT_MS); requests and bytes are
// attributed per audit. It also emits the R14 events (T052): one `proxy.audit_summary` when an
// audit is revoked or expires, and `proxy.blocked` for each refused destination.
import { hostHash, type ProxyLogger } from "./logger.ts";
import { secretEquals } from "./secret-compare.ts";

export type Credentials = { username: string; password: string };
export type Usage = {
  requests: number;
  bytes: number;
  blockedHosts: string[];
  capped: { requests: boolean; bytes: boolean };
};

type Entry = {
  // Compared only through secretEquals (constant time).
  username: string;
  password: string;
  expiresAt: number;
  usage: Usage;
  blockedCount: number;
};

/** Distinct blocked hosts kept (and logged) per audit; further refusals are only counted. */
const MAX_BLOCKED_HOSTS = 100;
const BASIC = /^Basic ([A-Za-z0-9+/]+={0,2})$/;

export class CredentialRegistry {
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #logger: ProxyLogger | undefined;
  readonly #entries = new Map<string, Entry>();

  constructor(options: { ttlMs: number; now?: () => number; logger?: ProxyLogger }) {
    this.#ttlMs = options.ttlMs;
    this.#now = options.now ?? Date.now;
    this.#logger = options.logger;
  }

  /** Throws if the audit is already registered or the username is in use by another audit. */
  register(auditId: string, credentials: Credentials): void {
    if (this.#entries.has(auditId)) throw new Error("audit already registered");
    const { username, password } = credentials;
    for (const entry of this.#entries.values()) {
      if (secretEquals(entry.username, username)) throw new Error("username already in use");
    }
    this.#entries.set(auditId, {
      username,
      password,
      expiresAt: this.#now() + this.#ttlMs,
      usage: { requests: 0, bytes: 0, blockedHosts: [], capped: { requests: false, bytes: false } },
      blockedCount: 0,
    });
  }

  /** Revokes the audit's credentials and emits its summary. Unknown audits are ignored. */
  revoke(auditId: string): void {
    const entry = this.#entries.get(auditId);
    if (entry !== undefined) this.#finish(auditId, entry);
  }

  authorize(
    proxyAuthorization: string | undefined,
  ): { ok: true; auditId: string } | { ok: false; status: 407 } {
    const denied = { ok: false, status: 407 } as const;
    const match = BASIC.exec(proxyAuthorization ?? "");
    if (match?.[1] === undefined) return denied;
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 0) return denied;
    const username = decoded.slice(0, colon);
    const password = decoded.slice(colon + 1);
    const now = this.#now();
    let found: string | undefined;
    // Compare against every entry, so the time taken doesn't reveal which one matched.
    for (const [auditId, entry] of this.#entries) {
      const userOk = secretEquals(entry.username, username);
      const passOk = secretEquals(entry.password, password);
      if (userOk && passOk && now < entry.expiresAt) found = auditId;
    }
    return found === undefined ? denied : { ok: true, auditId: found };
  }

  /** True while the audit is registered and its credentials haven't expired. */
  isActive(auditId: string): boolean {
    const entry = this.#entries.get(auditId);
    return entry !== undefined && this.#now() < entry.expiresAt;
  }

  recordRequest(auditId: string): void {
    const entry = this.#entries.get(auditId);
    if (entry !== undefined) entry.usage.requests += 1;
  }

  recordBytes(auditId: string, bytes: number): void {
    const entry = this.#entries.get(auditId);
    if (entry !== undefined) entry.usage.bytes += bytes;
  }

  recordBlocked(auditId: string, host: string, reason: string): void {
    const entry = this.#entries.get(auditId);
    if (entry === undefined) return;
    entry.blockedCount += 1;
    const hosts = entry.usage.blockedHosts;
    if (hosts.includes(host) || hosts.length >= MAX_BLOCKED_HOSTS) return;
    hosts.push(host);
    this.#logger?.info(
      { event: "proxy.blocked", auditId, reason, hostHash: hostHash(host) },
      "destination refused",
    );
  }

  markCapped(auditId: string, cap: "requests" | "bytes"): void {
    const entry = this.#entries.get(auditId);
    if (entry !== undefined) entry.usage.capped[cap] = true;
  }

  /** A copy of the audit's usage, or undefined if it isn't registered. */
  usage(auditId: string): Usage | undefined {
    const usage = this.#entries.get(auditId)?.usage;
    if (usage === undefined) return undefined;
    return { ...usage, blockedHosts: [...usage.blockedHosts], capped: { ...usage.capped } };
  }

  /** Drops expired audits, emitting each one's summary. */
  sweep(): void {
    const now = this.#now();
    for (const [auditId, entry] of [...this.#entries]) {
      if (now >= entry.expiresAt) this.#finish(auditId, entry);
    }
  }

  // Removing the entry is what makes the summary once-only: a second revoke or sweep finds nothing.
  #finish(auditId: string, entry: Entry): void {
    this.#entries.delete(auditId);
    const { requests, bytes, capped } = entry.usage;
    this.#logger?.info(
      {
        event: "proxy.audit_summary",
        auditId,
        requests,
        bytes,
        blocked: entry.blockedCount,
        capped: { ...capped },
      },
      "audit finished",
    );
  }
}
