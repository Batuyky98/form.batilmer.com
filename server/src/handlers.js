// =====================================================================
//  Batilmer Form Paneli – sunucu işlemleri
//  Ön yüzdeki src/lib/api.local.js ile AYNI isimler ve AYNI dönüş şekilleri.
//  Her işlem yetkiyi kendisi kontrol eder; tarayıcıdan gelen hiçbir şeye güvenilmez.
// =====================================================================
import { config } from './config.js';
import { hashPassword, verifyPassword, burnTime, randomToken, sha256, uid, rateLimit } from './security.js';
import { decodeDataUrl, removeUploads, sniffMatches, writeUpload } from './files.js';
import { verifyTurnstile } from './turnstile.js';
import { newSecret, verifyTotp, otpauthUrl, newBackupCodes, normBackup } from './totp.js';
import { endpointAllowed } from './webpush.js';
import { sendTestPush, vapidPublicKey } from './notifier.js';

import { today, addDays, dateTimeToMs, dateOfMs, dayOfWeek, formatDateTime, formatDateShort, weekdayShort, slugify } from '../../src/lib/util.js';
import { validateAll, fileExt } from '../../src/lib/validators.js';
import { visibilityMap } from '../../src/lib/conditions.js';
import { t as tt } from '../../src/lib/i18n.js';
import { checkSlot, getSlots, endTime, serviceById, ACTIVE_STATUSES } from '../../src/lib/availability.js';
import { buildFormContent, normalizeContent, DEFAULT_CONTROL } from '../../src/lib/templates.js';
import { STATUS_LABELS, SUBMISSION_STATUSES, submissionStatusLabel, displayValue, contactFrom, fillTemplate, passwordProblem, SESSION_IDLE_MS, SESSION_MAX_MS } from '../../src/lib/shared.js';
import { appointmentTerm, buildIcs, googleCalendarUrl } from '../../src/lib/calendar.js';

// ---------------------------------------------------------------- hata
export class ApiError extends Error {
  constructor(message, code = 'hata', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const fail = (msg, code = 'hata', status = 400) => {
  throw new ApiError(msg, code, status);
};

// ---------------------------------------------------------------- yardımcılar
const now = () => Date.now();
const J = (s, d) => {
  if (s === null || s === undefined || s === '') return d;
  try {
    return JSON.parse(s);
  } catch {
    return d;
  }
};
const S = (v) => JSON.stringify(v ?? null);
const clone = (v) => JSON.parse(JSON.stringify(v));
const num = (v) => (v === null || v === undefined ? null : Number(v));
const ph = (arr) => arr.map(() => '?').join(',');
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const ACTIVE_SQL = "('bekliyor','onaylandi','geldi')";
const PENDING_SQL = "('bekliyor','onaylandi')";

// notify: "bu formdan bildirim alsın" (Ana Admin belirler; kullanıcı sadece kendi cihazında açıp kapatır)
const NO_PERMS = { view: false, excel: false, delete: false, edit: false, randevu: false, notify: false };
const ALL_PERMS = { view: true, excel: true, delete: true, edit: true, randevu: true, notify: false };

function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, email: r.email, passHash: r.pass_hash, role: r.role,
    mustChange: !!Number(r.must_change), active: !!Number(r.active), createdAt: num(r.created_at), deletedAt: num(r.deleted_at),
    notifyEnabled: r.notify_enabled === undefined || r.notify_enabled === null ? true : !!Number(r.notify_enabled),
    notifSeenAt: num(r.notif_seen_at), totpSecret: r.totp_secret || null, totpEnabled: !!Number(r.totp_enabled || 0),
    totpLastStep: num(r.totp_last_step), backupCodes: J(r.backup_codes, [])
  };
}
const publicUser = (u) =>
  u && {
    id: u.id, name: u.name, email: u.email, role: u.role, mustChange: !!u.mustChange, active: u.active,
    notifyEnabled: u.notifyEnabled !== false, twofaEnabled: !!u.totpEnabled,
    // Ana Admin hesaplarında Authenticator zorunlu
    twofaSetupRequired: u.role === 'admin' && !u.totpEnabled
  };

function mapForm(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, isletme: r.isletme, slug: r.slug,
    control: { ...clone(DEFAULT_CONTROL), ...J(r.control, {}) },
    draft: normalizeContent(J(r.draft, {})),
    published: r.published ? normalizeContent(J(r.published, {})) : null,
    publishedAt: num(r.published_at), createdBy: r.created_by,
    createdAt: num(r.created_at), updatedAt: num(r.updated_at), deletedAt: num(r.deleted_at)
  };
}

function mapSub(r) {
  if (!r) return null;
  return {
    id: r.id, formId: r.form_id, values: J(r.vals, {}), labels: J(r.labels, {}), types: J(r.types, {}), order: J(r.ord, []),
    status: r.status || 'yeni', notes: J(r.notes, []), appointmentId: r.appointment_id, manual: !!Number(r.manual),
    kvkkAt: num(r.kvkk_at), ip: r.ip, userAgent: r.user_agent, createdAt: num(r.created_at), deletedAt: num(r.deleted_at)
  };
}

function mapAppt(r) {
  if (!r) return null;
  return {
    id: r.id, formId: r.form_id, submissionId: r.submission_id, serviceId: r.service_id, resourceId: r.resource_id,
    date: r.date, start: r.start, end: r.end_time, buffer: Number(r.buffer), partySize: Number(r.party_size), status: r.status,
    cancelToken: r.cancel_token, cancelledBy: r.cancelled_by, reminderSent: !!Number(r.reminder_sent),
    contact: J(r.contact, {}), lang: r.lang, source: r.source, createdAt: num(r.created_at)
  };
}
const panelAppt = (a) => {
  const { cancelToken, ...rest } = a;
  void cancelToken;
  return rest;
};

// Panelde dosyalar indirme linkiyle gösterilir
function withFileUrls(sub) {
  const values = { ...sub.values };
  for (const [k, v] of Object.entries(values)) {
    if (sub.types[k] === 'dosya' && v && typeof v === 'object' && v.fileId) values[k] = { ...v, url: `/api/files/${v.fileId}` };
  }
  return { ...sub, values };
}

const content = (form) => form.published || form.draft;

async function log(q, userId, action, target = '') {
  await q('INSERT INTO logs (id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?)', [uid('l_'), userId, str(action, 300), str(target, 300), now()]);
}

async function mail(q, to, subject, body, kind = 'bilgi') {
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
  for (const addr of list) {
    await q('INSERT INTO outbox (id, recipient, subject, body, kind, channel, status, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      uid('m_'), addr.slice(0, 190), str(subject, 300), String(body || '').slice(0, 20000), kind, 'mail', 'bekliyor', now()
    ]);
  }
}

async function sms(q, phone, text) {
  if (!phone) return;
  await q('INSERT INTO outbox (id, recipient, subject, body, kind, channel, status, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    uid('m_'), String(phone).slice(0, 30), 'SMS', String(text).slice(0, 1000), 'sms', 'sms', 'bekliyor', now()
  ]);
}

const cancelUrl = (appt) => `${config.publicUrl}/iptal/${appt.cancelToken}`;

// Müşteriye mail: varsayılan KAPALI (ücretli ek özellik, form bazında sadece Ana Admin açar)
const customerMails = (c) => !!c?.settings?.customerMails;

// Panel + telefon bildirimi. İçerikte kişisel veri yok (ad, telefon, TC gönderilmez);
// detaylar ancak panele giriş yapınca görünür. Telefona gönderimi notifier.js yapar.
async function addNotice(q, form, kind, appt = null, cfg = null) {
  const biz = form.isletme || form.name;
  let title;
  let body;
  let url;
  if (appt) {
    const term = appointmentTerm(cfg);
    const svc = serviceById(cfg, appt.serviceId)?.name;
    const res = (cfg.resources || []).find((r) => r.id === appt.resourceId)?.name;
    title = kind === 'iptal' ? `${term} iptal edildi` : `Yeni ${term.toLocaleLowerCase('tr')}${appt.status === 'bekliyor' ? ' (onay bekliyor)' : ''}`;
    body = [biz, `${weekdayShort(appt.date)} ${formatDateShort(appt.date)} ${appt.start}`, svc, res, cfg.capacityMode === 'kisi' ? `${appt.partySize} kişi` : null].filter(Boolean).join(' · ');
    url = `/panel/formlar/${form.id}/randevular?tarih=${appt.date}`;
  } else {
    title = 'Yeni kayıt';
    body = biz === form.name ? form.name : `${biz} · ${form.name}`;
    url = `/panel/formlar/${form.id}/kayitlar`;
  }
  await q('INSERT INTO notifications (id, form_id, kind, title, body, url, push_done, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)', [
    uid('n_'), form.id, appt ? (kind === 'iptal' ? 'iptal' : 'randevu') : 'kayit', str(title, 200), str(body, 500), url, now()
  ]);
}

// Form gönderildikten sonra müşteriye gösterilen randevu kartı için bilgiler
function appointmentCard(form, appt, cfg, lang) {
  const biz = form.isletme || form.name;
  const term = appointmentTerm(cfg);
  const svc = serviceById(cfg, appt.serviceId)?.name || '';
  const res = (cfg.resources || []).find((r) => r.id === appt.resourceId)?.name || '';
  const title = `${biz} – ${svc && svc !== term ? `${term}: ${svc}` : term}`;
  const cancel = cancelUrl(appt);
  return {
    date: appt.date, start: appt.start, end: appt.end, status: appt.status, service: svc, resource: res, resourceLabel: cfg.resourceLabel || '',
    partySize: cfg.capacityMode === 'kisi' ? appt.partySize : null, term, isletme: biz,
    cancelUrl: cancel, cancelCutoffHours: Number(cfg.cancelCutoffHours || 0),
    icsUrl: `${config.publicUrl}/api/ics/${appt.cancelToken}`,
    googleUrl: googleCalendarUrl({ date: appt.date, start: appt.start, end: appt.end, title, description: `${lang === 'en' ? 'Cancel' : 'İptal'}: ${cancel}` })
  };
}

// "Takvimime ekle" dosyası (/api/ics/<iptal-kodu>)
export async function icsByToken(db, tok) {
  if (!/^[a-f0-9]{32}$/.test(String(tok || ''))) return null;
  const a = mapAppt((await db.query('SELECT * FROM appointments WHERE cancel_token = ?', [tok]))[0]);
  if (!a || a.status === 'iptal') return null;
  const form = await loadForm(db.query, a.formId);
  if (!form) return null;
  const c = content(form);
  const card = appointmentCard(form, a, c.randevu, a.lang || 'tr');
  const title = `${card.isletme} – ${card.service && card.service !== card.term ? `${card.term}: ${card.service}` : card.term}`;
  return {
    filename: `${slugify(card.isletme) || 'randevu'}-${a.date}.ics`,
    text: buildIcs({ uid: a.id, date: a.date, start: a.start, end: a.end, title, description: `${a.lang === 'en' ? 'Cancel' : 'İptal'}: ${card.cancelUrl}`, url: card.cancelUrl, lang: a.lang || 'tr' })
  };
}

function appointmentMailBody(form, appt, cfg, status, lang = 'tr') {
  const svc = serviceById(cfg, appt.serviceId);
  const res = (cfg.resources || []).find((r) => r.id === appt.resourceId);
  return [
    `${form.isletme || form.name}`,
    `${tt(lang, 'service')}: ${svc?.name || '-'}`,
    res ? `${cfg.resourceLabel || 'Personel'}: ${res.name}` : null,
    `${tt(lang, 'date')}: ${appt.date} ${appt.start} - ${appt.end}`,
    cfg.capacityMode === 'kisi' ? `${tt(lang, 'partySize')}: ${appt.partySize}` : null,
    `${tt(lang, 'status')}: ${status}`,
    '',
    `${tt(lang, 'mailCancelLink')} ${cancelUrl(appt)}`
  ].filter((l) => l !== null).join('\n');
}

// ---------------------------------------------------------------- oturum / yetki
// Oturum: 2 saat hiçbir işlem yapılmazsa ya da girişten 12 saat sonra kapanır.
// Panelin arka planda yaptığı otomatik kontroller (yeni bildirim var mı?) süreyi UZATMAZ;
// sadece kişinin kendi yaptığı işlemler uzatır (X-Batilmer-Bg başlığı olmayan istekler).
const SESSION_COOKIE = 'bf_sess';

async function sessionUser(ctx) {
  if (ctx._user !== undefined) return ctx._user;
  ctx._session = null;
  const tok = ctx.cookies[SESSION_COOKIE];
  if (!tok || !/^[a-f0-9]{64}$/.test(tok)) return (ctx._user = null);
  const hash = sha256(tok);
  const rows = await ctx.db.query(
    'SELECT u.*, s.created_at AS s_created, s.last_seen AS s_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.deleted_at IS NULL AND u.active = 1',
    [hash]
  );
  if (!rows[0]) return (ctx._user = null);
  const t = now();
  const created = Number(rows[0].s_created);
  let seen = Number(rows[0].s_seen ?? created);
  if (t - created >= SESSION_MAX_MS || t - seen >= SESSION_IDLE_MS) {
    await ctx.db.query('DELETE FROM sessions WHERE token_hash = ?', [hash]);
    return (ctx._user = null);
  }
  if (!ctx.background && t - seen > 15000) {
    seen = t;
    await ctx.db.query('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', [t, hash]);
  }
  ctx._session = { hash, created, seen };
  ctx._user = mapUser(rows[0]);
  return ctx._user;
}

function sessionState(ctx) {
  const s = ctx._session;
  if (!s) return null;
  const t = now();
  return { idleLeftMs: Math.max(0, s.seen + SESSION_IDLE_MS - t), absLeftMs: Math.max(0, s.created + SESSION_MAX_MS - t) };
}

async function requireUser(ctx) {
  const u = await sessionUser(ctx);
  if (!u) fail('Oturum süresi doldu, lütfen tekrar giriş yapın.', 'oturum', 401);
  // İlk girişte şifre değiştirilmeden başka işlem yapılamaz
  if (u.mustChange && !ctx.allowMustChange) fail('Devam etmeden önce şifrenizi değiştirmeniz gerekiyor.', 'sifre', 403);
  // Ana Admin, Authenticator'ı kurmadan başka işlem yapamaz
  if (!u.mustChange && u.role === 'admin' && !u.totpEnabled && !ctx.allowTwofaSetup) fail('Devam etmeden önce iki adımlı doğrulamayı (Authenticator) açmanız gerekiyor.', '2fa_kurulum', 403);
  return u;
}

async function requireAdmin(ctx) {
  const u = await requireUser(ctx);
  if (u.role !== 'admin') fail('Bu işlem için yetkiniz yok.', 'yetki', 403);
  return u;
}

async function permsFor(q, user, formId) {
  if (!user) return { ...NO_PERMS };
  const rows = await q('SELECT perms FROM permissions WHERE user_id = ? AND form_id = ?', [user.id, formId]);
  const saved = rows[0] ? J(rows[0].perms, {}) : {};
  // Ana Admin her şeyi görür; bildirimi ise sadece kendisi tik attığı formlardan alır (varsayılan kapalı)
  if (user.role === 'admin') return { ...ALL_PERMS, notify: !!saved.notify };
  return { ...NO_PERMS, ...saved };
}

async function loadForm(q, formId, { lock = false } = {}) {
  const rows = await q(`SELECT * FROM forms WHERE id = ? AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`, [formId]);
  return mapForm(rows[0]);
}

async function requirePerm(ctx, q, formId, perm, opts = {}) {
  const user = await requireUser(ctx);
  const form = await loadForm(q, String(formId || ''), opts);
  if (!form) fail('Form bulunamadı.', 'yok', 404);
  const perms = await permsFor(q, user, form.id);
  if (!perms[perm]) fail('Bu işlem için yetkiniz yok.', 'yetki', 403);
  return { user, form, perms };
}

function sessionCookie(ctx, value, maxAgeSec) {
  ctx.setCookie(SESSION_COOKIE, value, { maxAge: maxAgeSec });
}

// ---------------------------------------------------------------- kurulum
export async function seedAdmin(db) {
  const rows = await db.query("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
  if (rows.length) return;
  const { email, password } = config.seedAdmin;
  if (!email || !password) {
    console.warn('[kurulum] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD tanımlı değil; Ana Admin oluşturulmadı.');
    return;
  }
  await db.query('INSERT INTO users (id, name, email, pass_hash, role, must_change, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    uid('u_'), 'Ana Admin', email, await hashPassword(password), 'admin', 1, 1, now()
  ]);
  console.log(`[kurulum] Ana Admin oluşturuldu: ${email} (ilk girişte şifre değiştirilecek)`);
}

// ---------------------------------------------------------------- formun açık olup olmadığı
async function formIsOpen(q, form) {
  const c = form.control || DEFAULT_CONTROL;
  const lang = content(form).settings.language || 'tr';
  if (!form.published) return { open: false, reason: lang === 'en' ? 'This form has not been published yet.' : 'Bu form henüz yayınlanmadı.' };
  if (c.status !== 'aktif') return { open: false, reason: c.closedMessage };
  const t = today();
  if (c.startDate && t < c.startDate) return { open: false, reason: c.closedMessage };
  if (c.endDate && t > c.endDate) return { open: false, reason: c.closedMessage };
  if (c.quota) {
    const [{ c: count }] = await q('SELECT COUNT(*) AS c FROM submissions WHERE form_id = ? AND deleted_at IS NULL', [form.id]);
    if (Number(count) >= Number(c.quota)) return { open: false, reason: c.closedMessage };
  }
  return { open: true };
}

// =====================================================================
//  İŞLEMLER
// =====================================================================
const H = {};
// Giriş yapmadan çağrılabilen işlemler
export const PUBLIC = new Set(['login', 'loginTotp', 'logout', 'currentUser', 'publicConfig', 'requestPasswordReset', 'resetPassword', 'getPublicForm', 'getAvailability', 'submitForm', 'getAppointmentByToken', 'cancelByToken']);
// İlk girişte şifre değiştirmeden önce de çağrılabilenler
const MUST_CHANGE_OK = new Set(['changePassword', 'currentUser', 'logout', 'sessionInfo', 'touchSession']);
// Ana Admin Authenticator'ı kurmadan önce çağrılabilenler
const TWOFA_SETUP_OK = new Set([...MUST_CHANGE_OK, 'totpStatus', 'totpSetupStart', 'totpSetupConfirm']);
export const BIG_BODY = new Set(['submitForm']);

// ---------------------------------------------------------------- oturum
// Şifre doğru, Authenticator kodu bekleniyor: 5 dakika geçerli, en fazla 5 deneme
const tickets = new Map();
setInterval(() => {
  for (const [k, v] of tickets) if (now() > v.exp) tickets.delete(k);
}, 60000).unref();

async function startSession(ctx, user) {
  const tok = randomToken(32);
  const t = now();
  await ctx.db.query('DELETE FROM sessions WHERE user_id = ? AND (expires_at < ? OR created_at < ?)', [user.id, t, t - SESSION_MAX_MS]);
  await ctx.db.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)', [sha256(tok), user.id, t, t + SESSION_MAX_MS, t]);
  await log(ctx.db.query, user.id, 'Giriş yaptı', ctx.ip);
  sessionCookie(ctx, tok, Math.floor(SESSION_MAX_MS / 1000));
  ctx._session = { hash: sha256(tok), created: t, seen: t };
  return publicUser(user);
}

H.login = async (ctx, email, password) => {
  const e = str(email, 190).toLowerCase();
  if (!rateLimit(`login:ip:${ctx.ip}`, 20, 15 * 60000) || !rateLimit(`login:mail:${e}`, 8, 15 * 60000)) {
    fail('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.', 'sinir', 429);
  }
  const user = mapUser((await ctx.db.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [e]))[0]);
  if (!user) {
    await burnTime(password);
    fail('E-posta veya şifre hatalı.');
  }
  if (!(await verifyPassword(password, user.passHash)) || !user.active) fail('E-posta veya şifre hatalı.');
  if (user.totpEnabled) {
    const ticket = randomToken(24);
    tickets.set(ticket, { userId: user.id, exp: now() + 5 * 60000, tries: 0 });
    return { twofa: true, ticket };
  }
  return startSession(ctx, user);
};

H.loginTotp = async (ctx, ticket, code) => {
  const tk = tickets.get(String(ticket || ''));
  if (!tk || now() > tk.exp) fail('Süre doldu, lütfen e-posta ve şifrenizle tekrar giriş yapın.', 'bilet');
  if (!rateLimit(`totp:ip:${ctx.ip}`, 20, 15 * 60000)) fail('Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.', 'sinir', 429);
  tk.tries += 1;
  if (tk.tries > 5) {
    tickets.delete(String(ticket));
    fail('Çok fazla hatalı kod girildi. Lütfen tekrar giriş yapın.', 'bilet');
  }
  const user = mapUser((await ctx.db.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND active = 1', [tk.userId]))[0]);
  if (!user || !user.totpEnabled) fail('Lütfen tekrar giriş yapın.', 'bilet');
  const c = String(code || '').trim();
  const step = verifyTotp(user.totpSecret, c, { lastStep: user.totpLastStep });
  if (step !== null) {
    await ctx.db.query('UPDATE users SET totp_last_step = ? WHERE id = ?', [step, user.id]);
  } else {
    // Yedek kod (tek kullanımlık)
    const h = sha256(`bk:${normBackup(c)}`);
    if (normBackup(c).length !== 8 || !user.backupCodes.includes(h)) fail('Kod hatalı. Telefonunuzdaki uygulamada görünen 6 haneli kodu girin.');
    const rest = user.backupCodes.filter((x) => x !== h);
    await ctx.db.query('UPDATE users SET backup_codes = ? WHERE id = ?', [S(rest), user.id]);
    await log(ctx.db.query, user.id, `Yedek kodla giriş yaptı (${rest.length} kod kaldı)`, ctx.ip);
  }
  tickets.delete(String(ticket));
  return startSession(ctx, user);
};

H.logout = async (ctx, endpoint) => {
  const tok = ctx.cookies[SESSION_COOKIE];
  if (tok && /^[a-f0-9]{64}$/.test(tok)) {
    const row = (await ctx.db.query('SELECT user_id FROM sessions WHERE token_hash = ?', [sha256(tok)]))[0];
    // "Çıkış yap" denince bu cihazın bildirimleri de durur
    if (row && endpoint) await ctx.db.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [row.user_id, sha256(String(endpoint))]);
    await ctx.db.query('DELETE FROM sessions WHERE token_hash = ?', [sha256(tok)]);
  }
  sessionCookie(ctx, '', 0);
  return true;
};

H.currentUser = async (ctx) => publicUser(await sessionUser(ctx));

H.sessionInfo = async (ctx) => {
  await requireUser(ctx);
  return sessionState(ctx);
};
// Kişi panelde bir şey yaptı (tıklama, yazma): süreyi uzatır
H.touchSession = async (ctx) => {
  await requireUser(ctx);
  return sessionState(ctx);
};

H.publicConfig = async () => ({ mailEnabled: config.mail.provider !== 'none' });

function checkStrong(pw) {
  const p = passwordProblem(pw);
  if (p) fail(p);
}

H.changePassword = async (ctx, oldPassword, newPassword) => {
  const user = await requireUser(ctx);
  if (!rateLimit(`pw:${user.id}`, 10, 15 * 60000)) fail('Çok fazla deneme yaptınız. Lütfen biraz bekleyin.', 'sinir', 429);
  if (!(await verifyPassword(oldPassword, user.passHash))) fail('Mevcut şifre hatalı.');
  checkStrong(newPassword);
  if (oldPassword === newPassword) fail('Yeni şifre eskisiyle aynı olamaz.');
  const hash = await hashPassword(newPassword);
  const current = sha256(ctx.cookies[SESSION_COOKIE] || '');
  await ctx.db.tx(async (q) => {
    await q('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?', [hash, user.id]);
    // Diğer cihazlardaki oturumları kapat
    await q('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [user.id, current]);
    await log(q, user.id, 'Şifresini değiştirdi');
  });
  return true;
};

H.requestPasswordReset = async (ctx, email) => {
  const e = str(email, 190).toLowerCase();
  if (!rateLimit(`reset:ip:${ctx.ip}`, 5, 15 * 60000) || !rateLimit(`reset:mail:${e}`, 3, 60 * 60000)) return true;
  const user = mapUser((await ctx.db.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL AND active = 1', [e]))[0]);
  if (!user) return true; // Hesap var/yok bilgisi sızdırılmaz
  const tok = randomToken(32);
  await ctx.db.tx(async (q) => {
    await q('DELETE FROM reset_tokens WHERE user_id = ?', [user.id]);
    await q('INSERT INTO reset_tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)', [sha256(tok), user.id, now()]);
    await mail(q, user.email, 'Batilmer Form Paneli – Şifre sıfırlama', `Şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın (1 saat geçerli):\n${config.publicUrl}/sifre-sifirla/${tok}\n\nBu isteği siz yapmadıysanız bu maili dikkate almayın.`, 'sifre');
  });
  return true;
};

H.resetPassword = async (ctx, resetToken, newPassword) => {
  if (!rateLimit(`resetuse:ip:${ctx.ip}`, 10, 15 * 60000)) fail('Çok fazla deneme yaptınız.', 'sinir', 429);
  const rec = (await ctx.db.query('SELECT * FROM reset_tokens WHERE token_hash = ?', [sha256(String(resetToken || ''))]))[0];
  if (!rec || now() - Number(rec.created_at) > 3600000) fail('Bağlantının süresi dolmuş. Lütfen tekrar şifre sıfırlama isteyin.');
  checkStrong(newPassword);
  const hash = await hashPassword(newPassword);
  await ctx.db.tx(async (q) => {
    await q('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?', [hash, rec.user_id]);
    await q('DELETE FROM reset_tokens WHERE user_id = ?', [rec.user_id]);
    await q('DELETE FROM sessions WHERE user_id = ?', [rec.user_id]);
    await log(q, rec.user_id, 'Şifresini sıfırladı', ctx.ip);
  });
  return true;
};

// ---------------------------------------------------------------- iki adımlı doğrulama (Authenticator)
H.totpSetupStart = async (ctx) => {
  const user = await requireUser(ctx);
  if (user.totpEnabled) fail('İki adımlı doğrulama zaten açık.');
  const secret = newSecret();
  await ctx.db.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, user.id]);
  return { secret, url: otpauthUrl(secret, user.email) };
};

H.totpSetupConfirm = async (ctx, code) => {
  const user = await requireUser(ctx);
  if (!rateLimit(`totpsetup:${user.id}`, 10, 15 * 60000)) fail('Çok fazla deneme yaptınız. Lütfen biraz bekleyin.', 'sinir', 429);
  if (user.totpEnabled) fail('İki adımlı doğrulama zaten açık.');
  if (!user.totpSecret) fail('Önce kurulumu başlatın.');
  const step = verifyTotp(user.totpSecret, code);
  if (step === null) fail('Kod hatalı. Uygulamadaki güncel 6 haneli kodu girin (kodlar 30 saniyede bir değişir).');
  const codes = newBackupCodes();
  await ctx.db.tx(async (q) => {
    await q('UPDATE users SET totp_enabled = 1, totp_last_step = ?, backup_codes = ? WHERE id = ?', [step, S(codes.map((c) => sha256(`bk:${normBackup(c)}`))), user.id]);
    await log(q, user.id, 'İki adımlı doğrulamayı açtı');
  });
  return { backupCodes: codes };
};

H.totpStatus = async (ctx) => {
  const user = await requireUser(ctx);
  return { enabled: user.totpEnabled, required: user.role === 'admin', backupLeft: user.backupCodes.length };
};

async function checkPasswordAndCode(user, password, code) {
  if (!rateLimit(`totpchg:${user.id}`, 10, 15 * 60000)) fail('Çok fazla deneme yaptınız. Lütfen biraz bekleyin.', 'sinir', 429);
  if (!(await verifyPassword(password, user.passHash))) fail('Şifre hatalı.');
  const step = verifyTotp(user.totpSecret, code, { lastStep: user.totpLastStep });
  if (step === null) fail('Authenticator kodu hatalı.');
  return step;
}

H.regenerateBackupCodes = async (ctx, password, code) => {
  const user = await requireUser(ctx);
  if (!user.totpEnabled) fail('Önce iki adımlı doğrulamayı açın.');
  const step = await checkPasswordAndCode(user, password, code);
  const codes = newBackupCodes();
  await ctx.db.query('UPDATE users SET totp_last_step = ?, backup_codes = ? WHERE id = ?', [step, S(codes.map((c) => sha256(`bk:${normBackup(c)}`))), user.id]);
  await log(ctx.db.query, user.id, 'Yeni yedek kodlar oluşturdu');
  return { backupCodes: codes };
};

H.totpDisable = async (ctx, password, code) => {
  const user = await requireUser(ctx);
  if (user.role === 'admin') fail('Ana Admin hesaplarında iki adımlı doğrulama zorunludur, kapatılamaz.');
  if (!user.totpEnabled) return true;
  await checkPasswordAndCode(user, password, code);
  await ctx.db.query('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, backup_codes = NULL WHERE id = ?', [user.id]);
  await log(ctx.db.query, user.id, 'İki adımlı doğrulamayı kapattı');
  return true;
};

// Telefonu kaybeden kullanıcı için: Ana Admin sıfırlar, kişi bir sonraki girişte yeniden kurar
H.adminResetTotp = async (ctx, id) => {
  const admin = await requireAdmin(ctx);
  if (id === admin.id) fail('Kendi iki adımlı doğrulamanızı buradan sıfırlayamazsınız; yedek kodlarınızı kullanın ya da başka bir Ana Admin\'den isteyin.');
  return ctx.db.tx(async (q) => {
    const u = mapUser((await q('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]))[0]);
    if (!u) fail('Kullanıcı bulunamadı.', 'yok', 404);
    await q('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, backup_codes = NULL WHERE id = ?', [id]);
    await q('DELETE FROM sessions WHERE user_id = ?', [id]);
    await log(q, admin.id, 'İki adımlı doğrulamayı sıfırladı', u.email);
    return true;
  });
};

// ---------------------------------------------------------------- bildirimler
// Bir kullanıcının bildirim alacağı formlar: Ana Admin'in "Bildirim" tiki attığı formlar
async function notifyFormIds(q, user) {
  const rows = await q('SELECT p.form_id, p.perms FROM permissions p JOIN forms f ON f.id = p.form_id WHERE p.user_id = ? AND f.deleted_at IS NULL', [user.id]);
  const out = {};
  for (const r of rows) {
    const p = J(r.perms, {});
    if (!p.notify) continue;
    if (user.role === 'admin') out[r.form_id] = { view: true, randevu: true };
    else if (p.view) out[r.form_id] = { view: true, randevu: !!p.randevu };
  }
  return out;
}

H.pushConfig = async (ctx) => {
  await requireUser(ctx);
  return { publicKey: await vapidPublicKey(ctx.db) };
};

H.savePushSubscription = async (ctx, sub = {}, label = '') => {
  const user = await requireUser(ctx);
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!endpointAllowed(endpoint) || endpoint.length > 2000) fail('Bu tarayıcının bildirim adresi desteklenmiyor.');
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,40}$/.test(auth)) fail('Geçersiz bildirim anahtarı.');
  if (!rateLimit(`pushsub:${user.id}`, 20, 60 * 60000)) fail('Çok fazla deneme yaptınız.', 'sinir', 429);
  const hash = sha256(endpoint);
  await ctx.db.tx(async (q) => {
    // Aynı cihaz başka bir hesapla kayıtlıysa o kaydı bu hesaba devret
    await q('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [hash]);
    await q('INSERT INTO push_subscriptions (id, user_id, endpoint_hash, endpoint, p256dh, auth, label, created_at, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)', [
      uid('p_'), user.id, hash, endpoint, p256dh, auth, str(label, 150), now()
    ]);
    // Kişi başı en fazla 10 cihaz
    const all = await q('SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
    for (const r of all.slice(10)) await q('DELETE FROM push_subscriptions WHERE id = ?', [r.id]);
    await log(q, user.id, 'Bildirimleri açtı', str(label, 150));
  });
  return true;
};

H.deletePushSubscription = async (ctx, endpoint) => {
  const user = await requireUser(ctx);
  await ctx.db.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [user.id, sha256(String(endpoint || ''))]);
  return true;
};

H.myNotificationSettings = async (ctx, endpoint = '') => {
  const user = await requireUser(ctx);
  const q = ctx.db.query;
  const ids = await notifyFormIds(q, user);
  const formIds = Object.keys(ids);
  const forms = formIds.length ? await q(`SELECT id, name, isletme FROM forms WHERE deleted_at IS NULL AND id IN (${ph(formIds)}) ORDER BY name`, formIds) : [];
  const devices = await q('SELECT id, endpoint_hash, label, created_at, last_ok_at, fail_count FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
  const mine = endpoint ? sha256(String(endpoint)) : '';
  return {
    enabled: user.notifyEnabled,
    forms: forms.map((f) => ({ id: f.id, name: f.name, isletme: f.isletme })),
    devices: devices.map((d) => ({ id: d.id, label: d.label, createdAt: num(d.created_at), lastOkAt: num(d.last_ok_at), failing: Number(d.fail_count) > 0, thisDevice: d.endpoint_hash === mine }))
  };
};

H.setNotifyEnabled = async (ctx, enabled) => {
  const user = await requireUser(ctx);
  await ctx.db.query('UPDATE users SET notify_enabled = ? WHERE id = ?', [enabled ? 1 : 0, user.id]);
  await log(ctx.db.query, user.id, enabled ? 'Bildirimlerini açtı' : 'Bildirimlerini kapattı');
  return !!enabled;
};

H.deleteMyDevice = async (ctx, id) => {
  const user = await requireUser(ctx);
  await ctx.db.query('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?', [String(id || ''), user.id]);
  return true;
};

H.sendTestNotification = async (ctx) => {
  const user = await requireUser(ctx);
  if (!rateLimit(`pushtest:${user.id}`, 5, 10 * 60000)) fail('Çok fazla deneme bildirimi gönderdiniz. Lütfen biraz bekleyin.', 'sinir', 429);
  return sendTestPush(ctx.db, user.id);
};

// Panel açıkken 15 saniyede bir çağrılır (arka plan isteği: oturum süresini uzatmaz)
H.pollNotifications = async (ctx, since = 0) => {
  const user = await requireUser(ctx);
  const q = ctx.db.query;
  const ids = await notifyFormIds(q, user);
  const formIds = Object.keys(ids);
  let items = [];
  let unread = 0;
  if (formIds.length) {
    const from = Math.max(Number(since) || 0, now() - 30 * 864e5);
    const rows = await q(`SELECT * FROM notifications WHERE form_id IN (${ph(formIds)}) AND created_at > ? ORDER BY created_at DESC LIMIT 50`, [...formIds, from]);
    const allowed = (r) => (r.kind === 'kayit' ? ids[r.form_id].view : ids[r.form_id].randevu);
    items = rows.filter(allowed).map((r) => ({ id: r.id, formId: r.form_id, kind: r.kind, title: r.title, body: r.body, url: r.url, at: num(r.created_at) }));
    const seen = Math.max(user.notifSeenAt || 0, now() - 7 * 864e5);
    const unreadRows = await q(`SELECT form_id, kind FROM notifications WHERE form_id IN (${ph(formIds)}) AND created_at > ? LIMIT 100`, [...formIds, seen]);
    unread = unreadRows.filter(allowed).length;
  }
  return { items, unread, enabled: user.notifyEnabled, hasForms: formIds.length > 0, session: sessionState(ctx), serverTime: now() };
};

H.markNotificationsSeen = async (ctx) => {
  const user = await requireUser(ctx);
  await ctx.db.query('UPDATE users SET notif_seen_at = ? WHERE id = ?', [now(), user.id]);
  return true;
};

// ---------------------------------------------------------------- kullanıcılar (Ana Admin)
H.listUsers = async (ctx) => {
  await requireAdmin(ctx);
  const users = (await ctx.db.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at')).map(mapUser);
  const perms = await ctx.db.query('SELECT user_id, perms FROM permissions');
  const devices = Object.fromEntries((await ctx.db.query('SELECT user_id, COUNT(*) AS c FROM push_subscriptions GROUP BY user_id')).map((r) => [r.user_id, Number(r.c)]));
  return users.map((u) => {
    const mine = perms.filter((p) => p.user_id === u.id).map((p) => J(p.perms, {}));
    return {
      ...publicUser(u),
      createdAt: u.createdAt,
      formCount: mine.filter((p) => p.view).length,
      notifyFormCount: mine.filter((p) => p.notify && (u.role === 'admin' || p.view)).length,
      pushDevices: devices[u.id] || 0
    };
  });
};

// En az bir aktif Ana Admin her zaman kalmalı
async function mustKeepAnotherAdmin(q, exceptId) {
  const rows = await q("SELECT id FROM users WHERE role = 'admin' AND active = 1 AND deleted_at IS NULL AND id <> ?", [exceptId]);
  if (!rows.length) fail('En az bir aktif Ana Admin kalmalı.');
}

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

H.createUser = async (ctx, { name, email, password, role } = {}) => {
  const admin = await requireAdmin(ctx);
  const e = str(email, 190).toLowerCase();
  if (!str(name)) fail('Ad Soyad zorunlu.');
  if (!emailOk(e)) fail('Geçerli bir e-posta girin.');
  checkStrong(password);
  const hash = await hashPassword(password);
  return ctx.db.tx(async (q) => {
    if ((await q('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [e])).length) fail('Bu e-posta ile bir kullanıcı zaten var.');
    const r = role === 'admin' ? 'admin' : 'user';
    const u = { id: uid('u_'), name: str(name, 150), email: e, role: r, mustChange: true, active: true };
    await q('INSERT INTO users (id, name, email, pass_hash, role, must_change, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [u.id, u.name, e, hash, r, 1, 1, now()]);
    await log(q, admin.id, r === 'admin' ? 'Ana Admin ekledi' : 'Kullanıcı ekledi', e);
    await mail(q, e, 'Batilmer Form Paneli hesabınız açıldı', `Merhaba ${u.name},\n\nPanel adresi: ${config.publicUrl}/giris\nKullanıcı adınız: ${e}\nGeçici şifreniz size ayrıca iletilecektir. İlk girişte şifrenizi değiştirmeniz istenecek.`, 'hesap');
    return publicUser(u);
  });
};

H.updateUser = async (ctx, id, { name, email, active } = {}) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const u = mapUser((await q('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]))[0]);
    if (!u) fail('Kullanıcı bulunamadı.', 'yok', 404);
    if (u.role === 'admin' && active === false) {
      if (u.id === admin.id) fail('Kendi hesabınızı pasif yapamazsınız.');
      await mustKeepAnotherAdmin(q, u.id);
    }
    if (email !== undefined) {
      const e = str(email, 190).toLowerCase();
      if (!emailOk(e)) fail('Geçerli bir e-posta girin.');
      if ((await q('SELECT id FROM users WHERE email = ? AND id <> ? AND deleted_at IS NULL', [e, id])).length) fail('Bu e-posta başka bir kullanıcıda kayıtlı.');
      u.email = e;
    }
    if (name !== undefined && str(name)) u.name = str(name, 150);
    if (active !== undefined) u.active = !!active;
    await q('UPDATE users SET name = ?, email = ?, active = ? WHERE id = ?', [u.name, u.email, u.active ? 1 : 0, id]);
    if (!u.active) await q('DELETE FROM sessions WHERE user_id = ?', [id]);
    await log(q, admin.id, 'Kullanıcıyı güncelledi', u.email);
    return publicUser(u);
  });
};

H.adminSetPassword = async (ctx, id, password) => {
  const admin = await requireAdmin(ctx);
  checkStrong(password);
  const hash = await hashPassword(password);
  return ctx.db.tx(async (q) => {
    const u = mapUser((await q('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]))[0]);
    if (!u) fail('Kullanıcı bulunamadı.', 'yok', 404);
    await q('UPDATE users SET pass_hash = ?, must_change = 1 WHERE id = ?', [hash, id]);
    await q('DELETE FROM sessions WHERE user_id = ?', [id]);
    await log(q, admin.id, 'Kullanıcının şifresini sıfırladı', u.email);
    return true;
  });
};

H.deleteUser = async (ctx, id) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const u = mapUser((await q('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]))[0]);
    if (!u) fail('Kullanıcı bulunamadı.', 'yok', 404);
    if (u.role === 'admin') {
      if (u.id === admin.id) fail('Kendi hesabınızı silemezsiniz.');
      await mustKeepAnotherAdmin(q, u.id);
    }
    await q('UPDATE users SET deleted_at = ?, active = 0 WHERE id = ?', [now(), id]);
    await q('DELETE FROM push_subscriptions WHERE user_id = ?', [id]);
    await q('DELETE FROM sessions WHERE user_id = ?', [id]);
    await log(q, admin.id, 'Kullanıcıyı sildi (çöp kutusu)', u.email);
    return true;
  });
};

// ---------------------------------------------------------------- yetkiler
H.getUserPermissions = async (ctx, userId) => {
  await requireAdmin(ctx);
  const map = {};
  for (const p of await ctx.db.query('SELECT form_id, perms FROM permissions WHERE user_id = ?', [userId])) map[p.form_id] = { ...NO_PERMS, ...J(p.perms, {}) };
  return map;
};

H.setPermission = async (ctx, userId, formId, perms = {}) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const u = mapUser((await q('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [userId]))[0]);
    const f = await loadForm(q, formId);
    if (!u || !f) fail('Kullanıcı veya form bulunamadı.', 'yok', 404);
    const cleanPerms = {};
    if (u.role === 'admin') {
      // Ana Admin her formu zaten görür; burada sadece "bildirim alsın" tiki saklanır
      cleanPerms.notify = !!perms.notify;
    } else {
      for (const k of Object.keys(NO_PERMS)) cleanPerms[k] = !!perms[k];
      if (!cleanPerms.view) Object.keys(cleanPerms).forEach((k) => (cleanPerms[k] = false));
    }
    await q('DELETE FROM permissions WHERE user_id = ? AND form_id = ?', [userId, formId]);
    await q('INSERT INTO permissions (user_id, form_id, perms) VALUES (?, ?, ?)', [userId, formId, S(cleanPerms)]);
    await log(q, admin.id, 'Yetki güncelledi', `${u.email} → ${f.name}`);
    return cleanPerms;
  });
};

H.myPermissions = async (ctx, formId) => permsFor(ctx.db.query, await requireUser(ctx), formId);

// ---------------------------------------------------------------- formlar
H.listForms = async (ctx) => {
  const user = await requireUser(ctx);
  const q = ctx.db.query;
  const forms = (await q('SELECT * FROM forms WHERE deleted_at IS NULL ORDER BY updated_at DESC')).map(mapForm);
  const t = today();
  const dayStart = dateTimeToMs(t, '00:00');
  const totals = Object.fromEntries((await q('SELECT form_id, COUNT(*) AS c FROM submissions WHERE deleted_at IS NULL GROUP BY form_id')).map((r) => [r.form_id, Number(r.c)]));
  const todays = Object.fromEntries((await q('SELECT form_id, COUNT(*) AS c FROM submissions WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY form_id', [dayStart, dayStart + 864e5])).map((r) => [r.form_id, Number(r.c)]));
  const upcoming = Object.fromEntries((await q(`SELECT form_id, COUNT(*) AS c FROM appointments WHERE date >= ? AND status IN ${ACTIVE_SQL} GROUP BY form_id`, [t])).map((r) => [r.form_id, Number(r.c)]));
  const out = [];
  for (const f of forms) {
    const perms = await permsFor(q, user, f.id);
    if (!perms.view) continue;
    out.push({
      id: f.id, name: f.name, isletme: f.isletme, slug: f.slug, control: f.control, publishedAt: f.publishedAt,
      hasDraftChanges: JSON.stringify(f.draft) !== JSON.stringify(f.published), updatedAt: f.updatedAt,
      total: totals[f.id] || 0, todayCount: todays[f.id] || 0, upcomingAppointments: upcoming[f.id] || 0,
      hasRandevu: content(f).fields.some((x) => x.type === 'randevu'), perms
    });
  }
  return out;
};

H.getForm = async (ctx, id) => {
  const { form, perms } = await requirePerm(ctx, ctx.db.query, id, 'view');
  return { ...form, perms };
};

H.createForm = async (ctx, { name, isletme, slug, templateId } = {}) => {
  const admin = await requireAdmin(ctx);
  if (!str(name)) fail('Form adı zorunlu.');
  const s = slugify(slug || `${isletme || ''} ${name}`);
  if (!s) fail('Geçerli bir form linki girin.');
  return ctx.db.tx(async (q) => {
    if ((await q('SELECT id FROM forms WHERE slug = ? AND deleted_at IS NULL', [s])).length) fail('Bu form linki kullanılıyor, başka bir link seçin.');
    const c = buildFormContent(templateId);
    c.settings.title = str(name, 200);
    const id = uid('f_');
    await q('INSERT INTO forms (id, name, isletme, slug, control, draft, published, published_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)', [
      id, str(name, 200), str(isletme, 200), s, S(DEFAULT_CONTROL), S(c), admin.id, now(), now()
    ]);
    await log(q, admin.id, 'Form oluşturdu', str(name, 200));
    return id;
  });
};

H.updateFormMeta = async (ctx, id, { name, isletme, slug } = {}) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const f = await loadForm(q, id, { lock: true });
    if (!f) fail('Form bulunamadı.', 'yok', 404);
    if (slug !== undefined) {
      const s = slugify(slug);
      if (!s) fail('Geçerli bir form linki girin.');
      if ((await q('SELECT id FROM forms WHERE slug = ? AND id <> ? AND deleted_at IS NULL', [s, id])).length) fail('Bu form linki kullanılıyor.');
      if (s !== f.slug) await log(q, admin.id, 'Form linkini değiştirdi', `${f.slug} → ${s}`);
      f.slug = s;
    }
    if (name !== undefined && str(name)) f.name = str(name, 200);
    if (isletme !== undefined) f.isletme = str(isletme, 200);
    await q('UPDATE forms SET name = ?, isletme = ?, slug = ?, updated_at = ? WHERE id = ?', [f.name, f.isletme, f.slug, now(), id]);
    return true;
  });
};

function cleanDraft(draft, prev, user) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.fields)) fail('Geçersiz form içeriği.');
  if (S(draft).length > 2_000_000) fail('Form içeriği çok büyük.');
  const next = normalizeContent(clone(draft));
  // KVKK ayarlarını sadece Ana Admin değiştirebilir
  if (user.role !== 'admin') {
    next.settings.kvkk = clone(prev.settings.kvkk);
    // Müşteriye mail ve SMS ücretli ek özellik: sadece Ana Admin açıp kapatır
    next.settings.customerMails = !!prev.settings.customerMails;
    next.randevu.sms = clone(prev.randevu.sms);
  }
  if (next.randevu.openFrom && !/^\d{4}-\d{2}-\d{2}$/.test(next.randevu.openFrom)) next.randevu.openFrom = '';
  next.randevu.term = str(next.randevu.term, 40);
  const keys = next.fields.map((x) => x.key);
  if (keys.some((k) => !/^[a-z0-9_]{1,60}$/.test(String(k)))) fail('Alan anahtarları sadece küçük harf, rakam ve alt çizgi içerebilir.');
  if (new Set(keys).size !== keys.length) fail('İki alanın teknik anahtarı aynı olamaz.');
  if (next.fields.filter((x) => x.type === 'randevu').length > 1) fail('Bir formda en fazla bir randevu alanı olabilir.');
  for (const fld of next.fields) {
    if (['select', 'radio', 'checkbox'].includes(fld.type)) {
      fld.options = (fld.options || []).map((o) => String(o).trim()).filter(Boolean);
      if (!fld.options.length) fail(`"${fld.label}" alanına en az bir seçenek ekleyin.`);
    }
    if (fld.type === 'dosya') fld.maxMB = Math.min(config.maxUploadMB, Math.max(1, Number(fld.maxMB) || 2));
  }
  return next;
}

H.saveDraft = async (ctx, id, draft) => {
  return ctx.db.tx(async (q) => {
    const { user, form } = await requirePerm(ctx, q, id, 'edit', { lock: true });
    const next = cleanDraft(draft, form.draft, user);
    await q('UPDATE forms SET draft = ?, updated_at = ? WHERE id = ?', [S(next), now(), id]);
    return true;
  });
};

async function findAffectedAppointments(q, form, cfg) {
  const rows = (await q("SELECT * FROM appointments WHERE form_id = ? AND date >= ? AND status IN ('bekliyor','onaylandi')", [form.id, today()])).map(mapAppt);
  return rows.filter((a) => {
    if ((cfg.closedDates || []).includes(a.date)) return true;
    const ranges = cfg.hours?.[dayOfWeek(a.date)] || [];
    return !ranges.some((r) => r.start <= a.start && a.end <= r.end);
  });
}

H.previewPublishImpact = async (ctx, id) => {
  const { form } = await requirePerm(ctx, ctx.db.query, id, 'edit');
  return (await findAffectedAppointments(ctx.db.query, form, form.draft.randevu)).map(panelAppt);
};

H.publishForm = async (ctx, id, { note = '', cancelAffected = false } = {}) => {
  return ctx.db.tx(async (q) => {
    const { user, form } = await requirePerm(ctx, q, id, 'edit', { lock: true });
    const pub = clone(form.draft);
    await q('UPDATE forms SET published = ?, published_at = ?, updated_at = ? WHERE id = ?', [S(pub), now(), now(), id]);
    await q('INSERT INTO form_versions (id, form_id, snapshot, by_user, by_name, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)', [uid('v_'), id, S(pub), user.id, user.name, str(note), now()]);
    await log(q, user.id, 'Formu yayınladı', form.name);
    if (cancelAffected) {
      const affected = await findAffectedAppointments(q, form, pub.randevu);
      for (const a of affected) {
        await q("UPDATE appointments SET status = 'iptal', cancelled_by = 'isletme' WHERE id = ?", [a.id]);
        if (a.contact?.email && customerMails(pub)) {
          const lang = a.lang || 'tr';
          await mail(q, a.contact.email, tt(lang, 'mailCancelledSubject', { x: form.isletme || form.name }), tt(lang, 'mailCancelledBody', { d: `${a.date} ${a.start}`, u: `${config.publicUrl}/f/${form.slug}` }), 'randevu');
        }
      }
      if (affected.length) await log(q, user.id, `${affected.length} randevuyu iptal etti (saat değişikliği)`, form.name);
    }
    if (user.role !== 'admin' && pub.settings.notifyAdminOnEdit) {
      const admins = (await q("SELECT email FROM users WHERE role = 'admin' AND deleted_at IS NULL")).map((r) => r.email);
      await mail(q, admins, `Form düzenlendi: ${form.name}`, `${user.name} (${user.email}) formu düzenleyip yayınladı.`, 'bilgi');
    }
    return true;
  });
};

H.updateControl = async (ctx, id, control = {}) => {
  return ctx.db.tx(async (q) => {
    const { user, form } = await requirePerm(ctx, q, id, 'edit', { lock: true });
    const c = { ...form.control };
    if (control.status !== undefined) c.status = control.status === 'aktif' ? 'aktif' : 'pasif';
    for (const k of ['startDate', 'endDate']) if (control[k] !== undefined) c[k] = /^\d{4}-\d{2}-\d{2}$/.test(control[k]) ? control[k] : '';
    if (control.quota !== undefined) c.quota = control.quota === '' || control.quota === null ? '' : String(Math.max(1, parseInt(control.quota, 10) || 1));
    if (control.closedMessage !== undefined) c.closedMessage = str(control.closedMessage, 500);
    await q('UPDATE forms SET control = ?, updated_at = ? WHERE id = ?', [S(c), now(), id]);
    await log(q, user.id, 'Form durumunu güncelledi', `${form.name}: ${c.status}`);
    return c;
  });
};

H.discardDraft = async (ctx, id) => {
  return ctx.db.tx(async (q) => {
    const { form } = await requirePerm(ctx, q, id, 'edit', { lock: true });
    if (form.published) await q('UPDATE forms SET draft = ?, updated_at = ? WHERE id = ?', [S(form.published), now(), id]);
    return clone(form.published || form.draft);
  });
};

H.fieldUsage = async (ctx, formId) => {
  await requirePerm(ctx, ctx.db.query, formId, 'edit');
  const counts = {};
  for (const r of await ctx.db.query('SELECT vals FROM submissions WHERE form_id = ? AND deleted_at IS NULL', [formId])) {
    for (const k of Object.keys(J(r.vals, {}))) counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
};

H.listVersions = async (ctx, formId) => {
  await requirePerm(ctx, ctx.db.query, formId, 'edit');
  const rows = await ctx.db.query('SELECT * FROM form_versions WHERE form_id = ? ORDER BY at DESC LIMIT 100', [formId]);
  return rows.map((v) => ({ id: v.id, by: v.by_name, at: num(v.at), note: v.note, fieldCount: (J(v.snapshot, {}).fields || []).length }));
};

H.restoreVersion = async (ctx, versionId) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const v = (await q('SELECT * FROM form_versions WHERE id = ?', [versionId]))[0];
    if (!v) fail('Sürüm bulunamadı.', 'yok', 404);
    const form = await loadForm(q, v.form_id, { lock: true });
    if (!form) fail('Form bulunamadı.', 'yok', 404);
    await q('UPDATE forms SET draft = ?, updated_at = ? WHERE id = ?', [v.snapshot, now(), form.id]);
    await log(q, admin.id, 'Eski sürümü taslağa geri yükledi', form.name);
    return true;
  });
};

H.duplicateForm = async (ctx, id) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const f = await loadForm(q, id);
    if (!f) fail('Form bulunamadı.', 'yok', 404);
    let slug = `${f.slug}-kopya`;
    for (let i = 2; (await q('SELECT id FROM forms WHERE slug = ? AND deleted_at IS NULL', [slug])).length; i++) slug = `${f.slug}-kopya-${i}`;
    const newId = uid('f_');
    await q('INSERT INTO forms (id, name, isletme, slug, control, draft, published, published_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)', [
      newId, `${f.name} (kopya)`.slice(0, 200), f.isletme, slug, S({ ...f.control, status: 'pasif' }), S(f.draft), admin.id, now(), now()
    ]);
    await log(q, admin.id, 'Formu kopyaladı', f.name);
    return newId;
  });
};

H.deleteForm = async (ctx, id) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    const f = await loadForm(q, id, { lock: true });
    if (!f) fail('Form bulunamadı.', 'yok', 404);
    await q('UPDATE forms SET deleted_at = ? WHERE id = ?', [now(), id]);
    await log(q, admin.id, 'Formu sildi (çöp kutusu)', f.name);
    return true;
  });
};

// ---------------------------------------------------------------- herkese açık form
async function formBySlug(q, slug, { lock = false } = {}) {
  const rows = await q(`SELECT * FROM forms WHERE slug = ? AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`, [String(slug || '').slice(0, 80)]);
  return mapForm(rows[0]);
}

H.getPublicForm = async (ctx, slug) => {
  const form = await formBySlug(ctx.db.query, slug);
  if (!form) return null;
  const state = await formIsOpen(ctx.db.query, form);
  const c = clone(content(form));
  return { id: form.id, slug: form.slug, name: form.name, isletme: form.isletme, content: c, lang: c.settings.language || 'tr', turnstileKey: config.turnstile.siteKey, ...state };
};

async function dayData(q, formId, date) {
  const appts = (await q('SELECT * FROM appointments WHERE form_id = ? AND date = ?', [formId, date])).map(mapAppt);
  const blocks = (await q('SELECT * FROM blocks WHERE form_id = ? AND date = ?', [formId, date])).map((b) => ({ id: b.id, date: b.date, start: b.start, end: b.end_time, resourceId: b.resource_id, note: b.note }));
  return { appts, blocks };
}

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

H.getAvailability = async (ctx, slug, { date, serviceId, resourceId, partySize } = {}) => {
  if (!isDate(date)) return [];
  const form = await formBySlug(ctx.db.query, slug);
  if (!form?.published) return [];
  const { appts, blocks } = await dayData(ctx.db.query, form.id, date);
  return getSlots(form.published.randevu, appts, blocks, { date, serviceId, resourceId: resourceId || null, partySize: Number(partySize || 1) });
};

H.submitForm = async (ctx, slug, values = {}, meta = {}) => {
  const { honeypot = '', startedAt = 0, kvkkAccepted = false, turnstileToken = '' } = meta || {};
  const pre = await formBySlug(ctx.db.query, slug);
  const lang = pre?.published?.settings?.language || 'tr';
  // Bot: gizli alan doluysa ya da 2 saniyeden hızlı gönderildiyse sessizce "başarılı" de, kaydetme
  if (honeypot || (startedAt && now() - Number(startedAt) < 2000)) return { ok: true, spam: true };
  if (!rateLimit(`submit:${ctx.ip}`, 10, 10 * 60000)) fail(tt(lang, 'rateLimited'), 'sinir', 429);
  if (config.turnstile.siteKey) {
    if (!turnstileToken || !(await verifyTurnstile(turnstileToken, ctx.ip))) fail(tt(lang, 'verifyFailed'), 'dogrulama_bot');
  }
  if (!pre) fail(tt(lang, 'notFound'), 'yok', 404);
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail(tt(lang, 'genericError'));

  // Dosyaları çöz ve kontrol et (diske yazma işlem içinde)
  const fieldsPre = (pre.published || pre.draft).fields;
  const visPre = visibilityMap(fieldsPre, values);
  const uploads = {};
  for (const f of fieldsPre) {
    const v = values[f.key];
    if (f.type !== 'dosya' || !visPre[f.key] || !v) continue;
    const dec = decodeDataUrl(v.dataUrl);
    const ext = fileExt(v.name);
    const maxMB = Math.min(config.maxUploadMB, Number(f.maxMB || 2));
    const accept = f.accept?.length ? f.accept : ['pdf', 'jpg', 'png'];
    const bad = () => {
      const e = new ApiError(tt(lang, 'checkFields'), 'dogrulama');
      e.fields = { [f.key]: tt(lang, 'fileType', { n: accept.join(', ').toUpperCase() }) };
      throw e;
    };
    if (!dec || !accept.includes(ext) || !sniffMatches(ext, dec.buffer)) bad();
    if (dec.buffer.length > maxMB * 1024 * 1024) {
      const e = new ApiError(tt(lang, 'checkFields'), 'dogrulama');
      e.fields = { [f.key]: tt(lang, 'fileSize', { n: maxMB }) };
      throw e;
    }
    uploads[f.key] = { id: uid('file_'), name: str(v.name, 150).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'), mime: dec.mime, buffer: dec.buffer };
    // Doğrulama metadata ile yapılsın
    values[f.key] = { name: uploads[f.key].name, size: dec.buffer.length, type: dec.mime, dataUrl: 'data:' };
  }

  const written = [];
  try {
    return await ctx.db.tx(async (q) => {
      const form = await formBySlug(q, slug, { lock: true });
      if (!form) fail(tt(lang, 'notFound'), 'yok', 404);
      const state = await formIsOpen(q, form);
      if (!state.open) fail(state.reason || tt(lang, 'formClosed'), 'kapali');
      const c = form.published;
      const fields = c.fields;
      const errors = validateAll(fields, values, lang);
      if (Object.keys(errors).length) {
        const e = new ApiError(tt(lang, 'checkFields'), 'dogrulama');
        e.fields = errors;
        throw e;
      }
      if (c.settings.kvkk?.enabled && !kvkkAccepted) fail(tt(lang, 'consentRequired'));

      const vis = visibilityMap(fields, values);
      const clean = {};
      for (const f of fields) {
        if (!vis[f.key]) continue;
        const v = values[f.key];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
        if (f.type === 'dosya') {
          const up = uploads[f.key];
          if (!up) continue;
          clean[f.key] = { fileId: up.id, name: up.name, size: up.buffer.length, type: up.mime };
        } else if (f.type === 'randevu') {
          clean[f.key] = { date: String(v.date || ''), time: String(v.time || ''), serviceId: String(v.serviceId || ''), resourceId: v.resourceId ? String(v.resourceId) : null, partySize: Math.max(1, parseInt(v.partySize, 10) || 1) };
        } else if (Array.isArray(v)) clean[f.key] = v.map((x) => str(x, 300));
        else clean[f.key] = str(v, 5000);
      }

      // Mükerrer kayıt
      const dup = c.settings.duplicateCheck;
      if (dup && dup !== 'yok') {
        const fld = fields.find((f) => f.type === dup);
        if (fld && clean[fld.key]) {
          const norm = (x) => String(x).replace(/\s/g, '').toLowerCase();
          const target = norm(clean[fld.key]);
          const rows = await q('SELECT vals FROM submissions WHERE form_id = ? AND deleted_at IS NULL', [form.id]);
          if (rows.some((r) => {
            const v = J(r.vals, {})[fld.key];
            return v && norm(v) === target;
          })) fail(tt(lang, 'duplicate'), 'mukerrer');
        }
      }

      const contact = contactFrom(fields, clean);
      const sub = {
        id: uid('s_'), formId: form.id, values: clean,
        labels: Object.fromEntries(fields.map((f) => [f.key, f.label])),
        types: Object.fromEntries(fields.map((f) => [f.key, f.type])),
        order: fields.map((f) => f.key),
        kvkkAt: c.settings.kvkk?.enabled ? now() : null, appointmentId: null
      };

      // Randevu: form satırı kilitli olduğu için aynı anda iki kişi aynı saati alamaz
      const rField = fields.find((f) => f.type === 'randevu' && vis[f.key]);
      let appt = null;
      const biz = form.isletme || form.name;
      if (rField && clean[rField.key]) {
        const cfg = c.randevu;
        const r = clean[rField.key];
        if (!isDate(r.date)) fail(tt(lang, 'pickSlot'));
        if (Number(cfg.perContactLimit) > 0 && (contact.email || contact.phone)) {
          const act = (await q(`SELECT contact FROM appointments WHERE form_id = ? AND date >= ? AND status IN ${PENDING_SQL}`, [form.id, today()])).map((x) => J(x.contact, {}));
          const mine = act.filter((x) => (contact.email && x.email === contact.email) || (contact.phone && x.phone === contact.phone));
          if (mine.length >= Number(cfg.perContactLimit)) fail(tt(lang, 'contactLimit', { n: cfg.perContactLimit }), 'sinir');
        }
        const { appts, blocks } = await dayData(q, form.id, r.date);
        const check = checkSlot(cfg, appts, blocks, { date: r.date, time: r.time, serviceId: r.serviceId, resourceId: r.resourceId, partySize: r.partySize });
        if (!check.ok) throw new ApiError(tt(lang, 'slotTaken'), 'saat_doldu', 409);
        const svc = serviceById(cfg, r.serviceId);
        appt = {
          id: uid('a_'), formId: form.id, submissionId: sub.id, serviceId: svc.id, resourceId: check.resourceId, date: r.date, start: r.time,
          end: endTime(cfg, svc.id, r.time), buffer: Number(svc.buffer || 0), partySize: r.partySize,
          status: cfg.approval === 'manual' ? 'bekliyor' : 'onaylandi', cancelToken: randomToken(16), contact, lang
        };
        await q('INSERT INTO appointments (id, form_id, submission_id, service_id, resource_id, date, start, end_time, buffer, party_size, status, cancel_token, reminder_sent, contact, lang, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)', [
          appt.id, form.id, sub.id, appt.serviceId, appt.resourceId, appt.date, appt.start, appt.end, appt.buffer, appt.partySize, appt.status, appt.cancelToken, S(contact), lang, 'form', now()
        ]);
        sub.appointmentId = appt.id;
        clean[rField.key] = { ...r, serviceId: svc.id, resourceId: check.resourceId };
        const pending = appt.status === 'bekliyor';
        if (contact.email && customerMails(c)) {
          await mail(q, contact.email, tt(lang, pending ? 'mailRequestSubject' : 'mailConfirmSubject', { x: biz }), appointmentMailBody(form, appt, cfg, pending ? tt(lang, 'mailPendingText') : tt(lang, 'statusLabels').onaylandi, lang), 'randevu');
        }
        if (cfg.sms?.confirm && contact.phone) await sms(q, contact.phone, tt(lang, pending ? 'smsPending' : 'smsConfirm', { x: biz, d: `${appt.date} ${appt.start}`, u: cancelUrl(appt) }));
      }

      // Dosyaları diske yaz
      for (const up of Object.values(uploads)) {
        if (!Object.values(clean).some((v) => v && v.fileId === up.id)) continue;
        await writeUpload(up.id, up.buffer);
        written.push(up.id);
        await q('INSERT INTO files (id, form_id, submission_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [up.id, form.id, sub.id, up.name, up.mime, up.buffer.length, now()]);
      }

      await q('INSERT INTO submissions (id, form_id, vals, labels, types, ord, status, notes, appointment_id, manual, kvkk_at, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)', [
        sub.id, form.id, S(clean), S(sub.labels), S(sub.types), S(sub.order), 'yeni', '[]', sub.appointmentId, sub.kvkkAt, ctx.ip.slice(0, 64), str(ctx.userAgent, 255), now()
      ]);

      const ar = c.settings.autoReply;
      if (ar?.enabled && contact.email && !appt && customerMails(c)) {
        await mail(q, contact.email, fillTemplate(ar.subject, sub.labels, clean, c.randevu), fillTemplate(ar.body, sub.labels, clean, c.randevu), 'otomatik-cevap');
      }
      // Yetkili kişilere panel + telefon bildirimi (içerikte kişisel veri yok)
      await addNotice(q, form, 'yeni', appt, c.randevu);
      return {
        ok: true, afterSubmit: c.settings.afterSubmit, successMessage: c.settings.successMessage, redirectUrl: c.settings.redirectUrl,
        appointment: appt && appointmentCard(form, appt, c.randevu, lang)
      };
    });
  } catch (e) {
    if (written.length) await removeUploads(written);
    throw e;
  }
};

// ---------------------------------------------------------------- kayıtlar
async function apptStatusMap(q, formId) {
  return Object.fromEntries((await q('SELECT id, status FROM appointments WHERE form_id = ?', [formId])).map((r) => [r.id, r.status]));
}

H.listSubmissions = async (ctx, formId, { q: search = '', from = '', to = '', status = '' } = {}) => {
  const q = ctx.db.query;
  const { form, perms } = await requirePerm(ctx, q, formId, 'view');
  const c = content(form);
  const cfg = c.randevu;
  const where = ['form_id = ?', 'deleted_at IS NULL'];
  const params = [form.id];
  if (isDate(from)) {
    where.push('created_at >= ?');
    params.push(dateTimeToMs(from, '00:00'));
  }
  if (isDate(to)) {
    where.push('created_at < ?');
    params.push(dateTimeToMs(to, '00:00') + 864e5);
  }
  if (status) {
    where.push('status = ?');
    params.push(String(status));
  }
  const query = String(search || '').trim().toLocaleLowerCase('tr');
  const statuses = await apptStatusMap(q, form.id);
  const rows = (await q(`SELECT * FROM submissions WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params))
    .map(mapSub)
    .filter((s) => {
      if (!query) return true;
      const inValues = Object.entries(s.values).some(([k, v]) => displayValue(s.types[k], v, cfg).toLocaleLowerCase('tr').includes(query));
      const inNotes = (s.notes || []).some((n) => String(n.text).toLocaleLowerCase('tr').includes(query));
      return inValues || inNotes;
    })
    .map((s) => ({ ...withFileUrls(s), appointmentStatus: s.appointmentId ? statuses[s.appointmentId] || null : null }));
  const counts = Object.fromEntries(SUBMISSION_STATUSES.map((x) => [x.value, 0]));
  for (const r of await q('SELECT status, COUNT(*) AS c FROM submissions WHERE form_id = ? AND deleted_at IS NULL GROUP BY status', [form.id])) counts[r.status || 'yeni'] = Number(r.c);
  return { rows, perms, fields: c.fields, randevu: cfg, counts };
};

async function loadSub(q, id) {
  return mapSub((await q('SELECT * FROM submissions WHERE id = ? AND deleted_at IS NULL', [id]))[0]);
}

H.setSubmissionStatus = async (ctx, id, status) => {
  if (!SUBMISSION_STATUSES.some((s) => s.value === status)) fail('Geçersiz durum.');
  return ctx.db.tx(async (q) => {
    const s = await loadSub(q, id);
    if (!s) fail('Kayıt bulunamadı.', 'yok', 404);
    const { user, form } = await requirePerm(ctx, q, s.formId, 'view');
    const prev = s.status || 'yeni';
    if (prev !== status) s.notes.push({ id: uid('n_'), by: user.name, at: now(), text: `Durum: ${submissionStatusLabel(prev)} → ${submissionStatusLabel(status)}`, system: true });
    s.status = status;
    await q('UPDATE submissions SET status = ?, notes = ? WHERE id = ?', [status, S(s.notes), id]);
    await log(q, user.id, `Kayıt durumu: ${submissionStatusLabel(status)}`, form.name);
    return withFileUrls(s);
  });
};

H.addSubmissionNote = async (ctx, id, text) => {
  const t = String(text || '').trim();
  if (!t) fail('Not boş olamaz.');
  if (t.length > 1000) fail('Not en fazla 1000 karakter olabilir.');
  return ctx.db.tx(async (q) => {
    const s = await loadSub(q, id);
    if (!s) fail('Kayıt bulunamadı.', 'yok', 404);
    const { user, form } = await requirePerm(ctx, q, s.formId, 'view');
    s.notes.push({ id: uid('n_'), by: user.name, at: now(), text: t });
    await q('UPDATE submissions SET notes = ? WHERE id = ?', [S(s.notes), id]);
    await log(q, user.id, 'Kayda not ekledi', form.name);
    return withFileUrls(s);
  });
};

H.deleteSubmission = async (ctx, id) => {
  return ctx.db.tx(async (q) => {
    const s = await loadSub(q, id);
    if (!s) fail('Kayıt bulunamadı.', 'yok', 404);
    const { user, form } = await requirePerm(ctx, q, s.formId, 'delete');
    await q('UPDATE submissions SET deleted_at = ? WHERE id = ?', [now(), id]);
    if (s.appointmentId) await q(`UPDATE appointments SET status = 'iptal', cancelled_by = 'isletme' WHERE id = ? AND status IN ${ACTIVE_SQL}`, [s.appointmentId]);
    await log(q, user.id, 'Kayıt sildi (çöp kutusu)', form.name);
    return true;
  });
};

// Excel: tarayıcı sadece hangi kayıtları istediğini (id) söyler; veriler sunucudan okunur
H.exportSubmissions = async (ctx, formId, rows = []) => {
  const q = ctx.db.query;
  const { user, form } = await requirePerm(ctx, q, formId, 'excel');
  const c = content(form);
  const cfg = c.randevu;
  const ids = (Array.isArray(rows) ? rows : []).map((r) => (typeof r === 'string' ? r : r?.id)).filter(Boolean);
  const all = new Map((await q('SELECT * FROM submissions WHERE form_id = ? AND deleted_at IS NULL', [form.id])).map((r) => [r.id, mapSub(r)]));
  const statuses = await apptStatusMap(q, form.id);
  const subs = ids.map((id) => all.get(id)).filter(Boolean).map((s) => ({ ...s, appointmentStatus: s.appointmentId ? statuses[s.appointmentId] : null }));

  const keys = [];
  const labels = {};
  const types = {};
  for (const f of c.fields) {
    keys.push(f.key);
    labels[f.key] = f.label;
    types[f.key] = f.type;
  }
  for (const s of subs) {
    for (const k of s.order || Object.keys(s.values)) {
      if (!keys.includes(k)) {
        keys.push(k);
        labels[k] = `${s.labels[k] || k} (eski alan)`;
        types[k] = s.types[k];
      }
    }
  }
  const hasResources = (cfg.resources || []).length > 0;
  const isKisi = cfg.capacityMode === 'kisi';
  const headers = ['Kayıt tarihi'];
  for (const k of keys) {
    if (types[k] === 'randevu') {
      headers.push('Randevu tarihi', 'Randevu saati', 'Hizmet');
      if (hasResources) headers.push(cfg.resourceLabel || 'Personel');
      if (isKisi) headers.push('Kişi sayısı');
      headers.push('Randevu durumu');
    } else headers.push(labels[k]);
  }
  headers.push('Kayıt durumu', 'Son not', 'KVKK onay zamanı');
  const fmt = (ms) => (ms ? formatDateTime(ms) : '');
  const data = subs.map((s) => {
    const row = [fmt(s.createdAt)];
    for (const k of keys) {
      const v = s.values[k];
      if (types[k] === 'randevu') {
        const r = v && typeof v === 'object' ? v : null;
        row.push(r?.date || '', r?.time || '', r ? serviceById(cfg, r.serviceId)?.name || '' : '');
        if (hasResources) row.push(r ? (cfg.resources || []).find((x) => x.id === r.resourceId)?.name || '' : '');
        if (isKisi) row.push(r ? String(r.partySize || 1) : '');
        row.push(s.appointmentStatus ? STATUS_LABELS[s.appointmentStatus] : '');
      } else row.push(displayValue(types[k], v, cfg));
    }
    const userNotes = (s.notes || []).filter((n) => !n.system);
    row.push(submissionStatusLabel(s.status), userNotes.length ? userNotes[userNotes.length - 1].text : '', fmt(s.kvkkAt));
    return row;
  });
  await log(q, user.id, `Excel indirdi (${subs.length} kayıt)`, form.name);
  return { headers, data, filename: `${form.slug}-kayitlar-${today()}.xlsx` };
};

H.formStats = async (ctx, formId, days = 30) => {
  const q = ctx.db.query;
  const { form, perms } = await requirePerm(ctx, q, formId, 'view');
  const d = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const c = content(form);
  const cfg = c.randevu;
  const subs = (await q('SELECT created_at, status FROM submissions WHERE form_id = ? AND deleted_at IS NULL', [form.id])).map((r) => ({ createdAt: Number(r.created_at), status: r.status || 'yeni' }));
  const start = addDays(today(), -(d - 1));
  const daily = [];
  for (let i = 0; i < d; i++) daily.push({ date: addDays(start, i), count: 0 });
  const idx = Object.fromEntries(daily.map((x, i) => [x.date, i]));
  for (const s of subs) {
    const k = dateOfMs(s.createdAt);
    if (idx[k] !== undefined) daily[idx[k]].count += 1;
  }
  const statusCounts = SUBMISSION_STATUSES.map((st) => ({ ...st, count: subs.filter((s) => s.status === st.value).length }));
  let randevu = null;
  if (c.fields.some((f) => f.type === 'randevu') && perms.randevu) {
    const appts = (await q('SELECT service_id, status, date FROM appointments WHERE form_id = ? AND date >= ?', [form.id, start])).map((r) => ({ serviceId: r.service_id, status: r.status, date: r.date }));
    const inRange = appts.filter((a) => a.date <= today());
    const geldi = inRange.filter((a) => a.status === 'geldi').length;
    const gelmedi = inRange.filter((a) => a.status === 'gelmedi').length;
    randevu = {
      byStatus: Object.keys(STATUS_LABELS).map((k) => ({ value: k, label: STATUS_LABELS[k], count: inRange.filter((a) => a.status === k).length })),
      byService: (cfg.services || []).map((s) => ({ label: s.name, count: inRange.filter((a) => a.serviceId === s.id && a.status !== 'iptal').length })),
      noShowRate: geldi + gelmedi ? Math.round((gelmedi / (geldi + gelmedi)) * 100) : null,
      upcoming: appts.filter((a) => a.date >= today() && a.date <= addDays(today(), 6) && ACTIVE_STATUSES.includes(a.status)).length,
      total: inRange.length
    };
  }
  return { form: { id: form.id, name: form.name, isletme: form.isletme }, days: d, total: subs.length, inRange: daily.reduce((a, b) => a + b.count, 0), daily, statusCounts, randevu };
};

// ---------------------------------------------------------------- randevular
H.listAppointments = async (ctx, formId, { from, to } = {}) => {
  const q = ctx.db.query;
  const { form, perms } = await requirePerm(ctx, q, formId, 'randevu');
  if (!isDate(from) || !isDate(to)) fail('Geçersiz tarih aralığı.');
  const cfg = content(form).randevu;
  const appts = (await q('SELECT * FROM appointments WHERE form_id = ? AND date >= ? AND date <= ? ORDER BY date, start', [form.id, from, to])).map(mapAppt);
  const subIds = [...new Set(appts.map((a) => a.submissionId))];
  const subs = subIds.length ? new Map((await q(`SELECT * FROM submissions WHERE id IN (${ph(subIds)})`, subIds)).map((r) => [r.id, withFileUrls(mapSub(r))])) : new Map();
  const blocks = (await q('SELECT * FROM blocks WHERE form_id = ? AND date >= ? AND date <= ?', [form.id, from, to])).map((b) => ({ id: b.id, formId: b.form_id, date: b.date, start: b.start, end: b.end_time, resourceId: b.resource_id, note: b.note }));
  return {
    items: appts.map((a) => ({ ...panelAppt(a), submission: subs.get(a.submissionId) || null })),
    blocks, cfg: clone(cfg), perms, form: { id: form.id, name: form.name, slug: form.slug, isletme: form.isletme }
  };
};

H.listAllAppointments = async (ctx, { from, to } = {}) => {
  const user = await requireUser(ctx);
  const q = ctx.db.query;
  if (!isDate(from) || !isDate(to)) fail('Geçersiz tarih aralığı.');
  const forms = [];
  for (const f of (await q('SELECT * FROM forms WHERE deleted_at IS NULL')).map(mapForm)) {
    if (!content(f).fields.some((x) => x.type === 'randevu')) continue;
    if ((await permsFor(q, user, f.id)).randevu) forms.push(f);
  }
  if (!forms.length) return { forms: [], items: [] };
  const ids = forms.map((f) => f.id);
  const appts = (await q(`SELECT * FROM appointments WHERE form_id IN (${ph(ids)}) AND date >= ? AND date <= ? ORDER BY date, start`, [...ids, from, to])).map(mapAppt);
  return {
    forms: forms.map((f) => ({ id: f.id, name: f.name, isletme: f.isletme })),
    items: appts.map((a) => {
      const cfg = content(forms.find((f) => f.id === a.formId)).randevu;
      return {
        id: a.id, formId: a.formId, date: a.date, start: a.start, end: a.end, status: a.status, partySize: a.partySize, name: a.contact?.name || '', phone: a.contact?.phone || '',
        service: serviceById(cfg, a.serviceId)?.name || '', resource: (cfg.resources || []).find((r) => r.id === a.resourceId)?.name || ''
      };
    })
  };
};

H.adminSlots = async (ctx, formId, { date, serviceId, resourceId, partySize, excludeId } = {}) => {
  const q = ctx.db.query;
  const { form } = await requirePerm(ctx, q, formId, 'randevu');
  if (!isDate(date)) return [];
  const { appts, blocks } = await dayData(q, form.id, date);
  return getSlots(content(form).randevu, appts, blocks, { date, serviceId, resourceId: resourceId || null, partySize: Number(partySize || 1), excludeId, ignoreNotice: true });
};

async function loadAppt(q, id) {
  return mapAppt((await q('SELECT * FROM appointments WHERE id = ?', [id]))[0]);
}

H.setAppointmentStatus = async (ctx, id, status) => {
  if (!STATUS_LABELS[status]) fail('Geçersiz durum.');
  return ctx.db.tx(async (q) => {
    const a0 = await loadAppt(q, id);
    if (!a0) fail('Randevu bulunamadı.', 'yok', 404);
    const { user, form } = await requirePerm(ctx, q, a0.formId, 'randevu', { lock: true });
    const a = await loadAppt(q, id);
    const c = content(form);
    const cfg = c.randevu;
    const lang = a.lang || c.settings.language || 'tr';
    const biz = form.isletme || form.name;
    // İptal edilmiş randevu geri açılırken saat hâlâ boş mu?
    if (a.status === 'iptal' && status !== 'iptal') {
      const { appts, blocks } = await dayData(q, form.id, a.date);
      const ok = checkSlot(cfg, appts, blocks, { date: a.date, time: a.start, serviceId: a.serviceId, resourceId: a.resourceId, partySize: a.partySize, excludeId: a.id, ignoreNotice: true });
      if (!ok.ok) fail('Bu saat artık dolu; randevuyu yeniden açmak için başka bir saate taşıyın.');
    }
    const prev = a.status;
    await q('UPDATE appointments SET status = ?, cancelled_by = ? WHERE id = ?', [status, status === 'iptal' ? 'isletme' : a.cancelledBy, id]);
    if (prev !== status) {
      if (a.contact?.email && customerMails(c)) {
        if (status === 'onaylandi') await mail(q, a.contact.email, tt(lang, 'mailApprovedSubject', { x: biz }), appointmentMailBody(form, a, cfg, tt(lang, 'statusLabels').onaylandi, lang), 'randevu');
        if (status === 'iptal') await mail(q, a.contact.email, tt(lang, 'mailCancelledSubject', { x: biz }), tt(lang, 'mailCancelledBody', { d: `${a.date} ${a.start}`, u: `${config.publicUrl}/f/${form.slug}` }), 'randevu');
      }
      if (cfg.sms?.confirm && a.contact?.phone) {
        if (status === 'onaylandi') await sms(q, a.contact.phone, tt(lang, 'smsConfirm', { x: biz, d: `${a.date} ${a.start}`, u: cancelUrl(a) }));
        if (status === 'iptal') await sms(q, a.contact.phone, tt(lang, 'smsCancelled', { x: biz, d: `${a.date} ${a.start}` }));
      }
    }
    await log(q, user.id, `Randevu durumu: ${STATUS_LABELS[status]}`, `${form.name} ${a.date} ${a.start}`);
    return true;
  });
};

H.moveAppointment = async (ctx, id, { date, time, resourceId } = {}) => {
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(String(time || ''))) fail('Geçerli bir tarih ve saat seçin.');
  return ctx.db.tx(async (q) => {
    const a0 = await loadAppt(q, id);
    if (!a0) fail('Randevu bulunamadı.', 'yok', 404);
    const { user, form } = await requirePerm(ctx, q, a0.formId, 'randevu', { lock: true });
    const a = await loadAppt(q, id);
    const c = content(form);
    const cfg = c.randevu;
    const lang = a.lang || c.settings.language || 'tr';
    const biz = form.isletme || form.name;
    const { appts, blocks } = await dayData(q, form.id, date);
    const check = checkSlot(cfg, appts, blocks, { date, time, serviceId: a.serviceId, resourceId: resourceId || null, partySize: a.partySize, excludeId: a.id, ignoreNotice: true });
    if (!check.ok) fail('Bu saat dolu veya çalışma saatleri dışında.');
    const old = `${a.date} ${a.start}`;
    a.date = date;
    a.start = time;
    a.end = endTime(cfg, a.serviceId, time);
    a.resourceId = check.resourceId;
    await q('UPDATE appointments SET date = ?, start = ?, end_time = ?, resource_id = ?, reminder_sent = 0 WHERE id = ?', [a.date, a.start, a.end, a.resourceId, id]);
    const sub = await loadSub(q, a.submissionId);
    if (sub) {
      const rKey = Object.keys(sub.types).find((k) => sub.types[k] === 'randevu');
      if (rKey && sub.values[rKey]) {
        sub.values[rKey] = { ...sub.values[rKey], date, time, resourceId: a.resourceId };
        await q('UPDATE submissions SET vals = ? WHERE id = ?', [S(sub.values), sub.id]);
      }
    }
    if (a.contact?.email && customerMails(c)) await mail(q, a.contact.email, tt(lang, 'mailMovedSubject', { x: biz }), `${tt(lang, 'mailOld')} ${old}\n` + appointmentMailBody(form, a, cfg, tt(lang, 'statusLabels')[a.status], lang), 'randevu');
    if (cfg.sms?.confirm && a.contact?.phone) await sms(q, a.contact.phone, tt(lang, 'smsMoved', { x: biz, d: `${date} ${time}` }));
    await log(q, user.id, 'Randevu taşıdı', `${form.name} ${old} → ${date} ${time}`);
    return true;
  });
};

H.createManualAppointment = async (ctx, formId, { name, phone, email, note, date, time, serviceId, resourceId, partySize } = {}) => {
  if (!str(name)) fail('Ad Soyad zorunlu.');
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(String(time || ''))) fail('Geçerli bir tarih ve saat seçin.');
  return ctx.db.tx(async (q) => {
    const { user, form } = await requirePerm(ctx, q, formId, 'randevu', { lock: true });
    const c = content(form);
    const cfg = c.randevu;
    const lang = c.settings.language || 'tr';
    const ps = Math.max(1, parseInt(partySize, 10) || 1);
    const { appts, blocks } = await dayData(q, form.id, date);
    const check = checkSlot(cfg, appts, blocks, { date, time, serviceId, resourceId: resourceId || null, partySize: ps, ignoreNotice: true });
    if (!check.ok) fail('Bu saat dolu veya çalışma saatleri dışında.');
    const svc = serviceById(cfg, serviceId);
    const contact = { name: str(name, 150), email: str(email, 190).toLowerCase(), phone: String(phone || '').replace(/\D/g, '').slice(0, 20) };
    if (contact.email && !emailOk(contact.email)) fail('Geçerli bir e-posta girin.');
    const subId = uid('s_');
    const rKey = c.fields.find((f) => f.type === 'randevu')?.key || 'randevu';
    const values = { manuel_ad: contact.name, [rKey]: { date, time, serviceId: svc.id, resourceId: check.resourceId, partySize: ps } };
    if (contact.phone) values.manuel_tel = str(phone, 30);
    if (contact.email) values.manuel_email = contact.email;
    if (str(note)) values.manuel_not = str(note, 1000);
    const labels = { manuel_ad: 'Ad Soyad', manuel_tel: 'Telefon', manuel_email: 'E-posta', manuel_not: 'Not', [rKey]: 'Randevu' };
    const types = { manuel_ad: 'text', manuel_tel: 'tel', manuel_email: 'email', manuel_not: 'textarea', [rKey]: 'randevu' };
    const order = ['manuel_ad', 'manuel_tel', 'manuel_email', rKey, 'manuel_not'].filter((k) => values[k] !== undefined);
    const appt = {
      id: uid('a_'), formId: form.id, submissionId: subId, serviceId: svc.id, resourceId: check.resourceId, date, start: time,
      end: endTime(cfg, svc.id, time), buffer: Number(svc.buffer || 0), partySize: ps, status: 'onaylandi', cancelToken: randomToken(16), contact, lang
    };
    await q('INSERT INTO appointments (id, form_id, submission_id, service_id, resource_id, date, start, end_time, buffer, party_size, status, cancel_token, reminder_sent, contact, lang, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)', [
      appt.id, form.id, subId, appt.serviceId, appt.resourceId, date, time, appt.end, appt.buffer, ps, 'onaylandi', appt.cancelToken, S(contact), lang, 'manuel', now()
    ]);
    await q('INSERT INTO submissions (id, form_id, vals, labels, types, ord, status, notes, appointment_id, manual, kvkk_at, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?)', [
      subId, form.id, S(values), S(labels), S(types), S(order), 'yeni', '[]', appt.id, 'panel (manuel)', '', now()
    ]);
    const biz = form.isletme || form.name;
    if (contact.email && customerMails(c)) await mail(q, contact.email, tt(lang, 'mailConfirmSubject', { x: biz }), appointmentMailBody(form, appt, cfg, tt(lang, 'statusLabels').onaylandi, lang), 'randevu');
    if (cfg.sms?.confirm && contact.phone) await sms(q, contact.phone, tt(lang, 'smsConfirm', { x: biz, d: `${date} ${time}`, u: cancelUrl(appt) }));
    await log(q, user.id, 'Manuel randevu ekledi', `${form.name} ${date} ${time}`);
    return appt.id;
  });
};

H.addBlock = async (ctx, formId, { date, start, end, resourceId, note } = {}) => {
  const tm = /^\d{2}:\d{2}$/;
  if (!isDate(date) || !tm.test(String(start || '')) || !tm.test(String(end || '')) || start >= end) fail('Geçerli bir tarih ve saat aralığı girin.');
  return ctx.db.tx(async (q) => {
    const { user, form } = await requirePerm(ctx, q, formId, 'randevu', { lock: true });
    await q('INSERT INTO blocks (id, form_id, date, start, end_time, resource_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)', [uid('b_'), form.id, date, start, end, resourceId || null, str(note, 300)]);
    await log(q, user.id, 'Saat blokladı', `${form.name} ${date} ${start}-${end}`);
    return true;
  });
};

H.removeBlock = async (ctx, id) => {
  return ctx.db.tx(async (q) => {
    const b = (await q('SELECT * FROM blocks WHERE id = ?', [id]))[0];
    if (!b) fail('Blok bulunamadı.', 'yok', 404);
    const { user } = await requirePerm(ctx, q, b.form_id, 'randevu', { lock: true });
    await q('DELETE FROM blocks WHERE id = ?', [id]);
    await log(q, user.id, 'Saat bloğunu kaldırdı', `${b.date} ${b.start}-${b.end_time}`);
    return true;
  });
};

const tokenOk = (t) => /^[a-f0-9]{32}$/.test(String(t || ''));

H.getAppointmentByToken = async (ctx, tok) => {
  if (!tokenOk(tok)) return null;
  const a = mapAppt((await ctx.db.query('SELECT * FROM appointments WHERE cancel_token = ?', [tok]))[0]);
  if (!a) return null;
  const form = await loadForm(ctx.db.query, a.formId);
  if (!form) return null;
  const c = content(form);
  const cfg = c.randevu;
  const cutoffMs = dateTimeToMs(a.date, a.start) - Number(cfg.cancelCutoffHours || 0) * 3600000;
  return {
    date: a.date, start: a.start, end: a.end, status: a.status, service: serviceById(cfg, a.serviceId)?.name,
    isletme: form.isletme || form.name, slug: form.slug, lang: a.lang || c.settings.language || 'tr',
    canCancel: ['bekliyor', 'onaylandi'].includes(a.status) && now() < cutoffMs, cutoffHours: cfg.cancelCutoffHours
  };
};

H.cancelByToken = async (ctx, tok) => {
  if (!tokenOk(tok)) fail('Randevu bulunamadı.', 'yok', 404);
  if (!rateLimit(`cancel:${ctx.ip}`, 20, 15 * 60000)) fail('Çok fazla deneme yaptınız.', 'sinir', 429);
  return ctx.db.tx(async (q) => {
    const a0 = mapAppt((await q('SELECT * FROM appointments WHERE cancel_token = ?', [tok]))[0]);
    if (!a0) fail('Randevu bulunamadı.', 'yok', 404);
    const form = await loadForm(q, a0.formId, { lock: true });
    if (!form) fail('Randevu bulunamadı.', 'yok', 404);
    const a = await loadAppt(q, a0.id);
    const c = content(form);
    const cfg = c.randevu;
    const lang = a.lang || c.settings.language || 'tr';
    const cutoffMs = dateTimeToMs(a.date, a.start) - Number(cfg.cancelCutoffHours || 0) * 3600000;
    if (!['bekliyor', 'onaylandi'].includes(a.status)) fail(tt(lang, 'alreadyCancelled'));
    if (now() >= cutoffMs) fail(tt(lang, 'cutoffPassed', { n: cfg.cancelCutoffHours }));
    await q("UPDATE appointments SET status = 'iptal', cancelled_by = 'musteri' WHERE id = ?", [a.id]);
    await addNotice(q, form, 'iptal', a, cfg);
    await log(q, null, 'Müşteri randevuyu iptal etti', `${form.name} ${a.date} ${a.start}`);
    return true;
  });
};

// ---------------------------------------------------------------- çöp kutusu, log, giden mail
H.listTrash = async (ctx) => {
  await requireAdmin(ctx);
  const q = ctx.db.query;
  const forms = await q('SELECT id, name, slug, deleted_at FROM forms WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  const names = Object.fromEntries((await q('SELECT id, name FROM forms')).map((r) => [r.id, r.name]));
  const subs = (await q('SELECT * FROM submissions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500')).map(mapSub);
  const users = await q('SELECT id, name, email, deleted_at FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  return {
    forms: forms.map((f) => ({ id: f.id, name: f.name, slug: f.slug, deletedAt: num(f.deleted_at) })),
    submissions: subs.map((s) => ({
      id: s.id, formName: names[s.formId] || '-', deletedAt: s.deletedAt, createdAt: s.createdAt,
      preview: (s.order || []).slice(0, 2).map((k) => (typeof s.values[k] === 'object' ? '' : s.values[k])).filter(Boolean).join(' · ')
    })),
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, deletedAt: num(u.deleted_at) }))
  };
};

H.restoreItem = async (ctx, kind, id) => {
  const admin = await requireAdmin(ctx);
  return ctx.db.tx(async (q) => {
    if (kind === 'form') {
      const f = (await q('SELECT * FROM forms WHERE id = ? AND deleted_at IS NOT NULL', [id]))[0];
      if (!f) fail('Bulunamadı.', 'yok', 404);
      if ((await q('SELECT id FROM forms WHERE slug = ? AND deleted_at IS NULL AND id <> ?', [f.slug, id])).length) fail('Bu formun linki başka bir formda kullanılıyor. Önce o formun linkini değiştirin.');
      await q('UPDATE forms SET deleted_at = NULL WHERE id = ?', [id]);
    } else if (kind === 'submission') {
      const r = await q('UPDATE submissions SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [id]);
      if (!r.affectedRows) fail('Bulunamadı.', 'yok', 404);
    } else if (kind === 'user') {
      const u = (await q('SELECT * FROM users WHERE id = ? AND deleted_at IS NOT NULL', [id]))[0];
      if (!u) fail('Bulunamadı.', 'yok', 404);
      if ((await q('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL AND id <> ?', [u.email, id])).length) fail('Bu e-posta ile aktif bir kullanıcı var.');
      await q('UPDATE users SET deleted_at = NULL, active = 1 WHERE id = ?', [id]);
    } else fail('Geçersiz tür.');
    await log(q, admin.id, 'Çöp kutusundan geri aldı', kind);
    return true;
  });
};

H.purgeItem = async (ctx, kind, id) => {
  const admin = await requireAdmin(ctx);
  const fileIds = await ctx.db.tx(async (q) => {
    let files = [];
    if (kind === 'form') {
      if (!(await q('SELECT id FROM forms WHERE id = ? AND deleted_at IS NOT NULL', [id])).length) fail('Bulunamadı.', 'yok', 404);
      files = (await q('SELECT id FROM files WHERE form_id = ?', [id])).map((r) => r.id);
      for (const t of ['submissions', 'appointments', 'permissions', 'form_versions', 'blocks', 'files', 'notifications']) await q(`DELETE FROM ${t} WHERE form_id = ?`, [id]);
      await q('DELETE FROM forms WHERE id = ?', [id]);
    } else if (kind === 'submission') {
      const s = (await q('SELECT * FROM submissions WHERE id = ? AND deleted_at IS NOT NULL', [id]))[0];
      if (!s) fail('Bulunamadı.', 'yok', 404);
      files = (await q('SELECT id FROM files WHERE submission_id = ?', [id])).map((r) => r.id);
      await q('DELETE FROM files WHERE submission_id = ?', [id]);
      await q('DELETE FROM appointments WHERE submission_id = ?', [id]);
      await q('DELETE FROM submissions WHERE id = ?', [id]);
    } else if (kind === 'user') {
      if (!(await q("SELECT id FROM users WHERE id = ? AND deleted_at IS NOT NULL AND role <> 'admin'", [id])).length) fail('Bulunamadı.', 'yok', 404);
      await q('DELETE FROM permissions WHERE user_id = ?', [id]);
      await q('DELETE FROM sessions WHERE user_id = ?', [id]);
      await q('DELETE FROM push_subscriptions WHERE user_id = ?', [id]);
      await q('DELETE FROM users WHERE id = ?', [id]);
    } else fail('Geçersiz tür.');
    await log(q, admin.id, 'Kalıcı olarak sildi', kind);
    return files;
  });
  await removeUploads(fileIds);
  return true;
};

H.listLogs = async (ctx) => {
  await requireAdmin(ctx);
  const rows = await ctx.db.query('SELECT l.*, u.name AS user_name FROM logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.at DESC LIMIT 500');
  return rows.map((l) => ({ id: l.id, userId: l.user_id, action: l.action, target: l.target, at: num(l.at), userName: l.user_name || 'Sistem' }));
};

H.listOutbox = async (ctx) => {
  await requireAdmin(ctx);
  const rows = await ctx.db.query('SELECT * FROM outbox ORDER BY at DESC LIMIT 300');
  return rows.map((m) => ({ id: m.id, to: m.recipient, subject: m.subject, body: m.body, kind: m.channel === 'sms' ? 'sms' : m.kind, at: num(m.at), status: m.status, error: m.error }));
};

H.clearOutbox = async (ctx) => {
  const admin = await requireAdmin(ctx);
  await ctx.db.query("DELETE FROM outbox WHERE status <> 'bekliyor'");
  await log(ctx.db.query, admin.id, 'Giden mail geçmişini temizledi');
  return true;
};

// ---------------------------------------------------------------- dosya indirme yetkisi
export async function authorizeFile(ctx, fileId) {
  const f = (await ctx.db.query('SELECT * FROM files WHERE id = ?', [fileId]))[0];
  if (!f) fail('Dosya bulunamadı.', 'yok', 404);
  const sub = (await ctx.db.query('SELECT deleted_at FROM submissions WHERE id = ?', [f.submission_id]))[0];
  const user = await requireUser(ctx);
  if (sub?.deleted_at && user.role !== 'admin') fail('Dosya bulunamadı.', 'yok', 404);
  await requirePerm(ctx, ctx.db.query, f.form_id, 'view');
  await log(ctx.db.query, user.id, 'Dosya indirdi', f.name);
  return { id: f.id, name: f.name, mime: f.mime, size: Number(f.size) };
}

// ---------------------------------------------------------------- çağrı
export async function dispatch(ctx, name, args) {
  const fn = Object.prototype.hasOwnProperty.call(H, name) ? H[name] : null;
  if (!fn) fail('Bilinmeyen işlem.', 'yok', 404);
  ctx.allowMustChange = MUST_CHANGE_OK.has(name) || PUBLIC.has(name);
  ctx.allowTwofaSetup = TWOFA_SETUP_OK.has(name) || PUBLIC.has(name);
  return fn(ctx, ...(Array.isArray(args) ? args : []));
}

export const handlerNames = () => Object.keys(H);
export { mapAppt, mapForm, content, appointmentMailBody, mail, sms, log, cancelUrl, customerMails, J };
