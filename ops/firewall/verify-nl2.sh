#!/usr/bin/env bash
# Verifies the NL-2 egress firewall rules (task T057; ADR-0001 §3 with Amendments 1 and 3).
# READ-ONLY: it only lists rules (iptables -S) and reads Docker networks and host addresses; it
# never adds, deletes or flushes anything.
#
# Exit 0 only if, in both DOCKER-USER and INPUT, the accesslens-nl2-tagged rules are exactly the
# expected ones, they are the first rules of the chain, they are in the expected order (the order
# install-nl2.sh uses), and none of them is an ACCEPT. Otherwise exit 1, naming every problem.
#
# Tests: tests/config/nl2-firewall.test.ts (fake tools, no root).
set -euo pipefail

readonly TAG="accesslens-nl2"
here=$(cd "$(dirname "$0")" && pwd)
readonly RANGES_FILE="$here/nonpublic-ipv4.txt"
readonly COMPOSE_FILE="$here/../../docker-compose.yml"
readonly IPV4_CIDR='^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'

problems=0
problem() {
  echo "verify-nl2: $*" >&2
  problems=$((problems + 1))
}
fail() {
  echo "verify-nl2: $*" >&2
  exit 1
}

compose_outbound() {
  awk '
    /^networks:/ { in_networks = 1; next }
    in_networks && /^[^ #]/ { in_networks = 0 }
    in_networks && /^  outbound:/ { in_outbound = 1; next }
    in_outbound && /^  [^ ]/ { in_outbound = 0 }
    in_outbound && /subnet:/ { gsub(/["\047]/, "", $NF); print $NF; exit }
  ' "$COMPOSE_FILE"
}

network_subnets() {
  local subnets
  subnets=$(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$1") ||
    fail "can't inspect Docker network $1"
  tr ' ' '\n' <<<"$subnets" | grep -E "$IPV4_CIDR" || true
}

docker_user=$(iptables -S DOCKER-USER 2>/dev/null) ||
  fail "the DOCKER-USER chain doesn't exist: Docker's firewall backend must be iptables"
input=$(iptables -S INPUT 2>/dev/null) || fail "can't list the INPUT chain"

[ -r "$RANGES_FILE" ] || fail "range file $RANGES_FILE is missing"
outbound=$(compose_outbound)
[[ "$outbound" =~ $IPV4_CIDR ]] || fail "can't read the outbound subnet from docker-compose.yml"

# The expected destinations, in install-nl2.sh's order.
ranges=$({ grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$RANGES_FILE" || true; } |
  tr -d '\r[:blank:]')
networks=$(docker network ls --filter driver=bridge --format '{{.Name}}') ||
  fail "can't list Docker networks"
bridges=$(while IFS= read -r name; do
  if [ -n "$name" ]; then network_subnets "$name"; fi
done <<<"$networks")
dests=$(printf '%s\n%s\n' "$ranges" "$bridges" | grep -E "$IPV4_CIDR" | awk '!seen[$0]++')
addrs=$(ip -4 -o addr show | awk '{ for (i = 1; i < NF; i++) if ($i == "inet") { print $(i + 1); break } }' |
  cut -d/ -f1 | awk '!seen[$0]++')
[ -n "$addrs" ] || fail "can't read the host's IPv4 addresses"

rule() { echo "-A $1 -s $outbound -d $2 -m comment --comment $TAG -j DROP"; }

# check <chain> <listing> <expected rules, one per line>
check() {
  local chain=$1 listing=$2 expected=$3 line
  local tagged rules top count
  # Real iptables prints an INPUT host address as a.b.c.d/32; accept it written without /32 too.
  rules=$(grep '^-A ' <<<"$listing" | sed -E 's#( -d [0-9.]+)( -m comment)#\1/32\2#' || true)
  tagged=$(grep -F -- "--comment $TAG" <<<"$rules" || true)
  count=$(grep -c . <<<"$expected" || true)

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    grep -qxF -- "$line" <<<"$tagged" || problem "$chain: missing rule for ${line#* -d }"
  done <<<"$expected"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    if grep -q -- '-j ACCEPT' <<<"$line"; then
      problem "$chain: a tagged rule is an ACCEPT, not a DROP: $line"
    elif ! grep -qxF -- "$line" <<<"$expected"; then
      problem "$chain: unexpected tagged rule: $line"
    fi
  done <<<"$tagged"

  top=$(head -n "$count" <<<"$rules")
  if [ "$top" != "$expected" ]; then
    problem "$chain: the tagged rules are not the first $count rules in the expected order (top of the chain)"
  fi
}

expected_docker_user=$(while IFS= read -r dest; do rule DOCKER-USER "$dest"; done <<<"$dests")
expected_input=$(while IFS= read -r addr; do rule INPUT "$addr/32"; done <<<"$addrs")
check DOCKER-USER "$docker_user" "$expected_docker_user"
check INPUT "$input" "$expected_input"

if [ "$problems" -gt 0 ]; then
  echo "verify-nl2: FAILED ($problems problem(s)); live scanning must stay disabled" >&2
  exit 1
fi
echo "verify-nl2: OK ($(grep -c . <<<"$expected_docker_user") DOCKER-USER and $(grep -c . <<<"$expected_input") INPUT rules for $outbound)"
