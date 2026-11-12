#!/usr/bin/env bash
# =====================================================================
#  Batilmer Form Paneli – bir önceki sürüme dönüş
#  Güncellemeden sonra bir şey bozulursa (sunucuda, proje klasöründe):
#     bash deploy/geri-al.sh               → canlı
#     ORTAM=test bash deploy/geri-al.sh    → test
#  Veritabanına ve yüklenen dosyalara DOKUNMAZ; sadece programı bir önceki hâline döndürür.
#  (Veritabanı değişiklikleri hep "ekleme" şeklinde yapıldığı için eski sürüm yeni veritabanıyla çalışır.)
# =====================================================================
set -euo pipefail

ORTAM="${ORTAM:-canli}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$ORTAM" = "test" ]; then
  APP_NAME="batilmer-form-test"
  ENV_FILE_NAME="sunucu-test.env"
else
  APP_NAME="batilmer-form"
  ENV_FILE_NAME="sunucu.env"
fi
export APP_NAME ENV_FILE_NAME
ENV_FILE="$APP_DIR/$ENV_FILE_NAME"
cd "$APP_DIR"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bu scripti root olarak çalıştırın."
[ -f "$ENV_FILE" ] || die "$ENV_FILE bulunamadı."
docker image inspect "$APP_NAME:onceki" >/dev/null 2>&1 || die "Saklanmış önceki sürüm yok ($APP_NAME:onceki). Henüz hiç güncelleme yapılmamış olabilir."

say "Önceki sürüme dönülüyor"
# Şu anki (sorunlu) sürüm de silinmesin: "sorunlu" adıyla saklanır
docker image inspect "$APP_NAME:latest" >/dev/null 2>&1 && docker tag "$APP_NAME:latest" "$APP_NAME:sorunlu"
docker tag "$APP_NAME:onceki" "$APP_NAME:latest"
docker compose -p "$APP_NAME" --env-file "$ENV_FILE" up -d --no-build app

for i in $(seq 1 40); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$APP_NAME" 2>/dev/null || echo yok)"
  [ "$STATUS" = "healthy" ] && break
  sleep 3
done
[ "${STATUS:-}" = "healthy" ] || die "Panel başlamadı: docker compose -p $APP_NAME --env-file $ENV_FILE_NAME logs --tail=100 app"
ok "Önceki sürüm çalışıyor."
echo "Sorunlu sürüm '$APP_NAME:sorunlu' adıyla saklandı. Düzeltilmiş sürüm gelince her zamanki gibi: $( [ "$ORTAM" = test ] && echo 'ORTAM=test ' )bash deploy/kur.sh"
