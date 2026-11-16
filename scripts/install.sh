#!/usr/bin/env bash
set -euo pipefail

# Installer otomatis RackLite Server Panel untuk Ubuntu/Debian (22.04 / 24.04 / Debian 12)
APP_DIR="/opt/racklite"
SERVICE_USER="racklite"
PANEL_PORT="${PANEL_PORT:-3000}"

if [[ $EUID -ne 0 ]]; then
  echo "Harap jalankan installer ini sebagai root (sudo bash scripts/install.sh)."
  exit 1
fi

echo "[1/6] Memperbarui paket sistem & memasang dependensi..."
apt-get update -y
apt-get install -y curl git ca-certificates gnupg build-essential python3 \
  nginx certbot python3-certbot-nginx ufw sqlite3 tar unzip

if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  echo "[2/6] Memasang Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  echo "[2/6] Node.js $(node -v) sudah terpasang."
fi

echo "[3/6] Menyalin berkas aplikasi ke ${APP_DIR}..."
mkdir -p "${APP_DIR}"
cp -R ./* "${APP_DIR}/"
cd "${APP_DIR}"

echo "[4/6] Memasang paket npm & membangun aplikasi..."
npm ci
# Opsional: pasang node-pty untuk PTY penuh pada Web Terminal
npm install --no-save node-pty || echo "Peringatan: node-pty gagal dikompilasi, menggunakan fallback PTY util-linux."
npm run build

if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "[5/6] Membuat .env dengan JWT secret acak..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "${APP_DIR}/.env" <<EOF
NODE_ENV=production
PORT=${PANEL_PORT}
HOSTNAME=0.0.0.0
PANEL_JWT_SECRET=${JWT_SECRET}
PANEL_DATA_DIR=${APP_DIR}/data
PANEL_FILE_ROOTS=/var/www,${APP_DIR}/data/workspace
PANEL_ADMIN_USER=admin
PANEL_ADMIN_PASS=admin12345
APP_URL=http://localhost:${PANEL_PORT}
PANEL_STRICT_FRAME=true
EOF
  chmod 600 "${APP_DIR}/.env"
fi

mkdir -p "${APP_DIR}/data" /var/www

echo "[6/6] Memasang unit systemd racklite.service..."
cp "${APP_DIR}/scripts/panel.service" /etc/systemd/system/racklite.service
systemctl daemon-reload
systemctl enable --now racklite.service

echo ""
echo "=========================================================="
echo " RackLite Server Panel berhasil dipasang!"
echo " URL      : http://$(hostname -I | awk '{print $1}'):${PANEL_PORT}"
echo " Login    : admin / admin12345 (SEGERA GANTI PASSWORD)"
echo " Status   : systemctl status racklite"
echo "=========================================================="
