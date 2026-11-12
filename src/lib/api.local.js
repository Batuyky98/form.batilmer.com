// =====================================================================
//  BATILMER FORM PANELİ – YEREL (DEMO) API
//  Sunucu olmadan, veriyi tarayıcıda (localStorage) tutarak çalışan sürüm.
//  .env içinde VITE_API_MODE=local iken kullanılır. Canlıda server/ klasöründeki
//  Node.js sunucusu aynı fonksiyonları MySQL ile çalıştırır (api.remote.js).
// =====================================================================

import { tx, read, resetAll, StorageFullError } from './db.js';
import { uid, token, sha256, clone, today, addDays, dateTimeToMs, slugify, maskTc, dateOfMs, dayOfWeek, formatDateTime } from './util.js';
import { validateAll } from './validators.js';
import { visibilityMap } from './conditions.js';
import { t as tt } from './i18n.js';
import { STATUS_LABELS, SUBMISSION_STATUSES, submissionStatusLabel, displayValue } from './shared.js';
export { STATUS_LABELS, SUBMISSION_STATUSES, submissionStatusLabel, displayValue };
import { checkSlot, getSlots, endTime, serviceById, ACTIVE_STATUSES } from './availability.js';
import { buildFormContent, DEFAULT_CONTROL } from './templates.js';

const SESSION_KEY = 'batilmer_session';
const delay = (v) => new Promise((res) => setTimeout(() => res(v), 60));

class ApiError extends Error {
  constructor(message, code = 'hata') {
    super(message);
    this.code = code;
  }
}
const fail = (msg, code) => {
  throw new ApiError(msg, code);
};

// ---------------------------------------------------------------- kurulum

async function hashPassword(password, salt) {
  return sha256(`${salt}:${password}`);
}

export async function ensureSeed() {
  const hasAdmin = read((db) => db.users.some((u) => u.role === 'admin' && !u.deletedAt));
  if (hasAdmin) return;
  const email = (import.meta.env.VITE_SEED_ADMIN_EMAIL || 'info@batilmer.com').toLowerCase();
  const password = import.meta.env.VITE_SEED_ADMIN_PASSWORD;
  if (!password) {
    console.warn('VITE_SEED_ADMIN_PASSWORD tanımlı değil (.env). Ana Admin oluşturulamadı.');
    return;
  }
  const salt = token();
  const passHash = await hashPassword(password, salt);
  tx((db) => {
    db.users.push({ id: uid('u_'), name: 'Ana Admin', email, salt, passHash, role: 'admin', mustChange: true, active: true, createdAt: Date.now() });
  });
}

export function resetDemoData() {
  resetAll();
  localStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------- yardımcılar

function log(db, userId, action, target = '') {
  db.logs.unshift({ id: uid('l_'), userId, action, target, at: Date.now() });
  if (db.logs.length > 2000) db.logs.length = 2000;
}

function mail(db, to, subject, body, kind = 'bilgi') {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  for (const addr of list) db.outbox.unshift({ id: uid('m_'), to: addr, subject, body, kind, at: Date.now() });
}

function sessionUser(db) {
  const t = localStorage.getItem(SESSION_KEY);
  if (!t) return null;
  const s = db.sessions.find((x) => x.token === t);
  if (!s) return null;
  const u = db.users.find((x) => x.id === s.userId && !x.deletedAt && x.active);
  return u || null;
}

function requireUser(db) {
  const u = sessionUser(db);
  if (!u) fail('Oturum süresi doldu, lütfen tekrar giriş yapın.', 'oturum');
  return u;
}

function requireAdmin(db) {
  const u = requireUser(db);
  if (u.role !== 'admin') fail('Bu işlem için yetkiniz yok.', 'yetki');
  return u;
}

const NO_PERMS = { view: false, excel: false, delete: false, edit: false, randevu: false };
const ALL_PERMS = { view: true, excel: true, delete: true, edit: true, randevu: true };

function permsFor(db, user, formId) {
  if (!user) return NO_PERMS;
  if (user.role === 'admin') return ALL_PERMS;
  const p = db.permissions.find((x) => x.userId === user.id && x.formId === formId);
  return p ? { ...NO_PERMS, ...p.perms } : NO_PERMS;
}

function requirePerm(db, formId, perm) {
  const u = requireUser(db);
  const form = db.forms.find((f) => f.id === formId && !f.deletedAt);
  if (!form) fail('Form bulunamadı.', 'yok');
  const p = permsFor(db, u, formId);
  if (!p[perm]) fail('Bu işlem için yetkiniz yok.', 'yetki');
  return { user: u, form, perms: p };
}

const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role, mustChange: !!u.mustChange, active: u.active };

function contactFrom(fields, values) {
  const c = { name: '', email: '', phone: '' };
  for (const f of fields) {
    const v = values[f.key];
    if (!v) continue;
    if (f.type === 'email' && !c.email) c.email = String(v).trim().toLowerCase();
    if (f.type === 'tel' && !c.phone) c.phone = String(v).replace(/\D/g, '');
  }
  // İsim: etiketi "ad / isim / name" içeren ilk kısa metin alanı, yoksa ilk kısa metin alanı
  const texts = fields.filter((f) => f.type === 'text' && values[f.key]);
  const nameField = texts.find((f) => /(^|\s)(ad|adı|adınız|isim|name)/i.test(f.label)) || texts[0];
  if (nameField) c.name = String(values[nameField.key]).trim();
  return c;
}

function formIsOpen(db, form) {
  const c = form.control || DEFAULT_CONTROL;
  if (!form.published) return { open: false, reason: 'Bu form henüz yayınlanmadı.' };
  if (c.status !== 'aktif') return { open: false, reason: c.closedMessage };
  const t = today();
  if (c.startDate && t < c.startDate) return { open: false, reason: c.closedMessage };
  if (c.endDate && t > c.endDate) return { open: false, reason: c.closedMessage };
  if (c.quota) {
    const count = db.submissions.filter((s) => s.formId === form.id && !s.deletedAt).length;
    if (count >= Number(c.quota)) return { open: false, reason: c.closedMessage || 'Kontenjan doldu.' };
  }
  return { open: true };
}

function appointmentMailBody(form, appt, cfg, status, lang = 'tr') {
  const svc = serviceById(cfg, appt.serviceId);
  const res = (cfg.resources || []).find((r) => r.id === appt.resourceId);
  const lines = [
    `${form.isletme || form.name}`,
    `${tt(lang, 'service')}: ${svc?.name || '-'}`,
    res ? `${cfg.resourceLabel || 'Personel'}: ${res.name}` : null,
    `${tt(lang, 'date')}: ${appt.date} ${appt.start} - ${appt.end}`,
    cfg.capacityMode === 'kisi' ? `${tt(lang, 'partySize')}: ${appt.partySize}` : null,
    `${tt(lang, 'status')}: ${status}`,
    '',
    `${tt(lang, 'mailCancelLink')} ${window.location.origin}/iptal/${appt.cancelToken}`
  ];
  return lines.filter((l) => l !== null).join('\n');
}

// ---------------------------------------------------------------- oturum

export async function login(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const user = read((db) => db.users.find((u) => u.email === e && !u.deletedAt));
  if (!user || !user.active) fail('E-posta veya şifre hatalı.');
  const h = await hashPassword(password, user.salt);
  if (h !== user.passHash) fail('E-posta veya şifre hatalı.');
  const t = token();
  tx((db) => {
    db.sessions = db.sessions.filter((s) => Date.now() - s.at < 7 * 864e5);
    db.sessions.push({ token: t, userId: user.id, at: Date.now() });
    log(db, user.id, 'Giriş yaptı');
  });
  localStorage.setItem(SESSION_KEY, t);
  return delay(publicUser(user));
}

export async function logout() {
  const t = localStorage.getItem(SESSION_KEY);
  tx((db) => {
    db.sessions = db.sessions.filter((s) => s.token !== t);
  });
  localStorage.removeItem(SESSION_KEY);
  return delay(true);
}

export async function currentUser() {
  return delay(publicUser(read(sessionUser)));
}

function checkStrong(pw) {
  if (!pw || pw.length < 8) fail('Şifre en az 8 karakter olmalı.');
  if (!/[A-ZÇĞİÖŞÜ]/.test(pw) || !/[a-zçğıöşü]/.test(pw) || !/\d/.test(pw)) fail('Şifre büyük harf, küçük harf ve rakam içermeli.');
}

export async function changePassword(oldPassword, newPassword) {
  const user = read(requireUser);
  const h = await hashPassword(oldPassword, user.salt);
  if (h !== user.passHash) fail('Mevcut şifre hatalı.');
  checkStrong(newPassword);
  if (oldPassword === newPassword) fail('Yeni şifre eskisiyle aynı olamaz.');
  const salt = token();
  const passHash = await hashPassword(newPassword, salt);
  tx((db) => {
    const u = db.users.find((x) => x.id === user.id);
    Object.assign(u, { salt, passHash, mustChange: false });
    log(db, user.id, 'Şifresini değiştirdi');
  });
  return delay(true);
}

export async function requestPasswordReset(email) {
  const e = String(email || '').trim().toLowerCase();
  tx((db) => {
    const u = db.users.find((x) => x.email === e && !x.deletedAt && x.active);
    if (!u) return; // Hesap var/yok bilgisi sızdırılmaz
    const t = token();
    db.resetTokens.push({ token: t, userId: u.id, at: Date.now() });
    mail(db, u.email, 'Batilmer Form Paneli – Şifre sıfırlama', `Şifrenizi sıfırlamak için (1 saat geçerli):\n${window.location.origin}/sifre-sifirla/${t}`, 'sifre');
  });
  return delay(true);
}

export async function resetPassword(resetToken, newPassword) {
  const rec = read((db) => db.resetTokens.find((r) => r.token === resetToken));
  if (!rec || Date.now() - rec.at > 3600000) fail('Bağlantının süresi dolmuş. Lütfen tekrar şifre sıfırlama isteyin.');
  checkStrong(newPassword);
  const salt = token();
  const passHash = await hashPassword(newPassword, salt);
  tx((db) => {
    const u = db.users.find((x) => x.id === rec.userId);
    if (u) Object.assign(u, { salt, passHash, mustChange: false });
    db.resetTokens = db.resetTokens.filter((r) => r.token !== resetToken);
    db.sessions = db.sessions.filter((s) => s.userId !== rec.userId);
    log(db, rec.userId, 'Şifresini sıfırladı');
  });
  return delay(true);
}

// ---------------------------------------------------------------- kullanıcılar (Ana Admin)

export async function listUsers() {
  return delay(read((db) => {
    requireAdmin(db);
    return db.users.filter((u) => !u.deletedAt).map((u) => ({
      ...publicUser(u),
      createdAt: u.createdAt,
      formCount: db.permissions.filter((p) => p.userId === u.id && Object.values(p.perms).some(Boolean)).length
    }));
  }));
}

export async function createUser({ name, email, password }) {
  const e = String(email || '').trim().toLowerCase();
  if (!name?.trim()) fail('Ad Soyad zorunlu.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) fail('Geçerli bir e-posta girin.');
  checkStrong(password);
  const salt = token();
  const passHash = await hashPassword(password, salt);
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    if (db.users.some((u) => u.email === e && !u.deletedAt)) fail('Bu e-posta ile bir kullanıcı zaten var.');
    const u = { id: uid('u_'), name: name.trim(), email: e, salt, passHash, role: 'user', mustChange: true, active: true, createdAt: Date.now() };
    db.users.push(u);
    log(db, admin.id, 'Kullanıcı ekledi', u.email);
    mail(db, u.email, 'Batilmer Form Paneli hesabınız açıldı', `Merhaba ${u.name},\nPanel adresi: ${window.location.origin}/giris\nKullanıcı adınız: ${u.email}\nGeçici şifreniz size ayrıca iletilecektir. İlk girişte şifrenizi değiştirmeniz istenecek.`, 'hesap');
    return publicUser(u);
  }));
}

export async function updateUser(id, { name, email, active }) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const u = db.users.find((x) => x.id === id && !x.deletedAt);
    if (!u) fail('Kullanıcı bulunamadı.');
    if (u.role === 'admin' && active === false) fail('Ana Admin pasif yapılamaz.');
    if (email !== undefined) {
      const e = String(email).trim().toLowerCase();
      if (db.users.some((x) => x.email === e && x.id !== id && !x.deletedAt)) fail('Bu e-posta başka bir kullanıcıda kayıtlı.');
      u.email = e;
    }
    if (name !== undefined) u.name = name.trim();
    if (active !== undefined) {
      u.active = active;
      if (!active) db.sessions = db.sessions.filter((s) => s.userId !== id);
    }
    log(db, admin.id, 'Kullanıcıyı güncelledi', u.email);
    return publicUser(u);
  }));
}

export async function adminSetPassword(id, password) {
  checkStrong(password);
  const salt = token();
  const passHash = await hashPassword(password, salt);
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const u = db.users.find((x) => x.id === id && !x.deletedAt);
    if (!u) fail('Kullanıcı bulunamadı.');
    Object.assign(u, { salt, passHash, mustChange: true });
    db.sessions = db.sessions.filter((s) => s.userId !== id);
    log(db, admin.id, 'Kullanıcının şifresini sıfırladı', u.email);
    return true;
  }));
}

export async function deleteUser(id) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const u = db.users.find((x) => x.id === id && !x.deletedAt);
    if (!u) fail('Kullanıcı bulunamadı.');
    if (u.role === 'admin') fail('Ana Admin silinemez.');
    u.deletedAt = Date.now();
    u.active = false;
    db.sessions = db.sessions.filter((s) => s.userId !== id);
    log(db, admin.id, 'Kullanıcıyı sildi (çöp kutusu)', u.email);
    return true;
  }));
}

// ---------------------------------------------------------------- yetkiler

export async function getUserPermissions(userId) {
  return delay(read((db) => {
    requireAdmin(db);
    const map = {};
    for (const p of db.permissions.filter((x) => x.userId === userId)) map[p.formId] = { ...NO_PERMS, ...p.perms };
    return map;
  }));
}

export async function setPermission(userId, formId, perms) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const u = db.users.find((x) => x.id === userId);
    const f = db.forms.find((x) => x.id === formId);
    if (!u || !f) fail('Kullanıcı veya form bulunamadı.');
    const clean = { ...NO_PERMS, ...perms };
    // Görüntüleme yetkisi olmadan diğerleri anlamsız
    if (!clean.view) Object.keys(clean).forEach((k) => (clean[k] = false));
    let p = db.permissions.find((x) => x.userId === userId && x.formId === formId);
    if (!p) {
      p = { userId, formId, perms: clean };
      db.permissions.push(p);
    } else p.perms = clean;
    log(db, admin.id, 'Yetki güncelledi', `${u.email} → ${f.name}`);
    return clean;
  }));
}

export async function myPermissions(formId) {
  return delay(read((db) => permsFor(db, sessionUser(db), formId)));
}

// ---------------------------------------------------------------- formlar

function formSummary(db, f, user) {
  const subs = db.submissions.filter((s) => s.formId === f.id && !s.deletedAt);
  const t = today();
  return {
    id: f.id,
    name: f.name,
    isletme: f.isletme,
    slug: f.slug,
    control: f.control,
    publishedAt: f.publishedAt,
    hasDraftChanges: JSON.stringify(f.draft) !== JSON.stringify(f.published),
    updatedAt: f.updatedAt,
    total: subs.length,
    todayCount: subs.filter((s) => dateOfMs(s.createdAt) === t).length,
    upcomingAppointments: db.appointments.filter((a) => a.formId === f.id && a.date >= t && ACTIVE_STATUSES.includes(a.status)).length,
    hasRandevu: (f.published?.fields || f.draft.fields).some((x) => x.type === 'randevu'),
    perms: permsFor(db, user, f.id)
  };
}


export async function listForms() {
  return delay(read((db) => {
    const u = requireUser(db);
    return db.forms
      .filter((f) => !f.deletedAt && permsFor(db, u, f.id).view)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((f) => formSummary(db, f, u));
  }));
}

export async function getForm(id) {
  return delay(read((db) => {
    const { form, perms } = requirePerm(db, id, 'view');
    return { ...clone(form), perms };
  }));
}

export async function createForm({ name, isletme, slug, templateId }) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    if (!name?.trim()) fail('Form adı zorunlu.');
    const s = slugify(slug || `${isletme || ''} ${name}`);
    if (!s) fail('Geçerli bir form linki girin.');
    if (db.forms.some((f) => f.slug === s && !f.deletedAt)) fail('Bu form linki kullanılıyor, başka bir link seçin.');
    const content = buildFormContent(templateId);
    content.settings.title = name.trim();
    const form = {
      id: uid('f_'),
      name: name.trim(),
      isletme: (isletme || '').trim(),
      slug: s,
      control: clone(DEFAULT_CONTROL),
      draft: content,
      published: null,
      publishedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: admin.id
    };
    db.forms.push(form);
    log(db, admin.id, 'Form oluşturdu', form.name);
    return form.id;
  }));
}

export async function updateFormMeta(id, { name, isletme, slug }) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const f = db.forms.find((x) => x.id === id && !x.deletedAt);
    if (!f) fail('Form bulunamadı.');
    if (slug !== undefined) {
      const s = slugify(slug);
      if (!s) fail('Geçerli bir form linki girin.');
      if (db.forms.some((x) => x.slug === s && x.id !== id && !x.deletedAt)) fail('Bu form linki kullanılıyor.');
      if (s !== f.slug) log(db, admin.id, 'Form linkini değiştirdi', `${f.slug} → ${s}`);
      f.slug = s;
    }
    if (name !== undefined) f.name = name.trim() || f.name;
    if (isletme !== undefined) f.isletme = isletme.trim();
    f.updatedAt = Date.now();
    return true;
  }));
}

export async function saveDraft(id, draft) {
  return delay(tx((db) => {
    const { user, form, perms } = requirePerm(db, id, 'edit');
    const next = clone(draft);
    // KVKK ayarlarını sadece Ana Admin değiştirebilir
    if (user.role !== 'admin') next.settings.kvkk = clone(form.draft.settings.kvkk);
    const keys = next.fields.map((x) => x.key);
    if (new Set(keys).size !== keys.length) fail('İki alanın teknik anahtarı aynı olamaz.');
    if (next.fields.filter((x) => x.type === 'randevu').length > 1) fail('Bir formda en fazla bir randevu alanı olabilir.');
    for (const fld of next.fields) {
      if (['select', 'radio', 'checkbox'].includes(fld.type)) {
        fld.options = (fld.options || []).map((o) => String(o).trim()).filter(Boolean);
        if (!fld.options.length) fail(`"${fld.label}" alanına en az bir seçenek ekleyin.`);
      }
    }
    form.draft = next;
    form.updatedAt = Date.now();
    void perms;
    return true;
  }));
}

// Yeni randevu ayarları yüzünden artık uymayan gelecek randevular
export function findAffectedAppointments(db, form, cfg) {
  const t = today();
  return db.appointments.filter((a) => {
    if (a.formId !== form.id || a.date < t || !ACTIVE_STATUSES.includes(a.status) || a.status === 'geldi') return false;
    if ((cfg.closedDates || []).includes(a.date)) return true;
    const day = dayOfWeek(a.date);
    const ranges = cfg.hours?.[day] || [];
    const inRange = ranges.some((r) => r.start <= a.start && a.end <= r.end);
    return !inRange;
  });
}

export async function previewPublishImpact(id) {
  return delay(read((db) => {
    const { form } = requirePerm(db, id, 'edit');
    return findAffectedAppointments(db, form, form.draft.randevu).map((a) => ({ ...a }));
  }));
}

export async function publishForm(id, { note = '', cancelAffected = false } = {}) {
  return delay(tx((db) => {
    const { user, form } = requirePerm(db, id, 'edit');
    form.published = clone(form.draft);
    form.publishedAt = Date.now();
    form.updatedAt = Date.now();
    db.versions.unshift({ id: uid('v_'), formId: id, snapshot: clone(form.draft), by: user.id, byName: user.name, at: Date.now(), note });
    log(db, user.id, 'Formu yayınladı', form.name);
    if (cancelAffected) {
      const affected = findAffectedAppointments(db, form, form.published.randevu);
      for (const a of affected) {
        a.status = 'iptal';
        a.cancelledBy = 'isletme';
        if (a.contact?.email) mail(db, a.contact.email, `${form.isletme || form.name} – Randevunuz iptal edildi`, `Çalışma saatlerindeki değişiklik nedeniyle ${a.date} ${a.start} randevunuz iptal edildi. Yeni randevu için: ${window.location.origin}/f/${form.slug}`, 'randevu');
      }
      if (affected.length) log(db, user.id, `${affected.length} randevuyu iptal etti (saat değişikliği)`, form.name);
    }
    if (user.role !== 'admin' && form.published.settings.notifyAdminOnEdit) {
      const admins = db.users.filter((u) => u.role === 'admin' && !u.deletedAt).map((u) => u.email);
      mail(db, admins, `Form düzenlendi: ${form.name}`, `${user.name} (${user.email}) formu düzenleyip yayınladı.`, 'bilgi');
    }
    return true;
  }));
}

export async function updateControl(id, control) {
  return delay(tx((db) => {
    const { user, form } = requirePerm(db, id, 'edit');
    form.control = { ...form.control, ...control };
    form.updatedAt = Date.now();
    log(db, user.id, 'Form durumunu güncelledi', `${form.name}: ${form.control.status}`);
    return form.control;
  }));
}

export async function discardDraft(id) {
  return delay(tx((db) => {
    const { form } = requirePerm(db, id, 'edit');
    if (form.published) form.draft = clone(form.published);
    return clone(form.draft);
  }));
}

// Hangi alanda kaç kayıtta veri var (alan silinirken uyarı için)
export async function fieldUsage(formId) {
  return delay(read((db) => {
    requirePerm(db, formId, 'edit');
    const counts = {};
    for (const s of db.submissions) {
      if (s.formId !== formId || s.deletedAt) continue;
      for (const k of Object.keys(s.values)) counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }));
}

export async function listVersions(formId) {
  return delay(read((db) => {
    requirePerm(db, formId, 'edit');
    return db.versions.filter((v) => v.formId === formId).map((v) => ({ id: v.id, by: v.byName, at: v.at, note: v.note, fieldCount: v.snapshot.fields.length }));
  }));
}

export async function restoreVersion(versionId) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const v = db.versions.find((x) => x.id === versionId);
    if (!v) fail('Sürüm bulunamadı.');
    const form = db.forms.find((f) => f.id === v.formId);
    form.draft = clone(v.snapshot);
    form.updatedAt = Date.now();
    log(db, admin.id, 'Eski sürümü taslağa geri yükledi', form.name);
    return true;
  }));
}

export async function duplicateForm(id) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const f = db.forms.find((x) => x.id === id && !x.deletedAt);
    if (!f) fail('Form bulunamadı.');
    let slug = `${f.slug}-kopya`;
    let i = 2;
    while (db.forms.some((x) => x.slug === slug && !x.deletedAt)) slug = `${f.slug}-kopya-${i++}`;
    const copy = { ...clone(f), id: uid('f_'), name: `${f.name} (kopya)`, slug, published: null, publishedAt: null, createdAt: Date.now(), updatedAt: Date.now(), control: { ...clone(f.control), status: 'pasif' } };
    db.forms.push(copy);
    log(db, admin.id, 'Formu kopyaladı', f.name);
    return copy.id;
  }));
}

export async function deleteForm(id) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const f = db.forms.find((x) => x.id === id && !x.deletedAt);
    if (!f) fail('Form bulunamadı.');
    f.deletedAt = Date.now();
    log(db, admin.id, 'Formu sildi (çöp kutusu)', f.name);
    return true;
  }));
}

// ---------------------------------------------------------------- herkese açık form

export async function getPublicForm(slug) {
  return delay(read((db) => {
    const form = db.forms.find((f) => f.slug === slug && !f.deletedAt);
    if (!form) return null;
    const state = formIsOpen(db, form);
    const content = clone(form.published || form.draft);
    return { id: form.id, slug: form.slug, name: form.name, isletme: form.isletme, content, lang: content.settings.language || 'tr', turnstileKey: TURNSTILE_SITE_KEY, ...state };
  }));
}

export async function getAvailability(slug, { date, serviceId, resourceId, partySize }) {
  return delay(read((db) => {
    const form = db.forms.find((f) => f.slug === slug && !f.deletedAt);
    if (!form?.published) return [];
    const cfg = form.published.randevu;
    const appts = db.appointments.filter((a) => a.formId === form.id);
    const blocks = db.blocks.filter((b) => b.formId === form.id);
    return getSlots(cfg, appts, blocks, { date, serviceId, resourceId: resourceId || null, partySize: Number(partySize || 1) });
  }));
}

// Sunucuda IP bazlı yapılacak; burada tarayıcı bazlı basit sınır
const RATE_KEY = 'batilmer_rate';
function rateLimited() {
  const now = Date.now();
  const list = JSON.parse(localStorage.getItem(RATE_KEY) || '[]').filter((x) => now - x < 10 * 60000);
  if (list.length >= 10) return true;
  list.push(now);
  localStorage.setItem(RATE_KEY, JSON.stringify(list));
  return false;
}

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

function fillTemplate(text, labels, values, cfg) {
  return String(text || '').replace(/\{([a-z0-9_]+)\}/gi, (m, k) => {
    if (!(k in values)) return k in labels ? '' : m;
    return displayValue(null, values[k], cfg);
  });
}

export async function submitForm(slug, values, { honeypot = '', startedAt = 0, kvkkAccepted = false, turnstileToken = '' } = {}) {
  const pre = read((db) => db.forms.find((f) => f.slug === slug && !f.deletedAt));
  const lang = pre?.published?.settings?.language || 'tr';
  // Bot kontrolü: gizli alan doluysa ya da form 2 saniyeden kısa sürede gönderildiyse
  // sessizce "başarılı" dön, hiçbir şey kaydetme.
  if (honeypot || (startedAt && Date.now() - startedAt < 2000)) return delay({ ok: true, spam: true });
  if (rateLimited()) fail(tt(lang, 'rateLimited'));
  // Turnstile anahtarı tanımlıysa token zorunlu. SUNUCUDA token, Cloudflare'in siteverify servisiyle doğrulanmalı.
  if (TURNSTILE_SITE_KEY && !turnstileToken) fail(tt(lang, 'verifyFailed'));

  try {
    return await delay(tx((db) => submitTx(db, slug, values, kvkkAccepted, lang)));
  } catch (e) {
    if (e instanceof StorageFullError) fail(tt(lang, 'storageFull'));
    throw e;
  }
}

function submitTx(db, slug, values, kvkkAccepted, lang) {
  const form = db.forms.find((f) => f.slug === slug && !f.deletedAt);
  if (!form) fail(tt(lang, 'notFound'));
  const state = formIsOpen(db, form);
  if (!state.open) fail(state.reason || tt(lang, 'formClosed'));
  const content = form.published;
  const fields = content.fields;
  const errors = validateAll(fields, values, lang);
  if (Object.keys(errors).length) {
    const e = new ApiError(tt(lang, 'checkFields'), 'dogrulama');
    e.fields = errors;
    throw e;
  }
  if (content.settings.kvkk?.enabled && !kvkkAccepted) fail(tt(lang, 'consentRequired'));

  // Sadece tanımlı VE görünür (koşulu sağlanan) alanlar kaydedilir
  const vis = visibilityMap(fields, values);
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === 'dosya' && vis[f.key] && v && (typeof v.dataUrl !== 'string' || !v.dataUrl.startsWith('data:'))) {
      const e = new ApiError(tt(lang, 'checkFields'), 'dogrulama');
      e.fields = { [f.key]: tt(lang, 'genericError') };
      throw e;
    }
  }
  const clean = {};
  for (const f of fields) {
    if (!vis[f.key]) continue;
    const v = values[f.key];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (f.type === 'dosya') clean[f.key] = { name: String(v.name).slice(0, 150), size: v.size, type: v.type, dataUrl: v.dataUrl };
    else clean[f.key] = typeof v === 'string' ? v.trim() : v;
  }

  // Mükerrer kayıt kontrolü
  const dup = content.settings.duplicateCheck;
  if (dup && dup !== 'yok') {
    const fld = fields.find((f) => f.type === dup);
    if (fld && clean[fld.key]) {
      const norm = (v) => String(v).replace(/\s/g, '').toLowerCase();
      const exists = db.submissions.some((s) => s.formId === form.id && !s.deletedAt && s.values[fld.key] && norm(s.values[fld.key]) === norm(clean[fld.key]));
      if (exists) fail(tt(lang, 'duplicate'));
    }
  }

  const contact = contactFrom(fields, clean);
  const submission = {
    id: uid('s_'),
    formId: form.id,
    values: clean,
    labels: Object.fromEntries(fields.map((f) => [f.key, f.label])),
    types: Object.fromEntries(fields.map((f) => [f.key, f.type])),
    order: fields.map((f) => f.key),
    createdAt: Date.now(),
    kvkkAt: content.settings.kvkk?.enabled ? Date.now() : null,
    ip: '127.0.0.1 (yerel test)',
    userAgent: navigator.userAgent.slice(0, 200),
    appointmentId: null,
    status: 'yeni',
    notes: []
  };

  // Randevu: son kontrol + kayıt (MySQL'de transaction içinde yapılacak)
  const rField = fields.find((f) => f.type === 'randevu' && vis[f.key]);
  let appt = null;
  const biz = form.isletme || form.name;
  if (rField && clean[rField.key]) {
    const cfg = content.randevu;
    const r = clean[rField.key];
    // Kişi başı aktif randevu sınırı
    if (Number(cfg.perContactLimit) > 0 && (contact.email || contact.phone)) {
      const active = db.appointments.filter((a) => a.formId === form.id && a.date >= today() && ACTIVE_STATUSES.includes(a.status) && a.status !== 'geldi' &&
        ((contact.email && a.contact?.email === contact.email) || (contact.phone && a.contact?.phone === contact.phone)));
      if (active.length >= Number(cfg.perContactLimit)) fail(tt(lang, 'contactLimit', { n: cfg.perContactLimit }));
    }
    const appts = db.appointments.filter((a) => a.formId === form.id);
    const blocks = db.blocks.filter((b) => b.formId === form.id);
    const check = checkSlot(cfg, appts, blocks, { date: r.date, time: r.time, serviceId: r.serviceId, resourceId: r.resourceId || null, partySize: Number(r.partySize || 1) });
    if (!check.ok) throw new ApiError(tt(lang, 'slotTaken'), 'saat_doldu');
    const svc = serviceById(cfg, r.serviceId);
    appt = {
      id: uid('a_'),
      formId: form.id,
      submissionId: submission.id,
      serviceId: svc.id,
      resourceId: check.resourceId,
      date: r.date,
      start: r.time,
      end: endTime(cfg, svc.id, r.time),
      buffer: Number(svc.buffer || 0),
      partySize: Number(r.partySize || 1),
      status: cfg.approval === 'manual' ? 'bekliyor' : 'onaylandi',
      cancelToken: token(),
      reminderSent: false,
      contact,
      lang,
      createdAt: Date.now(),
      source: 'form'
    };
    db.appointments.push(appt);
    submission.appointmentId = appt.id;
    submission.values[rField.key] = { ...r, resourceId: check.resourceId };
    const pending = appt.status === 'bekliyor';
    if (contact.email) {
      mail(db, contact.email, tt(lang, pending ? 'mailRequestSubject' : 'mailConfirmSubject', { x: biz }),
        appointmentMailBody(form, appt, cfg, pending ? tt(lang, 'mailPendingText') : tt(lang, 'statusLabels').onaylandi, lang), 'randevu');
    }
    if (cfg.sms?.confirm && contact.phone) {
      sms(db, contact.phone, tt(lang, pending ? 'smsPending' : 'smsConfirm', { x: biz, d: `${appt.date} ${appt.start}`, u: cancelUrl(appt) }));
    }
  }

  db.submissions.push(submission);

  // Otomatik cevap (randevulu gönderimlerde müşteriye zaten randevu maili gittiği için gönderilmez)
  const ar = content.settings.autoReply;
  if (ar?.enabled && contact.email && !appt) {
    mail(db, contact.email, fillTemplate(ar.subject, submission.labels, clean, content.randevu), fillTemplate(ar.body, submission.labels, clean, content.randevu), 'otomatik-cevap');
  }

  const notify = content.settings.notifyEmails || [];
  if (notify.length) {
    const body = submission.order
      .filter((k) => submission.values[k] !== undefined)
      .map((k) => `${submission.labels[k]}: ${displayValue(submission.types[k], submission.values[k], content.randevu)}`)
      .join('\n');
    mail(db, notify, `Yeni kayıt: ${form.name}`, `${body}\n\nPanel: ${window.location.origin}/panel/formlar/${form.id}/kayitlar`, 'bildirim');
  }
  return {
    ok: true,
    afterSubmit: content.settings.afterSubmit,
    successMessage: content.settings.successMessage,
    redirectUrl: content.settings.redirectUrl,
    appointment: appt && { date: appt.date, start: appt.start, status: appt.status }
  };
}


// ---------------------------------------------------------------- kayıtlar


export async function listSubmissions(formId, { q = '', from = '', to = '', status = '' } = {}) {
  return delay(read((db) => {
    const { form, perms } = requirePerm(db, formId, 'view');
    const query = q.trim().toLocaleLowerCase('tr');
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const rows = db.submissions
      .filter((s) => s.formId === formId && !s.deletedAt)
      .filter((s) => {
        const ds = dateOfMs(s.createdAt);
        if (from && ds < from) return false;
        if (to && ds > to) return false;
        if (status && (s.status || 'yeni') !== status) return false;
        if (!query) return true;
        const inValues = Object.entries(s.values).some(([k, v]) => displayValue(s.types[k], v, cfg).toLocaleLowerCase('tr').includes(query));
        const inNotes = (s.notes || []).some((n) => n.text.toLocaleLowerCase('tr').includes(query));
        return inValues || inNotes;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => {
        const appt = s.appointmentId ? db.appointments.find((a) => a.id === s.appointmentId) : null;
        return { ...clone(s), status: s.status || 'yeni', notes: s.notes || [], appointmentStatus: appt?.status || null };
      });
    const counts = Object.fromEntries(SUBMISSION_STATUSES.map((x) => [x.value, 0]));
    for (const s of db.submissions) if (s.formId === formId && !s.deletedAt) counts[s.status || 'yeni'] = (counts[s.status || 'yeni'] || 0) + 1;
    return { rows, perms, fields: content.fields, randevu: cfg, counts };
  }));
}

export async function setSubmissionStatus(id, status) {
  if (!SUBMISSION_STATUSES.some((s) => s.value === status)) fail('Geçersiz durum.');
  return delay(tx((db) => {
    const s = db.submissions.find((x) => x.id === id && !x.deletedAt);
    if (!s) fail('Kayıt bulunamadı.');
    const { user, form } = requirePerm(db, s.formId, 'view');
    const prev = s.status || 'yeni';
    s.status = status;
    s.notes = s.notes || [];
    if (prev !== status) s.notes.push({ id: uid('n_'), by: user.name, at: Date.now(), text: `Durum: ${submissionStatusLabel(prev)} → ${submissionStatusLabel(status)}`, system: true });
    log(db, user.id, `Kayıt durumu: ${submissionStatusLabel(status)}`, form.name);
    return clone(s);
  }));
}

export async function addSubmissionNote(id, text) {
  const clean = String(text || '').trim();
  if (!clean) fail('Not boş olamaz.');
  if (clean.length > 1000) fail('Not en fazla 1000 karakter olabilir.');
  return delay(tx((db) => {
    const s = db.submissions.find((x) => x.id === id && !x.deletedAt);
    if (!s) fail('Kayıt bulunamadı.');
    const { user, form } = requirePerm(db, s.formId, 'view');
    s.notes = s.notes || [];
    s.notes.push({ id: uid('n_'), by: user.name, at: Date.now(), text: clean });
    log(db, user.id, 'Kayda not ekledi', form.name);
    return clone(s);
  }));
}

export async function deleteSubmission(id) {
  return delay(tx((db) => {
    const s = db.submissions.find((x) => x.id === id && !x.deletedAt);
    if (!s) fail('Kayıt bulunamadı.');
    const { user, form } = requirePerm(db, s.formId, 'delete');
    s.deletedAt = Date.now();
    if (s.appointmentId) {
      const a = db.appointments.find((x) => x.id === s.appointmentId);
      if (a && ACTIVE_STATUSES.includes(a.status)) a.status = 'iptal';
    }
    log(db, user.id, 'Kayıt sildi (çöp kutusu)', form.name);
    return true;
  }));
}

export async function exportSubmissions(formId, rows) {
  return delay(tx((db) => {
    const { user, form } = requirePerm(db, formId, 'excel');
    const content = form.published || form.draft;
    const cfg = content.randevu;
    // Sütunlar: güncel alanlar + eski kayıtlarda kalmış alanlar (form sonradan değiştiyse)
    const keys = [];
    const labels = {};
    const types = {};
    for (const f of content.fields) {
      keys.push(f.key);
      labels[f.key] = f.label;
      types[f.key] = f.type;
    }
    for (const s of rows) {
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
    const data = rows.map((s) => {
      const row = [fmt(s.createdAt)];
      for (const k of keys) {
        const v = s.values[k];
        if (types[k] === 'randevu') {
          const r = v && typeof v === 'object' ? v : null;
          row.push(r?.date || '', r?.time || '', r ? serviceById(cfg, r.serviceId)?.name || '' : '');
          if (hasResources) row.push(r ? cfg.resources.find((x) => x.id === r.resourceId)?.name || '' : '');
          if (isKisi) row.push(r ? String(r.partySize || 1) : '');
          row.push(s.appointmentStatus ? STATUS_LABELS[s.appointmentStatus] : '');
        } else row.push(displayValue(types[k], v, cfg));
      }
      const userNotes = (s.notes || []).filter((n) => !n.system);
      row.push(submissionStatusLabel(s.status), userNotes.length ? userNotes[userNotes.length - 1].text : '', fmt(s.kvkkAt));
      return row;
    });
    log(db, user.id, `Excel indirdi (${rows.length} kayıt)`, form.name);
    return { headers, data, filename: `${form.slug}-kayitlar-${today()}.xlsx` };
  }));
}

// İstatistikler (son N gün)
export async function formStats(formId, days = 30) {
  return delay(read((db) => {
    const { form, perms } = requirePerm(db, formId, 'view');
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const subs = db.submissions.filter((s) => s.formId === formId && !s.deletedAt);
    const start = addDays(today(), -(days - 1));
    const daily = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      daily.push({ date: d, count: 0 });
    }
    const idx = Object.fromEntries(daily.map((x, i) => [x.date, i]));
    for (const s of subs) {
      const d = dateOfMs(s.createdAt);
      if (idx[d] !== undefined) daily[idx[d]].count += 1;
    }
    const statusCounts = SUBMISSION_STATUSES.map((st) => ({ ...st, count: subs.filter((s) => (s.status || 'yeni') === st.value).length }));
    const hasRandevu = content.fields.some((f) => f.type === 'randevu');
    let randevu = null;
    if (hasRandevu && perms.randevu) {
      const appts = db.appointments.filter((a) => a.formId === formId);
      const inRange = appts.filter((a) => a.date >= start && a.date <= today());
      const byStatus = Object.keys(STATUS_LABELS).map((k) => ({ value: k, label: STATUS_LABELS[k], count: inRange.filter((a) => a.status === k).length }));
      const byService = (cfg.services || []).map((s) => ({ label: s.name, count: inRange.filter((a) => a.serviceId === s.id && a.status !== 'iptal').length }));
      const geldi = inRange.filter((a) => a.status === 'geldi').length;
      const gelmedi = inRange.filter((a) => a.status === 'gelmedi').length;
      const upcoming = appts.filter((a) => a.date >= today() && a.date <= addDays(today(), 6) && ACTIVE_STATUSES.includes(a.status)).length;
      randevu = { byStatus, byService, noShowRate: geldi + gelmedi ? Math.round((gelmedi / (geldi + gelmedi)) * 100) : null, upcoming, total: inRange.length };
    }
    return {
      form: { id: form.id, name: form.name, isletme: form.isletme },
      days,
      total: subs.length,
      inRange: daily.reduce((a, b) => a + b.count, 0),
      daily,
      statusCounts,
      randevu
    };
  }));
}

// ---------------------------------------------------------------- randevular


function cancelUrl(appt) {
  return `${window.location.origin}/iptal/${appt.cancelToken}`;
}

function sms(db, phone, text) {
  // Canlıda SMS sağlayıcısının API'si ile gönderilecek. Yerelde "Giden mailler" sayfasında SMS olarak görünür.
  if (!phone) return;
  db.outbox.unshift({ id: uid('m_'), to: phone, subject: 'SMS', body: text, kind: 'sms', at: Date.now() });
}

export async function listAppointments(formId, { from, to }) {
  return delay(read((db) => {
    const { form, perms } = requirePerm(db, formId, 'randevu');
    const cfg = (form.published || form.draft).randevu;
    const items = db.appointments
      .filter((a) => a.formId === formId && a.date >= from && a.date <= to)
      .map((a) => {
        const sub = db.submissions.find((s) => s.id === a.submissionId);
        return { ...clone(a), submission: sub ? clone(sub) : null };
      })
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const blocks = db.blocks.filter((b) => b.formId === formId && b.date >= from && b.date <= to).map(clone);
    return { items, blocks, cfg: clone(cfg), perms, form: { id: form.id, name: form.name, slug: form.slug, isletme: form.isletme } };
  }));
}

// Kullanıcının randevu yetkisi olan TÜM formların randevuları (tek takvim)
export async function listAllAppointments({ from, to }) {
  return delay(read((db) => {
    const u = requireUser(db);
    const forms = db.forms.filter((f) => !f.deletedAt && permsFor(db, u, f.id).randevu && (f.published || f.draft).fields.some((x) => x.type === 'randevu'));
    const formIds = new Set(forms.map((f) => f.id));
    const items = db.appointments
      .filter((a) => formIds.has(a.formId) && a.date >= from && a.date <= to)
      .map((a) => {
        const f = forms.find((x) => x.id === a.formId);
        const cfg = (f.published || f.draft).randevu;
        return {
          id: a.id, formId: a.formId, date: a.date, start: a.start, end: a.end, status: a.status, partySize: a.partySize,
          name: a.contact?.name || '', service: serviceById(cfg, a.serviceId)?.name || '',
          resource: (cfg.resources || []).find((r) => r.id === a.resourceId)?.name || ''
        };
      })
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return { forms: forms.map((f) => ({ id: f.id, name: f.name, isletme: f.isletme })), items };
  }));
}

export async function adminSlots(formId, { date, serviceId, resourceId, partySize, excludeId }) {
  return delay(read((db) => {
    const { form } = requirePerm(db, formId, 'randevu');
    const cfg = (form.published || form.draft).randevu;
    return getSlots(cfg, db.appointments.filter((a) => a.formId === formId), db.blocks.filter((b) => b.formId === formId), {
      date, serviceId, resourceId: resourceId || null, partySize: Number(partySize || 1), excludeId, ignoreNotice: true
    });
  }));
}

export async function setAppointmentStatus(id, status) {
  if (!STATUS_LABELS[status]) fail('Geçersiz durum.');
  return delay(tx((db) => {
    const a = db.appointments.find((x) => x.id === id);
    if (!a) fail('Randevu bulunamadı.');
    const { user, form } = requirePerm(db, a.formId, 'randevu');
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const lang = a.lang || content.settings.language || 'tr';
    const biz = form.isletme || form.name;
    const prev = a.status;
    a.status = status;
    if (status === 'iptal') a.cancelledBy = 'isletme';
    if (prev !== status) {
      if (a.contact?.email) {
        if (status === 'onaylandi') mail(db, a.contact.email, tt(lang, 'mailApprovedSubject', { x: biz }), appointmentMailBody(form, a, cfg, tt(lang, 'statusLabels').onaylandi, lang), 'randevu');
        if (status === 'iptal') mail(db, a.contact.email, tt(lang, 'mailCancelledSubject', { x: biz }), tt(lang, 'mailCancelledBody', { d: `${a.date} ${a.start}`, u: `${window.location.origin}/f/${form.slug}` }), 'randevu');
      }
      if (cfg.sms?.confirm && a.contact?.phone) {
        if (status === 'onaylandi') sms(db, a.contact.phone, tt(lang, 'smsConfirm', { x: biz, d: `${a.date} ${a.start}`, u: cancelUrl(a) }));
        if (status === 'iptal') sms(db, a.contact.phone, tt(lang, 'smsCancelled', { x: biz, d: `${a.date} ${a.start}` }));
      }
    }
    log(db, user.id, `Randevu durumu: ${STATUS_LABELS[status]}`, `${form.name} ${a.date} ${a.start}`);
    return true;
  }));
}

export async function moveAppointment(id, { date, time, resourceId }) {
  return delay(tx((db) => {
    const a = db.appointments.find((x) => x.id === id);
    if (!a) fail('Randevu bulunamadı.');
    const { user, form } = requirePerm(db, a.formId, 'randevu');
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const lang = a.lang || content.settings.language || 'tr';
    const biz = form.isletme || form.name;
    const check = checkSlot(cfg, db.appointments.filter((x) => x.formId === a.formId), db.blocks.filter((b) => b.formId === a.formId), {
      date, time, serviceId: a.serviceId, resourceId: resourceId || null, partySize: a.partySize, excludeId: a.id, ignoreNotice: true
    });
    if (!check.ok) fail('Bu saat dolu veya çalışma saatleri dışında.');
    const old = `${a.date} ${a.start}`;
    a.date = date;
    a.start = time;
    a.end = endTime(cfg, a.serviceId, time);
    a.resourceId = check.resourceId;
    a.reminderSent = false;
    const sub = db.submissions.find((s) => s.id === a.submissionId);
    if (sub) {
      const rKey = Object.keys(sub.types).find((k) => sub.types[k] === 'randevu');
      if (rKey && sub.values[rKey]) sub.values[rKey] = { ...sub.values[rKey], date, time, resourceId: a.resourceId };
    }
    if (a.contact?.email) mail(db, a.contact.email, tt(lang, 'mailMovedSubject', { x: biz }), `${tt(lang, 'mailOld')} ${old}\n` + appointmentMailBody(form, a, cfg, tt(lang, 'statusLabels')[a.status], lang), 'randevu');
    if (cfg.sms?.confirm && a.contact?.phone) sms(db, a.contact.phone, tt(lang, 'smsMoved', { x: biz, d: `${date} ${time}` }));
    log(db, user.id, 'Randevu taşıdı', `${form.name} ${old} → ${date} ${time}`);
    return true;
  }));
}

export async function createManualAppointment(formId, { name, phone, email, note, date, time, serviceId, resourceId, partySize }) {
  return delay(tx((db) => {
    const { user, form } = requirePerm(db, formId, 'randevu');
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const lang = content.settings.language || 'tr';
    if (!name?.trim()) fail('Ad Soyad zorunlu.');
    const check = checkSlot(cfg, db.appointments.filter((a) => a.formId === formId), db.blocks.filter((b) => b.formId === formId), {
      date, time, serviceId, resourceId: resourceId || null, partySize: Number(partySize || 1), ignoreNotice: true
    });
    if (!check.ok) fail('Bu saat dolu veya çalışma saatleri dışında.');
    const svc = serviceById(cfg, serviceId);
    const contact = { name: name.trim(), email: (email || '').trim().toLowerCase(), phone: String(phone || '').replace(/\D/g, '') };
    const subId = uid('s_');
    const rKey = content.fields.find((f) => f.type === 'randevu')?.key || 'randevu';
    const values = { [rKey]: { date, time, serviceId: svc.id, resourceId: check.resourceId, partySize: Number(partySize || 1) } };
    const labels = { manuel_ad: 'Ad Soyad', manuel_tel: 'Telefon', manuel_email: 'E-posta', manuel_not: 'Not', [rKey]: 'Randevu' };
    const types = { manuel_ad: 'text', manuel_tel: 'tel', manuel_email: 'email', manuel_not: 'textarea', [rKey]: 'randevu' };
    values.manuel_ad = contact.name;
    if (contact.phone) values.manuel_tel = phone;
    if (contact.email) values.manuel_email = contact.email;
    if (note) values.manuel_not = note;
    const appt = {
      id: uid('a_'), formId, submissionId: subId, serviceId: svc.id, resourceId: check.resourceId, date, start: time,
      end: endTime(cfg, svc.id, time), buffer: Number(svc.buffer || 0), partySize: Number(partySize || 1), status: 'onaylandi',
      cancelToken: token(), reminderSent: false, contact, lang, createdAt: Date.now(), source: 'manuel'
    };
    db.appointments.push(appt);
    db.submissions.push({
      id: subId, formId, values, labels, types, order: ['manuel_ad', 'manuel_tel', 'manuel_email', rKey, 'manuel_not'].filter((k) => values[k] !== undefined),
      createdAt: Date.now(), kvkkAt: null, ip: 'panel (manuel)', appointmentId: appt.id, manual: true, status: 'yeni', notes: []
    });
    const biz = form.isletme || form.name;
    if (contact.email) mail(db, contact.email, tt(lang, 'mailConfirmSubject', { x: biz }), appointmentMailBody(form, appt, cfg, tt(lang, 'statusLabels').onaylandi, lang), 'randevu');
    if (cfg.sms?.confirm && contact.phone) sms(db, contact.phone, tt(lang, 'smsConfirm', { x: biz, d: `${date} ${time}`, u: cancelUrl(appt) }));
    log(db, user.id, 'Manuel randevu ekledi', `${form.name} ${date} ${time}`);
    return appt.id;
  }));
}

export async function addBlock(formId, { date, start, end, resourceId, note }) {
  if (!date || !start || !end || start >= end) fail('Geçerli bir tarih ve saat aralığı girin.');
  return delay(tx((db) => {
    const { user, form } = requirePerm(db, formId, 'randevu');
    db.blocks.push({ id: uid('b_'), formId, date, start, end, resourceId: resourceId || null, note: note || '' });
    log(db, user.id, 'Saat blokladı', `${form.name} ${date} ${start}-${end}`);
    return true;
  }));
}

export async function removeBlock(id) {
  return delay(tx((db) => {
    const b = db.blocks.find((x) => x.id === id);
    if (!b) fail('Blok bulunamadı.');
    const { user } = requirePerm(db, b.formId, 'randevu');
    db.blocks = db.blocks.filter((x) => x.id !== id);
    log(db, user.id, 'Saat bloğunu kaldırdı', `${b.date} ${b.start}-${b.end}`);
    return true;
  }));
}

export async function getAppointmentByToken(tok) {
  return delay(read((db) => {
    const a = db.appointments.find((x) => x.cancelToken === tok);
    if (!a) return null;
    const form = db.forms.find((f) => f.id === a.formId);
    if (!form) return null;
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const cutoffMs = dateTimeToMs(a.date, a.start) - Number(cfg.cancelCutoffHours || 0) * 3600000;
    return {
      date: a.date, start: a.start, end: a.end, status: a.status,
      service: serviceById(cfg, a.serviceId)?.name, isletme: form.isletme || form.name, slug: form.slug,
      lang: a.lang || content.settings.language || 'tr',
      canCancel: ACTIVE_STATUSES.includes(a.status) && a.status !== 'geldi' && Date.now() < cutoffMs,
      cutoffHours: cfg.cancelCutoffHours
    };
  }));
}

export async function cancelByToken(tok) {
  return delay(tx((db) => {
    const a = db.appointments.find((x) => x.cancelToken === tok);
    if (!a) fail('Randevu bulunamadı.');
    const form = db.forms.find((f) => f.id === a.formId);
    const content = form.published || form.draft;
    const cfg = content.randevu;
    const lang = a.lang || content.settings.language || 'tr';
    const cutoffMs = dateTimeToMs(a.date, a.start) - Number(cfg.cancelCutoffHours || 0) * 3600000;
    if (!ACTIVE_STATUSES.includes(a.status) || a.status === 'geldi') fail(tt(lang, 'alreadyCancelled'));
    if (Date.now() >= cutoffMs) fail(tt(lang, 'cutoffPassed', { n: cfg.cancelCutoffHours }));
    a.status = 'iptal';
    a.cancelledBy = 'musteri';
    const notify = content.settings.notifyEmails || [];
    mail(db, notify, `Randevu iptal edildi: ${form.name}`, `${a.contact?.name || 'Müşteri'} ${a.date} ${a.start} randevusunu iptal etti. Saat yeniden açıldı.`, 'bildirim');
    return true;
  }));
}

// ---------------------------------------------------------------- çöp kutusu, log, giden mail

export async function listTrash() {
  return delay(read((db) => {
    requireAdmin(db);
    return {
      forms: db.forms.filter((f) => f.deletedAt).map((f) => ({ id: f.id, name: f.name, slug: f.slug, deletedAt: f.deletedAt })),
      submissions: db.submissions.filter((s) => s.deletedAt).map((s) => ({
        id: s.id, formName: db.forms.find((f) => f.id === s.formId)?.name || '-', deletedAt: s.deletedAt, createdAt: s.createdAt,
        preview: (s.order || []).slice(0, 2).map((k) => (typeof s.values[k] === 'object' ? '' : s.values[k])).filter(Boolean).join(' · ')
      })),
      users: db.users.filter((u) => u.deletedAt).map((u) => ({ id: u.id, name: u.name, email: u.email, deletedAt: u.deletedAt }))
    };
  }));
}

export async function restoreItem(kind, id) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    const list = { form: db.forms, submission: db.submissions, user: db.users }[kind];
    const item = list?.find((x) => x.id === id);
    if (!item) fail('Bulunamadı.');
    if (kind === 'form' && db.forms.some((f) => f.slug === item.slug && !f.deletedAt && f.id !== id)) fail('Bu formun linki başka bir formda kullanılıyor. Önce o formun linkini değiştirin.');
    if (kind === 'user' && db.users.some((u) => u.email === item.email && !u.deletedAt && u.id !== id)) fail('Bu e-posta ile aktif bir kullanıcı var.');
    delete item.deletedAt;
    if (kind === 'user') item.active = true;
    log(db, admin.id, 'Çöp kutusundan geri aldı', kind);
    return true;
  }));
}

export async function purgeItem(kind, id) {
  return delay(tx((db) => {
    const admin = requireAdmin(db);
    if (kind === 'form') {
      db.forms = db.forms.filter((f) => f.id !== id);
      db.submissions = db.submissions.filter((s) => s.formId !== id);
      db.appointments = db.appointments.filter((a) => a.formId !== id);
      db.permissions = db.permissions.filter((p) => p.formId !== id);
      db.versions = db.versions.filter((v) => v.formId !== id);
      db.blocks = db.blocks.filter((b) => b.formId !== id);
    } else if (kind === 'submission') {
      const s = db.submissions.find((x) => x.id === id);
      db.submissions = db.submissions.filter((x) => x.id !== id);
      if (s?.appointmentId) db.appointments = db.appointments.filter((a) => a.id !== s.appointmentId);
    } else if (kind === 'user') {
      db.users = db.users.filter((u) => u.id !== id || u.role === 'admin');
      db.permissions = db.permissions.filter((p) => p.userId !== id);
    }
    log(db, admin.id, 'Kalıcı olarak sildi', kind);
    return true;
  }));
}

export async function listLogs() {
  return delay(read((db) => {
    requireAdmin(db);
    return db.logs.slice(0, 500).map((l) => ({ ...l, userName: db.users.find((u) => u.id === l.userId)?.name || 'Sistem' }));
  }));
}

export async function listOutbox() {
  return delay(read((db) => {
    requireAdmin(db);
    return db.outbox.slice(0, 300);
  }));
}

export async function clearOutbox() {
  return delay(tx((db) => {
    requireAdmin(db);
    db.outbox = [];
    return true;
  }));
}

// ---------------------------------------------------------------- zamanlayıcı
// Sunucuda her 5 dakikada bir çalışan bir iş (cron/worker) olacak.
// Yerelde panel açıkken dakikada bir çalışıyor.

export function runScheduler() {
  tx((db) => {
    const now = Date.now();
    for (const a of db.appointments) {
      if (a.reminderSent || a.status !== 'onaylandi') continue;
      const form = db.forms.find((f) => f.id === a.formId);
      if (!form) continue;
      const content = form.published || form.draft;
      const cfg = content.randevu;
      const lang = a.lang || content.settings.language || 'tr';
      const biz = form.isletme || form.name;
      const startMs = dateTimeToMs(a.date, a.start);
      const hours = Number(cfg.reminderHours || 24);
      if (startMs > now && startMs - now <= hours * 3600000) {
        a.reminderSent = true;
        if (a.contact?.email) mail(db, a.contact.email, tt(lang, 'mailReminderSubject', { x: biz }), appointmentMailBody(form, a, cfg, tt(lang, 'statusLabels')[a.status], lang), 'hatirlatma');
        if (cfg.sms?.reminder && a.contact?.phone) sms(db, a.contact.phone, tt(lang, 'smsReminder', { x: biz, d: `${a.date} ${a.start}`, u: cancelUrl(a) }));
      }
    }
    // Saklama süresi dolan kayıtları kalıcı sil
    for (const form of db.forms) {
      const months = Number((form.published || form.draft).settings.retentionMonths || 0);
      if (!months) continue;
      const limit = now - months * 30 * 864e5;
      const expired = db.submissions.filter((s) => s.formId === form.id && s.createdAt < limit);
      if (expired.length) {
        const ids = new Set(expired.map((s) => s.id));
        db.submissions = db.submissions.filter((s) => !ids.has(s.id));
        db.appointments = db.appointments.filter((a) => !ids.has(a.submissionId));
        log(db, null, `Saklama süresi dolan ${expired.length} kayıt silindi`, form.name);
      }
    }
  });
}

export { addDays, today };
