# Batilmer Form Paneli – Sunucuya Kurulum

Hedef: Paneli `https://form.batilmer.com` adresinde yayına almak. Ana site (`batilmer.com`), `demo` ve `yonetim` **etkilenmez**.

## Sunucudaki yapı

| Kutu (container) | Görevi |
| --- | --- |
| `site-caddy-1` | Mevcut. Tüm https trafiğini karşılar, SSL'i otomatik alır. Kurulum buna sadece `form.batilmer.com` bloğunu ekler. |
| `batilmer-form` | **Yeni.** Panel + formlar (Node.js). Dışarıya port açmaz, Caddy üzerinden gelir. |
| `batilmer-form-db` | **Yeni.** MySQL 8.4. Sadece panel görebilir, dışarıya tamamen kapalı. |

## Ön koşul

- GoDaddy DNS'te `A  form  2.24.62.101` kaydı (eklendi ✔)

## Kurulum (ilk sefer)

Hostinger'ın web konsolunda yapıştırma çalışmadığı için **Windows PowerShell** kullanın.

1. Zip dosyasının bulunduğu klasörde PowerShell açın (klasörde boş yere Shift + sağ tık → "PowerShell penceresini burada aç") ve dosyayı sunucuya gönderin:

   ```powershell
   scp batilmer-form-paneli.zip root@2.24.62.101:/root/
   ```

   İlk bağlantıda `yes` yazın, ardından root şifresini girin (yazarken görünmez).

2. Sunucuya bağlanın:

   ```powershell
   ssh root@2.24.62.101
   ```

3. Sunucuda şu komutları sırayla çalıştırın (PowerShell'de sağ tık = yapıştır):

   ```bash
   apt-get install -y unzip
   unzip -o /root/batilmer-form-paneli.zip -d /opt/
   cd /opt/batilmer-form-paneli
   bash deploy/kur.sh
   ```

4. Script bittiğinde **ilk giriş şifresini bir kez** ekrana yazar. Not alın. `https://form.batilmer.com/panel` adresine girip yeni şifrenizi belirleyin.
5. Şifreden sonra panel **iki adımlı doğrulamayı (Authenticator)** kurmanızı ister. Ana Admin hesaplarında zorunludur; telefonunuza Google Authenticator ya da Microsoft Authenticator kurup ekrandaki kareyi okutun. Verilen **10 yedek kodu** indirip güvenli bir yerde saklayın (telefon kaybolursa bunlarla girilir).

Script şunları yapar:

- Rastgele, güçlü veritabanı şifreleri üretir (`sunucu.env`, sadece root okuyabilir)
- Paneli ve MySQL'i Docker ile kurar
- Caddy ayar dosyasını **yedekler**, `form.batilmer.com` bloğunu ekler, doğrular; hata olursa eski haline geri döndürür
- Caddy'yi kesintisiz yeniden yükler (ana site kapanmaz)
- Her gece 03:30'da veritabanı ve dosya yedeği kurar (`/opt/batilmer-form-paneli/yedekler`, son 14 gün)

## Güncelleme (yeni sürüm geldiğinde)

```bash
# PowerShell'den yeni zip'i gönderin, sonra sunucuda:
unzip -o /root/batilmer-form-paneli.zip -d /opt/
cd /opt/batilmer-form-paneli
bash deploy/kur.sh
```

`sunucu.env`, veritabanı ve yüklenen dosyalar korunur. Veritabanı şeması gerekiyorsa otomatik güncellenir.

**Önerilen sıra:** yeni sürümü önce test ortamına kurun (aşağıda), orada deneyin, sorun yoksa canlıya kurun.

### Bir şey bozulursa: önceki sürüme dönüş

`kur.sh` her güncellemede çalışan sürümü `batilmer-form:onceki` adıyla saklar. Güncellemeden sonra bir sorun çıkarsa:

```bash
cd /opt/batilmer-form-paneli
bash deploy/geri-al.sh
```

Veritabanına ve yüklenen dosyalara dokunmaz, sadece programı bir önceki hâline döndürür (veritabanı değişiklikleri hep "ekleme" şeklinde yapıldığı için eski sürüm yeni veritabanıyla çalışır).

### Bu sürüme (bildirimler + Authenticator) geçerken

- 12 saatten eski ya da 2 saattir işlem yapılmamış oturumlar kapanır; o kişiler yeniden giriş yapar.
- Ana Admin ilk girişte Authenticator kurmadan devam edemez (telefonunuz yanınızda olsun).
- Formlardaki eski "bildirim gidecek e-postalar" ayarı kaldırıldı. Kimin bildirim alacağını **Kullanıcılar** ekranında her formun satırındaki **"Bildirim"** tikiyle seçin.
- Müşteriye giden mailler artık form bazında **kapalı** başlar (ücretli ek özellik). Müşteri, formu gönderdiği ekranda randevu bilgisi, iptal bağlantısı ve "Takvimime ekle" butonunu görür.

## Test ortamı (test.form.batilmer.com)

Canlıyla aynı sunucuda, **ayrı veritabanı ve ayrı kutularla** çalışan deneme ortamı. Veterinerin kullandığı sisteme dokunmadan yeni sürümler burada denenir.

1. GoDaddy DNS'e `A  test.form  2.24.62.101` kaydını ekleyin.
2. Sunucuda:

   ```bash
   cd /opt/batilmer-form-paneli
   ORTAM=test bash deploy/kur.sh
   ```

   İlk seferde test için ayrı bir `sunucu-test.env` ve ayrı ilk giriş şifresi üretilir. Test sitesi arama motorlarına kapalıdır, gece yedeği alınmaz.
3. Güncelleme akışı: yeni zip'i açın → `ORTAM=test bash deploy/kur.sh` → test edin → `bash deploy/kur.sh` (canlı).
4. Test ortamında da sorun olursa: `ORTAM=test bash deploy/geri-al.sh`

## Bildirimler (ücretsiz, ek servis gerekmez)

- **Panelde canlı bildirim:** panel açıkken 15 saniyede bir yeni randevu/kayıt kontrol edilir; ses + köşede açılır kart + zil simgesinde sayaç.
- **Telefon / bilgisayar bildirimi (Web Push):** panel kapalıyken de gelir. Tarayıcıların kendi altyapısı kullanılır; hesap açmak, ücret ödemek ya da sunucu ayarı yapmak gerekmez. Bildirim anahtarları ilk açılışta otomatik üretilir ve veritabanında (dolayısıyla yedekte) saklanır.
- **Kim alır?** Ana Admin, Kullanıcılar ekranında formun satırındaki **"Bildirim"** tikini atar. Kişi girişte çıkan pencerede **"Bildirimlere izin ver"** der (telefonun güvenlik kuralı: bu adımı başkası yapamaz). Tik kaldırılınca bildirim anında durur; "Çıkış yap" denince o cihazın bildirimi durur.
- **Ana Admin** bildirimleri varsayılan olarak kapalıdır; sadece tik attığı formlardan alır.
- **İçerik:** sadece işletme, tarih, saat ve hizmet ("Yeni randevu: Vital Veteriner · Per 14 Kas 14:30 · Muayene"). Müşterinin adı, telefonu, TC'si bildirimde ve kilit ekranında görünmez.
- Telefonda nasıl açılacağı: [KULLANIM.md](KULLANIM.md)

## Oturum ve giriş güvenliği

- 2 saat hiçbir işlem yapılmazsa oturum kapanır; 5 dakika önce "Devam etmek istiyor musunuz?" diye sorulur. Panelin arka planda yaptığı bildirim kontrolleri süreyi uzatmaz, sadece kişinin kendi tıklamaları uzatır.
- Sürekli kullanılsa bile 12 saatte bir yeniden giriş istenir.
- Ana Admin hesaplarında Authenticator zorunlu, diğer kullanıcılarda isteğe bağlı (sol alttaki **Güvenlik**). Telefonunu kaybeden kullanıcının Authenticator'ını başka bir Ana Admin, Kullanıcılar ekranından **"2FA sıfırla"** ile sıfırlar.
- Ekipte herkesin **kendi** Ana Admin hesabı olsun (Kullanıcılar → Yeni kullanıcı → Hesap türü: Ana Admin). Böylece işlem kayıtlarında kimin ne yaptığı görünür. `info@batilmer.com` hesabını yedek olarak saklayın.
- Mail servisi ayarlı değilken "Şifremi unuttum" ekranı kullanıcıyı yöneticiye yönlendirir; Ana Admin, Kullanıcılar ekranından yeni geçici şifre verir.

## Mail gönderimi (Brevo) – isteğe bağlı

Panelin çalışması için mail **gerekmez**: yetkili kişilere bildirimler panel + telefon bildirimiyle gider, müşteri bilgilerini formdan sonraki ekranda görür. Mail sadece şunlar için kullanılır: form bazında açılan "Müşteriye mail" (ücretli ek özellik) ve "Şifremi unuttum" bağlantısı. Ayarlanana kadar mailler "Giden mailler" sayfasında **"Mail servisi ayarlı değil"** olarak görünür.

Günde 300 mail ücretsiz sınırı, form sayısı arttıkça (ör. 100 form × günde 5 randevu) aşılır; bu yüzden müşteri maili sadece isteyen işletmede açılmalı.

1. brevo.com'da ücretsiz hesap açın (günde 300 mail ücretsiz).
2. **Senders, Domains → Domains → batilmer.com** ekleyin. Brevo'nun verdiği **TXT (SPF/DKIM)** kayıtlarını GoDaddy DNS'e ekleyin ve doğrulayın.
3. **SMTP & API → API Keys** bölümünden bir anahtar oluşturun.
4. Sunucuda `nano /opt/batilmer-form-paneli/sunucu.env` ile `BREVO_API_KEY=` satırına anahtarı yazın, kaydedin (Ctrl+O, Enter, Ctrl+X) ve `bash deploy/kur.sh` çalıştırın.

> `info@batilmer.com` adresine mail **gelmesi** için ayrıca bir mail hizmeti (Google Workspace, Zoho, GoDaddy mail) ve MX kayıtları gerekir. DNS'te şu an MX kaydı yok.

## Faydalı komutlar

```bash
cd /opt/batilmer-form-paneli
docker compose --env-file sunucu.env ps            # durum
docker compose --env-file sunucu.env logs -f app   # panel kayıtları (çıkmak için Ctrl+C)
docker compose --env-file sunucu.env restart app   # paneli yeniden başlat
bash deploy/yedek.sh                               # elle yedek al
bash deploy/yedek-test.sh                          # yedekten geri dönme testi (canlıya dokunmaz)
bash deploy/kontrol.sh                             # sunucu güvenlik/sağlık kontrolü (sadece bilgi toplar)
bash deploy/geri-al.sh                             # önceki sürüme dön
```

## Yedekler

| Katman | Nerede | Ne kadar |
| --- | --- | --- |
| Çöp kutusu | Panel (Ana Admin geri alır) | Kalıcı silinene kadar |
| Gece yedeği (03:30) | Sunucuda `yedekler/` | Son 14 gün |
| Sunucu dışı kopya | Google Drive (şifreli, aşağıda) | Son 30 gün |
| Hostinger yedeği | Hostinger paneli | Haftalık |

### Yedek gerçekten çalışıyor mu? (ayda bir)

```bash
cd /opt/batilmer-form-paneli
bash deploy/yedek-test.sh
```

Son yedeği **geçici, internete kapalı ayrı bir MySQL kutusuna** açar, içindeki kullanıcı/form/kayıt/randevu sayılarını gösterir ve kutuyu siler. Canlı veritabanına dokunmaz.

### Sunucu dışı yedek (Google Drive, ücretsiz, şifreli)

Yedekler şu an aynı sunucuda; sunucuya bir şey olursa onlar da gider. Her gece bir kopyasını Google Drive'a **şifreleyerek** göndermek için (müşteri verisi olduğu için şifresiz göndermeyin):

1. Sunucuda rclone'u kurun: `apt-get install -y rclone`
2. `rclone config` → `n` (yeni) → ad: `gdrive` → tür: `drive` → client_id ve secret boş → scope: `1` (tam erişim) → "Use web browser to authenticate?" sorusuna `n` deyin. Ekranda yazan `rclone authorize "drive" ...` komutunu **kendi bilgisayarınızda** çalıştırın (rclone.org'dan Windows için indirin), tarayıcıda Google hesabınızla izin verin, çıkan kodu sunucuya yapıştırın.
3. Yine `rclone config` → `n` → ad: `gdrive-sifreli` → tür: `crypt` → remote: `gdrive:batilmer-yedek` → dosya adları şifrelensin: `1` → **iki şifre belirleyin ve bunları sunucu dışında (şifre yöneticisinde) saklayın**. Bu şifreler olmadan yedek açılamaz.
4. `nano /opt/batilmer-form-paneli/sunucu.env` → en alta `RCLONE_HEDEF=gdrive-sifreli:` yazın, kaydedin.
5. Deneyin: `bash deploy/yedek.sh` → "sunucu dışına kopyalandı" yazmalı. Kontrol: `rclone ls gdrive-sifreli:`

## Yedekten geri yükleme

```bash
cd /opt/batilmer-form-paneli
gunzip -c yedekler/veritabani-TARIH.sql.gz | docker exec -i batilmer-form-db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" batilmer_form'
```

## Kesinti alarmı (UptimeRobot, ücretsiz)

Site çökerse bunu veterinerden değil sizin öğrenmeniz için: uptimerobot.com'da kişisel mailinizle hesap açın → **New monitor** → HTTP(s) → URL `https://form.batilmer.com/api/health`, aralık 5 dakika. Aynısını `https://batilmer.com` için de ekleyin, telefonunuza UptimeRobot uygulamasını kurun. `/api/health` panel ve veritabanı çalışıyorsa cevap verir.

## Sunucu güvenliği

Önce sadece bilgi toplayan kontrolü çalıştırın: `bash deploy/kontrol.sh`. Çıktıya göre (arkadaşınızın projeleri de bu sunucuda olduğu için her adımı ona danışarak):

- Bütün kutuların yeniden başlatma ayarı `unless-stopped` / `always` ise bekleyen güncellemeleri yükleyip sakin bir saatte yeniden başlatın: `apt-get update && apt-get upgrade -y`, sonra `reboot`.
- Otomatik güvenlik güncellemeleri: `apt-get install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`
- SSH anahtarıyla girişin çalıştığından emin olduktan sonra root'un şifreyle girişini kapatın (`PasswordAuthentication no`).
- Güvenlik duvarında (Hostinger paneli) sadece 22, 80, 443 açık kalsın. Doğrudan açık başka portlar (ör. 81, 8090) varsa arkadaşınıza sorup kapatın; Caddy üzerinden çalışmaya devam ederler.

## Bir şey ters giderse

- Güncellemeden sonra bozulduysa: `bash deploy/geri-al.sh`
- Panel açılmıyor: `docker compose --env-file sunucu.env logs --tail=100 app`
- SSL hatası: DNS kaydını kontrol edin; `docker logs --tail=50 site-caddy-1`
- Caddy ayarını geri almak: Caddyfile'ın yanında `Caddyfile.yedek-TARIH` dosyası var; içeriğini geri kopyalayıp `docker exec -w /etc/caddy site-caddy-1 caddy reload --config /etc/caddy/Caddyfile` çalıştırın.
- **"Traefik'i Dağıt" butonuna basmayın**: Caddy ile çakışır, ana site kapanır.

## Otomatik güncelleme (GitHub → sunucu)

Bir kez açılır. Dala her gönderimde GitHub derler ve testleri çalıştırır; sunucuya kurulum sadece
Actions → "Sunucuya gönder" → Run workflow ile elle başlatılınca olur (yedek alır, panel ayağa kalkmazsa
önceki sürüme döner). Elle zip/scp gerekmez.

1. Sunucuda, proje klasöründe: `bash deploy/otomatik-kur.sh`
2. Ekrana yazılan 3 değeri GitHub'da depo → Settings → Secrets and variables → Actions →
   New repository secret ile aynı isimlerle ekleyin: `SUNUCU_ADRES`, `SUNUCU_PARMAK_IZI`, `SUNUCU_ANAHTAR`.
3. GitHub → Actions → "Sunucuya gönder" → Run workflow ile ilk kurulumu deneyin.

GitHub'ın anahtarı sunucuda yalnızca güncellemeyi çalıştırabilir; kabuk açamaz.
Kayıtlar: `/var/log/batilmer-guncelle.log`. Kapatmak için: `bash deploy/otomatik-kur.sh kapat`
