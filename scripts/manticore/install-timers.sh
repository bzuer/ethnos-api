#!/usr/bin/env bash
#
# Install the systemd timers that keep the Manticore tables current: a delta
# rebuild every 10 minutes and a full rebuild every night. The nightly run is
# not optional — the delta sources only select rows whose updated_at is inside
# a 48h window, so a write that no full rebuild captured within two days falls
# out of the window and disappears from search until the next `all` run.
#
# The nightly job is `all` (every table in one indexer invocation), never
# `main` alone: rotating a fresh main discards the kill-list the delta had
# applied to it, so a main-only rebuild leaves the recently-updated works
# duplicated across both locals until the next delta rotate.
#
#   sudo scripts/manticore/install-timers.sh
#   sudo scripts/manticore/install-timers.sh --uninstall
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_SRC="${REPO_ROOT}/scripts/systemd"
UNIT_DIR="/etc/systemd/system"
HELPER="/usr/local/bin/manticore-ethnos-reindex"
UNITS="manticore-ethnos-reindex@.service manticore-ethnos-reindex@delta.timer manticore-ethnos-reindex@all.timer"
TIMERS="manticore-ethnos-reindex@delta.timer manticore-ethnos-reindex@all.timer"

[ "$(id -u)" -eq 0 ] || { echo "must run as root: sudo $0 $*" >&2; exit 1; }

if [ "${1:-}" = "--uninstall" ]; then
  for t in $TIMERS; do systemctl disable --now "$t" 2>/dev/null || true; done
  for u in $UNITS; do rm -f "${UNIT_DIR}/${u}"; done
  systemctl daemon-reload
  echo "removed the reindex timers"
  exit 0
fi

[ -x "$HELPER" ] || { echo "missing $HELPER; run scripts/manticore/render-config.sh first" >&2; exit 1; }
command -v flock >/dev/null 2>&1 || { echo "flock not found (install util-linux)" >&2; exit 1; }

for u in $UNITS; do
  [ -f "${UNIT_SRC}/${u}" ] || { echo "missing unit source: ${UNIT_SRC}/${u}" >&2; exit 1; }
  install -m 0644 "${UNIT_SRC}/${u}" "${UNIT_DIR}/${u}"
done

systemctl daemon-reload
for t in $TIMERS; do systemctl enable --now "$t"; done

echo "installed: $UNITS"
systemctl list-timers --no-pager 'manticore-ethnos-reindex@*' || true
echo
echo "logs: journalctl -t manticore-ethnos-reindex -f"
echo "run once now: systemctl start manticore-ethnos-reindex@delta.service"
