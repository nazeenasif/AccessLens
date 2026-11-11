// Vitest projects (task T008). Vitest deprecated the separate `vitest.workspace.ts` file in 3.2
// in favour of `test.projects`, so the projects are defined here.
import { defineConfig } from "vitest/config";

const workspaces = ["packages/shared", "services/egress-proxy", "services/scanner", "apps/web"];
const layer = (name: "unit" | "integration" | "security") =>
  workspaces.map((w) => `${w}/tests/${name}/**/*.test.{ts,tsx}`);

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: layer("unit"), environment: "node" } },
      { test: { name: "integration", include: layer("integration"), environment: "node" } },
      { test: { name: "security", include: layer("security"), environment: "node" } },
      {
        test: {
          name: "config",
          include: ["tests/config/**/*.test.ts"],
          environment: "node",
          // Docker-backed files share fixed Compose subnets and port 3000, so they can't overlap.
          fileParallelism: false,
          testTimeout: 600_000,
          hookTimeout: 900_000,
        },
      },
    ],
    passWithNoTests: true,
  },
});
