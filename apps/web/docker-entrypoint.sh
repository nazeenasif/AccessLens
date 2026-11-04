#!/bin/sh
# AccessLens web entrypoint (task T020; ADR-0001 §1). Binds Next.js ONLY to this container's
# address on the `public` network, so nothing listens on `scan-ctl` except the scanner.
# Fails closed: if no unique interface is found in WEB_PUBLIC_SUBNET, the server does not start.
set -eu

: "${WEB_PUBLIC_SUBNET:?WEB_PUBLIC_SUBNET must be set (e.g. 172.30.10.0/24)}"

if ! BIND_ADDR="$(node /app/apps/web/scripts/public-ip.mjs "$WEB_PUBLIC_SUBNET")"; then
  echo "docker-entrypoint: no interface in $WEB_PUBLIC_SUBNET; refusing to bind to all interfaces" >&2
  exit 1
fi

# Next.js standalone reads HOSTNAME as its bind address (overrides Docker's default HOSTNAME).
export HOSTNAME="$BIND_ADDR"
echo "docker-entrypoint: binding web to ${HOSTNAME}:${PORT:-3000}"
exec node /app/apps/web/server.js
