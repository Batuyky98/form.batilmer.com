// "Neon şehir" trend görseli (retro gün batımı + çizgi roman paneli). Oyun adı/logo/font/karakter kullanılmaz.
// Kullanım: node neon-sehir-post.mjs <çıktı-klasörü>
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || '.';

const LOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0F172A"/><circle cx="15" cy="13" r="2.6" fill="#2F5BEA"/><circle cx="23" cy="13" r="2.6" fill="#2F5BEA"/><circle cx="31" cy="13" r="2.6" fill="#2F5BEA"/><path d="M21 22 V51" stroke="#fff" stroke-width="6.5" stroke-linecap="round" fill="none"/><circle cx="34" cy="40" r="11" stroke="#fff" stroke-width="6.5" fill="none"/><path d="M47 49 L53 49" stroke="#2F5BEA" stroke-width="5" stroke-linecap="round"/></svg>`;

// palmiye silueti
const palm = (x, y, s, flip = false, col = '#1A0B2E') => {
  const leaves = [-168, -140, -112, -80, -50, -22, 6].map((a, i) => {
    const L = 165 - Math.abs(i - 3) * 12;
    return `<path d="M0 0 C ${L * 0.3} ${-L * 0.28}, ${L * 0.75} ${-L * 0.22}, ${L} ${L * 0.16} C ${L * 0.7} ${-L * 0.02}, ${L * 0.32} ${-L * 0.04}, 0 ${L * 0.1} Z" fill="${col}" transform="rotate(${a})"/>`;
  }).join('');
  return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
    <path d="M0 0 C 14 120, 4 260, 26 420" stroke="${col}" stroke-width="16" fill="none" stroke-linecap="round"/>${leaves}
    <circle cx="6" cy="10" r="10" fill="${col}"/></g>`;
};

const skyline = (w, h, col) => {
  let x = 0, d = `M0 ${h}`; const r = [38, 62, 30, 84, 46, 110, 52, 70, 36, 96, 58, 40, 76, 48, 120, 44, 66, 34, 90, 50];
  let i = 0;
  while (x < w) { const bw = 34 + (i * 17) % 40, bh = r[i % r.length]; d += ` L${x} ${h - bh} L${x + bw} ${h - bh}`; x += bw; i++; }
  return `<path d="${d} L${w} ${h} Z" fill="${col}"/>`;
};

const ic = {
  bell: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  wa: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.5-4.2A8 8 0 1 1 8.6 19z"/><path d="M9 9.5c.4 2 2.5 4.2 4.6 4.6l1.2-1.2 2 1"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&display=swap">
<style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;overflow:hidden;background:#12061F;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;color:#fff;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(120% 60% at 50% 0%, #3B0F5C 0%, #12061F 60%)}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.06) 1.4px, transparent 1.6px);background-size:10px 10px}
.head{position:absolute;left:44px;right:44px;top:34px}
.h1{font-family:Anton,Impact,sans-serif;font-size:118px;line-height:.98;letter-spacing:.5px;transform:skewX(-8deg);transform-origin:left}
.h1 .a{display:block;color:#FFF3E6;text-shadow:5px 5px 0 #2F5BEA}
.h1 .b{display:block;background:linear-gradient(90deg,#FFC24B 0%,#FF6A3D 45%,#FF2E88 100%);-webkit-background-clip:text;color:transparent;filter:drop-shadow(5px 5px 0 #0B0420)}
.p{position:absolute;border:7px solid #0B0420;border-radius:20px;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.08)}
.lbl{position:absolute;left:18px;bottom:18px;background:#FF2E88;color:#fff;font-family:Anton,Impact,sans-serif;font-size:30px;letter-spacing:1px;padding:8px 18px 6px;border-radius:8px;transform:skewX(-8deg);box-shadow:4px 4px 0 #0B0420}
.lbl.y{background:#FFC24B;color:#1A0B2E}
.lbl.b{background:#2F5BEA}
.C .lbl{font-size:23px}
.badge{position:absolute;right:52px;top:70px;width:170px;height:170px;display:grid;place-items:center;text-align:center;font-family:Anton,Impact,sans-serif;color:#1A0B2E;font-size:34px;line-height:1;transform:rotate(12deg)}
.badge svg{position:absolute;inset:0}
.badge span{position:relative}
/* A: gün batımı */
.A{left:36px;top:300px;width:654px;height:580px;background:linear-gradient(180deg,#2A0F57 0%,#7B1E7A 38%,#FF4F7B 66%,#FFB347 100%)}
.sun{position:absolute;left:150px;top:150px;width:330px;height:330px;border-radius:50%;
 background:linear-gradient(180deg,#FFE27A 0%,#FF9F45 55%,#FF3D7F 100%);
 -webkit-mask:linear-gradient(#000 0 55%, transparent 55% 59%, #000 59% 67%, transparent 67% 71%, #000 71% 78%, transparent 78% 83%, #000 83% 88%, transparent 88% 94%, #000 94%)}
.sea{position:absolute;left:0;right:0;bottom:0;height:130px;background:linear-gradient(180deg,#5B1462,#1A0B2E)}
.sea i{position:absolute;left:0;right:0;height:4px;background:rgba(255,190,120,.45)}
.phone{position:absolute;right:46px;top:46px;width:250px;height:470px;border-radius:38px;background:#0B0F1A;padding:10px;transform:rotate(6deg);box-shadow:-14px 20px 0 rgba(11,4,32,.55)}
.scr{width:100%;height:100%;border-radius:30px;background:#F6F8FD;color:#0F172A;padding:22px 16px;font-size:15px}
.scr h4{font-family:'Inter Display',Inter;font-weight:800;font-size:21px;margin:6px 0 12px}
.chip{display:inline-block;background:#E8EEFF;color:#2F5BEA;font-weight:700;font-size:13px;padding:6px 10px;border-radius:999px;margin:0 4px 6px 0}
.g{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}
.g span{border:2px solid #DDE3F0;border-radius:10px;text-align:center;padding:8px 0;font-weight:700;font-size:15px;color:#334155}
.g span.on{background:#2F5BEA;border-color:#2F5BEA;color:#fff}
.g span.off{color:#B5BCCB;text-decoration:line-through}
.btn{margin-top:14px;background:#2F5BEA;color:#fff;font-weight:800;text-align:center;padding:12px 0;border-radius:12px;font-size:15px}
/* B: bildirim */
.B{left:708px;top:300px;width:336px;height:282px;background:linear-gradient(160deg,#1B1046,#3A0E59)}
.grid{position:absolute;left:-40px;right:-40px;bottom:-30px;height:150px;background:
 repeating-linear-gradient(90deg, rgba(255,46,136,.55) 0 2px, transparent 2px 44px),
 repeating-linear-gradient(0deg, rgba(255,46,136,.55) 0 2px, transparent 2px 26px);transform:perspective(220px) rotateX(55deg);transform-origin:bottom}
.notif{position:absolute;left:20px;right:20px;top:30px;background:rgba(255,255,255,.96);color:#0F172A;border-radius:18px;padding:14px;display:flex;gap:12px;align-items:center;box-shadow:6px 6px 0 #0B0420}
.notif .i{flex:none;width:52px;height:52px;border-radius:14px;background:#2F5BEA;display:grid;place-items:center}
.notif b{display:block;font-size:19px}.notif small{font-size:15px;color:#475569;font-weight:600}
/* C: hatırlatma */
.C{left:708px;top:600px;width:336px;height:280px;background:linear-gradient(200deg,#FF6A3D,#B8246F)}
.bub{position:absolute;left:22px;right:40px;top:40px;background:#DCF8C6;color:#0F172A;border-radius:18px 18px 18px 4px;padding:14px 16px;font-size:18px;font-weight:600;line-height:1.35;box-shadow:6px 6px 0 #0B0420}
.bub small{display:block;text-align:right;color:#5B7A5B;font-size:13px;margin-top:4px}
.wa{position:absolute;right:12px;top:12px;width:54px;height:54px;border-radius:50%;background:#25D366;display:grid;place-items:center;box-shadow:4px 4px 0 #0B0420}
/* D: takvim */
.D{left:36px;top:898px;width:490px;height:300px;background:linear-gradient(135deg,#2F5BEA,#5B2BD6)}
.cal{position:absolute;left:24px;top:24px;width:300px;background:#fff;color:#0F172A;border-radius:16px;padding:14px;box-shadow:6px 6px 0 #0B0420}
.cal h5{font-size:16px;font-weight:800;margin-bottom:8px}
.cal .d{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.cal .d span{height:26px;border-radius:7px;background:#EEF2FB;font-size:12px;font-weight:700;display:grid;place-items:center;color:#475569}
.cal .d span.on{background:#FF2E88;color:#fff}.cal .d span.x{background:#F3F4F6;color:#C4C8D0}
.palmD{position:absolute;right:-10px;bottom:-30px}
/* E: müşteri kartı */
.E{left:544px;top:898px;width:500px;height:300px;background:linear-gradient(160deg,#FFC24B,#FF6A3D)}
.card{position:absolute;left:24px;top:24px;width:300px;background:#fff;color:#0F172A;border-radius:16px;padding:16px;box-shadow:6px 6px 0 #0B0420}
.card .row{display:flex;gap:12px;align-items:center}
.card .av{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#2F5BEA,#FF2E88);display:grid;place-items:center;font-weight:800;color:#fff;font-size:18px}
.card b{font-size:18px}.card small{display:block;color:#64748B;font-size:13px;font-weight:600}
.card .st{display:flex;gap:8px;margin-top:12px}
.card .st span{flex:1;background:#F1F5F9;border-radius:10px;text-align:center;padding:8px 0;font-size:12px;color:#64748B;font-weight:600}
.card .st span b{display:block;font-size:20px;color:#0F172A}
/* alt bant */
.foot{position:absolute;left:36px;right:36px;top:1218px;height:96px;display:flex;align-items:center;gap:16px;background:#0B0420;border-radius:20px;padding:0 22px;border:2px solid rgba(255,255,255,.08)}
.foot .n{font-family:'Inter Display',Inter;font-weight:800;font-size:34px}
.foot .t{font-size:20px;color:#C9B8E8;font-weight:600;line-height:1.25}
.foot .cta{margin-left:auto;background:linear-gradient(90deg,#FF6A3D,#FF2E88);font-family:Anton,Impact,sans-serif;font-size:28px;letter-spacing:1px;padding:12px 22px 10px;border-radius:12px;transform:skewX(-8deg)}
</style></head><body>
<div class="bg"></div><div class="dots"></div>
<div class="badge"><svg viewBox="0 0 100 100" width="170" height="170"><polygon fill="#FFC24B" stroke="#0B0420" stroke-width="3" points="${Array.from({length:32},(_,i)=>{const r=i%2?40:49,a=Math.PI*i/16;return (50+r*Math.cos(a)).toFixed(1)+','+(50+r*Math.sin(a)).toFixed(1)}).join(' ')}"/></svg><span>7/24<br>AÇIK</span></div>
<div class="head"><div class="h1"><span class="a">BU ŞEHİRDE</span><span class="b">RANDEVU KAÇMAZ.</span></div></div>

<div class="p A">
  <div class="sun"></div>
  <svg style="position:absolute;left:0;bottom:120px" width="654" height="150">${skyline(654, 150, '#2A0B3F')}</svg>
  <div class="sea"><i style="bottom:96px;left:200px;right:260px"></i><i style="bottom:72px;left:160px;right:220px"></i><i style="bottom:46px;left:120px;right:180px"></i></div>
  <svg style="position:absolute;left:0;top:0" width="654" height="580">${palm(70, 150, 0.95)}${palm(150, 230, 0.7, true)}</svg>
  <div class="phone"><div class="scr">
    <span class="chip">Online randevu</span>
    <h4>Saatinizi seçin</h4>
    <span class="chip">Cuma</span><span class="chip">Bakım · 45 dk</span>
    <div class="g"><span>10:00</span><span class="off">11:30</span><span class="on">14:00</span><span>15:30</span><span class="off">16:00</span><span>17:30</span></div>
    <div class="btn">Randevuyu onayla</div>
  </div></div>
  <div class="lbl">GECE 2’DE BİLE AÇIK</div>
</div>

<div class="p B">
  <div class="grid"></div>
  <div class="notif"><div class="i">${ic.bell}</div><div><b>Yeni randevu!</b><small>Cuma 14:00 · Bakım</small></div></div>
  <div class="lbl b">ANINDA BİLDİRİM</div>
</div>

<div class="p C">
  <div class="bub">Yarın 14:00’te sizi bekliyoruz. Görüşmek üzere!<small>09:41 ✓✓</small></div>
  <div class="wa">${ic.wa}</div>
  <div class="lbl y">TEK DOKUNUŞLA HATIRLAT</div>
</div>

<div class="p D">
  <div class="cal"><h5>Kasım</h5><div class="d">
    ${Array.from({ length: 21 }, (_, i) => `<span class="${i === 11 ? 'on' : [3, 4, 17].includes(i) ? 'x' : ''}">${i + 7}</span>`).join('')}
  </div></div>
  <svg class="palmD" width="200" height="300">${palm(110, 70, 0.55, false, '#140A33')}</svg>
  <div class="lbl">MÜŞTERİ SAATİNİ KENDİ SEÇER</div>
</div>

<div class="p E">
  <div class="card"><div class="row"><div class="av">AY</div><div><b>Ayşe Y.</b><small>Son ziyaret: 12 Kasım</small></div></div>
    <div class="st"><span><b>6</b>geldi</span><span><b>0</b>gelmedi</span><span><b>1</b>iptal</span></div></div>
  <div class="lbl b">HER MÜŞTERİ TEK EKRANDA</div>
</div>

<div class="foot">${LOGO(60)}<div><div class="n">batilmer</div></div>
  <div class="t">Randevuyla çalışan<br>her işletme için</div>
  <div class="cta">DEMO İÇİN DM</div></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/13-neon-sehir.png` });
await browser.close();
console.log('ok', `${OUT}/13-neon-sehir.png`);
