#!/usr/bin/env bash
# Cheng-Pro — install inside a Debian 12 LXC (run as root).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cheng-pro}"
APP_USER="${APP_USER:-chengpro}"
PORT="${PORT:-8080}"
REPO_URL="${REPO_URL:-https://github.com/tsogs66/Cheng-Pro.git}"
BRANCH="${BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates git nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cd "$APP_DIR"
sudo -u "$APP_USER" npm install --omit=dev
sudo -u "$APP_USER" npm run seed || true

cat >/etc/systemd/system/cheng-pro.service <<EOF
[Unit]
Description=Cheng-Pro marine chief engineer suite
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=CHENG_PRO_DATA_DIR=$APP_DIR/data
ExecStart=/usr/bin/node $APP_DIR/server/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/nginx/sites-available/cheng-pro <<EOF
server {
  listen ${PORT} default_server;
  server_name _;
  client_max_body_size 64m;

  location /api/ {
    proxy_pass http://127.0.0.1:8787/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }

  location / {
    proxy_pass http://127.0.0.1:8787/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF

ln -sfn /etc/nginx/sites-available/cheng-pro /etc/nginx/sites-enabled/cheng-pro
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now cheng-pro
systemctl enable --now nginx
nginx -t
systemctl reload nginx

echo "Cheng-Pro installed. Open http://<ct-ip>:${PORT}/"
echo "Data: $APP_DIR/data"
