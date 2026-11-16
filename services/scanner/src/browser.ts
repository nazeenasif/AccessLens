// Browser launch and per-slot pool (task T055; tests T053). ADR-0001 §2 (Chromium flags kept as
// defense in depth; the proxy is addressed by its fixed IP, so Chromium needs no DNS) and
// Amendment 2 (chromiumSandbox: true; --no-sandbox and --disable-sandbox are forbidden); research
// R3 "Browser launch" and R4 (one browser per concurrency slot, recycled every 50 audits; a fresh
// context per audit).
import type { BrowserContextOptions, LaunchOptions } from "playwright";

/** Chromium flags from research R3. None of them weakens the sandbox. */
export const LAUNCH_ARGS: readonly string[] = [
  // Removes Chromium's implicit loopback bypass, so even 127.0.0.1 goes through the proxy.
  "--proxy-bypass-list=<-loopback>",
  // No DNS at all: the proxy is addressed by IP, and every host name fails to resolve locally.
  "--host-resolver-rules=MAP * ~NOTFOUND",
  // No QUIC (UDP), which wouldn't go through the HTTP proxy.
  "--disable-quic",
  // WebRTC may only use the proxy, never direct UDP.
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
];

/**
 * Playwright launch options. `chromiumSandbox: true` is required: Playwright launches Chromium
 * without its sandbox unless asked (ADR-0001 Amendment 2).
 */
export function launchOptions(): LaunchOptions {
  return { chromiumSandbox: true, args: [...LAUNCH_ARGS] };
}

/** Options for one audit's fresh context, with that audit's proxy credentials (T056). */
export function contextOptions(options: {
  proxyAddr: string;
  credentials: { username: string; password: string };
}): BrowserContextOptions {
  const { proxyAddr, credentials } = options;
  return {
    proxy: {
      server: `http://${proxyAddr}`,
      username: credentials.username,
      password: credentials.password,
    },
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
  };
}

export type BrowserLike = {
  newContext(options: BrowserContextOptions): Promise<unknown>;
  close(): Promise<void>;
};

const RECYCLE_AFTER = 50;

/**
 * One browser per concurrency slot, launched lazily, so recycling or killing one slot's browser
 * never affects another slot's audit. After `recycleAfter` audits a slot's browser is closed and
 * the next `browserFor` launches a fresh one.
 */
export function createBrowserPool(options: {
  slots: number;
  launch: () => Promise<BrowserLike>;
  recycleAfter?: number;
}) {
  const { slots, launch } = options;
  const recycleAfter = options.recycleAfter ?? RECYCLE_AFTER;
  // Promises, so two concurrent calls for the same slot share one launch.
  const browsers = new Map<number, Promise<BrowserLike>>();
  const audits = new Map<number, number>();

  const checkSlot = (slot: number) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
      throw new RangeError(`slot ${slot} is outside 0..${slots - 1}`);
    }
  };

  const retire = async (slot: number) => {
    const browser = browsers.get(slot);
    browsers.delete(slot);
    audits.set(slot, 0);
    if (browser !== undefined) await (await browser).close();
  };

  return {
    async browserFor(slot: number): Promise<BrowserLike> {
      checkSlot(slot);
      let browser = browsers.get(slot);
      if (browser === undefined) {
        browser = launch();
        browsers.set(slot, browser);
        // A failed launch must not be cached: the next call tries again.
        browser.catch(() => {
          if (browsers.get(slot) === browser) browsers.delete(slot);
        });
      }
      return browser;
    },

    async auditDone(slot: number): Promise<void> {
      checkSlot(slot);
      const count = (audits.get(slot) ?? 0) + 1;
      audits.set(slot, count);
      if (count >= recycleAfter) await retire(slot);
    },

    async close(): Promise<void> {
      await Promise.all([...browsers.keys()].map(retire));
    },
  };
}
