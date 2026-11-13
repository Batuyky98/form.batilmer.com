// Zamanlanmış işler: randevu hatırlatmaları, saklama süresi dolan kayıtların silinmesi, eski oturumların temizliği
import { removeUploads } from './files.js';
import { mapAppt, mapForm, content, appointmentMailBody, mail, sms, log, cancelUrl, customerMails, forgetSubmissions } from './handlers.js';
import { today, addDays, dateTimeToMs, nowMinutesTR, timeToMin, uid } from '../../src/lib/util.js';
import { reminderTargets } from '../../src/lib/reminder.js';
import { t as tt } from '../../src/lib/i18n.js';
import { STATUS_LABELS } from '../../src/lib/shared.js';

async function reminders(db) {
  const t = Date.now();
  const rows = (await db.query("SELECT * FROM appointments WHERE status = 'onaylandi' AND reminder_sent = 0 AND date >= ? AND date <= ?", [today(), addDays(today(), 8)])).map(mapAppt);
  const forms = new Map();
  for (const a of rows) {
    if (!forms.has(a.formId)) forms.set(a.formId, mapForm((await db.query('SELECT * FROM forms WHERE id = ?', [a.formId]))[0]));
    const form = forms.get(a.formId);
    if (!form || form.deletedAt) continue;
    const c = content(form);
    const cfg = c.randevu;
    const startMs = dateTimeToMs(a.date, a.start);
    const hours = Number(cfg.reminderHours || 24);
    if (!(startMs > t && startMs - t <= hours * 3600000)) continue;
    const lang = a.lang || c.settings.language || 'tr';
    const biz = form.isletme || form.name;
    await db.tx(async (q) => {
      // Aynı hatırlatma iki kez gitmesin
      const r = await q("UPDATE appointments SET reminder_sent = 1 WHERE id = ? AND reminder_sent = 0 AND status = 'onaylandi'", [a.id]);
      if (!r.affectedRows) return;
      if (a.contact?.email && customerMails(c)) await mail(q, a.contact.email, tt(lang, 'mailReminderSubject', { x: biz }), appointmentMailBody(form, a, cfg, tt(lang, 'statusLabels')[a.status] || STATUS_LABELS[a.status], lang), 'hatirlatma', { formId: a.formId, subId: a.submissionId });
      if (cfg.sms?.reminder && a.contact?.phone) await sms(q, a.contact.phone, tt(lang, 'smsReminder', { x: biz, d: `${a.date} ${a.start}`, u: cancelUrl(a) }), { formId: a.formId, subId: a.submissionId });
    });
  }
}

// Her gün ayarlanan saatte (varsayılan 10:00) personele "hatırlatmaları gönderin" bildirimi.
// Bildirimde kişisel veri yok: sadece işletme adı ve randevu sayısı.
async function dailyReminderNotice(db) {
  const nowMin = nowMinutesTR();
  const day = today();
  const forms = (await db.query('SELECT * FROM forms WHERE deleted_at IS NULL')).map(mapForm);
  for (const form of forms) {
    const c = content(form);
    if (!c.fields?.some((f) => f.type === 'randevu')) continue;
    const wa = c.randevu.wa || {};
    if (wa.enabled === false) continue;
    const at = timeToMin(wa.notifyAt || '10:00');
    // Sunucu o saatte kapalıysa en geç 3 saat sonrasına kadar telafi eder; gece geç saatte göndermez
    if (nowMin < at || nowMin > at + 180) continue;
    if ((await db.query('SELECT 1 AS x FROM reminder_runs WHERE form_id = ? AND day = ?', [form.id, day])).length) continue;
    try {
      await db.query('INSERT INTO reminder_runs (form_id, day, created_at) VALUES (?, ?, ?)', [form.id, day, Date.now()]);
    } catch {
      continue; // başka bir döngü aynı anda yazdı
    }
    const parts = [];
    let total = 0;
    for (const d of reminderTargets(wa.when, day)) {
      const n = Number((await db.query("SELECT COUNT(*) AS c FROM appointments WHERE form_id = ? AND date = ? AND status IN ('bekliyor','onaylandi') AND wa_at IS NULL", [form.id, d]))[0].c);
      total += n;
      if (n) parts.push(`${d === day ? 'Bugün' : 'Yarın'} ${n} randevu`);
    }
    if (!total) continue;
    const biz = form.isletme || form.name;
    const url = `/panel/hatirlatmalar${reminderTargets(wa.when, day)[0] === day ? '?gun=bugun' : ''}`;
    await db.query('INSERT INTO notifications (id, form_id, kind, title, body, url, push_done, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)', [
      uid('n_'), form.id, 'hatirlatma', 'Hatırlatma zamanı 📲', `${biz} · ${parts.join(' · ')}. Dokunun, liste hazır.`.slice(0, 500), url, Date.now()
    ]);
  }
}

async function retention(db) {
  const forms = (await db.query('SELECT * FROM forms')).map(mapForm);
  for (const form of forms) {
    const months = Number(content(form).settings.retentionMonths || 0);
    if (!months) continue;
    const limit = Date.now() - months * 30 * 864e5;
    const expired = await db.query('SELECT id FROM submissions WHERE form_id = ? AND created_at < ?', [form.id, limit]);
    if (!expired.length) continue;
    const ids = expired.map((r) => r.id);
    const files = await db.tx(async (q) => {
      const f = await forgetSubmissions(q, form.id, ids);
      await log(q, null, `Saklama süresi dolan ${ids.length} kayıt silindi`, form.name);
      return f;
    });
    await removeUploads(files);
  }
}

async function cleanup(db) {
  await db.query('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  await db.query('DELETE FROM reset_tokens WHERE created_at < ?', [Date.now() - 2 * 3600000]);
  // 90 günden eski gönderilmiş mail geçmişi ve 1 yıldan eski loglar
  await db.query("DELETE FROM outbox WHERE status <> 'bekliyor' AND at < ?", [Date.now() - 90 * 864e5]);
  await db.query('DELETE FROM logs WHERE at < ?', [Date.now() - 365 * 864e5]);
  // Panel bildirim akışı 30 gün tutulur
  await db.query('DELETE FROM notifications WHERE created_at < ?', [Date.now() - 30 * 864e5]);
  await db.query('DELETE FROM sessions WHERE created_at < ?', [Date.now() - 24 * 3600000]);
  await db.query('DELETE FROM reminder_runs WHERE created_at < ?', [Date.now() - 14 * 864e5]);
}

export function startScheduler(db) {
  const safe = (name, fn) => async () => {
    try {
      await fn(db);
    } catch (e) {
      console.error(`[zamanlayici] ${name}:`, e.message);
    }
  };
  const timers = [
    setInterval(safe('hatirlatma', reminders), 60 * 1000),
    setInterval(safe('wa-bildirim', dailyReminderNotice), 60 * 1000),
    setInterval(safe('saklama', retention), 60 * 60 * 1000),
    setInterval(safe('temizlik', cleanup), 6 * 60 * 60 * 1000)
  ];
  timers.forEach((t) => t.unref());
  setTimeout(safe('hatirlatma', reminders), 5000).unref();
  setTimeout(safe('saklama', retention), 30000).unref();
  setTimeout(safe('temizlik', cleanup), 60000).unref();
  return () => timers.forEach(clearInterval);
}

export const _test = { reminders, retention, cleanup, dailyReminderNotice };
