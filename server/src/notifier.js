// Telefon / tarayıcı bildirimlerini gönderen döngü.
//  • İşlemler bildirimi "notifications" tablosuna yazar (veritabanı işlemiyle birlikte, kaybolmaz).
//  • Bu döngü 3 saniyede bir yeni bildirimleri alır, ALICILARI O ANDA hesaplar ve gönderir.
//    Yani bir kişinin yetkisi ya da "Bildirim" tiki kaldırıldığı anda ona bildirim gitmesi durur.
//  • Alıcı: o formda "Bildirim" tiki olan, aktif, bildirimlerini kapatmamış kullanıcılar.
//    Randevu bildirimleri için ayrıca "Randevuları yönet" yetkisi gerekir.
import { config } from './config.js';
import { generateVapidKeys, sendPush } from './webpush.js';
import { uid } from './security.js';

const J = (s, d) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};

let vapidCache = null;
export async function vapidKeys(db) {
  if (vapidCache) return vapidCache;
  const row = (await db.query("SELECT v FROM app_settings WHERE k = 'vapid'"))[0];
  if (row) return (vapidCache = J(row.v, null));
  const keys = generateVapidKeys();
  await db.query("INSERT INTO app_settings (k, v) VALUES ('vapid', ?)", [JSON.stringify(keys)]);
  console.log('[bildirim] Bildirim anahtarları oluşturuldu.');
  return (vapidCache = keys);
}
export const vapidPublicKey = async (db) => (await vapidKeys(db)).publicKey;

const subject = () => `mailto:${config.mail.from || 'info@batilmer.com'}`;

async function recipients(db, formId, kind) {
  const rows = await db.query(
    `SELECT u.id, u.role, p.perms FROM permissions p JOIN users u ON u.id = p.user_id JOIN forms f ON f.id = p.form_id
     WHERE p.form_id = ? AND f.deleted_at IS NULL AND u.deleted_at IS NULL AND u.active = 1 AND u.notify_enabled = 1`,
    [formId]
  );
  return rows
    .filter((r) => {
      const p = J(r.perms, {});
      if (!p.notify) return false;
      if (r.role === 'admin') return true;
      return kind === 'kayit' ? !!p.view : !!(p.view && p.randevu);
    })
    .map((r) => r.id);
}

async function deliver(db, sub, payload, keys) {
  const r = await sendPush(sub, payload, keys, subject(), { topic: payload.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') || undefined });
  if (r.status === 'ok') {
    await db.query('UPDATE push_subscriptions SET last_ok_at = ?, fail_count = 0 WHERE id = ?', [Date.now(), sub.id]);
  } else if (r.status === 'gone') {
    // Kişi telefonda izni kaldırdı ya da uygulamayı sildi
    await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
  } else {
    const fails = Number(sub.fail_count || 0) + 1;
    if (fails >= 20) await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
    else await db.query('UPDATE push_subscriptions SET fail_count = ? WHERE id = ?', [fails, sub.id]);
    console.error(`[bildirim] gönderilemedi (${sub.id}): ${r.detail}`);
  }
  return r.status;
}

async function tick(db) {
  const list = await db.query('SELECT * FROM notifications WHERE push_done = 0 ORDER BY created_at LIMIT 20');
  if (!list.length) return;
  const keys = await vapidKeys(db);
  for (const n of list) {
    // Önce "gönderildi" işaretle: sunucu yeniden başlasa da aynı bildirim iki kez gitmesin
    const r = await db.query('UPDATE notifications SET push_done = 1 WHERE id = ? AND push_done = 0', [n.id]);
    if (!r.affectedRows) continue;
    // 1 saatten eski (sunucu uzun süre kapalı kaldıysa) bildirimi telefona göndermeye gerek yok
    if (Date.now() - Number(n.created_at) > 3600000) continue;
    const users = await recipients(db, n.form_id, n.kind);
    if (!users.length) continue;
    const subs = await db.query(`SELECT * FROM push_subscriptions WHERE user_id IN (${users.map(() => '?').join(',')})`, users);
    const payload = { title: n.title, body: n.body, url: n.url, tag: n.id, ts: Number(n.created_at) };
    await Promise.all(subs.map((s) => deliver(db, s, payload, keys)));
  }
}

export async function sendTestPush(db, userId) {
  const subs = await db.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  if (!subs.length) return { sent: 0, failed: 0 };
  const keys = await vapidKeys(db);
  const payload = { title: 'Deneme bildirimi', body: 'Bildirimler bu cihazda çalışıyor. ✔', url: '/panel/bildirimler', tag: `test-${uid('')}`, ts: Date.now() };
  const results = await Promise.all(subs.map((s) => deliver(db, s, payload, keys)));
  return { sent: results.filter((r) => r === 'ok').length, failed: results.filter((r) => r !== 'ok').length };
}

export function startNotifier(db) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(db);
    } catch (e) {
      console.error('[bildirim] döngü hatası:', e.message);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(run, 3000);
  timer.unref();
  vapidKeys(db).catch((e) => console.error('[bildirim] anahtar hatası:', e.message));
  return () => clearInterval(timer);
}

export const _test = { tick, recipients };
