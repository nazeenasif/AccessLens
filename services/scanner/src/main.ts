// Scanner entrypoint. T198: refuse unsafe startup configurations first (T044), exiting non-zero
// and naming the variables. The scanner service itself is implemented in M3 (T085–T092); until
// then it launches no browser, opens no listeners, and makes no network connections.
import { startupProblems } from "./startup-refusal.ts";

const problems = startupProblems(process.env);
if (problems.length > 0) {
  process.stderr.write(`${JSON.stringify({ event: "scanner.config_invalid", problems })}\n`);
  process.exit(1);
}

console.log(JSON.stringify({ event: "scanner.placeholder", msg: "not implemented (M3)" }));

setInterval(() => undefined, 60_000);
