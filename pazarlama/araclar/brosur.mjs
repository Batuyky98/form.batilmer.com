import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const D = new URL('.', import.meta.url).pathname;
const I = (n) => `data:image/${n.endsWith('.png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(D + 'img/' + (n.includes('.') ? n : n + '.jpg')).toString('base64');
const LOGO = (s = 44) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0F172A"/><circle cx="15" cy="13" r="2.6" fill="#2F5BEA"/><circle cx="23" cy="13" r="2.6" fill="#2F5BEA"/><circle cx="31" cy="13" r="2.6" fill="#2F5BEA"/><path d="M21 22 V51" stroke="#fff" stroke-width="6.5" stroke-linecap="round" fill="none"/><circle cx="34" cy="40" r="11" stroke="#fff" stroke-width="6.5" fill="none"/><path d="M47 49 L53 49" stroke="#2F5BEA" stroke-width="5" stroke-linecap="round"/></svg>`;
const phone = (img, w = 230, crop = null) => `<div class="ph" style="width:${w}px"><div class="scr" style="${crop ? `height:${crop}px` : ''}"><img src="${I(img)}"></div></div>`;
const tick = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;color:#0F172A;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;padding:16mm 15mm}
.pg:last-child{page-break-after:auto}
h1,h2,h3{font-family:'Inter Display',Inter,sans-serif;letter-spacing:-.025em}
.brand{display:flex;align-items:center;gap:10px;font-family:'Inter Display';font-weight:800;font-size:22px}
.foot{position:absolute;left:15mm;right:15mm;bottom:10mm;display:flex;justify-content:space-between;font-size:10px;color:#64748B;border-top:1px solid #E2E8F0;padding-top:8px}
.ph{background:#0B0F1A;border-radius:34px;padding:8px;box-shadow:0 18px 40px -18px rgba(15,23,42,.5)}
.ph .scr{border-radius:27px;overflow:hidden;background:#fff}
.ph img{display:block;width:100%}
.pill{display:inline-flex;align-items:center;gap:8px;background:#EEF2FF;color:#2F5BEA;font-weight:700;font-size:12px;padding:7px 12px;border-radius:99px}
.lead{font-size:15px;line-height:1.55;color:#475569}
/* kapak */
.cover{background:#0B1222;color:#fff}
.cover .glow{position:absolute;width:700px;height:700px;border-radius:50%;right:-260px;top:260px;background:radial-gradient(circle,#2F5BEA66 0%,transparent 62%)}
.cover .glow2{position:absolute;width:500px;height:500px;border-radius:50%;left:-220px;top:-200px;background:radial-gradient(circle,#0E749055 0%,transparent 62%)}
.cover .brand{color:#fff;position:relative}
.cover h1{font-size:46px;line-height:1.04;margin-top:26mm;position:relative}
.cover h1 em{font-style:normal;color:#8EA6FF}
.cover .lead{color:#B8C2D9;font-size:16px;margin-top:14px;max-width:118mm;position:relative}
.badges{display:flex;gap:10px;margin-top:20px;position:relative;flex-wrap:wrap}
.badge{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 14px;font-weight:700;font-size:13px}
.badge i{width:24px;height:24px;border-radius:50%;background:#2F5BEA;display:grid;place-items:center;font-style:normal}
.cover .phones{position:absolute;left:15mm;right:15mm;bottom:22mm;display:flex;justify-content:center;gap:26px;align-items:flex-end}
.cover .lbl{text-align:center;font-size:11.5px;color:#B8C2D9;margin-top:9px;font-weight:600}
.cover .foot{color:#94A3B8;border-color:rgba(255,255,255,.12)}
/* adımlar */
.sec-t{font-size:32px;line-height:1.1;margin:16px 0 8px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}
.step{background:#F5F7FB;border-radius:20px;padding:14px 14px 0;overflow:hidden;display:flex;flex-direction:column}
.step .n{width:30px;height:30px;border-radius:50%;background:#2F5BEA;color:#fff;font-weight:800;display:grid;place-items:center;font-size:15px}
.step h3{font-size:16px;margin:10px 0 4px}
.step p{font-size:13px;line-height:1.5;color:#475569;min-height:60px}
.step .ph{margin:14px auto 0;border-radius:26px 26px 0 0;padding:6px 6px 0}
.step .ph .scr{border-radius:21px 21px 0 0}
.where{margin-top:18px;background:#0F172A;color:#fff;border-radius:20px;padding:16px 18px;display:flex;gap:14px;align-items:center}
.where b{font-size:15px}
.where .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
.where .chips span{background:rgba(255,255,255,.1);border-radius:99px;padding:6px 11px;font-size:12px;font-weight:600}
/* özellikler */
.feat{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
.f{display:flex;gap:12px;background:#F5F7FB;border-radius:18px;padding:12px;align-items:flex-start;overflow:hidden;height:68mm}
.f .tx{flex:1;min-width:0}
.f .ic{font-size:20px}
.f h3{font-size:16.5px;margin:6px 0 6px}
.f p{font-size:12.8px;line-height:1.5;color:#475569}
.f .mini{flex:none;width:132px;border-radius:16px;background:#0B0F1A;padding:5px;align-self:stretch;overflow:hidden}
.f .mini img{display:block;width:100%;border-radius:12px}
/* son sayfa */
.tl{margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.tl>div{display:flex;gap:10px;align-items:flex-start;background:#F5F7FB;border-radius:16px;padding:12px}
.tl b{flex:none;width:28px;height:28px;border-radius:50%;background:#0F172A;color:#fff;display:grid;place-items:center;font-size:14px}
.tl span{font-size:12.4px;line-height:1.45;color:#475569}.tl strong{display:block;color:#0F172A;font-size:14px;margin-bottom:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.box{border-radius:18px;padding:16px}
.box h3{font-size:16px;margin-bottom:8px}
.box ul{list-style:none;display:flex;flex-direction:column;gap:7px}
.box li{display:flex;gap:9px;font-size:13.4px;line-height:1.45}
.box li i{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;margin-top:1px}
.us{background:#EEF2FF}.us li i{background:#2F5BEA}
.you{background:#F0FDF4}.you li i{background:#16A34A}
.faq{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.q{border:1px solid #E2E8F0;border-radius:14px;padding:11px 13px}
.q b{font-size:12.8px;display:block;margin-bottom:3px}
.q span{font-size:12.6px;color:#475569;line-height:1.45}
.cta{margin-top:16px;background:#0B1222;color:#fff;border-radius:22px;padding:18px 20px;display:flex;gap:20px;align-items:center}
.cta h3{font-size:22px;line-height:1.1}
.cta p{font-size:12.5px;color:#B8C2D9;margin-top:6px;line-height:1.45}
.cta .contact{flex:none;width:72mm;background:#fff;color:#0F172A;border-radius:14px;padding:12px 14px;font-size:12px}
.cta .contact div{border-bottom:1.5px dashed #CBD5E1;padding:9px 0 4px;color:#64748B}
</style></head><body>

<!-- 1. KAPAK -->
<section class="pg cover"><div class="glow2"></div><div class="glow"></div>
<div class="brand">${LOGO(40)}batilmer</div>
<h1>Randevu defteriniz<br><em>artık cebinizde.</em></h1>
<p class="lead">Randevuyla çalışan her işletme için online randevu ve hatırlatma sistemi. Müşteriniz 7/24 randevu alır, siz telefonunuzdan yönetirsiniz.</p>
<div class="badges"><div class="badge"><i>${tick}</i>Kurulumu biz yapıyoruz</div><div class="badge"><i>${tick}</i>SMS ücreti yok</div><div class="badge"><i>${tick}</i>KVKK metni hazır</div></div>
<div class="phones">
 <div>${phone('form', 205, 400)}<div class="lbl">Müşterinizin gördüğü</div></div>
 <div>${phone('bugun', 230, 452)}<div class="lbl">Sizin gördüğünüz</div></div>
</div>
<div class="foot"><span>batilmer · Online randevu ve hatırlatma</span><span>Ekran görüntüleri örnek (demo) işletmeye aittir.</span></div>
</section>

<!-- 2. NASIL ÇALIŞIR -->
<section class="pg">
<div class="brand">${LOGO(32)}batilmer</div>
<span class="pill" style="margin-top:14px">NASIL ÇALIŞIR?</span>
<h2 class="sec-t">3 adımda online randevu</h2>
<p class="lead">Telefonla saat ayarlamak, deftere yazmak, unutulan randevular… Hepsi tek ekranda ve otomatik.</p>
<div class="steps">
 <div class="step"><div class="n">1</div><h3>Müşteri saatini seçer</h3><p>Linkinize ya da QR kodunuza dokunur, hizmeti ve boş saati seçer. Dolu saat seçilemez, çakışma olmaz.</p>${phone('saat', 176, 400)}</div>
 <div class="step"><div class="n">2</div><h3>Telefonunuza bildirim düşer</h3><p>Yeni randevu anında panelinizde ve telefonunuzda. Tüm bilgiler tek kartta: ara, WhatsApp, not.</p>${phone('randevu', 176, 400)}</div>
 <div class="step"><div class="n">3</div><h3>Tek dokunuşla hatırlatma</h3><p>Bir gün önce "WhatsApp ile hatırlat"a basarsınız; mesaj hazır yazılı açılır. Gelmeyen müşteri azalır.</p>${phone('hatirlat', 176, 400)}</div>
</div>
<div class="where"><div style="font-size:30px">🔗</div><div><b>Randevu linkinizi her yere koyun</b>
<div class="chips"><span>📸 Instagram bio</span><span>💬 WhatsApp</span><span>📍 Google Haritalar</span><span>🌐 Web siteniz</span><span>🏷️ Kapıda / masada QR kod</span></div></div></div>
<div class="foot"><span>batilmer · Online randevu ve hatırlatma</span><span>2 / 4</span></div>
</section>

<!-- 3. NE KAZANDIRIR -->
<section class="pg">
<div class="brand">${LOGO(32)}batilmer</div>
<span class="pill" style="margin-top:14px">SİZE NE KAZANDIRIR?</span>
<h2 class="sec-t">Boş saat azalır, müşteri geri gelir</h2>
<div class="feat">
 <div class="f"><div class="tx"><div class="ic">🔁</div><h3>Tekrar çağırma</h3><p>Aşı, bakım, saç kesimi… Zamanı gelen müşteri listeye kendiliğinden düşer. Tek dokunuşla WhatsApp'tan çağırırsınız.</p></div><div class="mini"><img src="${I('cagir')}"></div></div>
 <div class="f"><div class="tx"><div class="ic">🔔</div><h3>Bekleme listesi</h3><p>Dolu güne randevu isteyen müşteri "yer açılırsa haber ver" der. İptal olunca saat boş kalmaz.</p></div><div class="mini"><img src="${I('bekle')}"></div></div>
 <div class="f"><div class="tx"><div class="ic">⭐</div><h3>Google yorum</h3><p>Gelen müşteriye tek dokunuşla yorum isteği. Link doğrudan Google yorum ekranını açar.</p></div><div class="mini"><img src="${I('yorum')}"></div></div>
 <div class="f"><div class="tx"><div class="ic">👤</div><h3>Müşteri kartı</h3><p>Kaç kez geldi, hangi hizmeti aldı, notlarınız… Defter karıştırmadan tek ekranda.</p></div><div class="mini"><img src="${I('kart')}"></div></div>
 <div class="f"><div class="tx"><div class="ic">💬</div><h3>Sitede sohbet asistanı</h3><p>Fiyat, saat, adres sorularını 7/24 cevaplar, boş saati gösterip randevuya götürür.</p></div><div class="mini"><img src="${I('asistan')}"></div></div>
 <div class="f"><div class="tx"><div class="ic">📊</div><h3>Ay sonu raporu</h3><p>Kaç randevu, kaç kişi gelmedi, en yoğun gün, tahmini ciro. İşletmenizin karnesi tek sayfada.</p></div><div class="mini"><img src="${I('rapor')}"></div></div>
</div>
<div class="foot"><span>batilmer · Online randevu ve hatırlatma</span><span>3 / 4</span></div>
</section>

<!-- 4. BAŞLAMAK -->
<section class="pg">
<div class="brand">${LOGO(32)}batilmer</div>
<span class="pill" style="margin-top:14px">BAŞLAMAK KOLAY</span>
<h2 class="sec-t">Kurulumu biz yapıyoruz</h2>
<p class="lead">Teknik bilgi gerekmez. Birkaç gün içinde sistem hazır olur, personelinize kısaca anlatırız.</p>
<div class="two">
 <div class="box us"><h3>Bizim yaptıklarımız</h3><ul>
  <li><i>${tick}</i>Randevu formunuzu logonuz ve renklerinizle kurarız</li>
  <li><i>${tick}</i>Hizmetleri, süreleri ve çalışma saatlerini gireriz</li>
  <li><i>${tick}</i>KVKK aydınlatma metninizi hazırlarız</li>
  <li><i>${tick}</i>Kapı / masa için QR kartınızı hazırlarız</li>
  <li><i>${tick}</i>Personelinize kullanımı gösteririz</li>
  <li><i>${tick}</i>Sorun olursa WhatsApp'tan destek veririz</li></ul></div>
 <div class="box you"><h3>Sizden istediklerimiz</h3><ul>
  <li><i>${tick}</i>Hizmet listeniz ve yaklaşık süreleri</li>
  <li><i>${tick}</i>Çalışma günleriniz ve saatleriniz</li>
  <li><i>${tick}</i>Logonuz (varsa)</li>
  <li><i>${tick}</i>Paneli kullanacak kişilerin adı</li></ul></div>
</div>
<div class="faq">
 <div class="q"><b>Müşterilerim yaşlı, online randevu kullanmaz?</b><span>Telefonla gelen randevuyu da panele siz girersiniz. Hatırlatma yine WhatsApp'tan gider.</span></div>
 <div class="q"><b>Uygulama indirmek gerekiyor mu?</b><span>Hayır. Müşteriniz linke dokunur; siz de paneli telefonunuzun ana ekranına eklersiniz.</span></div>
 <div class="q"><b>Müşteri randevusunu iptal edebilir mi?</b><span>Evet, kendi telefon numarası ve adıyla. Belirlediğiniz süreden sonra iptal edemez.</span></div>
 <div class="q"><b>Verilerim güvende mi?</b><span>Şifreli bağlantı, iki adımlı giriş, günlük yedek. Silinen kayıtlar iz bırakmadan silinir.</span></div>
</div>
<div class="tl"><div><b>1</b><span><strong>Tanışalım</strong>15 dakikalık görüşmede işletmenizi dinleyelim, örnek paneli gösterelim.</span></div><div><b>2</b><span><strong>Kuralım</strong>Formunuzu, hizmetlerinizi ve KVKK metninizi birkaç gün içinde hazırlayalım.</span></div><div><b>3</b><span><strong>Başlayalım</strong>Linkinizi paylaşın, ilk online randevularınız gelsin.</span></div></div>
<div class="cta"><div><h3>Önce görün,<br>sonra karar verin.</h3><p>Size özel formunuzu hazırlayıp telefonunuzda gösterelim. Sorularınızı yüz yüze cevaplayalım.</p></div>
 <div class="contact"><b style="font-size:13px">İletişim</b><div>Yetkili:</div><div>Telefon / WhatsApp:</div><div>Instagram:</div></div></div>
<div class="foot"><span>batilmer · Online randevu ve hatırlatma</span><span>4 / 4</span></div>
</section>
</body></html>`;
fs.writeFileSync(D + 'brosur.html', html);
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(html, { waitUntil: 'load' });
await p.waitForTimeout(500);
await p.pdf({ path: D + 'Batilmer-Tanitim-Brosuru.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
console.log('pdf ok', (fs.statSync(D + 'Batilmer-Tanitim-Brosuru.pdf').size / 1024).toFixed(0) + ' KB');
