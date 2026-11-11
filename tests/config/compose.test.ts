// Compose configuration test (task T014; ADR-0001 §1/§4, ADR-0002 §6, ADR-0003 M0 list).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Service = {
  image?: string;
  build?: unknown;
  ports?: unknown[];
  expose?: unknown[];
  networks?: Record<string, { ipv4_address?: string } | null> | string[];
  environment?: Record<string, string | number | boolean | null> | string[];
  env_file?: unknown;
  read_only?: boolean;
  tmpfs?: string[] | string;
  volumes?: unknown[];
  init?: boolean;
  shm_size?: string | number;
  ipc?: string;
  cap_drop?: string[];
  cap_add?: string[];
  security_opt?: string[];
  user?: string;
  mem_limit?: string;
  cpus?: number | string;
  pids_limit?: number;
  profiles?: string[];
  scale?: number;
  deploy?: { replicas?: number };
};
type Network = {
  internal?: boolean;
  enable_ipv6?: boolean;
  ipam?: { config?: { subnet?: string }[] };
};
type Compose = { services: Record<string, Service>; networks: Record<string, Network> };

const COMPOSE_PATH = "docker-compose.yml";
const SECCOMP = "seccomp=./ops/seccomp/playwright-seccomp-profile.json";

// Environment allowlists per ADR-0001's secret table.
const ALLOWED_ENV: Record<string, readonly string[]> = {
  web: [
    "NODE_ENV",
    "PORT",
    "WEB_PUBLIC_SUBNET",
    "NEXT_TELEMETRY_DISABLED",
    "LOG_LEVEL",
    "SCAN_ENABLED",
    "AI_PROVIDER",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "AI_MAX_OUTPUT_TOKENS",
    "AI_TIMEOUT_MS",
    "AI_DAILY_REQUEST_CAP",
    "AI_EXPLAINS_PER_AUDIT",
    "EVIDENCE_SIGNING_SECRET",
    "EVIDENCE_SIGNING_SECRET_PREVIOUS",
    "SCANNER_URL",
    "SCANNER_INTERNAL_TOKEN",
    "TRUSTED_PROXY_HOPS",
    "RL_AUDITS_PER_10M",
    "RL_EXPLAINS_PER_10M",
  ],
  scanner: [
    "NODE_ENV",
    "LOG_LEVEL",
    "SCANNER_INTERNAL_TOKEN",
    "PROXY_CONTROL_TOKEN",
    "EGRESS_PROXY_ADDR",
    "SCAN_NAV_TIMEOUT_MS",
    "SCAN_ANALYSIS_BUDGET_MS",
    "SCAN_TEARDOWN_MS",
    "SCAN_TOTAL_TIMEOUT_MS",
    "SCAN_MAX_DOM_ELEMENTS",
    "SCAN_CONCURRENCY",
    "SCAN_QUEUE",
    "SCAN_MAX_BYTES",
    "SCAN_MAX_REQUESTS",
  ],
  "egress-proxy": [
    "NODE_ENV",
    "LOG_LEVEL",
    "PROXY_CONTROL_TOKEN",
    "SCAN_MAX_BYTES",
    "SCAN_MAX_REQUESTS",
  ],
};
const FORBIDDEN_IN_SCAN_PATH = /^(OPENROUTER_|EVIDENCE_SIGNING_|AI_)/;

function load(): Compose {
  return parse(readFileSync(COMPOSE_PATH, "utf8"), { merge: true }) as Compose;
}
function envKeys(svc: Service): string[] {
  const env = svc.environment;
  if (!env) return [];
  if (Array.isArray(env)) return env.map((e) => e.split("=")[0] ?? "");
  return Object.keys(env);
}
function netNames(svc: Service): string[] {
  const n = svc.networks;
  if (!n) return [];
  return Array.isArray(n) ? n : Object.keys(n);
}
function tmpfsList(svc: Service): string[] {
  const t = svc.tmpfs;
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map((x) => x.split(":")[0] ?? "");
}
function subnet(net: Network | undefined): string | undefined {
  return net?.ipam?.config?.[0]?.subnet;
}

describe("docker-compose.yml (T014)", () => {
  it("exists", () => {
    expect(existsSync(COMPOSE_PATH)).toBe(true);
  });

  const c = existsSync(COMPOSE_PATH) ? load() : ({ services: {}, networks: {} } as Compose);
  const svc = (name: string): Service => {
    const s = c.services?.[name];
    if (!s) throw new Error(`service ${name} missing`);
    return s;
  };

  it("defines the four networks with the required isolation", () => {
    for (const n of ["public", "scan-ctl", "scan-egress", "outbound"]) {
      expect(c.networks?.[n], `network ${n}`).toBeDefined();
    }
    expect(c.networks["scan-ctl"]?.internal).toBe(true);
    expect(c.networks["scan-egress"]?.internal).toBe(true);
    expect(c.networks.public?.internal ?? false).toBe(false);
    expect(c.networks.outbound?.internal ?? false).toBe(false);
    expect(c.networks.outbound?.enable_ipv6).toBe(false);
    expect(subnet(c.networks.outbound)).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
    expect(subnet(c.networks["scan-egress"])).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
  });

  it("attaches each service only to its allowed networks", () => {
    expect(netNames(svc("web")).sort()).toEqual(["public", "scan-ctl"]);
    expect(netNames(svc("scanner")).sort()).toEqual(["scan-ctl", "scan-egress"]);
    expect(netNames(svc("egress-proxy")).sort()).toEqual(["outbound", "scan-egress"]);
  });

  it("gives egress-proxy a fixed IP on scan-egress", () => {
    const nets = svc("egress-proxy").networks as Record<string, { ipv4_address?: string } | null>;
    expect(nets["scan-egress"]?.ipv4_address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("publishes no ports for scanner or egress-proxy, and only 3000 for web", () => {
    for (const name of Object.keys(c.services)) {
      if (name === "web" || name === "web-dev") continue;
      expect(svc(name).ports ?? [], `${name} ports`).toEqual([]);
    }
    expect((svc("web").ports ?? []).map(String)).toEqual(["3000:3000"]);
  });

  it("hardens the scanner (ADR-0001 §4, research R4)", () => {
    const s = svc("scanner");
    expect(s.init).toBe(true);
    expect(s.shm_size).toBeDefined();
    expect(s.ipc).toBeUndefined();
    expect(s.read_only).toBe(true);
    expect(tmpfsList(s)).toContain("/tmp");
    expect(s.cap_drop).toEqual(["ALL"]);
    expect(s.cap_add).toEqual(["SYS_CHROOT"]); // ADR-0001 Amendment 2 (OD-13)
    expect(s.security_opt).toContain("no-new-privileges:true");
    expect(s.security_opt).toContain(SECCOMP);
    expect(s.volumes ?? []).toEqual([]);
    expect(s.mem_limit).toBeDefined();
    expect(s.cpus).toBeDefined();
    expect(s.pids_limit).toBeDefined();
  });

  it("hardens egress-proxy", () => {
    const s = svc("egress-proxy");
    expect(s.read_only).toBe(true);
    expect(s.cap_drop).toEqual(["ALL"]);
    expect(s.security_opt).toContain("no-new-privileges:true");
    expect(s.volumes ?? []).toEqual([]);
  });

  it("runs web read-only with tmpfs only for /tmp and the Next.js cache, and no volumes (ADR-0002 §6)", () => {
    const s = svc("web");
    expect(s.read_only).toBe(true);
    expect(tmpfsList(s).sort()).toEqual(["/app/apps/web/.next/cache", "/tmp"]);
    expect(s.volumes ?? []).toEqual([]);
  });

  it("grants capabilities only to the scanner (ADR-0001 Amendment 2)", () => {
    const withCaps = Object.entries(c.services)
      .filter(([, s]) => (s.cap_add ?? []).length > 0)
      .map(([name]) => name);
    expect(withCaps).toEqual(["scanner"]);
    for (const [name, s] of Object.entries(c.services)) {
      expect(s.cap_drop, `${name} cap_drop`).toEqual(["ALL"]);
      expect((s as { privileged?: boolean }).privileged ?? false, `${name} privileged`).toBe(false);
    }
  });

  it("never uses env_file (would leak every .env value into every service)", () => {
    for (const [name, s] of Object.entries(c.services)) {
      expect(s.env_file, `${name} env_file`).toBeUndefined();
    }
  });

  it("matches the per-service environment allowlists (ADR-0001 secret table)", () => {
    for (const [name, allowed] of Object.entries(ALLOWED_ENV)) {
      const keys = envKeys(svc(name));
      const extra = keys.filter((k) => !allowed.includes(k));
      expect(extra, `${name} unexpected env`).toEqual([]);
    }
    for (const name of ["scanner", "egress-proxy"]) {
      const bad = envKeys(svc(name)).filter((k) => FORBIDDEN_IN_SCAN_PATH.test(k));
      expect(bad, `${name} must not receive AI/signing secrets`).toEqual([]);
    }
    expect(envKeys(svc("web"))).not.toContain("PROXY_CONTROL_TOKEN");
  });

  it("runs exactly one replica of each service", () => {
    for (const [name, s] of Object.entries(c.services)) {
      expect(s.scale ?? 1, `${name} scale`).toBe(1);
      expect(s.deploy?.replicas ?? 1, `${name} replicas`).toBe(1);
    }
  });
});
