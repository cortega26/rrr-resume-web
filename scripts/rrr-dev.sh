#!/usr/bin/env bash
#
# Run the Resume QA App (private backend + public frontend) from anywhere.
#
#   bash /path/to/rrr-resume-web/scripts/run-app.sh [up|down|status]
#   npm run app            # up      (from the frontend checkout)
#   npm run app:stop       # down
#   npm run app:status     # status
#
# up (default): ensure a backend tree at origin/main (managed detached
#   worktree under /tmp, refreshed via fetch — your checkout is never
#   touched), start `rrr serve` on 127.0.0.1:RRR_PORT, start Astro dev on
#   127.0.0.1:FRONT_PORT (auto-bump if busy), wait for both health checks,
#   print the URLs. Logs to $RUN_DIR/*.log.
# down: stop only the processes this script started (pidfiles + cmdline
#   guard; never pattern-kills, so other servers are safe).
# status: probe both ends, no changes (nonzero exit when anything is down).
#
# Env: RRR_REPO, RRR_BACKEND_DIR (skip worktree mgmt), RRR_NO_FETCH=1,
#   RRR_WORKTREE, RRR_PORT (backend, default 8000), FRONT_PORT (default
#   4321), FRONTEND_DIR, PYTHON_BIN (default python3), APP_RUN_DIR
#   (default /tmp/rrr-app), LOG_FILE.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
REPO="${RRR_REPO:-$HOME/VS_Code_Projects/pipelines/remote-role-radar}"
BACKEND_DIR="${RRR_BACKEND_DIR:-}"
WORKTREE="${RRR_WORKTREE:-/tmp/rrr-app-backend}"
BACKEND_PORT="${RRR_PORT:-8000}"
FRONT_PORT="${FRONT_PORT:-4321}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
RUN_DIR="${APP_RUN_DIR:-/tmp/rrr-app}"
LOG_FILE="${LOG_FILE:-}"
ACTION="${1:-up}"

log() {
  local level="$1"; shift
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [$level] $*"
  printf '%s\n' "$line"
  if [[ -n "$LOG_FILE" ]]; then printf '%s\n' "$line" >>"$LOG_FILE"; fi
}
info() { log INFO "$@"; }
warn() { log WARN "$@"; }
die() { log ERROR "$@"; exit 1; }

[[ "$ACTION" == up || "$ACTION" == down || "$ACTION" == status ]] \
  || die "usage: $(basename "$0") [up|down|status]"

mkdir -p "$RUN_DIR"
pidfile() { printf '%s/%s.pid' "$RUN_DIR" "$1"; }
logfile() { printf '%s/%s.log' "$RUN_DIR" "$1"; }

pid_alive() { # $1=pid $2=cmdline pattern
  local pid="$1" pattern="$2"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [[ -f "/proc/$pid/cmdline" ]] || return 1
  tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q "$pattern" || return 1
}

port_listening() { # $1=port → 0 when something listens on 127.0.0.1:$1
  ss -ltn 2>/dev/null | grep -q "127.0.0.1:$1 "
}

pid_of_port() { # $1=port → prints the owning pid, or nothing
  # Never trust $!: setsid may fork, leaving $! pointing at a dead
  # intermediate. The listening socket cannot lie about its owner.
  ss -ltnp 2>/dev/null | grep "127.0.0.1:$1 " | grep -oP 'pid=\K[0-9]+' | head -n 1
}

is_up() { # $1=backend|frontend (pidfile + cmdline guard)
  local f pid
  f="$(pidfile "$1")"
  [[ -f "$f" ]] || return 1
  pid="$(cat "$f")"
  if [[ "$1" == backend ]]; then pid_alive "$pid" "remote_role_radar.cli serve"
  else pid_alive "$pid" "astro dev"
  fi
}

wait_for() { # $1=url $2=name $3=timeout_s
  local url="$1" name="$2" timeout="$3" i=0
  until curl -sf -o /dev/null --max-time 3 "$url" 2>/dev/null; do
    i=$((i + 1))
    if [[ "$i" -ge "$timeout" ]]; then
      log ERROR "$name not responding at $url after ${timeout}s"
      return 1
    fi
    sleep 1
  done
  info "$name healthy ($url)"
}

ensure_backend_tree() {
  if [[ -n "$BACKEND_DIR" ]]; then
    [[ -f "$BACKEND_DIR/src/remote_role_radar/serve.py" ]] \
      || die "RRR_BACKEND_DIR=$BACKEND_DIR has no serve module"
    info "backend tree: $BACKEND_DIR (explicit)"
    return 0
  fi
  [[ "$WORKTREE" == /tmp/* ]] || die "refusing to manage a worktree outside /tmp: $WORKTREE"
  [[ -d "$REPO/.git" ]] || die "backend repo not found: $REPO (override with RRR_REPO)"
  git -C "$REPO" worktree prune >/dev/null 2>&1 || true
  if [[ -z "${RRR_NO_FETCH:-}" ]]; then
    info "fetching backend origin"
    git -C "$REPO" fetch origin >/dev/null 2>&1 \
      || warn "fetch failed (offline?); continuing with local origin/main"
  fi
  if [[ -d "$WORKTREE" ]]; then
    if git -C "$WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      if [[ -n "$(git -C "$WORKTREE" status --porcelain)" ]]; then
        die "managed worktree $WORKTREE is dirty; inspect it (nothing was touched)"
      fi
      git -C "$WORKTREE" checkout --detach origin/main -q \
        || die "cannot refresh $WORKTREE at origin/main"
    else
      warn "$WORKTREE is not a worktree; recreating"
      rm -rf "$WORKTREE"
    fi
  fi
  if [[ ! -d "$WORKTREE" ]]; then
    git -C "$REPO" worktree add --detach "$WORKTREE" origin/main \
      || die "cannot create worktree at $WORKTREE"
  fi
  BACKEND_DIR="$WORKTREE"
  [[ -f "$BACKEND_DIR/src/remote_role_radar/serve.py" ]] \
    || die "origin/main has no serve module; backend repo is behind?"
  info "backend tree: $BACKEND_DIR @ $(git -C "$BACKEND_DIR" rev-parse --short HEAD)"
}

start_backend() {
  if is_up backend; then
    info "backend already running (pid $(cat "$(pidfile backend)"))"
    return 0
  fi
  ensure_backend_tree
  # Honor the backend repo's pinned interpreter: a bare `python3` resolves
  # via pyenv shims from the *caller's* CWD, which may not be the backend
  # (this script runs from anywhere). An explicit PYTHON_BIN env wins.
  if [[ "$PYTHON_BIN" == python3 && -f "$BACKEND_DIR/.python-version" ]]; then
    local pinned="$HOME/.pyenv/versions/$(tr -d '[:space:]' <"$BACKEND_DIR/.python-version")/bin/python3"
    if [[ -x "$pinned" ]]; then
      PYTHON_BIN="$pinned"
      info "backend python pinned to $PYTHON_BIN (repo .python-version)"
    fi
  fi
  command -v "$PYTHON_BIN" >/dev/null || die "python not found: $PYTHON_BIN"
  command -v setsid >/dev/null || die "setsid not found (util-linux required)"
  command -v ss >/dev/null || die "ss not found (iproute2 required)"
  if port_listening "$BACKEND_PORT"; then
    die "port $BACKEND_PORT is already in use; is another backend running? (run-app.sh status)"
  fi
  PYTHONPATH="$BACKEND_DIR/src" "$PYTHON_BIN" -c "import fastapi, uvicorn" 2>/dev/null \
    || die "backend deps missing; run: pip install fastapi uvicorn"
  info "starting backend :$BACKEND_PORT (log $(logfile backend))"
  # setsid + full stdio redirect detaches the server. Launched directly
  # by this shell on purpose (see frontend note about subshells).
  PYTHONPATH="$BACKEND_DIR/src" setsid "$PYTHON_BIN" -m remote_role_radar.cli serve \
    --port "$BACKEND_PORT" </dev/null >"$(logfile backend)" 2>&1 &
  wait_for "http://127.0.0.1:$BACKEND_PORT/api/v1/health" "backend" 30 \
    || { tail -n 20 "$(logfile backend)"; die "backend failed to come up"; }
  local pid
  pid="$(pid_of_port "$BACKEND_PORT")"
  if [[ -z "$pid" ]] || ! pid_alive "$pid" "remote_role_radar.cli serve"; then
    die "backend pid discovery failed on :$BACKEND_PORT"
  fi
  echo "$pid" >"$(pidfile backend)"
}

start_frontend() {
  if is_up frontend; then
    info "frontend already running (pid $(cat "$(pidfile frontend)"))"
    return 0
  fi
  [[ -f "$FRONTEND_DIR/package.json" ]] || die "frontend not found: $FRONTEND_DIR"
  command -v npm >/dev/null || die "npm not found in PATH"
  [[ -x "$FRONTEND_DIR/node_modules/.bin/astro" ]] || {
    info "installing frontend deps (one-time)"
    (cd "$FRONTEND_DIR" && npm install) || die "npm install failed"
  }
  info "starting frontend (log $(logfile frontend))"
  # No subshell around the launch: a background job started inside ( ... )
  # parks that subshell in exit-wait for as long as the server lives
  # (observed: 7+ min in do_wait), while a job started directly by the
  # main shell never blocks exit. pushd/popd instead.
  pushd "$FRONTEND_DIR" >/dev/null || die "cannot cd to $FRONTEND_DIR"
  RRR_PORT="$BACKEND_PORT" setsid ./node_modules/.bin/astro dev --port "$FRONT_PORT" \
    </dev/null >"$(logfile frontend)" 2>&1 &
  popd >/dev/null || die "cannot return from $FRONTEND_DIR"
  local url="" i=0
  while [[ $i -lt 30 ]]; do
    url="$(grep -m1 -o 'http://localhost:[0-9]*' "$(logfile frontend)" 2>/dev/null || true)"
    [[ -n "$url" ]] && break
    sleep 1; i=$((i + 1))
  done
  [[ -n "$url" ]] || { tail -n 20 "$(logfile frontend)"; die "frontend printed no URL"; }
  wait_for "$url/" "frontend" 20 || { tail -n 20 "$(logfile frontend)"; die "frontend failed to come up"; }
  local fport="${url##*:}" pid
  pid="$(pid_of_port "$fport")"
  if [[ -z "$pid" ]] || ! pid_alive "$pid" "astro"; then
    die "frontend pid discovery failed on :$fport"
  fi
  echo "$pid" >"$(pidfile frontend)"
  info "frontend: $url"
}

stop_one() { # $1=backend|frontend
  local f pid
  f="$(pidfile "$1")"
  [[ -f "$f" ]] || { info "$1: not running (no pidfile)"; return 0; }
  pid="$(cat "$f")"
  if is_up "$1"; then
    info "stopping $1 (pid $pid)"
    kill "$pid" 2>/dev/null || true
    local i=0
    while is_up "$1" && [[ $i -lt 5 ]]; do sleep 1; i=$((i + 1)); done
    if is_up "$1"; then
      warn "$1 ignores TERM; killing -9"
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    warn "$1 pidfile stale (pid $pid is not ours); dropping it"
  fi
  rm -f "$f"
}

do_status() {
  local rc=0
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:$BACKEND_PORT/api/v1/health" 2>/dev/null; then
    info "backend UP :$BACKEND_PORT"
  else
    info "backend DOWN :$BACKEND_PORT"; rc=1
  fi
  if is_up frontend; then
    local url
    url="$(grep -m1 -o 'http://localhost:[0-9]*' "$(logfile frontend)" 2>/dev/null || true)"
    if [[ -n "$url" ]] && curl -sf -o /dev/null --max-time 3 "$url/" 2>/dev/null; then
      info "frontend UP $url"
    else
      info "frontend process alive but not responding"; rc=1
    fi
  else
    info "frontend DOWN (no live pid)"; rc=1
  fi
  return $rc
}

case "$ACTION" in
  up) start_backend; start_frontend; info "app up"; do_status ;;
  down) stop_one frontend; stop_one backend; info "app stopped" ;;
  status) do_status ;;
esac
