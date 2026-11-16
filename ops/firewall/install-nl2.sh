#!/usr/bin/env bash
# Installs the NL-2 egress firewall rules (task T057). ADR-0001 §3 as amended by Amendment 1
# (drop first, state-independent, scoped to the outbound subnet, tagged, idempotent, conntrack
# flush for the outbound subnet only), Amendment 3 (one range list) and Amendment 5 (how
# conntrack helpers are confirmed off).
#
# - Pre-checks first, and nothing changes unless all of them pass (fail closed, exit 1). One of
#   them refuses while any AccessLens container is running: stop the stack before a re-run.
# - DOCKER-USER rules 1..n: -s <outbound> -d <dest> ... -j DROP, destinations in this order:
#   nonpublic-ipv4.txt (file order), then every IPv4 Docker bridge subnet (`docker network ls`
#   order), skipping exact duplicates.
# - INPUT rules 1..m: the same drop for every host IPv4 address (`ip` order).
# - Every rule carries the comment tag accesslens-nl2. Existing tagged rules are deleted first,
#   so a re-run produces an identical rule set. Untagged rules, chain policies and Docker-owned
#   chains are never touched; there is no flush and no ACCEPT.
# - Afterwards: conntrack -D -s <outbound> only, never a global flush.
#
# Requires root on the host. Tests: tests/config/nl2-firewall.test.ts (fake tools, no root).
set -euo pipefail

readonly TAG="accesslens-nl2"
readonly COMPOSE_PROJECT="accesslens"
readonly OUTBOUND_NETWORK="${COMPOSE_PROJECT}_outbound"
here=$(cd "$(dirname "$0")" && pwd)
readonly RANGES_FILE="$here/nonpublic-ipv4.txt"
readonly COMPOSE_FILE="$here/../../docker-compose.yml"
readonly IPV4_CIDR='^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
readonly IPV4_ADDR='^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
readonly KERNEL_VERSION='^([0-9]+)\.([0-9]+)'

changed=0
fail() {
  echo "install-nl2: $*" >&2
  if [ "$changed" = 0 ]; then
    echo "install-nl2: no rule was changed" >&2
  else
    echo "install-nl2: the rule set may be incomplete; fix the problem and run install-nl2.sh again" >&2
  fi
  exit 1
}

# The fixed `outbound` subnet from docker-compose.yml's top-level networks section.
compose_outbound() {
  awk '
    /^networks:/ { in_networks = 1; next }
    in_networks && /^[^ #]/ { in_networks = 0 }
    in_networks && /^  outbound:/ { in_outbound = 1; next }
    in_outbound && /^  [^ ]/ { in_outbound = 0 }
    in_outbound && /subnet:/ { gsub(/["\047]/, "", $NF); print $NF; exit }
  ' "$COMPOSE_FILE"
}

# IPv4 subnets of a Docker network, one per line.
network_subnets() {
  local subnets
  subnets=$(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$1") ||
    fail "can't inspect Docker network $1"
  tr ' ' '\n' <<<"$subnets" | grep -E "$IPV4_CIDR" || true
}

# ---------------------------------------------------------------------------------------------
# Pre-checks. Nothing below them changes anything until every one has passed.

iptables -S DOCKER-USER >/dev/null 2>&1 ||
  fail "the DOCKER-USER chain doesn't exist: Docker's firewall backend must be iptables"

# Install deletes the tagged rules before inserting the new set, so while the stack runs there
# would be a moment without them. Refuse while any AccessLens container is running (created or
# stopped containers, e.g. from `docker compose up --no-start`, are fine). ADR-0001 Amendment 5.
running=$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --format '{{.Names}}') ||
  fail "can't list running containers (docker ps)"
if [ -n "$running" ]; then
  fail "AccessLens containers are running ($(tr '\n' ' ' <<<"$running" | sed 's/ $//')); stop the stack before installing, because install deletes the rules before inserting them"
fi

[ -r "$RANGES_FILE" ] || fail "range file $RANGES_FILE is missing (npm run firewall:ranges)"
[ -r "$COMPOSE_FILE" ] || fail "docker-compose.yml not found next to ops/firewall"

outbound=$(compose_outbound)
[[ "$outbound" =~ $IPV4_CIDR ]] || fail "can't read the outbound subnet from docker-compose.yml"

actual=$(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' \
  "$OUTBOUND_NETWORK" 2>/dev/null) ||
  fail "the outbound network ($OUTBOUND_NETWORK) doesn't exist; create the Compose networks first"
actual=$(tr ' ' '\n' <<<"$actual" | grep -E "$IPV4_CIDR" | head -n 1 || true)
[ "$actual" = "$outbound" ] ||
  fail "the outbound network's subnet (${actual:-none}) differs from docker-compose.yml ($outbound)"

# Conntrack helpers must be off (ADR-0001 Amendment 5).
if helper=$(sysctl -n net.netfilter.nf_conntrack_helper 2>/dev/null); then
  [ "$helper" = "0" ] ||
    fail "net.netfilter.nf_conntrack_helper is $helper; automatic helper assignment must be off (0)"
else
  kernel=$(uname -r)
  if [[ "$kernel" =~ $KERNEL_VERSION ]]; then
    # Kernel 6.0 removed the sysctl together with automatic helper assignment (b118509076b3).
    [ "${BASH_REMATCH[1]}" -ge 6 ] ||
      fail "net.netfilter.nf_conntrack_helper is missing on kernel $kernel (before 6.0), so helpers can't be confirmed off"
  else
    fail "net.netfilter.nf_conntrack_helper is missing and the kernel version '$kernel' can't be parsed"
  fi
fi
raw=$(iptables -t raw -S 2>/dev/null) || fail "can't list the raw table to check for conntrack helpers"
if grep -Eq -- '-j CT( .*)? --helper' <<<"$raw"; then
  fail "a raw-table rule attaches a conntrack helper (-j CT --helper); helpers must be off"
fi

command -v conntrack >/dev/null 2>&1 || fail "conntrack is not installed (conntrack-tools)"

# Destinations, in order: the range file, then the IPv4 bridge subnets; no exact duplicates.
ranges=$({ grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$RANGES_FILE" || true; } |
  tr -d '\r[:blank:]')
while IFS= read -r range; do
  [[ "$range" =~ $IPV4_CIDR ]] || fail "invalid line in $RANGES_FILE: $range"
done <<<"$ranges"
[ -n "$ranges" ] || fail "$RANGES_FILE lists no ranges"
networks=$(docker network ls --filter driver=bridge --format '{{.Name}}') ||
  fail "can't list Docker networks"
bridges=$(while IFS= read -r name; do
  if [ -n "$name" ]; then network_subnets "$name"; fi
done <<<"$networks")
dests=$(printf '%s\n%s\n' "$ranges" "$bridges" | grep -E "$IPV4_CIDR" | awk '!seen[$0]++')

# Host IPv4 addresses, in `ip` order.
addrs=$(ip -4 -o addr show | awk '{ for (i = 1; i < NF; i++) if ($i == "inet") { print $(i + 1); break } }' |
  cut -d/ -f1 | awk '!seen[$0]++')
[ -n "$addrs" ] || fail "can't read the host's IPv4 addresses"
while IFS= read -r addr; do
  [[ "$addr" =~ $IPV4_ADDR ]] || fail "unexpected host address: $addr"
done <<<"$addrs"

# ---------------------------------------------------------------------------------------------
# Replace the tagged rules: delete every existing one, then insert the new set.

delete_tagged() {
  local chain=$1 line
  local -a rule
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    read -r -a rule <<<"${line#-A }"
    iptables -D "${rule[@]}"
  done < <(iptables -S "$chain" | grep -F -- "--comment $TAG" || true)
}
changed=1
delete_tagged DOCKER-USER
delete_tagged INPUT

position=1
while IFS= read -r dest; do
  iptables -I DOCKER-USER "$position" -s "$outbound" -d "$dest" -m comment --comment "$TAG" -j DROP
  position=$((position + 1))
done <<<"$dests"
docker_user_rules=$((position - 1))

position=1
while IFS= read -r addr; do
  iptables -I INPUT "$position" -s "$outbound" -d "$addr/32" -m comment --comment "$TAG" -j DROP
  position=$((position + 1))
done <<<"$addrs"
input_rules=$((position - 1))

# Cut flows that conntrack already tracks for the outbound subnet, and nothing else. conntrack
# exits 1 when there was nothing to delete; that isn't an error.
if ! flush=$(conntrack -D -s "$outbound" 2>&1); then
  grep -q "flow entries have been deleted" <<<"$flush" || fail "conntrack -D -s $outbound failed: $flush"
fi

echo "install-nl2: installed $docker_user_rules DOCKER-USER and $input_rules INPUT rules for $outbound"
