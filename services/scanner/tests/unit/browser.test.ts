// Browser-launch tests (task T053; implementation T055). ADR-0001 §2 (Chromium flags kept as
// defense in depth; the proxy addressed by its fixed IP so Chromium needs no DNS) and Amendment 2
// (chromiumSandbox: true; --no-sandbox and --disable-sandbox forbidden); research R3 "Browser
// launch" and R4 (one browser per slot, recycled every 50 audits; fresh context per audit).
//
// These are unit tests: nothing launches Chromium. The sandbox-on check under the real Compose
// service is tests/config/scanner-sandbox.test.ts (required in CI).
//
// API expected from T055 (services/scanner/src/browser.ts):
//   export const LAUNCH_ARGS: readonly string[];
//   export function launchOptions(): import("playwright").LaunchOptions;
//   export function contextOptions(options: {
//     proxyAddr: string;                                // EGRESS_PROXY_ADDR, e.g. "172.30.30.30:3128"
//     credentials: { username: string; password: string };  // registered for this audit (T056)
//   }): import("playwright").BrowserContextOptions;
//   export type BrowserLike = { newContext(o: BrowserContextOptions): Promise<unknown>; close(): Promise<void> };
//   export function createBrowserPool(options: {
//     slots: number;                                    // SCAN_CONCURRENCY
//     launch: () => Promise<BrowserLike>;               // chromium.launch(launchOptions()) in production
//     recycleAfter?: number;                            // default 50
//   }): {
//     browserFor(slot: number): Promise<BrowserLike>;   // one browser per slot, launched lazily
//     auditDone(slot: number): Promise<void>;           // after `recycleAfter` audits the slot's browser
//                                                       // is closed; the next browserFor relaunches it
//     close(): Promise<void>;
//   };
import { describe, expect, it } from "vitest";
import {
  contextOptions,
  createBrowserPool,
  LAUNCH_ARGS,
  launchOptions,
  type BrowserLike,
} from "../../src/browser.ts";

const PROXY_ADDR = "172.30.30.30:3128";
const CREDS = { username: "audit-a-user", password: "a".repeat(43) };

const REQUIRED_ARGS = [
  "--proxy-bypass-list=<-loopback>",
  "--host-resolver-rules=MAP * ~NOTFOUND",
  "--disable-quic",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
];

describe("launch options", () => {
  it.each(REQUIRED_ARGS)("include %s", (arg) => {
    expect(LAUNCH_ARGS).toContain(arg);
    expect(launchOptions().args).toContain(arg);
  });

  it("never disable the sandbox", () => {
    const args = launchOptions().args ?? [];
    for (const arg of [...LAUNCH_ARGS, ...args]) {
      expect(arg).not.toMatch(/^--(no|disable)-sandbox\b/);
    }
  });

  it("set chromiumSandbox: true (Playwright leaves the sandbox off otherwise)", () => {
    expect(launchOptions().chromiumSandbox).toBe(true);
  });
});

describe("per-audit context options", () => {
  const options = contextOptions({ proxyAddr: PROXY_ADDR, credentials: CREDS });

  it("use the audit's proxy credentials, with the proxy addressed by its fixed IP", () => {
    expect(options.proxy).toEqual({
      server: "http://172.30.30.30:3128",
      username: CREDS.username,
      password: CREDS.password,
    });
  });

  it("refuse downloads", () => {
    expect(options.acceptDownloads).toBe(false);
  });

  it("block service workers", () => {
    expect(options.serviceWorkers).toBe("block");
  });

  it("use a 1280×800 viewport", () => {
    expect(options.viewport).toEqual({ width: 1280, height: 800 });
  });

  it("are built fresh for each audit's credentials", () => {
    const other = { username: "audit-b-user", password: "b".repeat(43) };
    const second = contextOptions({ proxyAddr: PROXY_ADDR, credentials: other });
    expect(second.proxy).toMatchObject(other);
    expect(options.proxy).toMatchObject(CREDS);
  });
});

type FakeBrowser = BrowserLike & { id: number; closed: boolean };

/** Fake browsers that record whether they were closed; nothing launches Chromium. */
function fakeLauncher() {
  const launched: FakeBrowser[] = [];
  const launch = async (): Promise<BrowserLike> => {
    const browser: FakeBrowser = {
      id: launched.length + 1,
      closed: false,
      newContext: async () => ({}),
      close: async () => {
        browser.closed = true;
      },
    };
    launched.push(browser);
    return browser;
  };
  return { launch, launched };
}
const idOf = (b: BrowserLike) => (b as FakeBrowser).id;

describe("one browser per concurrency slot", () => {
  it("each slot gets its own browser, reused across audits", async () => {
    const { launch, launched } = fakeLauncher();
    const pool = createBrowserPool({ slots: 2, launch });
    const a1 = await pool.browserFor(0);
    const b1 = await pool.browserFor(1);
    const a2 = await pool.browserFor(0);
    expect(idOf(a1)).not.toBe(idOf(b1));
    expect(idOf(a2)).toBe(idOf(a1));
    expect(launched).toHaveLength(2);
  });

  it("refuses a slot outside 0..slots-1", async () => {
    const { launch } = fakeLauncher();
    const pool = createBrowserPool({ slots: 2, launch });
    await expect(pool.browserFor(2)).rejects.toThrow();
    await expect(pool.browserFor(-1)).rejects.toThrow();
  });
});

describe("recycle after 50 audits", () => {
  it("keeps the browser for 49 audits and relaunches it after the 50th", async () => {
    const { launch, launched } = fakeLauncher();
    const pool = createBrowserPool({ slots: 2, launch });
    const first = await pool.browserFor(0);
    for (let i = 0; i < 49; i++) {
      await pool.auditDone(0);
      expect(idOf(await pool.browserFor(0))).toBe(idOf(first));
    }
    await pool.auditDone(0); // the 50th
    expect(launched[0]?.closed).toBe(true);
    const next = await pool.browserFor(0);
    expect(idOf(next)).not.toBe(idOf(first));
  });

  it("recycling one slot leaves the other slot's browser alone", async () => {
    const { launch, launched } = fakeLauncher();
    const pool = createBrowserPool({ slots: 2, launch });
    await pool.browserFor(0);
    const other = await pool.browserFor(1);
    for (let i = 0; i < 50; i++) await pool.auditDone(0);
    expect(launched.find((l) => l.id === idOf(other))?.closed).toBe(false);
    expect(idOf(await pool.browserFor(1))).toBe(idOf(other));
  });

  it("the default is 50", async () => {
    const { launch } = fakeLauncher();
    const pool = createBrowserPool({ slots: 1, launch });
    const first = await pool.browserFor(0);
    for (let i = 0; i < 50; i++) await pool.auditDone(0);
    expect(idOf(await pool.browserFor(0))).not.toBe(idOf(first));
  });
});
