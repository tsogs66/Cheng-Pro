#!/usr/bin/env bash
# Cheng-Pro — install inside a Debian 12 LXC (run as root).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cheng-pro}"
APP_USER="${APP_USER:-chengpro}"
PORT="${PORT:-8080}"
REPO_URL="${REPO_URL:-https://github.com/tsogs66/Cheng-Pro.git}"
BRANCH="${BRANCH:-main}"
INSTALL_URL="${INSTALL_URL:-https://raw.githubusercontent.com/tsogs66/Cheng-Pro/main/deploy/proxmox-install.sh}"

export DEBIAN_FRONTEND=noninteractive

log() { printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# Minimal LXCs often have no sudo. Script already requires root.
run_as_app() {
  local user="$1"; shift
  if command -v runuser >/dev/null 2>&1; then
    runuser -u "$user" -- "$@"
  elif command -v su >/dev/null 2>&1; then
    local cmd
    printf -v cmd '%q ' "$@"
    su -s /bin/bash "$user" -c "$cmd"
  else
    # Last resort: run as root (files still chowned afterward).
    "$@"
  fi
}

[[ ${EUID:-0} -eq 0 ]] || die "Run as root inside the LXC."

log "Installing base packages (curl, git, nginx, python3, node)…"
apt-get update
apt-get install -y curl ca-certificates git nginx python3

NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif command -v nodejs >/dev/null 2>&1; then
  NODE_BIN="$(command -v nodejs)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  NODE_BIN="$(command -v node || command -v nodejs)"
fi
[[ -n "$NODE_BIN" ]] || die "Node.js not found after install."
log "Using Node: $NODE_BIN ($("$NODE_BIN" -v))"

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

if [[ -d "$APP_DIR/.git" ]]; then
  log "Updating existing clone…"
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  log "Cloning Cheng-Pro…"
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "npm install + seed…"
cd "$APP_DIR"
run_as_app "$APP_USER" npm install --omit=dev
run_as_app "$APP_USER" npm run seed || true

ENV_FILE="/root/cheng-pro.env"
if [[ ! -f "$ENV_FILE" ]]; then
  ADMIN_PASS="$(python3 - <<'PY'
import secrets
print('-'.join(''.join(secrets.choice('abcdefghjkmnpqrstuvwxyz23456789') for _ in range(4)) for _ in range(4)))
PY
)"
  cat >"$ENV_FILE" <<EOF
SYNC_ADMIN_USER=admin
SYNC_ADMIN_PASSWORD=$ADMIN_PASS
SYNC_API_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(24))')
LICENSE_ADMIN_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(24))')
LICENSE_SIGNING_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
LICENSE_ENFORCE=1
EOF
  chmod 600 "$ENV_FILE"
  log "Admin password (save now):"
  grep SYNC_ADMIN_PASSWORD "$ENV_FILE"
  log "License admin token (save now):"
  grep LICENSE_ADMIN_TOKEN "$ENV_FILE"
else
  # Backfill license secrets on existing installs without overwriting known values.
  if ! grep -q '^LICENSE_ADMIN_TOKEN=' "$ENV_FILE" 2>/dev/null; then
    echo "LICENSE_ADMIN_TOKEN=$(python3 -c 'import secrets; print(secrets.token_hex(24))')" >>"$ENV_FILE"
    log "Added LICENSE_ADMIN_TOKEN to $ENV_FILE"
  fi
  if ! grep -q '^LICENSE_SIGNING_SECRET=' "$ENV_FILE" 2>/dev/null; then
    echo "LICENSE_SIGNING_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >>"$ENV_FILE"
  fi
  if ! grep -q '^LICENSE_ENFORCE=' "$ENV_FILE" 2>/dev/null; then
    echo "LICENSE_ENFORCE=1" >>"$ENV_FILE"
  fi
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

log "Writing systemd unit…"
cat >/etc/systemd/system/cheng-pro.service <<EOF
[Unit]
Description=Cheng-Pro marine chief engineer suite
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8788
Environment=SYNC_PORT=8787
Environment=CHENG_PRO_DATA_DIR=$APP_DIR/data
Environment=TMS_DATA_DIR=$APP_DIR/data
Environment=SYNC_ADMIN_USER=$SYNC_ADMIN_USER
Environment=SYNC_ADMIN_PASSWORD=$SYNC_ADMIN_PASSWORD
Environment=SYNC_API_TOKEN=$SYNC_API_TOKEN
Environment=LICENSE_ADMIN_TOKEN=$LICENSE_ADMIN_TOKEN
Environment=LICENSE_SIGNING_SECRET=${LICENSE_SIGNING_SECRET:-}
Environment=LICENSE_ENFORCE=${LICENSE_ENFORCE:-1}
Environment=LICENSE_REQUIRE_ADMIN=1
ExecStart=$NODE_BIN $APP_DIR/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

log "Configuring nginx on port ${PORT}…"
cat >/etc/nginx/sites-available/cheng-pro <<EOF
server {
  listen ${PORT} default_server;
  listen [::]:${PORT} default_server;
  server_name _;
  client_max_body_size 64m;

  location / {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_read_timeout 600s;
  }
}
EOF

ln -sfn /etc/nginx/sites-available/cheng-pro /etc/nginx/sites-enabled/cheng-pro
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable cheng-pro nginx
systemctl restart cheng-pro
systemctl restart nginx
nginx -t

log "Waiting for app…"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

GUEST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "=============================================="
if [[ "$ok" -eq 1 ]]; then
  echo " Cheng-Pro is running"
else
  echo " Cheng-Pro install finished but health check FAILED"
  echo " Run: journalctl -u cheng-pro -n 80 --no-pager"
fi
echo "=============================================="
echo "  Local:    http://127.0.0.1:${PORT}/"
if [[ -n "$GUEST_IP" ]]; then
  echo "  Network:  http://${GUEST_IP}:${PORT}/"
else
  echo "  Network:  http://<this-CT-ip>:${PORT}/"
fi
echo "  Tanks:          /tanks/"
echo "  Voyage:         /voyage/"
echo "  License admin:  /license-admin   (paste LICENSE_ADMIN_TOKEN from $ENV_FILE)"
echo "  Secrets:        cat $ENV_FILE"
echo "  Status:         systemctl status cheng-pro nginx"
echo "=============================================="

[[ "$ok" -eq 1 ]] || exit 1
