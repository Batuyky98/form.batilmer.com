#!/usr/bin/env bash
# =====================================================================
#  Otomatik güncelleme (GitHub Actions'tan SSH ile çağrılır)
#  Bu dosya sunucuda /usr/local/sbin/batilmer-guncelle olarak kuruludur ve
#  GitHub'ın anahtarı SADECE bunu çalıştırabilir (authorized_keys "command=").
#  Girdi: standart girişten proje zip'i (git archive). Başka hiçbir komut kabul edilmez.
#  Akış: zip kontrolü → yedek → dosyaları aç → kur.sh → sağlık kontrolü;
#        panel ayağa kalkmazsa otomatik olarak önceki sürüme döner.
# =====================================================================
set -uo pipefail
APP_DIR="${APP_DIR:-/opt/batilmer-form-paneli}"
LOG=/var/log/batilmer-guncelle.log
exec > >(tee -a "$LOG") 2>&1
echo; echo "===== $(date '+%F %T') otomatik güncelleme ====="
die() { echo "✖ $*"; exit 1; }

exec 9>/run/batilmer-guncelle.lock
flock -n 9 || die "Başka bir güncelleme sürüyor."

ZIP="$(mktemp --suffix=.zip)"
trap 'rm -f "$ZIP"' EXIT
head -c 200000000 >"$ZIP"
[ -s "$ZIP" ] || die "Zip gelmedi."
unzip -tq "$ZIP" >/dev/null || die "Zip bozuk."
unzip -Z1 "$ZIP" | grep -qvE '^batilmer-form-paneli/' && die "Zip beklenen klasörün dışına dosya içeriyor."
unzip -Z1 "$ZIP" | grep -q '\.\./' && die "Zip geçersiz yol içeriyor."

cd "$APP_DIR" || die "$APP_DIR yok."
bash deploy/yedek.sh || die "Yedek alınamadı; güncelleme yapılmadı."
unzip -oq "$ZIP" -d "$(dirname "$APP_DIR")" || die "Dosyalar açılamadı."
sed -i 's/\r$//' deploy/*.sh

if bash deploy/kur.sh; then
  echo "✔ Güncelleme tamam"
  exit 0
fi
STATUS="$(docker inspect -f '{{.State.Health.Status}}' batilmer-form 2>/dev/null || echo yok)"
if [ "$STATUS" != "healthy" ]; then
  echo "! Panel ayağa kalkmadı, önceki sürüme dönülüyor"
  bash deploy/geri-al.sh || true
fi
die "Güncelleme başarısız (ayrıntı: $LOG)"
