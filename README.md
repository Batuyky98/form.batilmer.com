# Batilmer Form Paneli

Her sektöre (veteriner, klinik, kuaför, kafe/restoran, spor, danışmanlık, oto servis, kurs, etkinlik…) bilgi toplama ve randevu/rezervasyon formu sunan panel. Canlı adres: `https://form.batilmer.com`

Veterinere (ya da işletmenin çalışanına) verilecek kısa kullanım rehberi: **[KULLANIM.md](KULLANIM.md)**

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

Tarayıcıda `http://localhost:5180` adresini açın. Sunucu modunda ilk giriş: `info@batilmer.com` / `Gecici.Sifre1` (ilk girişte şifre değiştirilir, ardından Authenticator kurulur). Yerel veriler `server/data/` klasöründe durur; silerseniz sıfırdan başlar.

> Bildirimler, Authenticator ve oturum süresi sadece **sunucu modunda** çalışır; demo modunda bu ekranlar "demo modunda kullanılamaz" der.

## Neler çalışıyor

| Bölüm | Adres |
| --- | --- |
| Giriş, Authenticator kodu / yedek kod, şifremi unuttum, ilk girişte şifre değiştirme | `/giris` |
| İki adımlı doğrulama (Authenticator) kurulumu, yedek kodlar | `/panel/guvenlik` |
| Bildirim ayarlarım: aç/kapat, bu cihaz, cihaz listesi, deneme bildirimi, ses | `/panel/bildirimler` |
| Formlar listesi, yeni form (şablondan), kopyalama, silme | `/panel` |
| Form oluşturucu: alanlar, görünüm, ayarlar, randevu, paylaş/iframe kodu, geçmiş | `/panel/formlar/:id/duzenle` |
| Kayıtlar: arama (notlar dahil), durum ve tarih filtresi, detay, durum takibi + notlar, dosya indirme, Excel (.xlsx) | `/panel/formlar/:id/kayitlar` |
| İstatistik: günlere göre kayıt, kayıt/randevu durumları, hizmet dağılımı, gelmeme oranı | `/panel/formlar/:id/istatistik` |
| Randevu takvimi: gün/hafta, onay, geldi/gelmedi, taşıma, iptal, manuel randevu, saat bloklama | `/panel/formlar/:id/randevular` |
| Tüm randevular tek takvimde (yetkili olunan bütün formlar) | `/panel/takvim` |
| Kullanıcılar, form bazında 5 yetki + "Bildirim" tiki, ek Ana Admin, 2FA sıfırlama | `/panel/kullanicilar` |
| Giden mailler ve SMS, gönderim durumu | `/panel/giden-mailler` |
| İşlem kayıtları (log) | `/panel/islem-kayitlari` |
| Çöp kutusu (geri alma / kalıcı silme) | `/panel/cop-kutusu` |
| Herkese açık form | `/f/:form-linki` |
| Müşterinin randevu iptal sayfası (formdan sonra verilen bağlantı) | `/iptal/:token` |
| Müşterinin "Takvimime ekle" dosyası (.ics, 1 gün ve 2 saat önce hatırlatmalı) | `/api/ics/:token` |
| Müşteri sitesi taklidi (iframe testi) | `/test-sitesi?f=:form-linki` |

## Form özellikleri

- **Alan tipleri:** kısa/uzun metin, e-posta, telefon (TR ve +yabancı), TC Kimlik No (algoritma kontrolü), açılır liste, tekli/çoklu seçim, tarih, sayı, **dosya yükleme** (tür ve boyut sınırı), randevu
- **Koşullu alanlar:** "Hayvan türü = Diğer ise 'Hangi hayvan?' sor" gibi. Gizli kalan alan zorunlu olsa da sorulmaz ve kaydedilmez. Koşullar zincirlenebilir.
- **Form dili:** Türkçe / English. Hata mesajları, gün/ay adları, randevu mailleri ve SMS'ler seçilen dilde.
- **Sektör şablonları:** genel, veteriner, klinik, kuaför/berber, güzellik, kafe, restoran, spor/özel ders, danışmanlık/terapi, oto servis, kurs ön kaydı, etkinlik kaydı, teklif/keşif talebi, iş başvurusu. Randevu alanının adı form bazında seçilir (Randevu / Rezervasyon / Seans / Ders / Görüşme…).
- **Randevu kuralları:** en az kaç saat önceden, en fazla kaç gün ileri, **"şu tarihten itibaren açılsın"**, iptal süresi, kişi başı sınır, kapasite (randevu ya da kişi sayısı), personel/kaynak, kapalı günler.
- **Müşteri tarafı (mailsiz):** form gönderilince randevu bilgi kartı, iptal bağlantısı (kopyala), **"Takvimime ekle"** (.ics) ve Google Takvim. Hatırlatmayı müşterinin kendi telefonu yapar.
- **Bildirimler (yetkili kişilere, ücretsiz):** panelde canlı (ses + açılır kart + zil) ve telefon/bilgisayar bildirimi (Web Push, Android ve iPhone). Sadece "Bildirim" tiki olan yetkililere gider; içerikte kişisel veri yok.
- **Müşteriye mail / SMS (ücretli ek özellik, form bazında, sadece Ana Admin açar):** randevu onayı, değişiklik, iptal, hatırlatma, otomatik cevap. Varsayılan kapalı.
- **Görünüm:** şeffaf/beyaz/özel arka plan, renkler, font, köşe, etiket yerleşimi, genişlik, koyu tema, buton metni
- **Güvenlik:** gizli bot tuzağı, 2 saniyeden hızlı gönderim engeli, gönderim sınırı, isteğe bağlı Cloudflare Turnstile (`sunucu.env` içinde `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET`)
- **Saat dilimi:** tüm tarih ve saatler Türkiye saatine (UTC+3) sabit. Ziyaretçinin bilgisayarı başka saat diliminde olsa da randevu saatleri kaymaz.

## Mimari

- **Ön yüz:** React (Vite). Ekranlar veriye sadece `src/lib/api.js` üzerinden ulaşır.
- **Sunucu:** `server/` – bağımlılığı tek paket (mysql2) olan Node.js sunucusu. Panel ve formlar `POST /api/rpc/<işlem>` ile konuşur.
- **Veritabanı:** MySQL 8.4 (canlı) / SQLite (yerel). Şema `server/src/schema.js`, açılışta otomatik kurulur ve güncellenir.
- **Ortak kurallar:** doğrulama, uygun saat hesabı, koşullu alanlar ve çeviriler (`src/lib/`) tarayıcı ve sunucuda **aynı kodla** çalışır.

### Güvenlik
- Şifreler **scrypt** ile hash'lenir; oturum **httpOnly + Secure + SameSite** çerezde
- Oturum 2 saat işlem yapılmazsa ve en geç 12 saatte kapanır (5 dk önce uyarı); arka plan kontrolleri süreyi uzatmaz
- Ana Admin'de **Authenticator (TOTP) zorunlu**, diğer kullanıcılarda isteğe bağlı; tek kullanımlık yedek kodlar, aynı kodun tekrar kullanımı engellenir
- Telefon bildirimleri uçtan uca şifreli (RFC 8291) ve sunucu imzalı (VAPID); bildirimde ad/telefon/TC yok
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
server/src/notifier.js   Telefon bildirimi kuyruğu (alıcılar gönderim anında yetkiden hesaplanır)
server/src/webpush.js    Web Push şifreleme + VAPID (dış paket yok)
server/src/totp.js       Authenticator kodları ve yedek kodlar
server/src/scheduler.js  Hatırlatma, saklama süresi, temizlik
src/lib/push.js          Tarayıcıda bildirim izni / abonelik
src/lib/calendar.js      "Takvimime ekle" (.ics) ve Google Takvim bağlantısı
src/components/Live.jsx  Canlı bildirim, zil, oturum uyarısı, izin penceresi
public/sw.js             Bildirimi gösteren servis çalışanı (önbellek yok)
public/manifest.webmanifest  "Ana Ekrana Ekle" (iPhone bildirimleri için)
Dockerfile, docker-compose.yml, deploy/   Canlı + test kurulumu, geri alma, yedek, yedek testi, sunucu kontrolü
```
