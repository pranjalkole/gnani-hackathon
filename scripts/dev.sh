#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
BACKEND_DIR="$ROOT_DIR/backend"
COMPOSE_FILE="$BACKEND_DIR/compose.yaml"
LOG_DIR="${TMPDIR:-/tmp}/crewline-dev"
BACKEND_LOG="$LOG_DIR/backend.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
API_URL="http://localhost:8080"

APP_ONLY=0
CLEAR_CACHE=0

usage() {
  cat <<'EOF'
Usage: ./scripts/dev.sh [options]

Starts the full Crewline development stack:
  PostgreSQL -> migrations -> seed -> backend API
  -> adb reverse 8080/8081 -> Expo dev server + Android app

Options:
  --app-only   Skip PostgreSQL, migrations, seed, and backend startup.
               Use this when the backend is already running.
  --clear      Clear the Expo/Metro cache before starting.
  -h, --help   Show this help.

Environment:
  NODE_BIN_DIR  Directory containing a Node.js 20+ binary (optional).
  ADB_SERIAL    Android device serial when more than one device is connected.
  ADB           Path to the adb binary (optional).

Examples:
  ./scripts/dev.sh
  NODE_BIN_DIR=/tmp/opencode/node22/bin ./scripts/dev.sh
  ./scripts/dev.sh --app-only --clear
EOF
}

while (($# > 0)); do
  case "$1" in
    --app-only)
      APP_ONLY=1
      ;;
    --clear)
      CLEAR_CACHE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

mkdir -p "$LOG_DIR"

if [[ -n "${NODE_BIN_DIR:-}" ]]; then
  export PATH="$NODE_BIN_DIR:$PATH"
fi

for command_name in node npx curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

NODE_VERSION="$(node -v)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"

if ((NODE_MAJOR < 20)); then
  echo "Node.js 20+ is required. Current: $NODE_VERSION" >&2
  echo "Run: NODE_BIN_DIR=/tmp/opencode/node22/bin ${BASH_SOURCE[0]}" >&2
  exit 1
fi

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}$"
    return
  fi

  return 1
}

backend_ready() {
  local body
  body="$(curl -fsS --max-time 2 "$API_URL/readyz" 2>/dev/null)" || return 1
  [[ "$body" == *'"status":"ok"'* && "$body" == *'"database":"ok"'* ]]
}

wait_for_backend() {
  local attempts=120
  local i

  for ((i = 1; i <= attempts; i++)); do
    if backend_ready; then
      echo "==> Backend ready at $API_URL"
      return 0
    fi
    sleep 1
  done

  echo "Backend did not become ready within ${attempts}s." >&2
  echo "See $BACKEND_LOG for details." >&2
  tail -n 40 "$BACKEND_LOG" >&2 2>/dev/null || true
  return 1
}

resolve_adb() {
  if [[ -n "${ADB:-}" ]]; then
    printf '%s\n' "$ADB"
    return 0
  fi

  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return 0
  fi

  if [[ -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/platform-tools/adb" ]]; then
    printf '%s\n' "$ANDROID_HOME/platform-tools/adb"
    return 0
  fi

  if [[ -n "${ANDROID_SDK_ROOT:-}" && -x "$ANDROID_SDK_ROOT/platform-tools/adb" ]]; then
    printf '%s\n' "$ANDROID_SDK_ROOT/platform-tools/adb"
    return 0
  fi

  if [[ -x "$HOME/Android/Sdk/platform-tools/adb" ]]; then
    printf '%s\n' "$HOME/Android/Sdk/platform-tools/adb"
    return 0
  fi

  return 1
}

if port_in_use 8081; then
  echo "Port 8081 is already in use." >&2
  echo "Stop the existing Metro/Expo dev server and run this script again." >&2
  exit 1
fi

if ((APP_ONLY == 0)); then
  if ! command -v make >/dev/null 2>&1; then
    echo "Required command not found: make" >&2
    exit 1
  fi

  if ! command -v go >/dev/null 2>&1; then
    echo "Required command not found: go" >&2
    exit 1
  fi

  USE_SG_DOCKER=0
  if docker info >/dev/null 2>&1; then
    USE_SG_DOCKER=0
  elif command -v sg >/dev/null 2>&1 && sg docker -c 'docker info' >/dev/null 2>&1; then
    USE_SG_DOCKER=1
    echo "==> Docker is available through 'sg docker'"
  else
    echo "Docker is not accessible." >&2
    echo "Add your user to the docker group or run the Docker commands manually." >&2
    exit 1
  fi

  docker_run() {
    if ((USE_SG_DOCKER == 1)); then
      local quoted
      quoted="$(printf '%q ' "$@")"
      sg docker -c "$quoted"
      return
    fi

    "$@"
  }

  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    echo "==> Creating backend/.env from .env.example"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  fi

  echo "==> Starting PostgreSQL"
  docker_run docker compose -f "$COMPOSE_FILE" up -d --wait db

  echo "==> Applying migrations (first run may download Go modules)"
  make -C "$BACKEND_DIR" migrate-up

  echo "==> Seeding sample data"
  docker_run docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -v ON_ERROR_STOP=1 -U postgres -d gnani \
    < "$BACKEND_DIR/scripts/seed_dev.sql"

  if backend_ready; then
    echo "==> Backend already running and healthy"
  else
    if port_in_use 8080; then
      echo "Port 8080 is already in use, but $API_URL/readyz is not healthy." >&2
      echo "Stop the process using port 8080 and run this script again." >&2
      exit 1
    fi

    echo "==> Starting backend API"
    if command -v setsid >/dev/null 2>&1; then
      nohup setsid bash -c 'cd "$1" && exec make run' _ "$BACKEND_DIR" \
        > "$BACKEND_LOG" 2>&1 &
    else
      nohup bash -c 'cd "$1" && exec make run' _ "$BACKEND_DIR" \
        > "$BACKEND_LOG" 2>&1 &
    fi
    echo $! > "$BACKEND_PID_FILE"
    echo "==> Backend log: $BACKEND_LOG"
    wait_for_backend
  fi
else
  echo "==> Skipping PostgreSQL, migrations, seed, and backend startup"
  if ! backend_ready; then
    echo "Warning: backend is not healthy at $API_URL." >&2
    echo "Start it with './scripts/dev.sh' or run the backend manually." >&2
  fi
fi

ADB_BIN="$(resolve_adb)" || {
  echo "Could not find adb." >&2
  echo "Set ADB=/path/to/adb or ANDROID_HOME/ANDROID_SDK_ROOT." >&2
  exit 1
}

DEVICE_IDS="$("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
DEVICE_COUNT="$(printf '%s\n' "$DEVICE_IDS" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ -n "${ADB_SERIAL:-}" ]]; then
  if ! grep -qx "$ADB_SERIAL" <<<"$DEVICE_IDS"; then
    echo "ADB_SERIAL=$ADB_SERIAL is not connected in 'device' state." >&2
    "$ADB_BIN" devices >&2
    exit 1
  fi
  ADB_CMD=("$ADB_BIN" -s "$ADB_SERIAL")
elif ((DEVICE_COUNT == 1)); then
  ADB_CMD=("$ADB_BIN")
elif ((DEVICE_COUNT == 0)); then
  echo "No Android device is connected in 'device' state." >&2
  "$ADB_BIN" devices >&2
  exit 1
else
  echo "Multiple Android devices are connected. Set ADB_SERIAL to choose one." >&2
  "$ADB_BIN" devices >&2
  exit 1
fi

echo "==> Configuring adb reverse for backend and Metro"
"${ADB_CMD[@]}" reverse tcp:8080 tcp:8080
"${ADB_CMD[@]}" reverse tcp:8081 tcp:8081

if ! "${ADB_CMD[@]}" reverse --list | grep -q 'tcp:8080'; then
  echo "adb reverse for tcp:8080 was not registered." >&2
  "${ADB_CMD[@]}" reverse --list >&2
  exit 1
fi

export EXPO_PUBLIC_API_URL="$API_URL"

EXPO_ARGS=(start --dev-client --localhost --android)
if ((CLEAR_CACHE == 1)); then
  EXPO_ARGS+=(--clear)
fi

echo "==> Starting Expo with EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"
cd "$APP_DIR"
exec npx expo "${EXPO_ARGS[@]}"
