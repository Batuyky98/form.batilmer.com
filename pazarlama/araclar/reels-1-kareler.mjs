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
// Önceki denemelerden kalan işaretleri geri al
const rm = await call('listReminders', [{ day: 'yarin' }]);
for (const i of rm.items) if (i.waAt && i.waBy === 'Dr. Ece Yalın') await call('markReminded', [i.id, false]);
const rc = await call('listRecalls', []);
for (const i of rc.done) if (i.sentBy === 'Dr. Ece Yalın' && i.status === 'cagrildi') await call('markRecall', [i.id, 'undo']);

const c = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await c.addCookies(ck);
await c.route('https://wa.me/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html></html>' }));
await c.addInitScript(() => { try { localStorage.setItem('bf_tema', 'light'); } catch {} });
const p = await c.newPage();
c.on('page', (pg) => { if (pg !== p) setTimeout(() => pg.close().catch(() => {}), 50); });
const seq = []; let n = 0;
const kshot = async (tag) => { const f = `kf/k${String(n++).padStart(3, '0')}.jpg`; await p.screenshot({ path: `${OUT}/${f}`, type: 'jpeg', quality: 92 }); seq.push({ f, tag }); return f; };
const center = async (loc) => { const b = await loc.boundingBox(); return { x: (b.x + b.width / 2) / 390, y: (b.y + b.height / 2) / 844 }; };
const scrollShots = async (to, steps) => { const from = await p.evaluate(() => window.scrollY); for (let i = 1; i <= steps; i++) { const e = 0.5 - Math.cos(Math.PI * i / steps) / 2; await p.evaluate((y) => window.scrollTo(0, y), from + (to - from) * e); await p.waitForTimeout(40); await kshot('scroll'); } };
// 1) Bugün
await p.goto(B + '/panel'); await p.waitForSelector('.td-head');
const g = p.locator('button:has-text("Gizle")'); if (await g.count()) await g.first().click();
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(900);
await kshot('bugun');
await scrollShots(150, 14);
const card = p.locator('a.td-nudge:has-text("randevu var")').first();
seq.push({ tap: await center(card) });
await card.click(); await p.waitForSelector('.rm-list'); await p.waitForTimeout(900);
await kshot('hatirlat');
const wa = p.locator('.rm-wa').first();
seq.push({ tap: await center(wa) });
await wa.click(); await p.waitForTimeout(900);
await kshot('hatirlat-tamam');
const tab = p.locator('.rm-tabs button:has-text("Çağır")');
seq.push({ tap: await center(tab) });
await tab.click(); await p.waitForSelector('.rc-hero'); await p.waitForTimeout(900);
await kshot('cagir');
const cg = p.locator('.rm-wa:has-text("Çağır")').first();
seq.push({ tap: await center(cg) });
await cg.click(); await p.waitForTimeout(900);
await kshot('cagir-tamam');
await p.goto(B + '/panel/rapor?form=' + ids.vet + '&ay=2026-10'); await p.waitForSelector('.rp-kpis'); await p.waitForTimeout(900);
await kshot('rapor');
await scrollShots(720, 36);
fs.writeFileSync(`${OUT}/seq.json`, JSON.stringify(seq));
console.log('kare', n);
await browser.close();
