// Placeholder entrypoint (task T011). The scanner service is implemented in M3 (T085–T092).
// It deliberately launches no browser, opens no listeners, and makes no network connections.
console.log(JSON.stringify({ event: "scanner.placeholder", msg: "not implemented (M3)" }));

setInterval(() => undefined, 60_000);
