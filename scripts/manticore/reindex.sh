#!/usr/bin/env bash
#
# Build / rotate the Manticore plain tables from MariaDB. Run as the manticore user:
#
#   sudo -u manticore scripts/manticore/reindex.sh init    # first full build (then restart searchd)
#   sudo -u manticore scripts/manticore/reindex.sh delta   # frequent: works_delta + persons_delta (live rotate)
#   sudo -u manticore scripts/manticore/reindex.sh main     # nightly: works_main + persons_main (live rotate)
#
# Requires libmysqlclient.so.21 resolvable (see calls/2026-06-11_manticore_deploy_and_index.md).
#
set -euo pipefail

CONF="${MANTICORE_CONF:-/etc/manticoresearch/manticore.conf}"
INDEXER="$(command -v indexer)"
MODE="${1:-delta}"

[ -n "$INDEXER" ] || { echo "indexer not found in PATH" >&2; exit 1; }
[ -f "$CONF" ] || { echo "missing config: $CONF" >&2; exit 1; }

case "$MODE" in
  init|all) TABLES="works_main works_delta persons_main persons_delta" ;;
  delta)    TABLES="works_delta persons_delta" ;;
  main)     TABLES="works_main persons_main" ;;
  *) echo "usage: $0 [init|all|delta|main]" >&2; exit 2 ;;
esac

# searchd runs as a persistent systemd service and holds the table-slot locks, so always
# rotate: indexer builds .new files and signals searchd to load them live (no restart).
# shellcheck disable=SC2086
"$INDEXER" --config "$CONF" --rotate $TABLES
