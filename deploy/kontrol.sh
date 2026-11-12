#!/usr/bin/env bash
# =====================================================================
#  Sunucu güvenlik / sağlık kontrolü – SADECE BİLGİ TOPLAR, HİÇBİR ŞEYİ DEĞİŞTİRMEZ.
#  Kullanım (sunucuda):   bash deploy/kontrol.sh
# =====================================================================
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
h() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

h "Kutular ve yeniden başlatma ayarı (sunucu yeniden başlarsa kendiliğinden açılırlar mı?)"
docker ps --format '{{.Names}}' | while read -r n; do
  printf '%-32s %s\n' "$n" "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$n")"
done
echo "(no / boş = sunucu yeniden başlayınca KAPALI kalır)"

h "İnternete açık portlar"
ss -tlnp 2>/dev/null | awk 'NR==1 || $4 !~ /127\.0\.0\.1|\[::1\]/' || netstat -tlnp

h "SSH ayarı"
sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication) ' || echo "sshd -T çalışmadı"
printf 'Tanımlı SSH anahtarı: %s\n' "$(grep -c '^ssh-\|^ecdsa-' /root/.ssh/authorized_keys 2>/dev/null || echo 0)"

h "Güvenlik duvarı"
(ufw status 2>/dev/null | head -n 20) || echo "ufw yok (Hostinger panelindeki güvenlik duvarına da bakın)"

h "Güncellemeler"
printf 'Otomatik güvenlik güncellemesi: %s\n' "$(systemctl is-enabled unattended-upgrades 2>/dev/null || echo kapalı/yok)"
printf 'Bekleyen güncelleme: %s\n' "$(apt list --upgradable 2>/dev/null | grep -vc '^Listing' || echo ?)"
[ -f /var/run/reboot-required ] && echo "Yeniden başlatma bekleniyor (sakin bir saatte yapın)."

h "Disk"
df -h / | tail -n1

h "Yedekler"
ls -lh "$APP_DIR/yedekler" 2>/dev/null | tail -n 6 || echo "Yedek klasörü yok"
tail -n 3 /var/log/batilmer-form-yedek.log 2>/dev/null || true
grep -qE '^RCLONE_HEDEF=.+' "$APP_DIR/sunucu.env" 2>/dev/null && echo "Sunucu dışı yedek: AÇIK" || echo "Sunucu dışı yedek: KAPALI"

h "Panel"
printf 'Sağlık: %s\n' "$(docker inspect -f '{{.State.Health.Status}}' batilmer-form 2>/dev/null || echo yok)"
printf 'Önceki sürüm saklı: %s\n' "$(docker image inspect batilmer-form:onceki >/dev/null 2>&1 && echo evet || echo hayır)"
