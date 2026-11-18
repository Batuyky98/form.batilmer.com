import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import crypto from 'node:crypto';
import fs from 'node:fs';
const B = 'http://localhost:3991';
const OUT = process.argv[2];
const ids = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const b32 = (t) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const o = []; for (const ch of t) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (sec, off) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + off)); const h = crypto.createHmac('sha1', b32(sec)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
let cookie = '';
const call = async (n, a) => {
  const r = await fetch(`${B}/api/rpc/${n}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-batilmer': '1', cookie, 'x-forwarded-for': '10.7.7.' + Math.floor(Math.random() * 200) }, body: JSON.stringify(a) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const j = await r.json(); if (j.error) throw new Error(`${n}: ${j.error.message}`); return j.result;
};
const t = await call('login', [process.env.DEMO_EPOSTA, process.env.DEMO_SIFRE]);
let ok = false;
for (const off of [0, 1, 2, -1, 3]) { try { await call('loginTotp', [t.ticket, totp(ids.secret, off)]); ok = true; break; } catch { } }
if (!ok) throw new Error('totp');
const browser = await chromium.launch({ args: ['--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks'] });
const ck = [{ name: cookie.split('=')[0], value: cookie.split('=')[1], url: B }];
async function ctxFor(mobile, dark) {
  const c = await browser.newContext(mobile ? { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, colorScheme: dark ? 'dark' : 'light' } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  await c.addCookies(ck);
  await c.addInitScript((d) => { try { localStorage.setItem('bf_tema', d ? 'dark' : 'light'); } catch {} }, dark);
  return c;
}
const shot = async (p, n, full) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: !!full, animations: 'disabled', timeout: 60000 }); };
const db = new DatabaseSync(process.argv[4]);
db.prepare('DELETE FROM notifications').run();
const rm = await call('listReminders', [{ day: 'yarin' }]);
for (const i of rm.items) if (i.waAt && i.waBy === 'Dr. Ece Yalın') await call('markReminded', [i.id, false]);
const T = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const D = (n) => new Date(Date.parse(T + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const slug = ids.vetSlug;
const day = '2026-11-19';
const seq = []; let n = 0;
const mk = async (pg, tag) => { const f = `kf/k${String(n++).padStart(3, '0')}.jpg`; await pg.screenshot({ path: `${OUT}/${f}`, type: 'jpeg', quality: 92 }); seq.push({ f, tag }); };
const center = async (loc) => { const b = await loc.boundingBox(); return { x: (b.x + b.width / 2) / 390, y: (b.y + b.height / 2) / 844 }; };
const tapAnd = async (pg, loc) => { await loc.scrollIntoViewIfNeeded(); await pg.waitForTimeout(150); seq.push({ tap: await center(loc) }); await loc.click(); await pg.waitForTimeout(500); };
const typeShots = async (pg, loc, text, parts, tag) => { for (let i = 1; i <= parts; i++) { await loc.fill(text.slice(0, Math.ceil(text.length * i / parts))); await mk(pg, tag); } };
const scrollShots = async (pg, to, steps, tag) => { const from = await pg.evaluate(() => window.scrollY); for (let i = 1; i <= steps; i++) { const e = 0.5 - Math.cos(Math.PI * i / steps) / 2; await pg.evaluate((y) => window.scrollTo(0, y), from + (to - from) * e); await pg.waitForTimeout(40); await mk(pg, tag); } };
// ---------------- MÜŞTERİ
const cc = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const c = await cc.newPage();
await c.goto(`${B}/f/${slug}`); await c.waitForTimeout(1200);
await mk(c, 'm-bos');
const pet = c.locator('input:visible').first();
await tapAnd(c, pet); await typeShots(c, pet, 'Pamuk', 3, 'm-yaz');
await tapAnd(c, c.locator('text=Kedi').first()); await mk(c, 'm-kedi');
await tapAnd(c, c.locator('button:has-text("Devam")')); await c.waitForTimeout(300); await mk(c, 'm-adim2');
await tapAnd(c, c.locator('.bf-svc-card:has-text("Aşı")')); await mk(c, 'm-asi');
await tapAnd(c, c.locator(`.bf-day:has(.bf-day-n:text-is("${Number(day.slice(8))}"))`).first()); await c.waitForTimeout(1500); await c.screenshot({ path: OUT + '/dbg-gun.png' });
await c.locator('.bf-slots-wrap').scrollIntoViewIfNeeded(); await c.evaluate(() => window.scrollBy(0, 60)); await mk(c, 'm-gun');
const times = await c.locator('.bf-slot').allInnerTexts(); const tsel = times.find((t) => t >= '11:00') || times[0];
await tapAnd(c, c.locator(`.bf-slot:has-text("${tsel}")`).first()); await mk(c, 'm-saat');
await tapAnd(c, c.locator('button:has-text("Devam")')); await c.waitForTimeout(300); await c.evaluate(() => window.scrollTo(0, 0)); await mk(c, 'm-adim3');
const nameI = c.locator('input[type=text]:visible').first(); const telI = c.locator('input[type=tel]:visible').first(); const mailI = c.locator('input[type=email]:visible').first();
await tapAnd(c, nameI); await typeShots(c, nameI, 'Zeynep Arıkan', 3, 'm-yaz');
await tapAnd(c, telI); await typeShots(c, telI, '0500 731 24 68', 2, 'm-yaz');
if (await mailI.count()) { await mailI.fill('zeynep@ornek.example'); }
const kv = c.locator('input[type=checkbox]').first();
await kv.scrollIntoViewIfNeeded(); await c.evaluate(() => window.scrollBy(0, 120));
seq.push({ tap: await center(kv) }); await kv.check({ force: true }).catch(async () => { await kv.evaluate((el) => el.closest('label')?.click()); }); await c.waitForTimeout(300); await mk(c, 'm-kvkk');
await c.waitForTimeout(2500);
await tapAnd(c, c.locator('button[type=submit]').last()); await c.waitForTimeout(1500); await c.evaluate(() => window.scrollTo(0, 0)); await mk(c, 'm-tamam');
await cc.close();
const nt = db.prepare('SELECT title, body FROM notifications ORDER BY created_at DESC LIMIT 1').get();
// ---------------- PANEL
const pc = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await pc.addCookies(ck); await pc.addInitScript(() => { try { localStorage.setItem('bf_tema', 'light'); localStorage.setItem('bf_bildirim_sor', String(Date.now() + 9e9)); } catch {} });
await pc.route('https://wa.me/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html></html>' }));
const p = await pc.newPage(); pc.on('page', (pg) => { if (pg !== p) setTimeout(() => pg.close().catch(() => {}), 50); });
await p.goto(B + '/panel'); await p.waitForSelector('.td-head'); const g = p.locator('button:has-text("Gizle")'); if (await g.count()) await g.first().click();
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(900); await mk(p, 'p-bugun');
seq.push({ banner: true });
await p.goto(`${B}/panel/formlar/${ids.vet}/randevular?tarih=${day}`); await p.waitForTimeout(1300); await mk(p, 'p-liste');
const row = p.locator(`text=Zeynep Arıkan`).first();
await tapAnd(p, row); await p.waitForTimeout(600); await mk(p, 'p-detay');
// ayarlar: hizmetler ve fiyatlar
await p.goto(`${B}/panel/formlar/${ids.vet}/duzenle`); await p.waitForTimeout(1200); await p.click('[role=tab]:has-text("Randevu")'); await p.waitForTimeout(600);
await p.evaluate(() => { const el = document.querySelector('#svc-price').closest('section'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150); }); await p.waitForTimeout(400); await mk(p, 'p-hizmet');
await scrollShots(p, await p.evaluate(() => window.scrollY + 260), 14, 'p-hizmet-kay');
// müsaitlik
await p.goto(`${B}/panel/formlar/${ids.vet}/saatler`); await p.waitForTimeout(1200); await mk(p, 'p-musait');
await scrollShots(p, await p.evaluate(() => { const h = [...document.querySelectorAll('h2,h3')].find((x) => /Kapalı günler/.test(x.textContent)); return h ? h.getBoundingClientRect().top + window.scrollY - 140 : 400; }), 14, 'p-musait-kay');
// hatırlatma
await p.goto(B + '/panel/hatirlatmalar'); await p.waitForSelector('.rm-list'); await p.waitForTimeout(900); await mk(p, 'p-hatirlat');
await tapAnd(p, p.locator('.rm-wa').first()); await p.waitForTimeout(600); await mk(p, 'p-hatirlat-tamam');
fs.writeFileSync(`${OUT}/seq.json`, JSON.stringify(seq));
fs.writeFileSync(`${OUT}/bildirim.json`, JSON.stringify(nt || {}));
console.log('kare', n, JSON.stringify(nt), tsel);
await browser.close();
