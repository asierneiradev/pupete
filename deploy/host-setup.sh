#!/bin/bash
# Instala en el host: unidad systemd (arranque al encender) y cron de backups diario.
# Idempotente. Ejecutar como root: sudo ./deploy/host-setup.sh
# APP_DIR es la carpeta con docker-compose.yml y .env (por defecto, la de este repo).
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cat > /etc/systemd/system/pupete.service <<EOF
[Unit]
Description=Pupete · amigo invisible (Docker Compose)
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/cron.d/pupete <<EOF
# Backup diario de Pupete (BD + fotos + .env). Retención 30 días.
30 3 * * * root $APP_DIR/deploy/backup.sh $APP_DIR/backups >> /var/log/pupete-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/pupete

systemctl daemon-reload
systemctl enable pupete.service
systemctl start pupete.service
systemctl --no-pager --lines=0 status pupete.service
echo "[host] systemd + cron instalados"
