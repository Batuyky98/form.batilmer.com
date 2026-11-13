#!/usr/bin/env bash
# =====================================================================
#  Otomatik güncellemeyi BİR KEZ açmak için (sunucuda, proje klasöründe):
#     bash deploy/otomatik-kur.sh
#  Ne yapar:
#   1) deploy/otomatik-guncelle.sh'i /usr/local/sbin/batilmer-guncelle olarak kurar
#   2) GitHub için ayrı bir SSH anahtarı üretir; bu anahtar sunucuda SADECE
#      güncellemeyi çalıştırabilir (kabuk açamaz, port yönlendiremez)
#   3) GitHub'a girilecek 3 değeri ekrana yazar
#  Kapatmak için: bash deploy/otomatik-kur.sh kapat
# =====================================================================
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEY=/root/.ssh/batilmer-github
AUTH=/root/.ssh/authorized_keys
MARK="batilmer-github-otomatik"
[ "$(id -u)" -eq 0 ] || { echo "root olarak çalıştırın"; exit 1; }
mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch "$AUTH" && chmod 600 "$AUTH"

if [ "${1:-}" = "kapat" ]; then
  sed -i "/$MARK/d" "$AUTH"
  rm -f "$KEY" "$KEY.pub"
  echo "✔ Otomatik güncelleme kapatıldı (GitHub artık sunucuya bağlanamaz)."
  exit 0
fi

install -m 755 "$APP_DIR/deploy/otomatik-guncelle.sh" /usr/local/sbin/batilmer-guncelle
sed -i "s#^APP_DIR=.*#APP_DIR=\"\${APP_DIR:-$APP_DIR}\"#" /usr/local/sbin/batilmer-guncelle
command -v unzip >/dev/null || apt-get install -y unzip >/dev/null
command -v flock >/dev/null || apt-get install -y util-linux >/dev/null

[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "$MARK" -f "$KEY"
sed -i "/$MARK/d" "$AUTH"
echo "command=\"/usr/local/sbin/batilmer-guncelle\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat "$KEY.pub")" >>"$AUTH"

IP="$(curl -s -4 --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')"
PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"; PORT="${PORT:-22}"
echo
echo "✔ Sunucu hazır. Şimdi GitHub'da: depo → Settings → Secrets and variables → Actions → New repository secret"
echo "  Aşağıdaki 3 değeri AYNI isimlerle ekleyin:"
echo
echo "──── 1) İsim: SUNUCU_ADRES ────"
[ "$PORT" = "22" ] && echo "$IP" || echo "$IP:$PORT"
echo
echo "──── 2) İsim: SUNUCU_PARMAK_IZI ────"
ssh-keyscan -p "$PORT" -t ed25519 127.0.0.1 2>/dev/null | sed "s/^[^ ]*/$( [ "$PORT" = 22 ] && echo "$IP" || echo "[$IP]:$PORT")/"
echo
echo "──── 3) İsim: SUNUCU_ANAHTAR (BEGIN ve END satırları dahil hepsi) ────"
cat "$KEY"
echo
echo "Bu anahtar sadece güncelleme yapabilir. Kapatmak için: bash deploy/otomatik-kur.sh kapat"
