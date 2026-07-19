#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-data}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_PATH="${2:-backups/data.schema.$(date +%Y-%m-%d).sql}"
mkdir -p "$(dirname "$OUTPUT_PATH")"

mysqldump -d --routines --events --order-by-primary --single-transaction \
  --compact --skip-comments --skip-tz-utc --default-character-set=utf8mb4 \
  "$DB_NAME" > "$OUTPUT_PATH"

printf 'Schema dump written to %s (%d lines).\n' \
  "$OUTPUT_PATH" "$(wc -l < "$OUTPUT_PATH")"
