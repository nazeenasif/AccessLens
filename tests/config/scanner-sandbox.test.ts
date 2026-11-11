// Chromium sandbox verification (ADR-0001 §4, Amendment 2 / OD-13).
// Runs through `docker compose run scanner`, so it exercises the real Compose service definition
// rather than a copy of its flags. A launch alone proves little: Playwright disables the sandbox
// unless asked, so this also inspects the renderer process.
// This shows the sandbox works on the host running the test. It is not production-host evidence:
// Ubuntu 24.04 user-namespace compatibility is verified by gate G1 (T062).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDocker, dockerGate, sh } from "./docker-support.ts";

const { available, run } = dockerGate();

// Used for both the run and its cleanup, so `down -v` can only reach this test's own resources.
const SANDBOX_PROJECT = "accesslens-sandboxtest";
const compose = (...args: string[]) => sh("docker", ["compose", "-p", SANDBOX_PROJECT, ...args]);

// CAP_SYS_CHROOT is capability number 18.
const ONLY_SYS_CHROOT = (1n << 18n).toString(16).padStart(16, "0");
const NO_CAPABILITIES = "0".repeat(16);
const DISABLING_FLAG = /(^|\s)--(no-sandbox|disable-sandbox|disable-setuid-sandbox)(\s|=|$)/;

type Probe = {
  node: string;
  browser: string;
  heading: string;
  screenshotBytes: number;
  chromiumCommands: string[];
  renderers: { nsPidDepth: number; seccomp: string }[];
  self: Record<"Uid" | "CapEff" | "CapPrm" | "CapInh" | "CapAmb" | "CapBnd" | "NoNewPrivs", string>;
};

const PROBE = `
  import { chromium } from "playwright";
  import { readFileSync, readdirSync } from "node:fs";
  const field = (status, name) => (status.match(new RegExp("^" + name + ":\\\\s*(.*)$", "m")) ?? [])[1] ?? "";
  const browser = await chromium.launch({ chromiumSandbox: true });
  const page = await browser.newPage();
  await page.setContent("<title>sandbox-check</title><h1 id='m'>rendered</h1>");
  const heading = await page.textContent("#m");
  const screenshotBytes = (await page.screenshot()).length;
  const processes = readdirSync("/proc").filter((d) => /^\\d+$/.test(d)).flatMap((pid) => {
    try {
      // Match the executable only: this script's own command line contains these strings too.
      const argv = readFileSync("/proc/" + pid + "/cmdline", "utf8").split("\\0");
      if (!/chrome|headless/.test(argv[0])) return [];
      return [{ cmd: argv.join(" ").trim(), status: readFileSync("/proc/" + pid + "/status", "utf8") }];
    } catch { return []; }
  });
  const status = readFileSync("/proc/self/status", "utf8");
  const self = Object.fromEntries(["Uid", "CapEff", "CapPrm", "CapInh", "CapAmb", "CapBnd", "NoNewPrivs"].map((n) => [n, field(status, n)]));
  console.log(JSON.stringify({
    node: process.version,
    browser: browser.version(),
    heading,
    screenshotBytes,
    chromiumCommands: processes.map((p) => p.cmd),
    renderers: processes.filter((p) => p.cmd.includes("--type=renderer")).map((p) => ({
      nsPidDepth: field(p.status, "NSpid").split(/\\s+/).length,
      seccomp: field(p.status, "Seccomp"),
    })),
    self,
  }));
  await browser.close();
`;

describe.skipIf(!run)("Chromium sandbox under the Compose scanner service (OD-13)", () => {
  let probe: Probe | undefined;
  let failure = "";
  const result = (): Probe => {
    if (!probe) throw new Error(`sandboxed launch failed:\n${failure}`);
    return probe;
  };

  beforeAll(() => {
    assertDocker(available, "OD-13");
    const r = compose(
      "run",
      "--rm",
      "--no-deps",
      "--build",
      "-T",
      "--entrypoint",
      "node",
      "scanner",
      "--input-type=module",
      "-e",
      PROBE,
    );
    if (r.status === 0) probe = JSON.parse(r.stdout.trim().split("\n").pop()!) as Probe;
    else failure = `${r.stdout}\n${r.stderr}`.slice(-4000);
  }, 900_000);

  afterAll(() => {
    compose("down", "-v", "--remove-orphans");
  }, 300_000);

  it("Chromium launches with chromiumSandbox: true and renders a page", () => {
    const p = result();
    expect(p.heading).toBe("rendered");
    expect(p.screenshotBytes).toBeGreaterThan(0);
    expect(p.browser).toMatch(/^\d+\./);
  });

  it("the renderer runs inside the sandbox (nested PID namespace, seccomp filter)", () => {
    const { renderers } = result();
    expect(renderers.length).toBeGreaterThan(0);
    for (const renderer of renderers) {
      // The nested PID namespace is what shows the sandbox is on: an unsandboxed renderer has
      // depth 1. It would also report seccomp 2, from the container's own profile.
      expect(renderer.nsPidDepth).toBeGreaterThan(1);
      expect(renderer.seccomp).toBe("2");
    }
  });

  it("no Chromium process was started with a sandbox-disabling flag", () => {
    const { chromiumCommands } = result();
    expect(chromiumCommands.length).toBeGreaterThan(0);
    expect(chromiumCommands.filter((cmd) => DISABLING_FLAG.test(cmd))).toEqual([]);
  });

  it("the scanner process is non-root with no effective capabilities; SYS_CHROOT is only in its bounding set", () => {
    const { self } = result();
    expect(self.Uid.split(/\s+/)[0]).not.toBe("0");
    for (const name of ["CapEff", "CapPrm", "CapInh", "CapAmb"] as const) {
      expect(self[name], name).toBe(NO_CAPABILITIES);
    }
    expect(self.CapBnd).toBe(ONLY_SYS_CHROOT);
    expect(self.NoNewPrivs).toBe("1");
  });
});

describe("sandbox-disabling options are absent from the code base (static)", () => {
  const ROOTS = [
    "docker-compose.yml",
    "apps/web/Dockerfile",
    "services/scanner/Dockerfile",
    "services/egress-proxy/Dockerfile",
    "services",
    "apps/web/src",
    "packages/shared/src",
  ];
  const FORBIDDEN = [
    "--no-sandbox",
    "--disable-sandbox",
    "--disable-setuid-sandbox",
    "chromiumSandbox: false",
  ];
  const walk = (path: string): string[] => {
    if (!existsSync(path)) return [];
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(path)
      .filter((name) => !["node_modules", ".next", "tests"].includes(name))
      .flatMap((name) => walk(join(path, name)));
  };

  it("no non-test source or config enables them (comments excluded)", () => {
    const hits = [...new Set(ROOTS.flatMap(walk))].flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => !/^\s*(#|\/\/)/.test(line))
        .filter((line) => FORBIDDEN.some((flag) => line.includes(flag)))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });
});

describe("Docker availability (OD-13 prerequisite)", () => {
  it.skipIf(available)(
    "Docker daemon is required for the sandbox check — currently unavailable (not executed)",
    () => {
      expect(available).toBe(false);
    },
  );
});
