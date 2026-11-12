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

## Mail gönderimi (Brevo)

Panel mailleri (randevu onayı, hatırlatma, şifre sıfırlama, bildirimler) Brevo üzerinden gönderir. Ayarlanana kadar mailler "Giden mailler" sayfasında **"Mail servisi ayarlı değil"** olarak görünür; hiçbir şey kaybolmaz.

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
```

## Yedekten geri yükleme

```bash
cd /opt/batilmer-form-paneli
gunzip -c yedekler/veritabani-TARIH.sql.gz | docker exec -i batilmer-form-db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" batilmer_form'
```

## Bir şey ters giderse

- Panel açılmıyor: `docker compose --env-file sunucu.env logs --tail=100 app`
- SSL hatası: DNS kaydını kontrol edin; `docker logs --tail=50 site-caddy-1`
- Caddy ayarını geri almak: Caddyfile'ın yanında `Caddyfile.yedek-TARIH` dosyası var; içeriğini geri kopyalayıp `docker exec -w /etc/caddy site-caddy-1 caddy reload --config /etc/caddy/Caddyfile` çalıştırın.
- **"Traefik'i Dağıt" butonuna basmayın**: Caddy ile çakışır, ana site kapanır.
