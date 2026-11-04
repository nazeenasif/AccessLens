// Placeholder entrypoint (task T010). The filtering proxy is implemented in M2 (T048–T051).
// It deliberately opens no listeners and makes no network connections.
console.log(JSON.stringify({ event: "egress_proxy.placeholder", msg: "not implemented (M2)" }));

setInterval(() => undefined, 60_000);
