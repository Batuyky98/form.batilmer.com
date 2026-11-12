#!/usr/bin/env bash
# Batilmer Form Paneli – veritabanı ve yüklenen dosyaların yedeği (her gece cron ile çalışır)
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$APP_DIR/yedekler"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DIR"
chmod 700 "$DIR"

docker exec batilmer-form-db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --default-character-set=utf8mb4 batilmer_form' \
  | gzip >"$DIR/veritabani-$STAMP.sql.gz"

docker cp batilmer-form:/data/uploads - 2>/dev/null | gzip >"$DIR/dosyalar-$STAMP.tar.gz" || true

# 14 günden eski yedekleri sil
find "$DIR" -type f -name '*.gz' -mtime +14 -delete
echo "$(date '+%F %T') yedek alındı: $STAMP"
