// Giden mail/SMS kuyruğu. İşlemler mailleri "outbox" tablosuna yazar; bu döngü onları gönderir.
// Böylece mail servisi geçici olarak çalışmasa bile kayıt kaybolmaz, sonra tekrar denenir.
import { config } from './config.js';

const MAX_ATTEMPTS = 5;

async function sendBrevo(m) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.mail.brevoKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.mail.fromName, email: config.mail.from },
      to: [{ email: m.recipient }],
      subject: m.subject,
      textContent: m.body
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function sendOne(m) {
  if (m.channel === 'sms') {
    // SMS sağlayıcısı seçildiğinde (Netgsm, İleti Merkezi vb.) buraya eklenecek
    if (config.sms.provider === 'none') return 'ayar-yok';
    throw new Error(`Tanımsız SMS sağlayıcısı: ${config.sms.provider}`);
  }
  if (config.mail.provider === 'none') return 'ayar-yok';
  if (config.mail.provider === 'brevo') {
    await sendBrevo(m);
    return 'gonderildi';
  }
  throw new Error(`Tanımsız mail sağlayıcısı: ${config.mail.provider}`);
}

export function startMailer(db) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = await db.query("SELECT * FROM outbox WHERE status = 'bekliyor' ORDER BY at LIMIT 20");
      for (const m of rows) {
        try {
          const status = await sendOne(m);
          await db.query('UPDATE outbox SET status = ?, attempts = attempts + 1, error = NULL, sent_at = ? WHERE id = ?', [status, Date.now(), m.id]);
        } catch (e) {
          const attempts = Number(m.attempts) + 1;
          await db.query('UPDATE outbox SET status = ?, attempts = ?, error = ? WHERE id = ?', [attempts >= MAX_ATTEMPTS ? 'hata' : 'bekliyor', attempts, String(e.message).slice(0, 500), m.id]);
          console.error(`[mail] ${m.recipient}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error('[mail] kuyruk hatası:', e.message);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
