#!/usr/bin/env bash
# Quick diagnostics — run as root inside the Cheng-Pro LXC.
set -u

PORT="${PORT:-8080}"
echo "=== IP ==="
hostname -I || true
echo
echo "=== Listening ports (8080 / 8788 / 8787) ==="
ss -tlnp 2>/dev/null | grep -E ":${PORT}|:8788|:8787" || echo "(none — services likely down)"
echo
echo "=== systemd ==="
systemctl is-active cheng-pro nginx 2>/dev/null || true
systemctl status cheng-pro --no-pager -l 2>/dev/null | tail -20 || echo "cheng-pro unit missing"
echo
echo "=== cheng-pro logs (last 30 lines) ==="
journalctl -u cheng-pro -n 30 --no-pager 2>/dev/null || true
echo
echo "=== Local HTTP checks ==="
curl -fsS -m 3 "http://127.0.0.1:${PORT}/api/health" && echo || echo "FAIL :${PORT}"
curl -fsS -m 3 "http://127.0.0.1:8788/api/health" && echo || echo "FAIL :8788 (node app)"
echo
echo "=== Fix if install never completed ==="
echo "apt-get update && apt-get install -y curl ca-certificates && curl -fsSL https://raw.githubusercontent.com/tsogs66/Cheng-Pro/main/deploy/proxmox-install.sh | bash"
