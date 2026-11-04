// Image-user test (task T024; ADR-0003 M0 list, ADR-0001 §4).
// Every service image must run as a non-root UID, and base images must use pinned tags.
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

describe("base images are pinned (T024, static)", () => {
  for (const df of DOCKERFILES) {
    it(`${df} uses explicit version tags, never latest`, () => {
      const imgs = baseImages(df);
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        expect(img, img).toMatch(/:v?\d+\.\d+\.\d+/);
        expect(img, img).not.toMatch(/:latest$/);
      }
    });
  }
});

describe.skipIf(!run)("images run as non-root (T024, built)", () => {
  beforeAll(() => assertDocker(available, "T024"));

  it("builds all service images", () => {
    const r = compose("build", "web", "scanner", "egress-proxy");
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  }, 1_800_000);

  for (const image of IMAGES) {
    it(`${image} runs with a non-root UID`, () => {
      const r = sh("docker", ["run", "--rm", "--entrypoint", "id", image, "-u"], 120_000);
      expect(r.status, r.stderr).toBe(0);
      expect(Number(r.stdout.trim())).toBeGreaterThan(0);
    });
  }
});

describe("Docker availability (T024 prerequisite)", () => {
  it.skipIf(available)(
    "Docker daemon is required for the built-image checks — currently unavailable (not executed)",
    () => {
      expect(available).toBe(false);
    },
  );
});
