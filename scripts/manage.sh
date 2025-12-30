#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_SCRIPT="$ROOT_DIR/server.sh"
DATA_CHECK_SCRIPT="$ROOT_DIR/scripts/check-data-integrity.js"
# Canonical Sphinx configuration (consolidated)
SPHINX_CONFIG_TEMPLATE="${SPHINX_CONFIG_TEMPLATE:-$ROOT_DIR/config/sphinx-unified.conf}"
SPHINX_CONFIG_RENDERED="${SPHINX_CONFIG_RENDERED:-/var/run/ethnos-api/sphinx.conf}"
SPHINX_PID_FILE="${SPHINX_PID_FILE:-/var/run/ethnos-api/sphinx.pid}"
SPHINX_RUNTIME_DIR="${SPHINX_RUNTIME_DIR:-/var/lib/ethnos-api/sphinx}"
SPHINX_LOG_DIR="${SPHINX_LOG_DIR:-/var/log/ethnos-api}"
SPHINX_LOG_FILE="${SPHINX_LOG_FILE:-/var/log/ethnos-api/sphinx-daemon.log}"
SPHINX_INDEX_USER="${SPHINX_INDEX_USER:-$(id -un)}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

err() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

require_command() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command '$1' not found in PATH"
    exit 1
  fi
}

ensure_system_dir() {
  local dir="$1"
  local mode="${2:-750}"

  if [ -d "$dir" ] && [ -w "$dir" ]; then
    return 0
  fi

  if [ -d "$dir" ] && [ ! -w "$dir" ]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo chown "$SPHINX_INDEX_USER":"$SPHINX_INDEX_USER" "$dir" 2>/dev/null || true
      sudo chmod "$mode" "$dir" 2>/dev/null || true
    fi
    return 0
  fi

  if mkdir -p "$dir" 2>/dev/null; then
    chmod "$mode" "$dir" 2>/dev/null || warn "Could not set restrictive permissions on $dir"
    return 0
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo install -d -m "$mode" -o "$SPHINX_INDEX_USER" -g "$SPHINX_INDEX_USER" "$dir" 2>/dev/null || true
  fi
}

ensure_sphinx_runtime_dirs() {
  ensure_system_dir "$SPHINX_RUNTIME_DIR" 750
  ensure_system_dir "$SPHINX_RUNTIME_DIR/binlog" 750

  if [ "$(id -u)" -eq 0 ] && id "$SPHINX_INDEX_USER" >/dev/null 2>&1; then
    chown "$SPHINX_INDEX_USER":"$SPHINX_INDEX_USER" "$SPHINX_RUNTIME_DIR" "$SPHINX_RUNTIME_DIR/binlog" 2>/dev/null || warn "Could not change ownership of $SPHINX_RUNTIME_DIR to $SPHINX_INDEX_USER"
  fi
}

ensure_sphinx_log_dir() {
  local pid_dir
  pid_dir="$(dirname "$SPHINX_PID_FILE")"
  ensure_system_dir "$SPHINX_LOG_DIR" 750
  ensure_system_dir "$pid_dir" 750

  if [ "$(id -u)" -eq 0 ] && id "$SPHINX_INDEX_USER" >/dev/null 2>&1; then
    chown -R "$SPHINX_INDEX_USER":"$SPHINX_INDEX_USER" "$SPHINX_LOG_DIR" 2>/dev/null || warn "Could not change ownership of $SPHINX_LOG_DIR to $SPHINX_INDEX_USER"
    chown "$SPHINX_INDEX_USER":"$SPHINX_INDEX_USER" "$pid_dir" 2>/dev/null || warn "Could not change ownership of $pid_dir to $SPHINX_INDEX_USER"
  fi

  if [ ! -w "$SPHINX_LOG_DIR" ]; then
    err "Sphinx log directory $SPHINX_LOG_DIR is not writable. Adjust permissions, e.g.: sudo chown -R $SPHINX_INDEX_USER:$SPHINX_INDEX_USER $SPHINX_LOG_DIR"
    exit 1
  fi
  if [ ! -w "$pid_dir" ]; then
    err "Sphinx PID directory $pid_dir is not writable. Adjust permissions, e.g.: sudo chown -R $SPHINX_INDEX_USER:$SPHINX_INDEX_USER $pid_dir"
    exit 1
  fi
}

require_server_index_privilege() {
  local cmd_ref=${1:-index}
  local current_user
  current_user=$(id -un)

  if [ "$current_user" != "$SPHINX_INDEX_USER" ]; then
    err "Full Sphinx indexing must be executed as '$SPHINX_INDEX_USER' (current: '$current_user')."
    err "Re-run using: sudo -u $SPHINX_INDEX_USER $(basename "$0") $cmd_ref"
    exit 1
  fi
}

validate_sphinx_config_include() {
  if command -v rg >/dev/null 2>&1; then
    if rg -q "^[[:space:]]*include[[:space:]]*=" "$SPHINX_CONFIG_TEMPLATE"; then
      err "Invalid include syntax in $SPHINX_CONFIG_TEMPLATE. Use: include /path/to/file"
      exit 1
    fi
  else
    if grep -Eq "^[[:space:]]*include[[:space:]]*=" "$SPHINX_CONFIG_TEMPLATE"; then
      err "Invalid include syntax in $SPHINX_CONFIG_TEMPLATE. Use: include /path/to/file"
      exit 1
    fi
  fi
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[&/\\]/\\&/g'
}

render_sphinx_config() {
  if [ ! -f "/etc/node-backend.env" ]; then
    err "Environment file /etc/node-backend.env not found"
    exit 1
  fi
  if [ ! -f "$SPHINX_CONFIG_TEMPLATE" ]; then
    err "Sphinx configuration not found at $SPHINX_CONFIG_TEMPLATE"
    exit 1
  fi

  set -a
  # shellcheck disable=SC1091
  source /etc/node-backend.env
  set +a

  local missing=0
  for key in DB_HOST DB_USER DB_PASSWORD DB_NAME DB_PORT; do
    if [ -z "${!key:-}" ]; then
      err "Missing $key in /etc/node-backend.env"
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    exit 1
  fi

  ensure_system_dir "$(dirname "$SPHINX_CONFIG_RENDERED")" 750
  local db_host db_user db_pass db_name db_port
  db_host="$DB_HOST"
  if [ "$db_host" = "localhost" ]; then
    db_host="127.0.0.1"
  fi
  db_host=$(escape_sed "$db_host")
  db_user=$(escape_sed "$DB_USER")
  db_pass=$(escape_sed "$DB_PASSWORD")
  db_name=$(escape_sed "$DB_NAME")
  db_port=$(escape_sed "$DB_PORT")

  sed \
    -e "s/__DB_HOST__/${db_host}/g" \
    -e "s/__DB_USER__/${db_user}/g" \
    -e "s/__DB_PASSWORD__/${db_pass}/g" \
    -e "s/__DB_NAME__/${db_name}/g" \
    -e "s/__DB_PORT__/${db_port}/g" \
    "$SPHINX_CONFIG_TEMPLATE" > "$SPHINX_CONFIG_RENDERED"
  chmod 600 "$SPHINX_CONFIG_RENDERED" 2>/dev/null || true
}

require_mysql_client_lib() {
  if ! command -v ldd >/dev/null 2>&1; then
    return 0
  fi
  local indexer_path
  indexer_path=$(command -v indexer || true)
  if [ -z "$indexer_path" ]; then
    return 0
  fi
  local missing
  if command -v rg >/dev/null 2>&1; then
    missing=$(ldd "$indexer_path" 2>/dev/null | rg "(libmysqlclient|libmariadb).*not found" || true)
  else
    missing=$(ldd "$indexer_path" 2>/dev/null | grep -E "(libmysqlclient|libmariadb).*not found" || true)
  fi
  if [ -n "$missing" ]; then
    err "Missing libmysqlclient/libmariadb for Sphinx. Install a MariaDB/MySQL client runtime library."
    exit 1
  fi
}

clean_repo_logs() {
  if [ -d "$ROOT_DIR/logs" ]; then
    find "$ROOT_DIR/logs" -type f -delete 2>/dev/null || true
  fi
}

clean_legacy_runtime() {
  local legacy_dir="$ROOT_DIR/runtime/sphinx"
  if [ -d "$legacy_dir" ] && [ "$SPHINX_RUNTIME_DIR" != "$legacy_dir" ]; then
    rm -rf "$legacy_dir" 2>/dev/null || true
  fi
}

get_not_serving_indexes() {
  if [ ! -f "$SPHINX_LOG_FILE" ]; then
    return 1
  fi

  tail -200 "$SPHINX_LOG_FILE" 2>/dev/null | sed -n "s/.*index '\\([^']\\+\\)'.*NOT SERVING.*/\\1/p" | sort -u
}

mark_sphinx_log() {
  if [ ! -w "$SPHINX_LOG_FILE" ]; then
    return 0
  fi
  echo "ETHNOS_MARKER $(date +'%Y-%m-%d %H:%M:%S')" >> "$SPHINX_LOG_FILE"
}

get_not_serving_since_marker() {
  if [ ! -f "$SPHINX_LOG_FILE" ]; then
    return 1
  fi
  awk '
    /ETHNOS_MARKER/ {flag=1; next}
    flag && /NOT SERVING/ {
      if (match($0, /index '\''([^'\'']+)'\''/, m)) {
        print m[1]
      }
    }
  ' "$SPHINX_LOG_FILE" | sort -u
}

clean_sphinx_indexes() {
  local index
  for index in "$@"; do
    rm -f "$SPHINX_RUNTIME_DIR/${index}."* 2>/dev/null || true
  done
}

repair_not_serving_indexes() {
  local indexes
  indexes=$(get_not_serving_since_marker || true)
  if [ -z "$indexes" ]; then
    return 0
  fi

  warn "Detected NOT SERVING indexes: $indexes"
  cmd_sphinx_stop || true
  clean_sphinx_indexes $indexes
  cmd_index
  cmd_sphinx_start || true
}

ensure_server_script_ready() {
  if [ ! -x "$SERVER_SCRIPT" ]; then
    err "server.sh not executable or missing"
    exit 1
  fi
}

run_core_maintenance_steps() {
  ensure_server_script_ready
  log "Stopping existing server (if running)"
  "$SERVER_SCRIPT" stop || true
  log "Stopping Sphinx searchd (if running)"
  cmd_sphinx_stop || true
  log "Cleaning repository logs"
  clean_repo_logs
  clean_legacy_runtime
  log "Clearing caches"
  "$SERVER_SCRIPT" clear-cache || true
  if [ -x "$ROOT_DIR/scripts/clean_ram.sh" ]; then
    log "Dropping system caches"
    if ! sudo -n "$ROOT_DIR/scripts/clean_ram.sh" 2>/dev/null; then
      "$ROOT_DIR/scripts/clean_ram.sh" || warn "RAM cleanup step failed"
    fi
  fi
  log "Installing dependencies"
  npm install --include=dev --no-fund
  log "Generating documentation cache"
  npm run docs:generate >/dev/null 2>&1 || warn "Swagger generation failed; continuing"

}

run_full_test_suite() {
  log "Running full endpoint test suite"
  npm run test
}

cmd_deploy() {
  log "Starting deploy sequence"

  run_core_maintenance_steps

  log "Starting Sphinx searchd"
  mark_sphinx_log
  cmd_sphinx_start || true

  if command -v indexer &>/dev/null; then
    log "Rebuilding Sphinx indexes"
    cmd_index
  else
    warn "Sphinx indexer not found; skipping index rebuild"
  fi

  repair_not_serving_indexes

  run_full_test_suite

  log "Restarting server"
  "$SERVER_SCRIPT" restart

  log "Deploy completed"
}

cmd_start() {
  "$SERVER_SCRIPT" start
}

cmd_stop() {
  "$SERVER_SCRIPT" stop
}

cmd_restart() {
  log "Starting restart sequence (deploy steps without Sphinx indexing)"

  run_core_maintenance_steps

  run_full_test_suite
  log "Starting Sphinx searchd"
  cmd_sphinx_start || true

  log "Restarting server"
  "$SERVER_SCRIPT" restart

  log "Restart sequence completed"
}

cmd_index() {
  require_server_index_privilege index
  require_command indexer
  validate_sphinx_config_include
  render_sphinx_config
  require_mysql_client_lib

  ensure_sphinx_runtime_dirs
  ensure_sphinx_log_dir
  log "Running Sphinx indexer"
  if [ -f "$SPHINX_PID_FILE" ] && ps -p "$(cat "$SPHINX_PID_FILE" 2>/dev/null)" >/dev/null 2>&1; then
    indexer --config "$SPHINX_CONFIG_RENDERED" --rotate --all
  else
    warn "searchd not running; running indexer without rotation"
    indexer --config "$SPHINX_CONFIG_RENDERED" --all
  fi
  log "Sphinx indexes rebuilt"
}

cmd_index_fast() {
  require_command indexer
  validate_sphinx_config_include
  render_sphinx_config
  require_mysql_client_lib
  ensure_sphinx_runtime_dirs
  ensure_sphinx_log_dir
  log "Running Sphinx indexer (fast)"
  # Only index existing fast targets (venues_metrics_poc removed in unified config)
  if [ -f "$SPHINX_PID_FILE" ] && ps -p "$(cat "$SPHINX_PID_FILE" 2>/dev/null)" >/dev/null 2>&1; then
    indexer --config "$SPHINX_CONFIG_RENDERED" --rotate works_poc persons_poc || {
      warn "Fast index failed; falling back to --all";
      indexer --config "$SPHINX_CONFIG_RENDERED" --rotate --all;
    }
  else
    warn "searchd not running; running indexer without rotation"
    indexer --config "$SPHINX_CONFIG_RENDERED" works_poc persons_poc || {
      warn "Fast index failed; falling back to --all";
      indexer --config "$SPHINX_CONFIG_RENDERED" --all;
    }
  fi
  log "Sphinx fast indexes rebuilt"
}

cmd_sphinx_start() {
  require_command searchd
  ensure_sphinx_log_dir
  ensure_sphinx_runtime_dirs
  validate_sphinx_config_include
  render_sphinx_config
  require_mysql_client_lib
  
  # Detect port conflicts before starting
  local in_use_pid=
  in_use_pid=$(ss -lntp 2>/dev/null | awk '/:9312|:9306/ {if (match($0, /pid=([0-9]+)/, m)) {print m[1]; exit}}') || true
  if [ -n "${in_use_pid:-}" ]; then
    warn "Ports 9312/9306 already bound by PID ${in_use_pid}."
    if [ "${1:-}" = "--force" ]; then
      warn "--force supplied: attempting to stop existing searchd/process."
      if kill -0 "$in_use_pid" 2>/dev/null; then
        kill "$in_use_pid" || true
        sleep 1
        if kill -0 "$in_use_pid" 2>/dev/null; then
          warn "Process still alive; sending SIGKILL."
          kill -9 "$in_use_pid" || true
        fi
      fi
    else
      err "Port in use. Use: $(basename "$0") sphinx stop  OR  $(basename "$0") sphinx start --force"
      return 1
    fi
  fi
  
  if [ -f "$SPHINX_PID_FILE" ] && ps -p "$(cat "$SPHINX_PID_FILE" 2>/dev/null)" >/dev/null 2>&1; then
    warn "searchd already running (PID: $(cat "$SPHINX_PID_FILE"))"
    return 0
  fi
  log "Starting searchd with $SPHINX_CONFIG_RENDERED"
  searchd --config "$SPHINX_CONFIG_RENDERED" || {
    err "Failed to start searchd"; return 1;
  }
  sleep 1
  if [ -f "$SPHINX_PID_FILE" ]; then
    log "searchd started (PID: $(cat "$SPHINX_PID_FILE"))"
  else
    warn "PID file not found; verifying process via ports"
    ss -lnt | awk 'NR==1 || /9306|9312/' || true
  fi
}

cmd_sphinx_stop() {
  require_command searchd
  local pid=""
  if [ -f "$SPHINX_PID_FILE" ]; then
    pid=$(cat "$SPHINX_PID_FILE" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      log "Stopping searchd (PID: $pid)"
    fi
  else
    warn "PID file not found; skipping searchd stop"
    return 0
  fi

  # Try graceful stop via searchd
  if [ -f "$SPHINX_CONFIG_TEMPLATE" ]; then
    render_sphinx_config
  fi

  local config_to_use="$SPHINX_CONFIG_RENDERED"
  if [ ! -f "$config_to_use" ]; then
    config_to_use="$SPHINX_CONFIG_TEMPLATE"
  fi

  local stop_help=""
  stop_help=$(searchd --help 2>&1 || true)
  if echo "$stop_help" | grep -q "stop --nowait"; then
    searchd --config "$config_to_use" stop || searchd --config "$config_to_use" --stopwait || searchd --config "$config_to_use" --stop || true
  else
    searchd --config "$config_to_use" --stopwait || searchd --config "$config_to_use" --stop || true
  fi
  sleep 1

  # If still running (or no pid file), try to detect by ports
  if [ -z "$pid" ] || ps -p "$pid" >/dev/null 2>&1; then
    # Port-based detection
    local port_pid=""
    port_pid=$(ss -lntp 2>/dev/null | awk '/:9312|:9306/ {if (match($0, /pid=([0-9]+)/, m)) {print m[1]; exit}}') || true
    if [ -z "$port_pid" ]; then
      # Fallback by process name + config
      port_pid=$(pgrep -f "searchd.*$(basename "$config_to_use")" || true)
    fi
    if [ -n "$port_pid" ]; then
      warn "Force killing searchd/process holding ports (PID: $port_pid)"
      kill "$port_pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$port_pid" 2>/dev/null; then
        warn "Still alive; sending SIGKILL (PID: $port_pid)"
        kill -9 "$port_pid" 2>/dev/null || true
      fi
    fi
  fi

  # Cleanup PID file if present and process gone
  if [ -f "$SPHINX_PID_FILE" ]; then
    local curpid
    curpid=$(cat "$SPHINX_PID_FILE" 2>/dev/null || true)
    if [ -n "$curpid" ] && ! ps -p "$curpid" >/dev/null 2>&1; then
      rm -f "$SPHINX_PID_FILE" || true
    fi
  fi
  log "searchd stopped"
}

cmd_sphinx_status() {
  if [ -f "$SPHINX_PID_FILE" ] && ps -p "$(cat "$SPHINX_PID_FILE")" >/dev/null 2>&1; then
    log "searchd running (PID: $(cat "$SPHINX_PID_FILE"))"
  else
    warn "searchd not running"
  fi
  ss -lnt | awk 'NR==1 || /9306|9312/' || true
}

cmd_test_endpoints() {
  log "Executing endpoint regression suite"
  npm run test
}

cmd_test_data() {
  require_command node
  if [ ! -f "$DATA_CHECK_SCRIPT" ]; then
    err "Data integrity script missing at $DATA_CHECK_SCRIPT"
    exit 1
  fi

  log "Validating database structures"
  node "$DATA_CHECK_SCRIPT"
}

usage() {
  cat <<USAGE
Ethnos unified control script

Usage: $(basename "$0") <command> [options]

Commands:
  deploy                 Stop, clear caches, reinstall deps, reindex Sphinx, test, and restart
  start                  Start the API server
  stop                   Stop the API server
  restart                Stop, deep clean, reinstall deps, regen docs, test, and restart (no Sphinx)
  index                  Rebuild Sphinx indexes (requires indexer)
  index:fast             Rebuild only works/persons indexes
  sphinx start|stop|status  Manage searchd lifecycle (use `sphinx start --force` to kill port holders)
  test --endpoints       Run Jest endpoint suite
  test --data            Validate required tables, views, and indexes in the database

Examples:
  $(basename "$0") deploy
  $(basename "$0") test --endpoints
  $(basename "$0") test --data
USAGE
}

main() {
  local cmd=${1:-}
  shift || true

  case "$cmd" in
    deploy)
      cmd_deploy
      ;;
    start)
      cmd_start
      ;;
    stop)
      cmd_stop
      ;;
    restart)
      cmd_restart
      ;;
    index)
      cmd_index
      ;;
    index:fast)
      cmd_index_fast
      ;;
    sphinx)
      # Subcommands for Sphinx lifecycle; pass through extra args to handlers
      case "${1:-}" in
        start)
          shift || true
          cmd_sphinx_start "$@"
          ;;
        stop)
          shift || true
          cmd_sphinx_stop "$@"
          ;;
        status)
          shift || true
          cmd_sphinx_status "$@"
          ;;
        *) usage; exit 1 ;;
      esac
      ;;
    test)
      case "${1:-}" in
        --endpoints)
          cmd_test_endpoints
          ;;
        --data)
          cmd_test_data
          ;;
        *)
          usage
          exit 1
          ;;
      esac
      ;;
    help|--help|-h|'')
      usage
      ;;
    *)
      err "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
