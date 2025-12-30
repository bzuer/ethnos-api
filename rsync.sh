#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_USER="server"
DEST_HOST="192.168.18.50"
DEST_DIR="/home/server/api"

ssh "${DEST_USER}@${DEST_HOST}" "mkdir -p ${DEST_DIR} /var/lib/ethnos-api/sphinx"

echo "Sync repo -> ${DEST_USER}@${DEST_HOST}:${DEST_DIR}"
rsync -az --delete --info=stats2 \
  --exclude 'logs' \
  --exclude 'coverage' \
  --exclude '.git' \
  "${ROOT_DIR}/" "${DEST_USER}@${DEST_HOST}:${DEST_DIR}/"
echo "Repo sync complete"

echo "Sync sphinx indexes -> ${DEST_USER}@${DEST_HOST}:/var/lib/ethnos-api/sphinx"
rsync -az --delete --info=stats2 \
  /var/lib/ethnos-api/sphinx/ "${DEST_USER}@${DEST_HOST}:/var/lib/ethnos-api/sphinx/"
echo "Index sync complete"
