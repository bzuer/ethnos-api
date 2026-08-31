#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-}"
ENV_FILE="/etc/node-backend.env"

if [ -z "$ACTION" ]; then
  echo "Usage: $0 {build|dev|deploy}" >&2
  exit 1
fi

require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Environment file ${ENV_FILE} not found" >&2
    exit 1
  fi
}

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

# The dev server binds the same loopback port the vhost proxies to, so a running
# nginx fronts it exactly as it fronts production. Missing config is reported,
# never installed here: writing to /etc is a deliberate step, not a side effect
# of starting a dev server.
report_public_entry() {
  local public_port upstream_port conf
  public_port="${NGINX_PUBLIC_PORT:-1211}"
  upstream_port="${PORT:-1212}"
  conf="${NGINX_API_CONF:-/etc/nginx/conf.d/ethnos-api.conf}"

  if [ -r "$conf" ] && systemctl is-active --quiet nginx 2>/dev/null; then
    echo "API published at http://localhost:${public_port} (nginx → 127.0.0.1:${upstream_port})"
  else
    echo "nginx vhost not active (${conf}); the API answers only on 127.0.0.1:${upstream_port}" >&2
    echo "Publish it with: scripts/manage.sh nginx" >&2
  fi
}

case "$ACTION" in
  build)
    require_env_file
    clean_workspace
    install_dependencies
    run_docs_cache
    npm run test
    ;;
  dev)
    require_env_file
    set -a; . "$ENV_FILE"; set +a
    clean_workspace
    install_dependencies
    run_docs_cache
    report_public_entry
    exec npm run dev:server
    ;;
  deploy)
    require_env_file
    npm cache clean --force
    clean_workspace
    exec bash scripts/manage.sh deploy
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac
