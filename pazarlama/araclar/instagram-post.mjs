import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const DIR = new URL('.', import.meta.url).pathname;
const img = (n) => 'data:image/png;base64,' + fs.readFileSync(`${DIR}shots/${n}.png`).toString('base64');
const LOGO = `<svg width="56" height="56" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0F172A"/><circle cx="15" cy="13" r="2.6" fill="#2F5BEA"/><circle cx="23" cy="13" r="2.6" fill="#2F5BEA"/><circle cx="31" cy="13" r="2.6" fill="#2F5BEA"/><path d="M21 22 V51" stroke="#fff" stroke-width="6.5" stroke-linecap="round" fill="none"/><circle cx="34" cy="40" r="11" stroke="#fff" stroke-width="6.5" fill="none"/><path d="M47 49 L53 49" stroke="#2F5BEA" stroke-width="5" stroke-linecap="round"/></svg>`;

const posts = [
  { n: '01-tanitim', accent: '#2F5BEA', tag: 'RANDEVUYLA ÇALIŞAN HER İŞLETME', h: 'Randevu defteriniz artık <em>cebinizde.</em>', s: 'Randevuyla çalışan her işletme için: online randevu, hatırlatma ve müşteri takibi tek panelde.', b: ['Online randevu formu', 'WhatsApp ile tek dokunuş hatırlatma', 'Google yorum ve ay sonu raporu'], shot: 'bugun', dark: true },
  { n: '12-sorun-telefon', accent: '#DC2626', tag: 'TANIDIK GELDİ Mİ?', h: 'Telefon çalıyor, <em>elinizde iş var.</em>', s: 'Açamadığınız her arama, kaçan bir randevu olabilir. Müşteriniz randevusunu linkten kendisi alsın.', b: ['Müşteri boş saati kendisi seçer', 'Randevu anında panelinize düşer', 'Siz işinize odaklanırsınız'], shot: 'form' },
  { n: '02-online-randevu', accent: '#2F5BEA', tag: 'ONLINE RANDEVU', h: 'Müşteriniz <em>gece 2’de bile</em> randevu alsın.', s: 'Telefonla saat ayarlamak yok. Müşteri boş saati görür, seçer, randevusu düşer.', b: ['Dolu saat seçilemez, çakışma olmaz', 'Sitenize, Instagram’a, WhatsApp’a tek link', 'Fiyatlı hizmet listesi, 11 farklı tasarım'], shot: 'form' },
  { n: '03-whatsapp-hatirlatma', accent: '#16A34A', tag: 'WHATSAPP HATIRLATMA', h: 'Gelmeyen müşteri = <em>boş kalan saat.</em>', s: 'Yarının randevuları hazır listede. Tek dokunuşla WhatsApp açılır, mesaj yazılı gelir.', b: ['SMS ücreti yok, kendi WhatsApp’ınızdan', 'Mesajda iptal linki: gelemeyen haber verir', 'Kime hatırlatıldığı herkeste görünür'], shot: 'hatirlat' },
  { n: '04-sohbet-asistani', accent: '#0E7490', tag: 'SOHBET ASİSTANI', h: 'Sitenizde <em>7/24 çalışan</em> bir asistan.', s: '“Fiyat ne kadar?”, “Yarın boş saat var mı?” sorularını sizin yerinize cevaplar.', b: ['Fiyat, çalışma saati, adres, sık sorulanlar', 'Boş saati gösterir, randevuya götürür', 'Sitenize tek satır kodla eklenir'], shot: 'asistan-saat' },
  { n: '05-tekrar-cagirma', accent: '#7C3AED', tag: 'TEKRAR ÇAĞIRMA', h: 'Müşteriniz unutur, <em>panel unutmaz.</em>', s: 'Aşı, bakım, saç kesimi… Zamanı gelen müşteri listeye kendiliğinden düşer.', b: ['Hizmet başına süre: 2 hafta, 1 ay, 1 yıl…', 'Tek dokunuşla WhatsApp, form hazır açılır', 'Kimin çağrılıp geri geldiğini görün'], shot: 'cagir' },
  { n: '06-bekleme-listesi', accent: '#F59E0B', tag: 'BEKLEME LİSTESİ', h: 'İptal olan randevu artık <em>boş kalmıyor.</em>', s: 'Dolu güne randevu isteyen müşteri “Yer açılırsa haber ver” der. İptal olunca size bildirim gelir.', b: ['Bekleyenler sırayla listede', 'Tek dokunuşla “Yer açıldı” mesajı', 'Link o saat seçili açılır, ilk dokunan alır'], shot: 'bekleyen' },
  { n: '07-google-yorum', accent: '#EAB308', tag: 'GOOGLE YORUM', h: 'Memnun müşteri <em>Google’da</em> konuşsun.', s: 'Gelen müşteriye tek dokunuşla yorum isteği. Link doğrudan Google yorum ekranını açar.', b: ['Ziyaretten sonra hazır liste', 'Tek adım: müşteri yormaz', 'Kaç kişinin Google’a gittiğini görün'], shot: 'yorum' },
  { n: '08-musteri-karti', accent: '#DB2777', tag: 'MÜŞTERİ KARTI', h: 'Her müşterinin geçmişi <em>tek ekranda.</em>', s: 'Kaç kez geldi, hangi hizmeti aldı, notlarınız… Telefon numarasıyla otomatik eşleşir.', b: ['Geldi / gelmedi / iptal sayıları', 'Notlar: “Kuduz aşısı Mart’ta”', 'Ara ve WhatsApp tek dokunuş'], shot: 'musteri-karti' },
  { n: '09-ay-sonu-raporu', accent: '#2F5BEA', tag: 'AY SONU RAPORU', h: 'Ay sonunda işletmenizin <em>karnesi.</em>', s: 'Kaç randevu aldınız, kaç kişi gelmedi, en yoğun gününüz hangisi? Tek sayfada.', b: ['Randevu, yeni müşteri, tahmini ciro', 'En yoğun gün ve saat, öneriler', 'WhatsApp’tan tek dokunuşla paylaşın'], shot: 'rapor' },
  { n: '10-kvkk', accent: '#0F766E', tag: 'KVKK VE GÜVENLİK', h: 'KVKK metniniz <em>hazır.</em> Verileriniz güvende.', s: 'Formunuza göre aydınlatma metni otomatik hazırlanır. Müşteri onay vermeden form gönderilemez.', b: ['Forma göre otomatik aydınlatma metni', 'Kalıcı silmede hiçbir iz kalmaz', 'İki adımlı giriş, kişi bazlı yetki'], shot: 'kvkk' }
];

const css = (p) => `
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;overflow:hidden;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;
 background:${p.dark ? '#0B1222' : '#F3F6FC'};color:${p.dark ? '#fff' : '#0F172A'};position:relative}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;right:-320px;bottom:-260px;background:radial-gradient(circle, ${p.accent}${p.dark ? '55' : '33'} 0%, transparent 65%)}
.glow2{position:absolute;width:600px;height:600px;border-radius:50%;left:-260px;top:-240px;background:radial-gradient(circle, ${p.accent}${p.dark ? '30' : '1f'} 0%, transparent 65%)}
.top{position:absolute;left:72px;right:72px;top:64px;display:flex;align-items:center;gap:16px}
.brand{font-family:'Inter Display';font-weight:800;font-size:38px;letter-spacing:-.02em;color:${p.dark ? '#fff' : '#0F172A'}}
.tag{margin-left:auto;font-weight:800;font-size:20px;letter-spacing:.12em;color:${p.accent};background:${p.accent}${p.dark ? '26' : '18'};padding:12px 20px;border-radius:999px;filter:${p.dark ? 'brightness(1.4)' : 'none'}}
h1{position:absolute;left:72px;right:72px;top:178px;font-family:'Inter Display';font-weight:800;font-size:${p.h.length > 60 ? 76 : 84}px;line-height:1.04;letter-spacing:-.035em}
h1 em{font-style:normal;color:${p.accent};${p.dark ? 'filter:brightness(1.35);' : ''}}
.sub{position:absolute;left:72px;right:90px;top:${p.h.length > 60 ? 452 : 390}px;font-size:31px;line-height:1.38;color:${p.dark ? '#B8C2D9' : '#475569'};font-weight:500}
ul{position:absolute;left:72px;width:470px;top:${p.h.length > 60 ? 650 : 600}px;list-style:none;display:flex;flex-direction:column;gap:26px}
li{display:flex;gap:16px;font-size:29px;line-height:1.3;font-weight:600}
li i{flex:none;width:40px;height:40px;border-radius:50%;background:${p.accent};display:grid;place-items:center;margin-top:-1px}
li i svg{width:22px;height:22px}
.phone{position:absolute;right:66px;top:${p.h.length > 60 ? 610 : 560}px;width:430px;border-radius:62px;background:#0B0F1A;padding:14px;box-shadow:0 50px 90px -30px rgba(15,23,42,.55), 0 0 0 2px #1f2937}
.phone .scr{border-radius:50px;overflow:hidden;height:900px;background:#fff}
.phone img{width:100%;display:block}
.foot{position:absolute;left:72px;bottom:56px;font-size:24px;font-weight:700;color:${p.dark ? '#fff' : '#0F172A'};background:${p.dark ? 'rgba(255,255,255,.08)' : '#fff'};padding:16px 24px;border-radius:999px;box-shadow:${p.dark ? 'none' : '0 10px 30px -14px rgba(15,23,42,.35)'};display:flex;gap:12px;align-items:center}
.foot b{color:${p.accent};${p.dark ? 'filter:brightness(1.35);' : ''}}
`;
const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const html = (p) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>${css(p)}</style></head><body>
<div class="glow2"></div><div class="glow"></div>
<div class="top">${LOGO}<span class="brand">batilmer</span><span class="tag">${p.tag}</span></div>
<h1>${p.h}</h1>
<p class="sub">${p.s}</p>
<ul>${p.b.map((x) => `<li><i>${tick}</i><span>${x}</span></li>`).join('')}</ul>
<div class="phone"><div class="scr"><img src="${img(p.shot)}"></div></div>
<div class="foot">💬 Demo için <b>DM</b> atın</div>
</body></html>`;

// Kapanış: tüm özellikler tek panelde
const summary = () => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;overflow:hidden;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;background:#0B1222;color:#fff;position:relative}
.glow{position:absolute;width:1000px;height:1000px;border-radius:50%;left:50%;top:40%;transform:translate(-50%,-50%);background:radial-gradient(circle,#2F5BEA40 0%,transparent 62%)}
.top{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:16px}.brand{font-family:'Inter Display';font-weight:800;font-size:38px}
h1{position:absolute;left:72px;right:72px;top:176px;font-family:'Inter Display';font-weight:800;font-size:84px;line-height:1.04;letter-spacing:-.035em}h1 em{font-style:normal;color:#6B8BFF}
.grid{position:absolute;left:72px;right:72px;top:420px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.c{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:26px;padding:24px 26px;display:flex;gap:18px;align-items:center}
.c span{font-size:40px;flex:none}.c b{display:block;font-size:27px;font-weight:700}.c small{display:block;font-size:20px;color:#AEB9D0;margin-top:3px;font-weight:500}
.cta{position:absolute;left:72px;right:72px;bottom:64px;background:#2F5BEA;border-radius:30px;padding:30px 34px;display:flex;align-items:center;justify-content:space-between}
.cta b{font-size:34px;font-weight:800}.cta small{display:block;font-size:22px;color:#DCE4FF;margin-top:4px;font-weight:500}.cta i{font-style:normal;background:#fff;color:#0F172A;font-weight:800;font-size:26px;padding:16px 26px;border-radius:999px}
</style></head><body><div class="glow"></div>
<div class="top">${LOGO}<span class="brand">batilmer</span></div>
<h1>Hepsi <em>tek panelde.</em><br>Ek uygulama yok.</h1>
<div class="grid">${[['🗓','Online randevu','7/24, çakışmasız'],['📲','WhatsApp hatırlatma','Tek dokunuş, ücretsiz'],['💬','Sohbet asistanı','Sitenizde 7/24'],['🔁','Tekrar çağırma','Zamanı gelen müşteri'],['🔔','Bekleme listesi','İptal boş kalmaz'],['⭐','Google yorum','Tek adımda yorum'],['👤','Müşteri kartı','Geçmiş ve notlar'],['📊','Ay sonu raporu','İşletmenin karnesi'],['🔒','KVKK hazır','Otomatik metin'],['📱','Telefondan yönetim','Bildirimler cebinizde']].map(([a, b, c]) => `<div class="c"><span>${a}</span><div><b>${b}</b><small>${c}</small></div></div>`).join('')}</div>
<div class="cta"><div><b>Ücretsiz demo görün</b><small>Kendi işletmenizle 10 dakikada deneyin</small></div><i>DM “DEMO”</i></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
const only = process.argv[2];
for (const p of posts) {
  if (only && !p.n.startsWith(only)) continue;
  await page.setContent(html(p), { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}out/${p.n}.png` });
}
if (!only || only === '11') { await page.setContent(summary(), { waitUntil: 'load' }); await page.waitForTimeout(300); await page.screenshot({ path: `${DIR}out/11-hepsi-tek-panelde.png` }); }
await browser.close();
console.log('bitti');
