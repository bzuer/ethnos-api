#!/usr/bin/env bash
#
# Render config/manticore.conf into the live Manticore config, injecting the
# MariaDB password from /etc/node-backend.env (never committed). Run as root.
#
#   sudo scripts/manticore/render-config.sh
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/node-backend.env}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${REPO_ROOT}/config/manticore.conf"
DEST="${MANTICORE_CONF:-/etc/manticoresearch/manticore.conf}"
DATA_DIR="${MANTICORE_DATA_DIR:-/var/lib/manticore/ethnos}"

[ -f "$SRC" ] || { echo "missing source config: $SRC" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "missing env file: $ENV_FILE" >&2; exit 1; }

PASS="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[ -n "$PASS" ] || { echo "DB_PASSWORD not found in $ENV_FILE" >&2; exit 1; }

content="$(cat "$SRC")"
content="${content//__DB_PASSWORD__/$PASS}"
printf '%s\n' "$content" > "$DEST"
chmod 640 "$DEST"
chown root:manticore "$DEST" 2>/dev/null || true

mkdir -p "$DATA_DIR" /var/log/manticore /run/manticore
chown -R manticore:manticore "$DATA_DIR" /var/log/manticore /run/manticore 2>/dev/null || true

echo "rendered ${DEST}; data dir ${DATA_DIR} ready"
