#!/bin/bash
# Publica Pupete en tu dominio con nginx + Let's Encrypt (certbot).
#   sudo ./deploy/nginx-setup.sh pupete.tudominio.com tu@email.com [puerto]
# El email es para los avisos de caducidad de Let's Encrypt. El puerto es
# APP_PORT del .env (3020 por defecto).
# Idempotente: si el certificado no existe, primero levanta el bloque :80,
# emite el certificado y después escribe el bloque :443 completo.
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
LE_EMAIL="${2:-${LE_EMAIL:-}}"
UPSTREAM="127.0.0.1:${3:-${APP_PORT:-3020}}"
if [ -z "$DOMAIN" ] || [ -z "$LE_EMAIL" ]; then
  echo "Uso: $0 <dominio> <email-lets-encrypt> [puerto]" >&2
  exit 1
fi
AVAIL=/etc/nginx/sites-available/$DOMAIN
ENABLED=/etc/nginx/sites-enabled/$DOMAIN
CERT=/etc/letsencrypt/live/$DOMAIN

if [ ! -f "$CERT/fullchain.pem" ]; then
  echo "[nginx] sin certificado: bloque :80 para el reto ACME"
  cat > "$AVAIL" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
  ln -sf "$AVAIL" "$ENABLED"
  nginx -t && systemctl reload nginx

  echo "[nginx] certbot certonly --nginx -d $DOMAIN"
  env -u PYTHONPATH -u PYTHONHOME certbot certonly --nginx -d "$DOMAIN" \
    --non-interactive --agree-tos -m "$LE_EMAIL"
fi

echo "[nginx] vhost definitivo"
cat > "$AVAIL" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # server actions de Next aceptan hasta 4 MB (fotos de 3 MB)
    client_max_body_size 6m;

    location / {
        proxy_pass http://$UPSTREAM;
        proxy_http_version 1.1;
        # Next compara Origin con Host en las server actions: sin esto, "Invalid Server Actions request"
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF
ln -sf "$AVAIL" "$ENABLED"
nginx -t && systemctl reload nginx
echo "[nginx] OK → https://$DOMAIN"
