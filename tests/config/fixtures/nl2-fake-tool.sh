#!/usr/bin/env bash
# Fake iptables/docker/sysctl/ip/conntrack/uname for tests/config/nl2-firewall.test.ts (T057).
# Copied under each tool's name; it dispatches on its own name, logs every call to
# $FAKE_STATE/calls.log, and keeps each chain in $FAKE_STATE/chain-<table>-<chain>.
# It never calls a real firewall tool.
name=$(basename "$0")
{ printf '%s' "$name"; printf ' %s' "$@"; printf '\n'; } >> "$FAKE_STATE/calls.log"
case "$name" in
iptables)
  while [ "$1" = "-w" ] || [ "$1" = "--wait" ]; do shift; done
  table=filter
  if [ "$1" = "-t" ]; then table=$2; shift 2; fi
  op=$1
  shift
  chain=""
  case "$1" in ''|-*) ;; *) chain=$1; shift ;; esac
  # `iptables [-t table] -S` with no chain lists every chain of the table.
  if [ -z "$chain" ]; then
    if [ "$op" = "-S" ] || [ "$op" = "-L" ]; then
      found=0
      for f in "$FAKE_STATE/chain-$table-"*; do
        [ -f "$f" ] || continue
        found=1
        grep -v '^-A ' "$f"
      done
      for f in "$FAKE_STATE/chain-$table-"*; do [ -f "$f" ] && grep '^-A ' "$f"; done
      [ "$found" = 1 ] || { echo "iptables: can't initialize iptables table \`$table'" >&2; exit 3; }
      exit 0
    fi
    echo "iptables: missing chain" >&2
    exit 2
  fi
  f="$FAKE_STATE/chain-$table-$chain"
  if [ ! -f "$f" ]; then echo "iptables: No chain/target/match by that name." >&2; exit 1; fi
  case "$op" in
    -S|-L) cat "$f" ;;
    -C) grep -qxF -- "-A $chain $*" "$f" ;;
    -A) echo "-A $chain $*" >> "$f" ;;
    -I)
      pos=1
      case "$1" in ''|*[!0-9]*) ;; *) pos=$1; shift ;; esac
      awk -v p="$((pos + 1))" -v r="-A $chain $*" 'NR==p{print r} {print} END{if (NR<p) print r}' "$f" > "$f.tmp" && mv "$f.tmp" "$f" ;;
    -D)
      rule="-A $chain $*"
      grep -qxF -- "$rule" "$f" || { echo "iptables: Bad rule (does a matching rule exist in that chain?)." >&2; exit 1; }
      awk -v r="$rule" '$0==r && !done {done=1; next} {print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f" ;;
    *) ;;
  esac ;;
docker)
  if [ "$1 $2" = "network ls" ]; then
    for entry in $FAKE_NETWORKS; do echo "${entry%%=*}"; done
    exit 0
  fi
  if [ "$1 $2" = "network inspect" ]; then
    shift 2
    skip=0
    for a in "$@"; do
      if [ "$skip" = 1 ]; then skip=0; continue; fi
      case "$a" in -f|--format) skip=1; continue ;; -*) continue ;; esac
      found=0
      for entry in $FAKE_NETWORKS; do
        if [ "${entry%%=*}" = "$a" ]; then echo "${entry#*=}" | tr ',' ' '; found=1; fi
      done
      if [ "$found" = 0 ]; then echo "Error response from daemon: network $a not found" >&2; exit 1; fi
    done
    exit 0
  fi
  exit 0 ;;
sysctl)
  # FAKE_HELPER empty: the sysctl doesn't exist (kernel 6.0+ removed it).
  if [ -z "$FAKE_HELPER" ]; then
    echo "sysctl: cannot stat /proc/sys/net/netfilter/nf_conntrack_helper: No such file or directory" >&2
    exit 255
  fi
  if [ "$1" = "-n" ]; then echo "$FAKE_HELPER"; else echo "net.netfilter.nf_conntrack_helper = $FAKE_HELPER"; fi ;;
uname)
  if [ "$1" = "-r" ]; then echo "$FAKE_KERNEL"; else echo "Linux"; fi ;;
ip)
  i=1
  for a in $FAKE_HOST_ADDRS; do
    echo "$i: eth$i    inet $a brd 0.0.0.0 scope global eth$i\       valid_lft forever preferred_lft forever"
    i=$((i + 1))
  done ;;
conntrack)
  if [ "$FAKE_CONNTRACK_EMPTY" = 1 ]; then
    echo "conntrack v1.4.8 (conntrack-tools): 0 flow entries have been deleted." >&2
    exit 1
  fi ;;
esac
exit 0
