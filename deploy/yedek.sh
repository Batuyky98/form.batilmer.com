#!/usr/bin/env bash
# Batilmer Form Paneli – veritabanı ve yüklenen dosyaların yedeği (her gece cron ile çalışır)
#  • Sunucuda: yedekler/ klasörü, son 14 gün
#  • Sunucu dışında (isteğe bağlı): sunucu.env içinde RCLONE_HEDEF doluysa rclone ile kopyalanır,
#    orada son 30 gün tutulur. Hedefin "crypt" (şifreli) rclone hedefi olması önerilir: KURULUM.md
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-batilmer-form}"
ENV_FILE="$APP_DIR/${ENV_FILE_NAME:-sunucu.env}"
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
  exit 1
fi
mv "$DB_FILE.tmp" "$DB_FILE"

docker cp "$APP_NAME":/data/uploads - 2>/dev/null | gzip >"$DIR/dosyalar-$STAMP.tar.gz" || true

# 14 günden eski yedekleri sil
find "$DIR" -type f -name '*.gz' -mtime +14 -delete
echo "$(date '+%F %T') yedek alındı: $STAMP ($(du -h "$DB_FILE" | cut -f1))"

# ---------------------------------------------------------------- sunucu dışına kopya
HEDEF="$(grep -E '^RCLONE_HEDEF=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' || true)"
if [ -n "$HEDEF" ]; then
  if ! command -v rclone >/dev/null; then
    echo "$(date '+%F %T') UYARI: RCLONE_HEDEF ayarlı ama rclone kurulu değil (apt-get install -y rclone)" >&2
    exit 1
  fi
  rclone copy "$DIR" "$HEDEF" --include "*-$STAMP.*" --no-traverse
  rclone delete "$HEDEF" --min-age 30d --include "*.gz" || true
  echo "$(date '+%F %T') sunucu dışına kopyalandı: $HEDEF"
fi
