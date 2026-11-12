# Batilmer Form Paneli

Her sektöre (veteriner, kafe, güzellik merkezi…) bilgi toplama ve randevu formu sunan panel. Canlı adres: `https://form.batilmer.com`

## Canlıya kurulum

Sunucuya kurulum adım adım **[KURULUM.md](KURULUM.md)** dosyasında.

## Bilgisayarda çalıştırma

İki seçenek var (`.env` içindeki `VITE_API_MODE` ile seçilir):

**1) Demo modu (`VITE_API_MODE=local`)** – sunucu gerekmez, veriler tarayıcıda durur:

```bash
npm install
npm run dev
```

**2) Sunucu modu (`VITE_API_MODE=server`)** – canlıdakinin aynısı; MySQL yerine yerel SQLite kullanır (Node.js 22.5+):

```bash
npm install
npm run sunucu      # 1. terminal: sunucu (http://localhost:3000)
npm run dev         # 2. terminal: panel
```

Tarayıcıda `http://localhost:5180` adresini açın. Sunucu modunda ilk giriş: `info@batilmer.com` / `Gecici.Sifre1` (ilk girişte değiştirilir). Yerel veriler `server/data/` klasöründe durur; silerseniz sıfırdan başlar.

## Neler çalışıyor

| Bölüm | Adres |
| --- | --- |
| Giriş, şifremi unuttum, ilk girişte şifre değiştirme | `/giris` |
| Formlar listesi, yeni form (şablondan), kopyalama, silme | `/panel` |
| Form oluşturucu: alanlar, görünüm, ayarlar, randevu, paylaş/iframe kodu, geçmiş | `/panel/formlar/:id/duzenle` |
| Kayıtlar: arama (notlar dahil), durum ve tarih filtresi, detay, durum takibi + notlar, dosya indirme, Excel (.xlsx) | `/panel/formlar/:id/kayitlar` |
| İstatistik: günlere göre kayıt, kayıt/randevu durumları, hizmet dağılımı, gelmeme oranı | `/panel/formlar/:id/istatistik` |
| Randevu takvimi: gün/hafta, onay, geldi/gelmedi, taşıma, iptal, manuel randevu, saat bloklama | `/panel/formlar/:id/randevular` |
| Tüm randevular tek takvimde (yetkili olunan bütün formlar) | `/panel/takvim` |
| Kullanıcılar ve form bazında 5 yetki tiki | `/panel/kullanicilar` |
| Giden mailler ve SMS, gönderim durumu | `/panel/giden-mailler` |
| İşlem kayıtları (log) | `/panel/islem-kayitlari` |
| Çöp kutusu (geri alma / kalıcı silme) | `/panel/cop-kutusu` |
| Herkese açık form | `/f/:form-linki` |
| Müşterinin randevu iptal sayfası (maildeki link) | `/iptal/:token` |
| Müşteri sitesi taklidi (iframe testi) | `/test-sitesi?f=:form-linki` |

## Form özellikleri

- **Alan tipleri:** kısa/uzun metin, e-posta, telefon (TR ve +yabancı), TC Kimlik No (algoritma kontrolü), açılır liste, tekli/çoklu seçim, tarih, sayı, **dosya yükleme** (tür ve boyut sınırı), randevu
- **Koşullu alanlar:** "Hayvan türü = Diğer ise 'Hangi hayvan?' sor" gibi. Gizli kalan alan zorunlu olsa da sorulmaz ve kaydedilmez. Koşullar zincirlenebilir.
- **Form dili:** Türkçe / English. Hata mesajları, gün/ay adları, randevu mailleri ve SMS'ler seçilen dilde.
- **Otomatik cevap maili:** dolduran kişiye; cevaplar `{alan_anahtari}` ile metne eklenebilir.
- **SMS:** randevu onayı/değişikliği/iptali ve hatırlatma. SMS sağlayıcısı seçilince bağlanacak; o zamana kadar Giden mailler sayfasında görünür.
- **Görünüm:** şeffaf/beyaz/özel arka plan, renkler, font, köşe, etiket yerleşimi, genişlik, koyu tema, buton metni
- **Güvenlik:** gizli bot tuzağı, 2 saniyeden hızlı gönderim engeli, gönderim sınırı, isteğe bağlı Cloudflare Turnstile (`sunucu.env` içinde `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET`)
- **Saat dilimi:** tüm tarih ve saatler Türkiye saatine (UTC+3) sabit. Ziyaretçinin bilgisayarı başka saat diliminde olsa da randevu saatleri kaymaz.

## Mimari

- **Ön yüz:** React (Vite). Ekranlar veriye sadece `src/lib/api.js` üzerinden ulaşır.
- **Sunucu:** `server/` – bağımlılığı tek paket (mysql2) olan Node.js sunucusu. Panel ve formlar `POST /api/rpc/<işlem>` ile konuşur.
- **Veritabanı:** MySQL 8.4 (canlı) / SQLite (yerel). Şema `server/src/schema.js`, açılışta otomatik kurulur ve güncellenir.
- **Ortak kurallar:** doğrulama, uygun saat hesabı, koşullu alanlar ve çeviriler (`src/lib/`) tarayıcı ve sunucuda **aynı kodla** çalışır.

### Güvenlik
- Şifreler **scrypt** ile hash'lenir; oturum **httpOnly + Secure + SameSite** çerezde, 7 gün
- Her işlem yetkiyi sunucuda kontrol eder; ilk girişte şifre değişmeden başka işlem yapılamaz
- Giriş, şifre sıfırlama ve form gönderiminde hız sınırı; bot tuzağı; isteğe bağlı Cloudflare Turnstile
- CSRF koruması (özel başlık zorunlu), panel başka sitelere iframe ile gömülemez, formlar gömülebilir
- Dosyalar diskte, türü içeriğinden doğrulanır, sadece yetkili kullanıcı indirebilir
- Randevu kaydı form satırı kilitlenerek yapılır: aynı saate iki kişi aynı anda randevu alamaz
- Mail/SMS kuyruğu: servis geçici olarak çalışmasa da kaybolmaz, tekrar denenir

## Klasör yapısı

```
src/lib/api.js           Ekranların veri girişi (sunucu / demo modu seçimi)
src/lib/api.remote.js    Sunucuya giden istemci
src/lib/api.local.js     Sunucusuz demo (localStorage)
src/lib/shared.js        Tarayıcı + sunucu ortak yardımcılar
src/lib/availability.js  Uygun randevu saati hesabı
src/lib/validators.js    TC, e-posta, telefon, dosya ve alan doğrulamaları
src/lib/conditions.js    Koşullu alan mantığı
src/lib/i18n.js          Formun Türkçe / İngilizce sistem metinleri
src/lib/templates.js     Alan tipleri, varsayılan ayarlar, sektör şablonları
src/lib/xlsx.js          Excel dosyası üretimi
src/components/          Ortak bileşenler, form çizici (FormRenderer)
src/pages/               Ekranlar
public/embed.js          Müşteri sitesine eklenen otomatik yükseklik script'i
server/src/handlers.js   Tüm sunucu işlemleri (yetki kontrolleriyle)
server/src/schema.js     Veritabanı tabloları
server/src/mailer.js     Mail / SMS kuyruğu (Brevo)
server/src/scheduler.js  Hatırlatma, saklama süresi, temizlik
Dockerfile, docker-compose.yml, deploy/   Canlı kurulum
```
