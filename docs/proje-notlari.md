# Batilmer — Proje Notları (YBY)

Yeni sohbette önce bu dosyayı oku. Her oturum sonunda yeni bilgileri buraya ekle; eski/geçersiz maddeleri sil. Kısa tut.

## Çalışma kuralları
- Kullanıcı "kanka" diye hitap eder, Türkçe konuşulur. Ben **YBY**'yim (yapay zekâ ekibinin patronu), kullanıcı üstüm.
- Önce görsel/önizleme göster, kullanıcı "okey/at" demeden **yayına alma**. Yayın: GitHub workflow `sunucuya-gonder.yml` (workflow_dispatch, ref = çalışma dalı).
- Ekip: web tasarımcı, sosyal medyacı, form paneli geliştiricisi, veritabanı uzmanı, grafiker, pazarlama ve satış sorumlusu. İş ilgili kişiye verilir, çıktıyı ben incelerim, mantıklıysa kullanıcıya getiririm. **Token tasarrufu:** basit işlerde ekibe sormadan kendim karar veririm.
- Pazarlamada gerçek işletme adı yok (Vital Veteriner gerçek müşteri adayı, kullanma). Demo: Patiland Veteriner Kliniği, Makas Erkek Kuaförü, Lavinya Güzellik Salonu.
- Metinlerde sektör sayma; "küçük işletme / KOBİ / esnaf" yok. Hitap: "randevuyla çalışan her işletme". Hatırlatma "otomatik" değil "tek dokunuşla". Fiyat/sonuç vaadi yok.
- Şifre, anahtar asla sohbete yazdırılmaz; anahtarlar ortamın Network secrets bölümüne güvenli formla eklenir.
- Kısa yaz, takılan işte 2 denemeden sonra alternatife geç.

## Ürün (canlı: form.batilmer.com)
React 19 + Vite (`src/`), Node 22 sunucu (`server/src`), MySQL (test: node:sqlite). RPC: `POST /api/rpc/<ad>` + `X-Batilmer: 1`. Şema v9 (`server/src/schema.js`). Test: `npm test` (144 test geçiyor).
Yayındaki özellikler: çok adımlı form, randevu + müsaitlik, bildirim (canlı + Web Push), 2FA, tek dokunuşla WhatsApp hatırlatma, müşteri kartı, Google yorum, sohbet asistanı (`public/asistan.js`, site içinde açılır), tekrar çağırma, bekleme listesi, ay sonu raporu (`/panel/rapor`), KVKK metni, çöp kutusu 30 gün, IP/UA 90 gün sonra silinir, gece yedek (`deploy/yedek.sh`).

## Kullanıcının yapacakları (teslimden önce)
- Sunucuda `sudo bash deploy/yedek-kur.sh` (Google Drive şifreli yedek + healthchecks.io).
- UptimeRobot ile site izleme.
- Teslim günü test kayıtlarını temizleme.
- Fiyat kararı (öneri: 690 / 1.190 / 1.790 ₺ aylık, kurucu teklifi).

## Instagram (batilmer.tech)
- Plan, bio, açıklamalar, hashtag'ler: `pazarlama/instagram-plan.md`. Bio 1 ve isim "Batilmer | Online Randevu & Web Sitesi" kullanılıyor.
- ~4.700 takipçi şüpheli; Insights'tan şehir/ülke kontrolü, yavaş temizlik. Hesap satın alma önerilmedi.
- Kural: bir görsel, bir reels sırayla; aynı gün iki paylaşım yok.

| Tarih | Tür | İçerik | Durum |
|---|---|---|---|
| 18 Kas | Görsel | 02-online-randevu | paylaşıldı |
| 19 Kas | Reels | reels-2 modern+müzik (27 sn) | hazır |
| 21 Kas | Görsel | 03-whatsapp-hatirlatma | hazır |
| 24 Kas | Reels | reels-1 modern+müzik (14 sn) | hazır (seslendirme eklenecek) |
| 26 Kas | Görsel | 12-sorun-telefon | hazır |
| 28 Kas | Reels | Müşteri kartı (10 sn) | yapılacak |
| 1 Ara | Görsel | 08-musteri-karti | hazır |
| 3 Ara | Görsel | 07-google-yorum | hazır |
| 5 Ara | Reels | Bekleme listesi (12 sn) | yapılacak |
| 8 Ara | Görsel | 10-kvkk | hazır |
| 10 Ara | Reels | Tek dokunuşla hatırlatma (8 sn) | yapılacak |
| 12 Ara | Görsel | 11-hepsi-tek-panelde | hazır |

Sabitlenecek: 11-hepsi-tek-panelde, reels-2, mevcut "Fikirden canlıya". Eski, Vital içeren ilk post arşivlenmeli.

## Sosyal medya yönetimi hizmeti (Kas 2026 kararı)
- Sunum: https://claude.ai/artifact/TXBcpR9uZTwyjybY3uMM1q (genel, firmaya özel değil; logo girişte). İlk aday: Ern Car Care (görüşme aşaması).
- Paketler (aylık, KDV hariç): Gümüş 4 gönderi + 2 reels 4.999 ₺ · Altın 6 + 3 6.999 ₺ (önerilen) · Platin 8 + 4 8.999 ₺.
- Çekimi işletme yapar (WhatsApp grubu), biz kurgu/müzik/açıklama/hashtag hazırlayıp **teslim ederiz; paylaşımı işletme yapar**. Yerinde çekim, reklam yönetimi, rapor, DM yanıtlama **yok**. Hesap erişimi gerekmez.
- Ek: online randevu formu +990 ₺/ay (panel tek başına 690/1.190/1.790 önerisinden ucuz kalsın; pazarlık payı yok, gerekirse ilk ay hediye).
- Şartlar: asgari süre yok, aylık peşin, yıllık peşin ödemede %10 indirim (Gümüş 53.990, Altın 75.590, Platin 97.190, form 10.690 ₺/yıl), ilk ay profil paketi hediye (bio metni, öne çıkan kapakları).
- Randevu formu kurulumu: panelde işletmeye özel form (`/f/<slug>`) + sadece o forma yetkili kullanıcı, 2FA, bildirim, bio linki/QR. İlk müşteriden önce: işletmeler arası ayrım testi, KVKK metni + hizmet sözleşmesi.
- Kapanış slaytında [telefon] boş; kullanıcı numarayı verecek. Reels videoları kullanıcıda.

## Reels yapımı (`pazarlama/araclar/`)
1. Yerel demo sunucusu (sqlite, kurgusal veriler) + `reels-*-kareler.mjs` → Playwright ile iPhone 14 ekran kareleri + `seq.json` (dokunma koordinatları). Giriş bilgisi `DEMO_EPOSTA` / `DEMO_SIFRE` ortam değişkeninden. Bot kuralı: sayfa açılışından 2 sn önce gönderilen form sahte başarı döner, bekle.
2. `reels-video.py`: kanca açılış, hareketli arka plan, kelime kelime yazı, süzülen telefon, punch-zoom, büyüteç kartı, whip-pan, ilerleme çubuğu, animasyonlu bitiş. 1080x1920, 30 fps. Sahneler/yazılar dosya başındaki `REELS` sözlüğünde.
3. `reels-muzik.py`: kendi ürettiğimiz telifsiz müzik (120 BPM, Am-F-C-G) + videodaki olaylara senkron efektler (whoosh, pop, zil, bildirim). -13 LUFS. ffmpeg ile birleştir.
Dosya yolları scratchpad'e göre yazılı; yeni oturumda yolları güncelle.

## Seslendirme (açık iş)
- ElevenLabs anahtarı ortamda kayıtlı (api.elevenlabs.io, `xi-api-key`). Anahtar tanınıyor ama ses/veri dönen istekler bu ortamda zaman aşımına düşüyor; hata cevapları hemen geliyor. Sebep bilinmiyor.
- Geçici yol: kullanıcı ElevenLabs sitesinde (Multilingual v2, yumuşak Türkçe ses, Stability ~%50) MP3 üretip gönderecek; ben sahnelere oturtup müziği konuşmada kısacağım.
- Metinler:
  - reels-2: "Randevular hâlâ mesajla mı geliyor? Artık müşteriniz formu kendisi dolduruyor; boş gün ve saati kendisi seçiyor. Randevu anında kaydediliyor, telefonunuza bildirim düşüyor. Tüm detaylar tek ekranda. Hizmetleri, izinleri, kapalı saatleri siz belirliyorsunuz. Randevudan önce de tek dokunuşla hatırlatıyorsunuz. Batilmer. Demo için bize yazın."
  - reels-1: "Yarınki randevu unutulmasın. Bugün ne var, tek bakışta görün. Yarının randevularını tek dokunuşla hatırlatın, zamanı gelen müşteriyi geri çağırın. Ay sonunda da işletmenizin karnesi hazır. Batilmer. Demo için bize yazın."

## Sonraki işler
- 3 yeni reels (yukarıdaki tablo), seslendirme.
- Sprint 1 kalanı: WhatsApp link önizleme görseli (og:image), QR vitrin kartı, logo/favicon birliği, theme-color.
- Tanıtım sayfası (landing), mini site. Önerilen yeni roller: test sorumlusu, müşteri başarısı.
- Reklam: 2–3 hafta organik hazırlık, sonra Meta "WhatsApp'a tıkla" testi 150–250 ₺/gün, 14 gün.
