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
  | perl -CSD -pe 's/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2300}-\x{23FF}\x{2B00}-\x{2BFF}\x{FE0F}]//g' \
  > "$OUTPUT_PATH"

printf 'Schema dump written to %s (%d lines).\n' \
  "$OUTPUT_PATH" "$(wc -l < "$OUTPUT_PATH")"
