#!/usr/bin/env bash
# =====================================================================
#  Yedekten geri dönme testi – CANLI VERİTABANINA DOKUNMAZ.
#  Son yedeği geçici, ayrı bir MySQL kutusuna açar, içindeki kayıtları sayar ve kutuyu siler.
#  Kullanım (sunucuda, proje klasöründe):   bash deploy/yedek-test.sh [yedek-dosyası.sql.gz]
#  Ayda bir çalıştırılması önerilir: "yedeğimiz var" demek için geri dönebildiğimizi görmek gerekir.
# =====================================================================
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$APP_DIR/yedekler"
NAME="batilmer-yedek-test"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

FILE="${1:-$(ls -1t "$DIR"/veritabani-*.sql.gz 2>/dev/null | head -n1 || true)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || die "Yedek dosyası bulunamadı ($DIR). Önce: bash deploy/yedek.sh"
say "Test edilen yedek: $(basename "$FILE") ($(du -h "$FILE" | cut -f1))"
gzip -t "$FILE" || die "Dosya bozuk (gzip testi geçmedi)."
ok "Dosya sağlam"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
PW="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24 || true)"
# Ağa bağlanmayan, port açmayan, işi bitince silinen geçici kutu
docker run -d --name "$NAME" --network none -e MYSQL_ROOT_PASSWORD="$PW" -e MYSQL_DATABASE=geri_test mysql:8.4 >/dev/null
say "Geçici veritabanı başlatılıyor"
for i in $(seq 1 60); do
  docker exec "$NAME" mysql -uroot -p"$PW" -e 'SELECT 1' geri_test >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$NAME" mysql -uroot -p"$PW" -e 'SELECT 1' geri_test >/dev/null 2>&1 || die "Geçici veritabanı açılmadı."

say "Yedek geri yükleniyor"
gzip -dc "$FILE" | docker exec -i "$NAME" mysql -uroot -p"$PW" geri_test
ok "Geri yükleme tamamlandı"

say "Yedeğin içindekiler"
docker exec "$NAME" mysql -uroot -p"$PW" -t geri_test -e "
  SELECT 'Kullanıcılar' AS tablo, COUNT(*) AS adet FROM users WHERE deleted_at IS NULL
  UNION ALL SELECT 'Formlar', COUNT(*) FROM forms WHERE deleted_at IS NULL
  UNION ALL SELECT 'Kayıtlar', COUNT(*) FROM submissions WHERE deleted_at IS NULL
  UNION ALL SELECT 'Randevular', COUNT(*) FROM appointments
  UNION ALL SELECT 'Son kayıt', IFNULL(FROM_UNIXTIME(MAX(created_at)/1000), '-') FROM submissions;"

UP="$(ls -1t "$DIR"/dosyalar-*.tar.gz 2>/dev/null | head -n1 || true)"
if [ -n "$UP" ]; then
  N="$(tar -tzf "$UP" 2>/dev/null | grep -vc '/$' || true)"
  ok "Dosya yedeği: $(basename "$UP") – $N dosya"
fi
ok "Yedek test edildi, geçici veritabanı silindi. Canlı sisteme dokunulmadı."
