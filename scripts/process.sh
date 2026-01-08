#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-}"

if [ -z "$ACTION" ]; then
  echo "Usage: $0 {build|dev|deploy}" >&2
  exit 1
fi

clean_workspace() {
  rm -rf coverage
  rm -rf runtime/*
  rm -rf logs/*.log logs/*.log.gz
  rm -rf node_modules/.cache
}

install_dependencies() {
  npm install --include=dev --no-fund
}

run_docs_cache() {
  npm run docs:generate >/dev/null 2>&1 || true
}

case "$ACTION" in
  build)
    npm cache clean --force
    clean_workspace
    install_dependencies
    run_docs_cache
    npm run test
    ;;
  dev)
    clean_workspace
    install_dependencies
    run_docs_cache
    exec npm run dev:server
    ;;
  deploy)
    npm cache clean --force
    clean_workspace
    exec bash scripts/manage.sh deploy
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac
