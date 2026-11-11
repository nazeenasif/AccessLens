// Image tests (task T024; ADR-0003 M0 list, ADR-0001 §4).
// Every service image must build, run as a non-root UID, and run the project's exact Node version.
// Base images must be pinned. The scanner's browser is verified in scanner-sandbox.test.ts.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { assertDocker, compose, dockerGate, sh } from "./docker-support.ts";

const DOCKERFILES = [
  "apps/web/Dockerfile",
  "services/scanner/Dockerfile",
  "services/egress-proxy/Dockerfile",
];
const IMAGES = [
  "accesslens/web:local",
  "accesslens/scanner:local",
  "accesslens/egress-proxy:local",
];
const SCANNER = "accesslens/scanner:local";
const SHA256 = /@sha256:[0-9a-f]{64}$/;
const { available, run } = dockerGate();

function baseImages(dockerfile: string): string[] {
  const text = readFileSync(dockerfile, "utf8");
  const args = Object.fromEntries(
    [...text.matchAll(/^ARG\s+(\w+)=(\S+)/gm)].map((m) => [m[1], m[2]]),
  );
  return [...text.matchAll(/^FROM\s+(\S+)/gm)]
    .map((m) => m[1]!.replace(/\$\{(\w+)\}/g, (_, k: string) => args[k] ?? ""))
    .filter((img) => !/^[a-z0-9_-]+$/i.test(img)); // skip references to earlier build stages
}

/** The exact Node version every image must run, taken from the web Dockerfile's pinned base. */
function pinnedNodeVersion(): string {
  const node = baseImages("apps/web/Dockerfile").find((img) => img.startsWith("node:"));
  const version = node?.match(/^node:(\d+\.\d+\.\d+)-/)?.[1];
  if (!version) throw new Error(`no exact Node version pinned in apps/web/Dockerfile: ${node}`);
  return version;
}

describe("base images are pinned (T024, static)", () => {
  for (const df of DOCKERFILES) {
    it(`${df} uses explicit version tags, never latest`, () => {
      const imgs = baseImages(df);
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        expect(img, img).toMatch(/:v?\d+\.\d+\.\d+/);
        expect(img, img).not.toMatch(/:latest(@|$)/);
      }
    });
  }

  it("the scanner pins both base images by digest (the Playwright tag was republished upstream)", () => {
    const imgs = baseImages("services/scanner/Dockerfile");
    expect(imgs.length).toBe(2);
    for (const img of imgs) expect(img, img).toMatch(SHA256);
  });

  it("every service pins the same Node 24 version", () => {
    const version = pinnedNodeVersion();
    expect(version).toMatch(/^24\./);
    for (const df of DOCKERFILES) {
      const node = baseImages(df).find((img) => img.startsWith("node:"));
      expect(node, `${df} must take Node from the official image`).toContain(`node:${version}-`);
    }
  });

  it("the Playwright image version matches the locked playwright package", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { version?: string }>;
    };
    const locked = lock.packages["node_modules/playwright"]?.version;
    const img = baseImages("services/scanner/Dockerfile").find((i) => i.includes("playwright"));
    expect(locked).toBeDefined();
    expect(img).toContain(`/playwright:v${locked}-`);
  });

  it("the project still requires Node 24", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines: { node: string } };
    expect(pkg.engines.node).toBe(">=24 <25");
  });
});

describe.skipIf(!run)("built images (T024)", () => {
  // Set only by a successful build. Later checks must not run against missing or stale images, so
  // each one fails here, naming the build as the cause.
  let buildSucceeded = false;
  const requireBuild = () => {
    if (!buildSucceeded) {
      throw new Error("not checked: 'builds all service images' failed, so images may be stale");
    }
  };

  beforeAll(() => assertDocker(available, "T024"));

  it("builds all service images", () => {
    const r = compose("build", "--progress=plain", "web", "scanner", "egress-proxy");
    const tail = `${r.stdout}\n${r.stderr}`.slice(-6000);
    expect(r.status, `docker compose build failed:\n${tail}`).toBe(0);
    buildSucceeded = true;
  }, 1_800_000);

  for (const image of IMAGES) {
    it(`${image} runs with a non-root UID`, () => {
      requireBuild();
      const r = sh("docker", ["run", "--rm", "--entrypoint", "id", image, "-u"], 120_000);
      expect(r.status, r.stderr).toBe(0);
      expect(Number(r.stdout.trim())).toBeGreaterThan(0);
    });

    it(`${image} runs the pinned Node version`, () => {
      requireBuild();
      const r = sh("docker", ["run", "--rm", "--entrypoint", "node", image, "-v"], 120_000);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.trim()).toBe(`v${pinnedNodeVersion()}`);
    });
  }

  it(`${SCANNER} contains exactly one Node binary and no package managers`, () => {
    requireBuild();
    const script =
      "find / -xdev -type f -name node -perm -u+x -not -path '/proc/*' -not -path '/ms-playwright/*' 2>/dev/null; " +
      "for tool in npm npx yarn yarnpkg corepack; do command -v $tool; done; true";
    const r = sh("docker", ["run", "--rm", "--entrypoint", "sh", SCANNER, "-c", script], 180_000);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split(/\s+/)).toEqual(["/usr/local/bin/node"]);
  }, 180_000);
});

describe("Docker availability (T024 prerequisite)", () => {
  it.skipIf(available)(
    "Docker daemon is required for the built-image checks — currently unavailable (not executed)",
    () => {
      expect(available).toBe(false);
    },
  );
});
