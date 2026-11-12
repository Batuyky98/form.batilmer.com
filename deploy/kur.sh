#!/usr/bin/env bash
# =====================================================================
#  Batilmer Form Paneli – sunucu kurulum / güncelleme scripti
#  Kullanım (sunucuda, proje klasöründe):   bash deploy/kur.sh
#  Tekrar çalıştırmak güvenlidir: mevcut şifreleri ve verileri korur.
# =====================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-form.batilmer.com}"
CADDY="${CADDY_CONTAINER:-site-caddy-1}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/sunucu.env"
cd "$APP_DIR"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }
rand() { (set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}"); }

[ "$(id -u)" -eq 0 ] || die "Bu scripti root olarak çalıştırın."
command -v docker >/dev/null || die "Docker bulunamadı."
docker compose version >/dev/null 2>&1 || die "docker compose bulunamadı."

# ------------------------------------------------------------------ 1) kontroller
say "Kontroller"
docker network inspect site_default >/dev/null 2>&1 || die "site_default ağı yok. Ana sitenin Docker projesi (Caddy) çalışıyor mu?"
docker inspect "$CADDY" >/dev/null 2>&1 || die "$CADDY bulunamadı. CADDY_CONTAINER=isim bash deploy/kur.sh ile belirtin."
ok "Caddy ve site_default ağı bulundu"

SERVER_IP="$(curl -s -4 --max-time 5 https://ifconfig.me || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -n "$DNS_IP" ] && [ -n "$SERVER_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; then
  warn "$DOMAIN şu an $DNS_IP adresine gidiyor, bu sunucu $SERVER_IP. DNS kaydını kontrol edin (SSL alınamaz)."
elif [ -z "$DNS_IP" ]; then
  warn "$DOMAIN henüz çözülemiyor. DNS yayılınca Caddy SSL'i kendisi alır."
else
  ok "DNS doğru: $DOMAIN → $DNS_IP"
fi

# ------------------------------------------------------------------ 2) ayar dosyası
if [ ! -f "$ENV_FILE" ]; then
  say "Ayar dosyası oluşturuluyor (sunucu.env)"
  ADMIN_PW="Bf-$(rand 6)-$(rand 6)-$(rand 4)7"
  umask 077
  cat >"$ENV_FILE" <<EOF
# Batilmer Form Paneli – canlı ayarlar. BU DOSYAYI KİMSEYLE PAYLAŞMAYIN, GIT'E EKLEMEYİN.
PUBLIC_URL=https://$DOMAIN

# Veritabanı (otomatik üretildi; değiştirirseniz MySQL verisi açılmaz)
DB_PASSWORD=$(rand 32)
DB_ROOT_PASSWORD=$(rand 32)

# İlk Ana Admin (sadece veritabanı boşken kullanılır; ilk girişte şifre değiştirilir)
SEED_ADMIN_EMAIL=info@batilmer.com
SEED_ADMIN_PASSWORD=$ADMIN_PW

# Mail (Brevo). Anahtarı girip "bash deploy/kur.sh" ile yeniden başlatın.
BREVO_API_KEY=
MAIL_FROM=info@batilmer.com
MAIL_FROM_NAME=Batilmer Form

# SMS sağlayıcısı (şimdilik yok)
SMS_PROVIDER=none

# Cloudflare Turnstile (isteğe bağlı bot koruması; ikisi birlikte doldurulmalı)
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET=

MAX_UPLOAD_MB=10
TRUST_PROXY=1
EOF
  chmod 600 "$ENV_FILE"
  FIRST_INSTALL=1
  ok "sunucu.env oluşturuldu"
else
  FIRST_INSTALL=0
  ok "Mevcut sunucu.env kullanılıyor (şifreler korunuyor)"
fi

# ------------------------------------------------------------------ 3) uygulamayı derle ve başlat
say "Panel derleniyor ve başlatılıyor (ilk seferde birkaç dakika sürebilir)"
docker compose --env-file "$ENV_FILE" up -d --build
say "Panelin hazır olması bekleniyor"
for i in $(seq 1 60); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' batilmer-form 2>/dev/null || echo yok)"
  [ "$STATUS" = "healthy" ] && break
  sleep 3
done
[ "${STATUS:-}" = "healthy" ] || { docker compose --env-file "$ENV_FILE" logs --tail=50 app; die "Panel başlamadı. Yukarıdaki kayıtlara bakın."; }
ok "Panel çalışıyor"

# ------------------------------------------------------------------ 4) Caddy'ye form.batilmer.com ekle
say "Caddy ayarı"
MOUNT="$(docker inspect -f '{{range .Mounts}}{{if or (eq .Destination "/etc/caddy/Caddyfile") (eq .Destination "/etc/caddy")}}{{.Destination}}|{{.Source}}{{end}}{{end}}' "$CADDY")"
[ -n "$MOUNT" ] || die "Caddyfile sunucudan bağlanmamış (image içinde). Caddy bloğunu elle ekleyin: deploy/Caddyfile.ek"
DEST="${MOUNT%%|*}"; SRC="${MOUNT#*|}"
if [ "$DEST" = "/etc/caddy" ]; then CADDYFILE="$SRC/Caddyfile"; else CADDYFILE="$SRC"; fi
[ -f "$CADDYFILE" ] || die "Caddyfile bulunamadı: $CADDYFILE"

if grep -q "^$DOMAIN" "$CADDYFILE"; then
  ok "$DOMAIN zaten Caddyfile içinde"
else
  BACKUP="$CADDYFILE.yedek-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CADDYFILE" "$BACKUP"
  ok "Caddyfile yedeklendi: $BACKUP"
  # Not: '>>' ile ekliyoruz (dosyanın kimliği değişmesin, Caddy kabı görmeye devam etsin)
  printf '\n%s {\n\tencode zstd gzip\n\treverse_proxy batilmer-form:3000\n}\n' "$DOMAIN" >>"$CADDYFILE"
  if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    cat "$BACKUP" >"$CADDYFILE"
    die "Caddy ayarı doğrulanamadı; eski hali geri yüklendi. Hiçbir site etkilenmedi."
  fi
  ok "$DOMAIN bloğu eklendi"
fi
docker exec -w /etc/caddy "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  && ok "Caddy yeniden yüklendi (siteler kesintisiz)" \
  || warn "Caddy yeniden yüklenemedi. 'docker restart $CADDY' deneyin."

# ------------------------------------------------------------------ 5) gece yedeği
say "Günlük veritabanı yedeği"
chmod +x "$APP_DIR/deploy/yedek.sh"
cat >/etc/cron.d/batilmer-form-yedek <<EOF
# Her gece 03:30 (sunucu saati) Batilmer Form yedeği
30 3 * * * root $APP_DIR/deploy/yedek.sh >>/var/log/batilmer-form-yedek.log 2>&1
EOF
chmod 644 /etc/cron.d/batilmer-form-yedek
ok "Her gece yedek alınacak: $APP_DIR/yedekler (son 14 gün saklanır)"

# ------------------------------------------------------------------ bitti
say "Kurulum tamam"
echo "Panel:  https://$DOMAIN/panel"
if [ "$FIRST_INSTALL" = "1" ]; then
  echo
  echo "İlk giriş bilgileri (BİR KEZ gösteriliyor, not alın):"
  echo "  E-posta: info@batilmer.com"
  echo "  Şifre  : $ADMIN_PW"
  echo "İlk girişte yeni şifre belirlemeniz istenecek."
fi
echo
echo "SSL sertifikası ilk açılışta birkaç saniye içinde otomatik alınır."
