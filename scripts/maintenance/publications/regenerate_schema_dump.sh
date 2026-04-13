#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-data}"
OUTPUT_PATH="${2:-database/data.schema.sql}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

mariadb-dump \
  --no-data \
  --routines \
  --triggers \
  --events \
  --skip-opt \
  --create-options \
  --add-drop-table \
  --set-charset \
  --skip-dump-date \
  --no-tablespaces \
  "$DB_NAME" \
  > "$OUTPUT_PATH"

printf 'Schema dump written to %s (%d lines).\n' \
  "$OUTPUT_PATH" "$(wc -l < "$OUTPUT_PATH")"
