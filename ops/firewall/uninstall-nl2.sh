#!/usr/bin/env bash
# Removes the NL-2 egress firewall rules (task T057; ADR-0001 §3 with Amendment 1): only rules
# tagged accesslens-nl2 in DOCKER-USER and INPUT. Untagged rules, chain policies and Docker-owned
# chains are never touched; there is no flush. Running it twice is harmless.
#
# With the rules removed, live scanning must stay disabled (SCAN_ENABLED=false).
# Requires root on the host. Tests: tests/config/nl2-firewall.test.ts (fake tools, no root).
set -euo pipefail

readonly TAG="accesslens-nl2"

removed=0
for chain in DOCKER-USER INPUT; do
  if ! listing=$(iptables -S "$chain" 2>/dev/null); then
    echo "uninstall-nl2: chain $chain not found; nothing to remove there" >&2
    continue
  fi
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    read -r -a rule <<<"${line#-A }"
    iptables -D "${rule[@]}"
    removed=$((removed + 1))
  done < <(grep -F -- "--comment $TAG" <<<"$listing" || true)
done

echo "uninstall-nl2: removed $removed accesslens-nl2 rules"
