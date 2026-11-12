#!/usr/bin/env bash
# =====================================================================
#  Batilmer Form Paneli – sunucu kurulum / güncelleme scripti
#  Kullanım (sunucuda, proje klasöründe):
#     bash deploy/kur.sh                 → canlı (form.batilmer.com)
#     ORTAM=test bash deploy/kur.sh      → test (test.form.batilmer.com, ayrı veritabanı)
#  Tekrar çalıştırmak güvenlidir: mevcut şifreleri ve verileri korur.
#  Her güncellemede bir önceki sürüm saklanır: sorun olursa  bash deploy/geri-al.sh
# =====================================================================
set -euo pipefail

ORTAM="${ORTAM:-canli}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$ORTAM" = "test" ]; then
  DOMAIN="${DOMAIN:-test.form.batilmer.com}"
  APP_NAME="batilmer-form-test"
  ENV_FILE_NAME="sunucu-test.env"
else
  ORTAM="canli"
  DOMAIN="${DOMAIN:-form.batilmer.com}"
  APP_NAME="batilmer-form"
  ENV_FILE_NAME="sunucu.env"
fi
export APP_NAME ENV_FILE_NAME
CADDY="${CADDY_CONTAINER:-site-caddy-1}"
ENV_FILE="$APP_DIR/$ENV_FILE_NAME"
DC=(docker compose -p "$APP_NAME" --env-file "$ENV_FILE")
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
  say "Ayar dosyası oluşturuluyor ($ENV_FILE_NAME)"
  ADMIN_PW="Bf-$(rand 6)-$(rand 6)-$(rand 4)7"
  umask 077
  cat >"$ENV_FILE" <<EOF
# Batilmer Form Paneli – $ORTAM ayarları. BU DOSYAYI KİMSEYLE PAYLAŞMAYIN, GIT'E EKLEMEYİN.
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

# Yedeklerin sunucu dışına (şifreli) kopyası. rclone kurulup ayarlandıktan sonra doldurun, örnek:
# RCLONE_HEDEF=gdrive-sifreli:batilmer-form   (ayrıntı: KURULUM.md → "Sunucu dışı yedek")
RCLONE_HEDEF=
EOF
  chmod 600 "$ENV_FILE"
  FIRST_INSTALL=1
  ok "$ENV_FILE_NAME oluşturuldu"
else
  FIRST_INSTALL=0
  ok "Mevcut $ENV_FILE_NAME kullanılıyor (şifreler korunuyor)"
fi

# ------------------------------------------------------------------ 3) uygulamayı derle ve başlat
# Geri dönüş için şu an çalışan sürümü sakla
if docker image inspect "$APP_NAME:latest" >/dev/null 2>&1; then
  docker tag "$APP_NAME:latest" "$APP_NAME:onceki"
  ok "Önceki sürüm saklandı ($APP_NAME:onceki). Sorun olursa: bash deploy/geri-al.sh"
fi
say "Panel derleniyor ve başlatılıyor (ilk seferde birkaç dakika sürebilir)"
"${DC[@]}" up -d --build
say "Panelin hazır olması bekleniyor"
for i in $(seq 1 60); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$APP_NAME" 2>/dev/null || echo yok)"
  [ "$STATUS" = "healthy" ] && break
  sleep 3
done
if [ "${STATUS:-}" != "healthy" ]; then
  "${DC[@]}" logs --tail=50 app
  warn "Panel başlamadı. Önceki sürüme dönmek için: $( [ "$ORTAM" = test ] && echo 'ORTAM=test ' )bash deploy/geri-al.sh"
  die "Yukarıdaki kayıtlara bakın."
fi
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
  if [ "$ORTAM" = "test" ]; then
    # Test sitesi arama motorlarında görünmesin
    printf '\n%s {\n\tencode zstd gzip\n\theader X-Robots-Tag "noindex, nofollow"\n\treverse_proxy %s:3000\n}\n' "$DOMAIN" "$APP_NAME" >>"$CADDYFILE"
  else
    printf '\n%s {\n\tencode zstd gzip\n\treverse_proxy %s:3000\n}\n' "$DOMAIN" "$APP_NAME" >>"$CADDYFILE"
  fi
  if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    cat "$BACKUP" >"$CADDYFILE"
    die "Caddy ayarı doğrulanamadı; eski hali geri yüklendi. Hiçbir site etkilenmedi."
  fi
  ok "$DOMAIN bloğu eklendi"
fi
docker exec -w /etc/caddy "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  && ok "Caddy yeniden yüklendi (siteler kesintisiz)" \
  || warn "Caddy yeniden yüklenemedi. 'docker restart $CADDY' deneyin."

# ------------------------------------------------------------------ 5) gece yedeği (sadece canlı)
chmod +x "$APP_DIR"/deploy/*.sh
if [ "$ORTAM" = "canli" ]; then
  say "Günlük veritabanı yedeği"
  cat >/etc/cron.d/batilmer-form-yedek <<EOF
# Her gece 03:30 (sunucu saati) Batilmer Form yedeği
30 3 * * * root $APP_DIR/deploy/yedek.sh >>/var/log/batilmer-form-yedek.log 2>&1
EOF
  chmod 644 /etc/cron.d/batilmer-form-yedek
  ok "Her gece yedek alınacak: $APP_DIR/yedekler (son 14 gün saklanır)"
  if grep -qE '^RCLONE_HEDEF=.+' "$ENV_FILE"; then ok "Yedekler sunucu dışına da kopyalanacak"; else warn "Sunucu dışı yedek ayarlı değil (KURULUM.md → Sunucu dışı yedek)"; fi
fi

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
echo "Bir sorun olursa önceki sürüme dönmek için: $( [ "$ORTAM" = test ] && echo 'ORTAM=test ' )bash deploy/geri-al.sh"
