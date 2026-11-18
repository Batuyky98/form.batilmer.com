#!/usr/bin/env bash
# Batilmer Form Paneli – veritabanı ve yüklenen dosyaların yedeği (her gece cron ile çalışır)
#  • Sunucuda: yedekler/ klasörü, son 14 gün
#  • Sunucu dışında (isteğe bağlı): sunucu.env içinde RCLONE_HEDEF doluysa rclone ile kopyalanır,
#    orada da son 14 gün tutulur (veri işleme sözleşmesindeki süreyle aynı). Hedefin "crypt" (şifreli)
#    rclone hedefi olması önerilir: KURULUM.md
#  • Yedek alınamazsa haber: sunucu.env içinde HEALTHCHECK_URL (ör. healthchecks.io, ücretsiz) doluysa
#    başarıda o adrese, hatada adres/fail'e istek atılır; yedek alınmayan gece size e-posta gelir.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-batilmer-form}"
ENV_FILE="$APP_DIR/${ENV_FILE_NAME:-sunucu.env}"
envval() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' || true; }
SAKLA_GUN=14
HC="$(envval HEALTHCHECK_URL)"
ping_hc() { [ -n "$HC" ] && curl -fsS -m 10 --retry 3 -o /dev/null "$HC$1" || true; }
trap 'ping_hc /fail' ERR
DIR="$APP_DIR/yedekler"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DIR"
chmod 700 "$DIR"
umask 077

DB_FILE="$DIR/veritabani-$STAMP.sql.gz"
docker exec "$APP_NAME-db" sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --default-character-set=utf8mb4 batilmer_form' \
  | gzip >"$DB_FILE.tmp"
# Boş / yarım dosya "yedek" sayılmasın
if [ "$(gzip -dc "$DB_FILE.tmp" | head -c 2000 | grep -c 'MySQL dump' || true)" -lt 1 ]; then
  mv "$DB_FILE.tmp" "$DB_FILE.HATALI"
  echo "$(date '+%F %T') HATA: veritabanı yedeği alınamadı ($DB_FILE.HATALI)" >&2
  ping_hc /fail
  exit 1
fi
mv "$DB_FILE.tmp" "$DB_FILE"

if ! docker cp "$APP_NAME":/data/uploads - 2>/dev/null | gzip >"$DIR/dosyalar-$STAMP.tar.gz"; then
  rm -f "$DIR/dosyalar-$STAMP.tar.gz"
  echo "$(date '+%F %T') UYARI: yüklenen dosyaların yedeği alınamadı (veritabanı yedeği tamam)" >&2
  DOSYA_UYARI=1
fi

# 14 günden eski yedekleri sil
find "$DIR" -type f -name '*.gz' -mtime +"$SAKLA_GUN" -delete
echo "$(date '+%F %T') yedek alındı: $STAMP ($(du -h "$DB_FILE" | cut -f1))"

# ---------------------------------------------------------------- sunucu dışına kopya
HEDEF="$(envval RCLONE_HEDEF)"
if [ -n "$HEDEF" ]; then
  if ! command -v rclone >/dev/null; then
    echo "$(date '+%F %T') UYARI: RCLONE_HEDEF ayarlı ama rclone kurulu değil (apt-get install -y rclone)" >&2
    ping_hc /fail
    exit 1
  fi
  rclone copy "$DIR" "$HEDEF" --include "*-$STAMP.*" --no-traverse
  rclone delete "$HEDEF" --min-age "${SAKLA_GUN}d" --include "*.gz" || true
  echo "$(date '+%F %T') sunucu dışına kopyalandı: $HEDEF"
fi
if [ -n "${DOSYA_UYARI:-}" ]; then ping_hc /fail; else ping_hc ""; fi
