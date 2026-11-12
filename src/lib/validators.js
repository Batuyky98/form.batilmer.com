// Alan doğrulamaları. Aynı kurallar sunucu tarafında da tekrar uygulanmalı (api.js submitForm içinde çağrılıyor).
import { t } from './i18n.js';
import { visibilityMap } from './conditions.js';

export function isValidTc(value) {
  const s = String(value || '');
  if (!/^[1-9][0-9]{10}$/.test(s)) return false;
  const d = s.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d11 === d[10];
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Türkiye numaraları (05xx…, sabit hat 02xx/03xx/04xx) ve +90 ile başlayanlar; yabancı numaralar için + ile 8-15 hane
export function isValidPhone(value) {
  const raw = String(value || '').trim();
  let d = phoneDigits(raw);
  if (raw.startsWith('+') && !raw.startsWith('+90')) return d.length >= 8 && d.length <= 15;
  if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  return /^0?5\d{9}$/.test(d) || /^0?[2-4]\d{9}$/.test(d);
}

// 05xx xxx xx xx biçimine maskeler (+ ile başlayan yabancı numaralara dokunmaz)
export function formatPhone(value) {
  const raw = String(value || '');
  if (raw.trim().startsWith('+')) return raw.replace(/[^\d+\s]/g, '').slice(0, 20);
  let d = phoneDigits(raw).slice(0, 11);
  if (d && d[0] !== '0') d = ('0' + d).slice(0, 11);
  const parts = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean);
  return parts.join(' ');
}

export const FILE_TYPES = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  png: ['image/png'],
  doc: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
};

export function fileExt(name) {
  const e = String(name || '').split('.').pop().toLowerCase();
  if (e === 'jpeg') return 'jpg';
  if (e === 'docx') return 'doc';
  if (e === 'xlsx') return 'xls';
  return e;
}

function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return String(v).trim() === '';
}

// Tek alan için hata metni döner (yoksa null)
export function validateField(field, value, lang = 'tr') {
  if (field.type === 'randevu') {
    if (field.required !== false && (!value || !value.date || !value.time)) return t(lang, 'pickSlot');
    return null;
  }
  if (isEmpty(value)) return field.required ? t(lang, 'required') : null;
  const v = typeof value === 'string' ? value.trim() : value;
  switch (field.type) {
    case 'email':
      return isValidEmail(v) ? null : t(lang, 'email');
    case 'tel':
      return isValidPhone(v) ? null : t(lang, 'phone');
    case 'tc':
      return isValidTc(v) ? null : t(lang, 'tc');
    case 'text':
    case 'textarea': {
      if (field.minLength && v.length < field.minLength) return t(lang, 'minLen', { n: field.minLength });
      if (field.maxLength && v.length > field.maxLength) return t(lang, 'maxLen', { n: field.maxLength });
      return null;
    }
    case 'number': {
      const n = Number(v);
      if (Number.isNaN(n)) return t(lang, 'number');
      if (field.min !== undefined && field.min !== '' && n < Number(field.min)) return t(lang, 'min', { n: field.min });
      if (field.max !== undefined && field.max !== '' && n > Number(field.max)) return t(lang, 'max', { n: field.max });
      return null;
    }
    case 'date': {
      if (field.minDate && v < field.minDate) return t(lang, 'dateRange');
      if (field.maxDate && v > field.maxDate) return t(lang, 'dateRange');
      return null;
    }
    case 'select':
    case 'radio':
      return (field.options || []).includes(v) ? null : t(lang, 'option');
    case 'checkbox': {
      const arr = Array.isArray(v) ? v : [];
      if (arr.some((x) => !(field.options || []).includes(x))) return t(lang, 'options');
      if (field.minSelect && arr.length < field.minSelect) return t(lang, 'minSelect', { n: field.minSelect });
      if (field.maxSelect && arr.length > field.maxSelect) return t(lang, 'maxSelect', { n: field.maxSelect });
      return null;
    }
    case 'dosya': {
      const accept = field.accept?.length ? field.accept : ['pdf', 'jpg', 'png'];
      if (!accept.includes(fileExt(v.name))) return t(lang, 'fileType', { n: accept.join(', ').toUpperCase() });
      const maxMB = Number(field.maxMB || 2);
      if (v.size > maxMB * 1024 * 1024) return t(lang, 'fileSize', { n: maxMB });
      return null;
    }
    default:
      return null;
  }
}

// Sadece görünür (koşulu sağlanan) alanlar doğrulanır
export function validateAll(fields, values, lang = 'tr') {
  const vis = visibilityMap(fields, values);
  const errors = {};
  for (const f of fields) {
    if (!vis[f.key]) continue;
    const err = validateField(f, values[f.key], lang);
    if (err) errors[f.key] = err;
  }
  return errors;
}
