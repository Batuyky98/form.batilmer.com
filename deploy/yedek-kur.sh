#!/usr/bin/env bash
# Batilmer Form Paneli – sunucu dışı şifreli yedek + "yedek alınamadı" uyarısı kurulumu (tek seferlik)
# Kullanım (sunucuda, root):  sudo bash /opt/batilmer-form-paneli/deploy/yedek-kur.sh
#  1) rclone'u kurar
#  2) Google Drive bağlantısını kurar (bir kere kendi bilgisayarınızdan Google'a izin verirsiniz)
#  3) Drive'a giden yedekleri ŞİFRELEYEN "gdrive-sifreli" hedefini oluşturur (şifreleri sizin için üretir)
#  4) sunucu.env'e RCLONE_HEDEF ve (isterseniz) HEALTHCHECK_URL yazar
#  5) Bir yedek alıp Drive'a gönderir ve kontrol eder
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/${ENV_FILE_NAME:-sunucu.env}"
b() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bu betiği root olarak çalıştırın: sudo bash $0"
[ -f "$ENV_FILE" ] || die "$ENV_FILE bulunamadı. Betik panelin kurulu olduğu klasörde olmalı."

setenv() { # sunucu.env içinde KEY=VALUE yaz/güncelle
  local k="$1" v="$2"
  if grep -qE "^$k=" "$ENV_FILE"; then sed -i "s|^$k=.*|$k=$v|" "$ENV_FILE"; else printf '%s=%s\n' "$k" "$v" >>"$ENV_FILE"; fi
}

b "1/5 rclone"
# Güncel rclone gerekli (Ubuntu deposundaki eski sürüm bazı ayarları desteklemiyor)
ver_ok() { rclone version 2>/dev/null | head -n1 | grep -qE 'v1\.(5[6-9]|[6-9][0-9])'; }
if command -v rclone >/dev/null && ver_ok; then ok "rclone kurulu ($(rclone version | head -n1))"; else
  apt-get update -qq && apt-get install -y -qq unzip curl >/dev/null
  curl -fsSL https://rclone.org/install.sh | bash >/dev/null 2>&1 || true
  ver_ok || die "rclone kurulamadı. Elle: curl https://rclone.org/install.sh | sudo bash"
  ok "rclone kuruldu ($(rclone version | head -n1))"
fi

b "2/5 Google Drive bağlantısı"
if rclone listremotes | grep -qx 'gdrive:'; then ok "gdrive bağlantısı zaten var"; else
  cat <<'TXT'
Şimdi rclone size sorular soracak. Şöyle cevaplayın:
  • name> gdrive
  • Storage> drive        (listede "Google Drive" yazanın numarası ya da "drive")
  • client_id> (boş bırakıp Enter)     • client_secret> (boş bırakıp Enter)
  • scope> 1              (tam erişim)
  • service_account_file> (boş, Enter)  • Edit advanced config? n
  • Use web browser to automatically authenticate? n
    → Ekranda "rclone authorize "drive" ..." diye bir komut çıkar. Bu komutu KENDİ BİLGİSAYARINIZDA çalıştırın
      (rclone.org/downloads adresinden Windows/Mac için rclone indirin), tarayıcıda Google hesabınızla izin verin,
      çıkan uzun kodu buraya yapıştırın.
  • Configure this as a Shared Drive? n
  • Keep this "gdrive" remote? y     • Sonra "q" ile çıkın.
TXT
  read -r -p "Hazırsanız Enter'a basın..." _
  rclone config
  rclone listremotes | grep -qx 'gdrive:' || die "gdrive bağlantısı oluşmadı. Betiği tekrar çalıştırın."
  ok "gdrive bağlandı"
fi
rclone lsd gdrive: >/dev/null 2>&1 && ok "Drive'a erişim var" || die "Drive'a erişilemedi. 'rclone config' ile gdrive bağlantısını kontrol edin."

b "3/5 Şifreli yedek hedefi"
if rclone listremotes | grep -qx 'gdrive-sifreli:'; then ok "gdrive-sifreli zaten var"; else
  P1="$(openssl rand -base64 24 | tr -d '\n')"
  P2="$(openssl rand -base64 24 | tr -d '\n')"
  rclone config create gdrive-sifreli crypt remote=gdrive:batilmer-yedek filename_encryption=standard directory_name_encryption=true password="$P1" password2="$P2" --obscure >/dev/null
  cat <<TXT

  ┌──────────────────────────────────────────────────────────────────────────┐
  │ YEDEK ŞİFRELERİ — BUNLARI ŞİMDİ ŞİFRE YÖNETİCİNİZE KAYDEDİN            │
  │ Sunucu tamamen kaybolursa yedeği ancak bu iki şifreyle açabilirsiniz.   │
  │ Bu şifreleri sohbete/WhatsApp'a yazmayın, kimseyle paylaşmayın.         │
  │   Şifre 1: $P1
  │   Şifre 2: $P2
  └──────────────────────────────────────────────────────────────────────────┘
TXT
  read -r -p "Şifreleri kaydettiyseniz 'kaydettim' yazın: " CEV
  [ "$CEV" = "kaydettim" ] || warn "Şifreleri kaydetmeyi unutmayın: 'rclone config show gdrive-sifreli' şifreleri gizli (obscured) gösterir, 'rclone reveal <değer>' ile açılır."
  unset P1 P2
  ok "gdrive-sifreli oluşturuldu (Drive'da 'batilmer-yedek' klasörü, adlar ve içerik şifreli)"
fi
setenv RCLONE_HEDEF "gdrive-sifreli:"
ok "sunucu.env → RCLONE_HEDEF=gdrive-sifreli:"

b "4/5 Yedek alınamazsa uyarı (healthchecks.io, isteğe bağlı)"
echo "healthchecks.io'da ücretsiz hesap → Add Check → Period: 1 day, Grace: 2 hours → çıkan https://hc-ping.com/... adresini yapıştırın."
read -r -p "Adres (atlamak için boş bırakıp Enter): " HC
if [ -n "$HC" ]; then
  [[ "$HC" =~ ^https://[A-Za-z0-9./_-]+$ ]] || die "Adres https:// ile başlamalı."
  setenv HEALTHCHECK_URL "$HC"
  ok "sunucu.env → HEALTHCHECK_URL ayarlandı"
else warn "Uyarı atlandı; sonra bu betiği tekrar çalıştırarak ekleyebilirsiniz."; fi

b "5/5 Deneme yedeği"
bash "$APP_DIR/deploy/yedek.sh"
echo
echo "Drive'daki (şifresi çözülmüş) yedek listesi:"
rclone ls gdrive-sifreli: | tail -n 5
ok "Bitti. Her gece yedek hem sunucuda hem Google Drive'da (şifreli) 14 gün tutulacak."
