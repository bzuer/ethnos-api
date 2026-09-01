#!/usr/bin/env bash
#
# Build and rotate the Manticore plain tables from MariaDB, verifying that the
# seamless rotate actually completes (searchd consumes every .new file). The
# script is safe to launch as root, via sudo, or from cron: it re-executes
# itself as the manticore user so the freshly built .new files are always owned
# by the daemon user and can be swapped in. This closes the historical stuck
# state where a root-owned .new build sat un-rotated and searchd kept serving
# the stale index.
#
#   scripts/manticore/reindex.sh init    # first full build of every table
#   scripts/manticore/reindex.sh delta   # frequent: works_delta + persons_delta
#   scripts/manticore/reindex.sh main    # nightly: works_main + persons_main
#
# Requires libmysqlclient.so.21 resolvable (symlink it to libmysqlclient.so.24).
#
set -euo pipefail

RUN_AS="${MANTICORE_USER:-manticore}"
SELF_INSTALLED="/usr/local/bin/manticore-ethnos-reindex"

# Always run as the daemon user so .new files are daemon-owned and rotatable.
if [ "$(id -un)" != "$RUN_AS" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    target="$SELF_INSTALLED"; [ -x "$target" ] || target="$0"
    if command -v runuser >/dev/null 2>&1; then
      exec runuser -u "$RUN_AS" -- "$target" "$@"
    else
      exec sudo -u "$RUN_AS" -- "$target" "$@"
    fi
  fi
  echo "must run as '$RUN_AS' (got '$(id -un)'); try: sudo -u $RUN_AS $SELF_INSTALLED ${1:-delta}" >&2
  exit 1
fi

CONF="${MANTICORE_CONF:-/etc/manticoresearch/manticore.conf}"
INDEXER="$(command -v indexer || true)"
MODE="${1:-delta}"
ROTATE_TIMEOUT="${MANTICORE_ROTATE_TIMEOUT:-600}"

[ -n "$INDEXER" ] || { echo "indexer not found in PATH" >&2; exit 1; }
[ -r "$CONF" ]    || { echo "missing or unreadable config: $CONF" >&2; exit 1; }

case "$MODE" in
  init|all) TABLES="works_main works_delta persons_main persons_delta" ;;
  delta)    TABLES="works_delta persons_delta" ;;
  main)     TABLES="works_main persons_main" ;;
  *) echo "usage: $0 [init|all|delta|main]" >&2; exit 2 ;;
esac

# searchd must be live to accept the rotate signal; otherwise the .new files are
# built but never swapped in. Fail loudly instead of silently serving stale data.
searchd_pid="$(pgrep -x searchd | head -1 || true)"
if [ -z "$searchd_pid" ]; then
  echo "searchd is not running; start it (systemctl start manticore) before reindexing so the rotate can complete" >&2
  exit 1
fi

table_path() {
  local p
  p="$(awk -v t="$1" '
    $1=="table"{inblk=($2==t)}
    inblk && $1=="path"{print $3; exit}
  ' "$CONF")"
  [ -n "$p" ] && { printf '%s\n' "$p"; return; }
  printf '%s/%s\n' "${MANTICORE_DATA_DIR:-/var/lib/manticore/ethnos}" "$1"
}

# Clear orphaned .new files from a previously aborted/un-rotated run so the
# indexer starts clean and a stale header can never mask the rotate check.
for t in $TABLES; do
  base="$(table_path "$t")"
  rm -f "$base".new.* 2>/dev/null || true
done

echo "[reindex] building + rotating: $TABLES (as $(id -un), searchd pid $searchd_pid)"
# shellcheck disable=SC2086
"$INDEXER" --config "$CONF" --rotate $TABLES

# The seamless rotate is asynchronous: indexer signals searchd and exits while
# searchd loads the .new files and renames them into place. Rotation is done
# only once every .new header is gone. Poll, nudge searchd once with SIGHUP if a
# table stalls, and fail loudly if it never swaps in.
wait_rotation() {
  local base header deadline nudged=0
  base="$(table_path "$1")"; header="$base.new.sph"
  deadline=$(( $(date +%s) + ROTATE_TIMEOUT ))
  while [ -e "$header" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      if [ "$nudged" -eq 0 ]; then
        echo "[reindex] $1 not rotated yet; nudging searchd (pid $searchd_pid) with SIGHUP" >&2
        kill -HUP "$searchd_pid" 2>/dev/null || true
        nudged=1
        deadline=$(( $(date +%s) + ROTATE_TIMEOUT ))
        continue
      fi
      echo "[reindex] FAILED: $1 did not rotate within ${ROTATE_TIMEOUT}s; .new files remain at $base.new.*" >&2
      return 1
    fi
    sleep 3
  done
}

rc=0
for t in $TABLES; do
  if wait_rotation "$t"; then
    echo "[reindex] rotated live: $t"
  else
    rc=1
  fi
done

if [ "$rc" -eq 0 ]; then
  echo "[reindex] done; all tables rotated live"
else
  echo "[reindex] one or more tables failed to rotate (see above)" >&2
fi
exit "$rc"
