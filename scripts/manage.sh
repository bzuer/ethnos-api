#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVICE_NAME="${SERVICE_NAME:-ethnos-api.service}"
ENV_FILE="/etc/node-backend.env"

API_PORT=1211

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0

log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; ERRORS=$((ERRORS + 1)); }
step() { echo -e "\n${CYAN}${BOLD}── $* ──${NC}"; }

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    err "$ENV_FILE not found"
    return 1
  fi
  set -a; source "$ENV_FILE"; set +a
  API_PORT="${PORT:-1211}"
}

# ─── Infrastructure checks ───────────────────────────────────────────────────

check_mariadb() {
  step "MariaDB"
  local db_host="${DB_HOST:-localhost}"
  [ "$db_host" = "localhost" ] && db_host="127.0.0.1"

  if ! ss -lnt | grep -q ":${DB_PORT:-3306} " 2>/dev/null; then
    err "MariaDB is not listening on port ${DB_PORT:-3306}"
    return 1
  fi

  local db_client
  db_client=$(command -v mariadb || command -v mysql || true)
  if [ -z "$db_client" ]; then
    err "No MariaDB/MySQL client available"
    return 1
  fi

  if ! "$db_client" -h "$db_host" -P "${DB_PORT:-3306}" -u "${DB_USER}" \
    --password="${DB_PASSWORD}" -D "${DB_NAME:-data}" -e "SELECT 1" &>/dev/null; then
    err "MariaDB connection failed"
    return 1
  fi

  log "MariaDB OK (port ${DB_PORT:-3306}, database ${DB_NAME:-data})"
}

check_redis() {
  step "Redis"
  local redis_host="${REDIS_HOST:-localhost}"
  local redis_port="${REDIS_PORT:-6379}"

  if [ "${REDIS_DISABLED:-false}" = "true" ]; then
    warn "Redis disabled by config (REDIS_DISABLED=true)"
    return 0
  fi

  if ! ss -lnt | grep -q ":${redis_port} " 2>/dev/null; then
    warn "Redis not listening on port $redis_port — attempting start"
    if command -v redis-server >/dev/null 2>&1; then
      redis-server --daemonize yes --port "$redis_port" --bind 127.0.0.1 ::1 2>/dev/null || true
      sleep 1
    fi
    if ! ss -lnt | grep -q ":${redis_port} " 2>/dev/null; then
      err "Redis failed to start on port $redis_port"
      return 1
    fi
  fi

  if command -v redis-cli >/dev/null 2>&1; then
    local pong
    pong=$(redis-cli -h "$redis_host" -p "$redis_port" PING 2>/dev/null || true)
    if [ "$pong" != "PONG" ]; then
      err "Redis PING failed (got: $pong)"
      return 1
    fi
  fi

  log "Redis OK (port $redis_port)"
}

check_api() {
  step "API Service"
  local needs_start=false

  kill_rogue_api_processes

  if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    log "systemd user service $SERVICE_NAME is active"
  else
    if systemctl --user list-unit-files --type=service --no-legend 2>/dev/null \
       | awk '{print $1}' | grep -Fxq "$SERVICE_NAME"; then
      warn "$SERVICE_NAME is installed but not active — will start"
    else
      warn "$SERVICE_NAME not installed — running systemd:install"
      cmd_systemd_install
    fi
    needs_start=true
  fi

  if $needs_start; then
    systemctl --user restart "$SERVICE_NAME" 2>/dev/null || true
    sleep 3
  fi

  if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    log "API service running"
  else
    err "API service failed to start"
    journalctl --user -u "$SERVICE_NAME" --no-pager -n 10 2>/dev/null || true
    return 1
  fi

  local retries=0
  while [ $retries -lt 5 ]; do
    if curl -sf "http://localhost:${API_PORT}/health/liveness" >/dev/null 2>&1; then
      log "API health OK (http://localhost:${API_PORT})"
      return 0
    fi
    retries=$((retries + 1))
    sleep 1
  done

  warn "API is running but /health/liveness not responding yet"
}

# ─── Process cleanup ─────────────────────────────────────────────────────────

kill_rogue_api_processes() {
  local rogue_pids
  rogue_pids=$(ss -lntp 2>/dev/null \
    | awk "/:${API_PORT} / {if (match(\$0, /pid=([0-9]+)/, m)) print m[1]}" \
    | sort -u) || true

  if [ -z "$rogue_pids" ]; then
    return 0
  fi

  local service_pid=""
  if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    service_pid=$(systemctl --user show "$SERVICE_NAME" --property=MainPID --value 2>/dev/null || true)
  fi

  local pid
  for pid in $rogue_pids; do
    [ -z "$pid" ] || [ "$pid" = "0" ] && continue
    if [ -n "$service_pid" ] && [ "$pid" = "$service_pid" ]; then
      continue
    fi
    warn "Killing rogue process on port $API_PORT (PID: $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

# ─── Build helpers ───────────────────────────────────────────────────────────

clean_repo_logs() {
  [ -d "$ROOT_DIR/logs" ] && find "$ROOT_DIR/logs" -type f -delete 2>/dev/null || true
}

clear_caches() {
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" FLUSHALL 2>/dev/null || true
  fi
  local d
  for d in node_modules/.cache .tmp tmp temp logs/cache; do
    [ -d "$ROOT_DIR/$d" ] && rm -rf "${ROOT_DIR:?}/$d" 2>/dev/null || true
  done
}

install_deps() {
  log "Installing dependencies"
  npm install --include=dev --no-fund --prefer-offline 2>&1 | tail -3
}

generate_docs() {
  log "Generating documentation"
  npm run docs:generate >/dev/null 2>&1 || warn "Swagger generation failed"
}

# ─── Validation summary ─────────────────────────────────────────────────────

validate_all() {
  step "Final validation"
  local ok=0 fail=0

  local checks=(
    "MariaDB:${DB_PORT:-3306}"
    "Redis:${REDIS_PORT:-6379}"
    "API:${API_PORT}"
  )

  for entry in "${checks[@]}"; do
    local label="${entry%%:*}"
    local port="${entry##*:}"

    if [ "$label" = "Redis" ] && [ "${REDIS_DISABLED:-false}" = "true" ]; then
      echo -e "  ${YELLOW}◦${NC} $label (disabled)"
      continue
    fi

    if ss -lnt | grep -q ":${port} " 2>/dev/null; then
      echo -e "  [OK] $label (port $port)"
      ok=$((ok + 1))
    else
      echo -e "  [FAIL] $label (port $port)"
      fail=$((fail + 1))
    fi
  done

  if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo -e "  [OK] systemd user service ($SERVICE_NAME)"
    ok=$((ok + 1))
  else
    echo -e "  [FAIL] systemd user service ($SERVICE_NAME)"
    fail=$((fail + 1))
  fi

  local health_status
  health_status=$(curl -sf "http://localhost:${API_PORT}/health/liveness" 2>/dev/null | grep -o '"alive":true' || true)
  if [ -n "$health_status" ]; then
    echo -e "  [OK] API health check (/health/liveness)"
    ok=$((ok + 1))
  else
    echo -e "  [FAIL] API health check (/health/liveness)"
    fail=$((fail + 1))
  fi

  echo ""
  if [ "$fail" -eq 0 ]; then
    log "All $ok checks passed"
  else
    err "$fail check(s) failed, $ok passed"
  fi
  return "$fail"
}

# ─── Commands ────────────────────────────────────────────────────────────────

cmd_restart() {
  step "Restart"
  load_env

  log "Stopping API"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  kill_rogue_api_processes

  clean_repo_logs
  clear_caches
  install_deps
  generate_docs

  check_mariadb
  check_redis
  check_api

  validate_all
}

cmd_deploy() {
  step "Deploy"
  load_env

  log "Stopping API"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  kill_rogue_api_processes

  clean_repo_logs
  clear_caches
  install_deps
  generate_docs

  check_mariadb
  check_redis

  step "Test suite"
  npm run test 2>&1 || warn "Tests reported failures"

  check_api

  validate_all
}

cmd_start() {
  load_env
  check_mariadb
  check_redis
  check_api
  validate_all
}

cmd_stop() {
  load_env
  step "Stopping API"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  kill_rogue_api_processes
  log "API stopped"
}

cmd_status() {
  load_env
  validate_all
}

cmd_systemd_install() {
  local template="$ROOT_DIR/scripts/systemd/ethnos-api.service"
  local user_unit_dir="$HOME/.config/systemd/user"
  local target="$user_unit_dir/$SERVICE_NAME"

  if [ ! -f "$template" ]; then
    err "Service template not found: $template"
    return 1
  fi

  local node_bin
  node_bin="$(command -v node 2>/dev/null || true)"
  if [ -z "$node_bin" ]; then
    err "Node.js not found in PATH"
    return 1
  fi

  mkdir -p "$user_unit_dir"

  sed \
    -e "s|__NODE_BIN__|${node_bin}|g" \
    -e "s|__WORKDIR__|${ROOT_DIR}|g" \
    "$template" > "$target"

  systemctl --user daemon-reload
  systemctl --user enable "$SERVICE_NAME" 2>/dev/null

  log "Installed $SERVICE_NAME → $target"
}

cmd_uninstall() {
  step "Uninstall"
  load_env

  step "Stopping API"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  kill_rogue_api_processes

  step "Removing systemd service"
  local user_unit_dir="$HOME/.config/systemd/user"
  local target="$user_unit_dir/$SERVICE_NAME"
  if [ -f "$target" ]; then
    systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$target"
    systemctl --user daemon-reload
    log "Removed $SERVICE_NAME from $user_unit_dir"
  else
    warn "Service file not found: $target"
  fi

  step "Removing dependencies"
  if [ -d "$ROOT_DIR/node_modules" ]; then
    rm -rf "$ROOT_DIR/node_modules"
    log "Removed node_modules"
  else
    warn "node_modules not found"
  fi

  step "Clearing caches and logs"
  clear_caches
  clean_repo_logs

  step "Removing generated documentation"
  rm -f "$ROOT_DIR/docs/swagger.json" "$ROOT_DIR/docs/swagger.yaml" 2>/dev/null || true
  log "Removed generated docs"

  echo ""
  log "Uninstall complete — infrastructure services (MariaDB, Redis) were left untouched"
}

cmd_test_endpoints() {
  log "Running endpoint test suite"
  npm run test
}

cmd_test_data() {
  load_env
  local precheck_sql="$ROOT_DIR/scripts/maintenance/publications/10_precheck_baseline.sql"
  if [ ! -f "$precheck_sql" ]; then
    err "Precheck SQL missing: $precheck_sql"
    return 1
  fi

  local db_client
  db_client=$(command -v mariadb || command -v mysql || true)
  if [ -z "$db_client" ]; then
    err "No database client available"
    return 1
  fi

  local db_host="${DB_HOST:-localhost}"
  [ "$db_host" = "localhost" ] && db_host="127.0.0.1"

  log "Validating database structures"
  local output
  output=$("$db_client" -h "$db_host" -P "${DB_PORT:-3306}" \
    -u "${DB_USER}" --password="${DB_PASSWORD}" \
    -D "${DB_NAME:-data}" --batch --skip-column-names < "$precheck_sql") || {
    err "Precheck SQL execution failed"
    return 1
  }

  local has_errors=0 check_name row_count
  while IFS=$'\t' read -r check_name row_count; do
    [ -z "${check_name:-}" ] || [ -z "${row_count:-}" ] && continue
    [[ "$row_count" =~ ^[0-9]+$ ]] || { err "Invalid output for $check_name: $row_count"; has_errors=1; continue; }
    case "$check_name" in
      resolved_without_cited_work)
        [ "$row_count" -ne 0 ] && { err "$check_name must be 0 (got $row_count)"; has_errors=1; } ;;
      *)
        [ "$row_count" -lt 1 ] && { err "$check_name must be >= 1 (got $row_count)"; has_errors=1; } ;;
    esac
  done <<< "$output"

  printf '%s\n' "$output"
  [ "$has_errors" -eq 0 ] && log "Database validation passed" || { err "Database validation failed"; return 1; }
}

# ─── Usage & dispatch ────────────────────────────────────────────────────────

usage() {
  cat <<'USAGE'
Ethnos API — unified control script

Usage: manage.sh <command> [options]

Lifecycle (with automatic infrastructure verification):
  deploy              Full deploy: stop API → clean → deps → docs → test → start + validate
  restart             Restart: stop API → clean → deps → docs → verify infra → start + validate
  start               Verify all infrastructure, start API if needed, validate
  stop                Stop API service and kill rogue processes
  status              Validate all infrastructure and report

Systemd:
  systemd:install     Generate and install user service (no sudo)
  uninstall           Stop all processes, remove service, deps, caches, and generated files

Test:
  test --endpoints    Run endpoint test suite
  test --data         Validate database structural integrity

USAGE
}

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    deploy)           cmd_deploy ;;
    restart)          cmd_restart ;;
    start)            cmd_start ;;
    stop)             cmd_stop ;;
    status)           cmd_status ;;
    systemd:install)  cmd_systemd_install ;;
    uninstall)        cmd_uninstall ;;
    test)
      case "${1:-}" in
        --endpoints)  cmd_test_endpoints ;;
        --data)       cmd_test_data ;;
        *)            usage; exit 1 ;;
      esac
      ;;
    help|--help|-h|'') usage ;;
    *)                 err "Unknown command: $cmd"; usage; exit 1 ;;
  esac
}

main "$@"
