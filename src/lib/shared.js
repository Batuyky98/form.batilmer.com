// Hem tarayıcıda hem sunucuda kullanılan ortak sabitler ve yardımcılar
import { maskTc } from './util.js';
import { serviceById } from './availability.js';

export const STATUS_LABELS = { bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı', iptal: 'İptal', geldi: 'Geldi', gelmedi: 'Gelmedi' };

export const SUBMISSION_STATUSES = [
  { value: 'yeni', label: 'Yeni', tone: 'blue' },
  { value: 'iletisim', label: 'İletişime geçildi', tone: 'amber' },
  { value: 'tamamlandi', label: 'Tamamlandı', tone: 'green' },
  { value: 'olumsuz', label: 'Olumsuz / vazgeçti', tone: 'gray' }
];

export const submissionStatusLabel = (v) => SUBMISSION_STATUSES.find((s) => s.value === v)?.label || 'Yeni';

export function displayValue(type, value, cfg, { mask = false } = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (type === 'tc' && mask) return maskTc(value);
  if (typeof value === 'object') {
    if (value.dataUrl !== undefined || value.fileId || type === 'dosya') return value.name || 'dosya';
    if (value.date) {
      const svc = cfg ? serviceById(cfg, value.serviceId) : null;
      const res = cfg?.resources?.find((r) => r.id === value.resourceId);
      return [value.date, value.time, svc?.name, res?.name, value.partySize > 1 ? `${value.partySize} kişi` : null].filter(Boolean).join(' · ');
    }
    return '';
  }
  return String(value);
}

// Formdaki cevaplardan iletişim bilgisi çıkarır (randevu mailleri, kişi başı sınır için)
export function contactFrom(fields, values) {
  const c = { name: '', email: '', phone: '' };
  for (const f of fields) {
    const v = values[f.key];
    if (!v) continue;
    if (f.type === 'email' && !c.email) c.email = String(v).trim().toLowerCase();
    if (f.type === 'tel' && !c.phone) c.phone = String(v).replace(/\D/g, '');
  }
  const texts = fields.filter((f) => f.type === 'text' && values[f.key]);
  const nameField = texts.find((f) => /(^|\s)(ad|adı|adınız|isim|name)/i.test(f.label)) || texts[0];
  if (nameField) c.name = String(values[nameField.key]).trim();
  return c;
}

// Otomatik cevap metnindeki {alan_anahtari} yerlerini doldurur
export function fillTemplate(text, labels, values, cfg) {
  return String(text || '').replace(/\{([a-z0-9_]+)\}/gi, (m, k) => {
    if (!(k in values)) return k in labels ? '' : m;
    return displayValue(null, values[k], cfg);
  });
}

// Şifre kuralı (tarayıcı ve sunucu aynı kuralı uygular)
export function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (!/[A-ZÇĞİÖŞÜ]/.test(pw) || !/[a-zçğıöşü]/.test(pw) || !/\d/.test(pw)) return 'Şifre büyük harf, küçük harf ve rakam içermeli.';
  return null;
}

// Oturum kuralları (sunucu uygular, panel 5 dakika önce uyarır)
export const SESSION_IDLE_MS = 2 * 3600000; // 2 saat hiçbir işlem yapılmazsa
export const SESSION_MAX_MS = 12 * 3600000; // sürekli kullanılsa bile 12 saatte bir yeniden giriş
export const SESSION_WARN_MS = 5 * 60000;
