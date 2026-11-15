// egress-proxy entrypoint (task T051). ADR-0001 §1 and §2; contracts/internal-egress-proxy.md.
// Validates the configuration first (T044 refusals) and exits non-zero, naming the variables, if
// anything is wrong. Otherwise it starts the proxy and control listeners on the scan-egress
// address and sweeps expired credentials once a second.
import { createServer } from "node:http";
import { loadProxyConfig } from "./config.ts";
import { createControlHandler } from "./control.ts";
import { CredentialRegistry } from "./credentials.ts";
import { createProxyLogger } from "./logger.ts";
import { createProxyServer } from "./proxy.ts";

/** egress-proxy's fixed scan-egress address (docker-compose.yml; EGRESS_PROXY_ADDR). */
const SCAN_EGRESS_ADDRESS = "172.30.30.30";
const PROXY_PORT = 3128;
/** Contract §1, dated addition 2026-11-14. */
const CONTROL_PORT = 3129;
const CONTROL_RATE_LIMIT = { max: 100, windowMs: 10_000 };
const SWEEP_INTERVAL_MS = 1_000;

const result = loadProxyConfig(process.env);
if (!result.ok) {
  process.stderr.write(
    `${JSON.stringify({ event: "egress_proxy.config_invalid", problems: result.problems })}\n`,
  );
  process.exit(1);
}

const { config } = result;
const logger = createProxyLogger(process.stdout, config.logLevel);
const registry = new CredentialRegistry({ ttlMs: config.totalTimeoutMs, logger });
const proxy = createProxyServer({ registry, testMode: config.testMode, caps: config.caps });
const control = createServer(
  createControlHandler({ token: config.controlToken, registry, rateLimit: CONTROL_RATE_LIMIT }),
);

const sweeper = setInterval(() => registry.sweep(), SWEEP_INTERVAL_MS);

const fail = (listener: string) => (error: Error) => {
  logger.fatal({
    event: "egress_proxy.listen_failed",
    listener,
    code: (error as NodeJS.ErrnoException).code,
  });
  process.exit(1);
};
proxy.on("error", fail("proxy"));
control.on("error", fail("control"));
let listening = 0;
const started = () => {
  listening += 1;
  if (listening < 2) return;
  logger.info({
    event: "egress_proxy.started",
    testMode: config.testMode.enabled,
    proxyPort: PROXY_PORT,
    controlPort: CONTROL_PORT,
  });
};
proxy.listen(PROXY_PORT, SCAN_EGRESS_ADDRESS, started);
control.listen(CONTROL_PORT, SCAN_EGRESS_ADDRESS, started);

const shutdown = () => {
  clearInterval(sweeper);
  proxy.close();
  control.close();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
