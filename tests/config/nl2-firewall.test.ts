// NL-2 firewall script tests without root or a real firewall (task T057; ADR-0001 §3 as amended by
// Amendments 1, 3 and 5). The real ops/firewall/install-nl2.sh, uninstall-nl2.sh and verify-nl2.sh
// run with `iptables`, `docker`, `sysctl`, `uname`, `ip` and `conntrack` replaced by FAKES placed
// first on PATH (tests/config/fixtures/nl2-fake-tool.sh). The fakes keep the chains in text files
// and log every call, so the tests check exactly which rules a script would install, in which
// order, and what it would never touch. Cases and titles: tests/support/nl2-cases.ts; every title
// is required in test:assert.
//
// Safety: no real firewall command can run. The test refuses to run as root, PATH holds only the
// fake directory plus the plain system tool directory (no sbin, where iptables/sysctl/conntrack
// live), and a source check requires the scripts to call these tools by bare name, never through
// sudo or an absolute path. The live-stack check of the same rules is T184 (G1), not this file.
//
// Interface expected from T057 (bash; tools called by bare name):
//   - ranges from ops/firewall/nonpublic-ipv4.txt (= NON_PUBLIC_IPV4_RANGES, T045), in file order;
//   - the fixed `outbound` subnet from docker-compose.yml, and the actual one from
//     `docker network inspect accesslens_outbound` (Compose project `name: accesslens`);
//   - bridge networks from `docker network ls`, their IPv4 subnets from `docker network inspect`;
//   - host addresses from `ip -4 -o addr show`;
//   - pre-checks: `iptables -S DOCKER-USER` succeeds; actual outbound subnet = Compose value;
//     conntrack helpers are off (ADR-0001 Amendment 5): `sysctl -n net.netfilter.nf_conntrack_helper`
//     is 0, or the sysctl is missing and `uname -r` is 6.0 or later; and no rule in
//     `iptables -t raw -S` uses `-j CT --helper`; `conntrack` is on PATH;
//   - rule form, exactly: -s <outbound> -d <dest> -m comment --comment accesslens-nl2 -j DROP;
//   - order: the DOCKER-USER drops are rules 1..n, destinations in this order: the ranges (file
//     order), then the IPv4 bridge subnets (`docker network ls` order), skipping exact duplicates;
//     the INPUT drops are rules 1..m, host addresses in `ip` order;
//   - idempotent replace: delete every tagged rule (from `iptables -S <chain>` lines), then insert;
//   - afterwards `conntrack -D -s <outbound>` only (an "0 flow entries" exit 1 is not an error);
//   - verify-nl2.sh is read-only (`iptables -S`/`-L`/`-C` only) and exits 0 only if the tagged
//     rules are exactly the expected ones, at the top, in order, with no ACCEPT.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { NON_PUBLIC_IPV4_RANGES } from "../../packages/shared/src/url-policy/ip-classify.ts";
import {
  BRIDGES,
  DOCKER_USER_BEFORE,
  HOST_ADDRS,
  INPUT_BEFORE,
  NL2_FAIL_CLOSED_CASES,
  NL2_HELPERS_OFF_CASES,
  NL2_SCRIPTS,
  NL2_TITLES as T,
  NL2_VERIFY_FAIL_CASES,
  OUTBOUND,
  RAW_BEFORE,
  TAG,
  type Chains,
  type Nl2Scenario,
} from "../support/nl2-cases.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = (name: string) => join(REPO, "ops", "firewall", name);
const INSTALL = SCRIPT("install-nl2.sh");
const UNINSTALL = SCRIPT("uninstall-nl2.sh");
const VERIFY = SCRIPT("verify-nl2.sh");
const UNIT = SCRIPT("accesslens-nl2.service");
const WIN = process.platform === "win32";

// Linux (CI is ubuntu-24.04): /bin/bash. Windows: Git Bash, never WSL's bash.exe (a different
// system), and Git's usr/bin/bash.exe rather than the bin/bash.exe launcher, which puts its own
// directories ahead of the PATH given here so the fakes would no longer come first.
const GIT_ROOT = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git");
const BASH = WIN ? join(GIT_ROOT, "usr", "bin", "bash.exe") : "/bin/bash";
const SYSTEM_TOOLS = WIN ? [join(GIT_ROOT, "usr", "bin")] : ["/usr/bin", "/bin"];
const posix = (p: string) => p.replace(/\\/g, "/");

const FAKE = readFileSync(join(REPO, "tests", "config", "fixtures", "nl2-fake-tool.sh"), "utf8");
const TOOLS = ["iptables", "docker", "sysctl", "uname", "ip", "conntrack"];

const HOST_IPS = HOST_ADDRS.map((a) => a.split("/")[0] ?? "");
const BRIDGE_IPV4 = Object.values(BRIDGES).flatMap((v) =>
  v.split(",").filter((s) => !s.includes(":")),
);
/** The DOCKER-USER destinations, in the required order. */
const DESTS = [...new Set([...NON_PUBLIC_IPV4_RANGES, ...BRIDGE_IPV4])];
const DOCKER_OWNED: Record<string, string[]> = {
  DOCKER: ["-N DOCKER", "-A DOCKER -d 172.30.10.2/32 -p tcp -m tcp --dport 3000 -j ACCEPT"],
  "DOCKER-FORWARD": ["-N DOCKER-FORWARD", "-A DOCKER-FORWARD -j DOCKER-ISOLATION-STAGE-1"],
  "DOCKER-ISOLATION-STAGE-1": [
    "-N DOCKER-ISOLATION-STAGE-1",
    "-A DOCKER-ISOLATION-STAGE-1 -j RETURN",
  ],
};

const tagged = (chain: string, dest: string) =>
  `-A ${chain} -s ${OUTBOUND} -d ${dest} -m comment --comment ${TAG} -j DROP`;
const isTagged = (line: string) => line.includes(`--comment ${TAG}`);
/** An INPUT destination, written with or without /32. */
const inputDest = (line: string) => / -d (\S+?)(?:\/32)? /.exec(line)?.[1];

/** The correct chains, as `iptables -S` prints them. */
const expectedChains = (): Chains => ({
  dockerUser: [
    DOCKER_USER_BEFORE[0] as string,
    ...DESTS.map((d) => tagged("DOCKER-USER", d)),
    ...DOCKER_USER_BEFORE.slice(1),
  ],
  input: [
    INPUT_BEFORE[0] as string,
    ...HOST_IPS.map((ip) => tagged("INPUT", `${ip}/32`)),
    ...INPUT_BEFORE.slice(1),
  ],
});

const MUTATING = /^iptables(?: -w| --wait)* (?:-t \S+ )?-(?:I|A|D|R|F|X|N|P|Z|E)\b/;
const READ_ONLY = /^iptables(?: -w| --wait)*(?: -t \S+)? -(?:S|L|C)(?: |$)/;
const mutations = (calls: string[]) => calls.filter((c) => MUTATING.test(c));

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function preconditions() {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    throw new Error("refusing to run the NL-2 script tests as root");
  }
  expect(existsSync(BASH), `bash not found at ${BASH}`).toBe(true);
}

function sandbox(s: Nl2Scenario = {}) {
  preconditions();
  const root = mkdtempSync(join(tmpdir(), "nl2-"));
  dirs.push(root);
  const bin = join(root, "bin");
  const state = join(root, "state");
  mkdirSync(bin);
  mkdirSync(state);
  for (const tool of TOOLS.filter((t) => !(s.noConntrack && t === "conntrack"))) {
    const file = join(bin, tool);
    writeFileSync(file, FAKE.replace(/\r\n/g, "\n"));
    chmodSync(file, 0o755);
  }
  const chain = (table: string, name: string, lines: string[]) =>
    writeFileSync(join(state, `chain-${table}-${name}`), lines.map((l) => `${l}\n`).join(""));
  if (!s.noDockerUser) chain("filter", "DOCKER-USER", s.dockerUser ?? DOCKER_USER_BEFORE);
  chain("filter", "INPUT", s.input ?? INPUT_BEFORE);
  for (const [name, lines] of Object.entries(DOCKER_OWNED)) chain("filter", name, lines);
  chain("raw", "PREROUTING", [...RAW_BEFORE.PREROUTING, ...(s.raw ?? [])]);
  chain("raw", "OUTPUT", RAW_BEFORE.OUTPUT);
  writeFileSync(join(state, "calls.log"), "");
  const env: Record<string, string> = {
    PATH: [bin, ...SYSTEM_TOOLS].join(WIN ? ";" : ":"),
    FAKE_STATE: posix(state),
    FAKE_NETWORKS: Object.entries(s.networks ?? BRIDGES)
      .map(([k, v]) => `${k}=${v}`)
      .join(" "),
    FAKE_HOST_ADDRS: HOST_ADDRS.join(" "),
    FAKE_HELPER: s.helper === null ? "" : (s.helper ?? "0"),
    FAKE_KERNEL: s.kernel ?? "6.8.0-45-generic",
    FAKE_CONNTRACK_EMPTY: s.conntrackEmpty ? "1" : "0",
    HOME: posix(root),
    ...(WIN ? { SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows" } : {}),
  };
  const read = (name: string, table = "filter") =>
    readFileSync(join(state, `chain-${table}-${name}`), "utf8")
      .split("\n")
      .filter((l) => l !== "");
  const snapshot = () =>
    Object.fromEntries(
      readdirSync(state)
        .filter((f) => f.startsWith("chain-") && !f.endsWith(".tmp"))
        .map((f) => [f, readFileSync(join(state, f), "utf8")]),
    );
  const run = (script: string) =>
    spawnSync(BASH, [posix(script)], { cwd: REPO, env, encoding: "utf8", timeout: 60_000 });
  const calls = () =>
    readFileSync(join(state, "calls.log"), "utf8")
      .split("\n")
      .filter((l) => l !== "");
  return { run, read, calls, snapshot };
}

const output = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

describe("scripts call tools by bare name only (so the fakes always intercept them)", () => {
  it.each(NL2_SCRIPTS.map((s) => [T.bareName(s), s] as const))("%s", (_title, script) => {
    expect(existsSync(SCRIPT(script)), script).toBe(true);
    const text = readFileSync(SCRIPT(script), "utf8");
    expect(text).not.toMatch(/\bsudo\b/);
    expect(text).not.toMatch(
      /(?:^|[\s;|&(`$])\/(?:usr\/)?s?bin\/(?:iptables|ip6tables|conntrack|sysctl|docker|ip|nft|uname)\b/m,
    );
    expect(text).not.toMatch(/\b(?:ip6tables|nft|iptables-restore|iptables-save)\b/);
  });
});

describe("install-nl2.sh: the rules it installs", () => {
  it(T.dockerUserTop, () => {
    const sb = sandbox();
    const result = sb.run(INSTALL);
    expect(result.status, result.stderr).toBe(0);
    const chain = sb.read("DOCKER-USER");
    expect(chain.slice(1, 1 + DESTS.length)).toEqual(DESTS.map((d) => tagged("DOCKER-USER", d)));
    expect(chain.filter(isTagged)).toHaveLength(DESTS.length); // no duplicates
    expect(chain.filter((l) => !isTagged(l))).toEqual(DOCKER_USER_BEFORE); // the rest untouched
    expect(chain.join("\n")).not.toMatch(/fd00:/); // IPv4 subnets only
  });

  it(T.inputTop, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    const chain = sb.read("INPUT");
    const top = chain.slice(1, 1 + HOST_IPS.length);
    expect(top.every(isTagged)).toBe(true);
    for (const line of top) {
      expect(line).toMatch(
        new RegExp(`^-A INPUT -s ${OUTBOUND} -d \\S+ -m comment --comment ${TAG} -j DROP$`),
      );
    }
    expect(top.map(inputDest)).toEqual(HOST_IPS);
    expect(chain.filter((l) => !isTagged(l))).toEqual(INPUT_BEFORE);
  });

  it(T.noAccept, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    for (const line of [...sb.read("DOCKER-USER"), ...sb.read("INPUT")].filter(isTagged)) {
      expect(line).not.toMatch(/ACCEPT|ctstate|--state|-m (?:conntrack|state)\b/);
    }
  });

  it(T.onlyTwoChains, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    for (const call of mutations(sb.calls())) {
      expect(call).toMatch(/^iptables(?: -w| --wait)* -(?:I|D) (?:DOCKER-USER|INPUT) /);
    }
    for (const [name, lines] of Object.entries(DOCKER_OWNED)) expect(sb.read(name)).toEqual(lines);
    expect(sb.read("PREROUTING", "raw")).toEqual(RAW_BEFORE.PREROUTING);
  });

  it(T.conntrackFlush, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    const calls = sb.calls();
    const flushes = calls.filter((c) => /^conntrack (?!-L|--version)/.test(c));
    expect(flushes).toEqual([`conntrack -D -s ${OUTBOUND}`]);
    const lastInsert = calls
      .map((c, i) => (/^iptables.* -I /.test(c) ? i : -1))
      .reduce((a, b) => Math.max(a, b));
    expect(calls.indexOf(`conntrack -D -s ${OUTBOUND}`)).toBeGreaterThan(lastInsert);
  });

  it(T.conntrackEmpty, () => {
    const sb = sandbox({ conntrackEmpty: true });
    const result = sb.run(INSTALL);
    expect(result.status, result.stderr).toBe(0);
  });
});

describe("install-nl2.sh: idempotent replace", () => {
  it(T.rerun, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    const first = sb.snapshot();
    expect(sb.run(INSTALL).status).toBe(0);
    expect(sb.snapshot()).toEqual(first);
  });

  it(T.stale, () => {
    const stale = tagged("DOCKER-USER", "198.51.100.77/32");
    const sb = sandbox({ dockerUser: [...DOCKER_USER_BEFORE, stale] });
    expect(sb.run(INSTALL).status).toBe(0);
    const chain = sb.read("DOCKER-USER");
    expect(chain).not.toContain(stale);
    expect(chain.filter((l) => !isTagged(l))).toEqual(DOCKER_USER_BEFORE);
    const calls = mutations(sb.calls());
    const lastDelete = calls
      .map((c, i) => (/ -D /.test(c) ? i : -1))
      .reduce((a, b) => Math.max(a, b));
    const firstInsert = calls.findIndex((c) => / -I /.test(c));
    expect(lastDelete).toBeLessThan(firstInsert);
    for (const call of calls.filter((c) => / -D /.test(c)))
      expect(call).toContain(`--comment ${TAG}`);
  });
});

describe("install-nl2.sh: pre-checks fail closed, with no partial rule set", () => {
  const STALE = tagged("DOCKER-USER", "198.51.100.77/32");
  it.each(NL2_FAIL_CLOSED_CASES.map((c) => [T.failClosed(c), c] as const))("%s", (_title, c) => {
    // A stale tagged rule is present wherever DOCKER-USER exists: a failed pre-check must leave it.
    const sb = sandbox(
      c.scenario.noDockerUser
        ? c.scenario
        : { ...c.scenario, dockerUser: [...DOCKER_USER_BEFORE, STALE] },
    );
    const before = sb.snapshot();
    const result = sb.run(INSTALL);
    expect(result.status, "must exit non-zero on its own").not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(output(result)).toMatch(c.message);
    expect(mutations(sb.calls()), "no rule added or removed").toEqual([]);
    expect(sb.calls().filter((l) => l.startsWith("conntrack -D"))).toEqual([]);
    expect(sb.snapshot()).toEqual(before);
  });
});

describe("install-nl2.sh: conntrack helpers count as off (ADR-0001 Amendment 5)", () => {
  it.each(NL2_HELPERS_OFF_CASES.map((c) => [T.helpersOff(c.name), c] as const))(
    "%s",
    (_title, c) => {
      const sb = sandbox(c.scenario);
      const result = sb.run(INSTALL);
      expect(result.status, result.stderr).toBe(0);
      expect(sb.read("DOCKER-USER").filter(isTagged)).toHaveLength(DESTS.length);
    },
  );
});

describe("uninstall-nl2.sh", () => {
  it(T.uninstall, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    const result = sb.run(UNINSTALL);
    expect(result.status, result.stderr).toBe(0);
    expect(sb.read("DOCKER-USER")).toEqual(DOCKER_USER_BEFORE);
    expect(sb.read("INPUT")).toEqual(INPUT_BEFORE);
    for (const call of mutations(sb.calls())) {
      expect(call).toMatch(/^iptables(?: -w| --wait)* -(?:I|D) (?:DOCKER-USER|INPUT) /);
    }
    expect(sb.run(UNINSTALL).status).toBe(0);
    expect(sb.read("DOCKER-USER")).toEqual(DOCKER_USER_BEFORE);
    for (const [name, lines] of Object.entries(DOCKER_OWNED)) expect(sb.read(name)).toEqual(lines);
  });
});

describe("verify-nl2.sh: read-only, exits 0 only on the exact expected rule set", () => {
  /** Every call verify made was read-only. */
  const expectReadOnly = (calls: string[]) => {
    for (const call of calls.filter((c) => c.startsWith("iptables"))) {
      expect(call, "iptables call must be -S, -L or -C").toMatch(READ_ONLY);
    }
    expect(
      calls.filter((c) => c.startsWith("conntrack") && !/^conntrack (?:-L|--version)/.test(c)),
    ).toEqual([]);
    for (const call of calls.filter((c) => c.startsWith("docker"))) {
      expect(call).toMatch(/^docker network (?:ls|inspect)\b/);
    }
  };

  it(T.verifyPasses, () => {
    const c = expectedChains();
    const sb = sandbox({ dockerUser: c.dockerUser, input: c.input });
    const before = sb.snapshot();
    const result = sb.run(VERIFY);
    expect(result.status, output(result)).toBe(0);
    expectReadOnly(sb.calls());
    expect(sb.snapshot()).toEqual(before);
  });

  it(T.verifyAfterInstall, () => {
    const sb = sandbox();
    expect(sb.run(INSTALL).status).toBe(0);
    const result = sb.run(VERIFY);
    expect(result.status, output(result)).toBe(0);
  });

  it(T.verifyMissingChain, () => {
    const sb = sandbox({ noDockerUser: true });
    const result = sb.run(VERIFY);
    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(output(result)).toMatch(/DOCKER-USER/);
    expectReadOnly(sb.calls());
  });

  it.each(NL2_VERIFY_FAIL_CASES.map((c) => [T.verifyFails(c), c] as const))("%s", (_title, c) => {
    const broken = c.breakIt(expectedChains());
    const sb = sandbox({ dockerUser: broken.dockerUser, input: broken.input });
    const before = sb.snapshot();
    const result = sb.run(VERIFY);
    expect(result.status, "must exit non-zero on its own").not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(output(result)).toMatch(c.message);
    expectReadOnly(sb.calls());
    expect(sb.snapshot()).toEqual(before);
  });
});

describe("accesslens-nl2.service", () => {
  const lines = () =>
    readFileSync(UNIT, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
  const values = (key: string) =>
    lines()
      .filter((l) => l.startsWith(`${key}=`))
      .map((l) => l.slice(key.length + 1));

  // Owner decision 2026-11-15: accesslens-networks.service creates the Compose networks first
  // ("docker compose up --no-start"), so install-nl2.sh can find them; accesslens-stack.service
  // starts the stack and requires this unit. Both are defined in T128/T129.
  it(T.unitOrder, () => {
    expect(lines().filter((l) => l.startsWith("After="))).toEqual([
      "After=docker.service accesslens-networks.service",
    ]);
    expect(lines().filter((l) => l.startsWith("Before="))).toEqual([
      "Before=accesslens-stack.service",
    ]);
  });

  it(T.unitOneshot, () => {
    expect(values("Type")).toEqual(["oneshot"]);
    expect(values("ExecStart").join(" ")).toMatch(/install-nl2\.sh/);
    expect(values("WantedBy").length).toBeGreaterThan(0);
  });
});
