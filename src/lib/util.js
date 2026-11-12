// Genel yardımcılar

export function uid(prefix = '') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + rand[0].toString(36) + rand[1].toString(36).slice(0, 4);
}

export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };

export function slugify(text) {
  return String(text || '')
    .replace(/[çğıiöşüÇĞİIÖŞÜ]/g, (c) => TR_MAP[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function fieldKey(label, existing = []) {
  let base = slugify(label).replace(/-/g, '_') || 'alan';
  let key = base;
  let i = 2;
  while (existing.includes(key)) key = `${base}_${i++}`;
  return key;
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- SAAT DİLİMİ
// Bütün tarih/saatler Türkiye saatine (Europe/Istanbul) göre hesaplanır.
// Ziyaretçinin bilgisayarı ya da sunucu başka saat diliminde olsa bile randevu saatleri kaymaz.
// Türkiye 2016'dan beri yaz/kış saati uygulamıyor: sabit UTC+3.
export const TZ_OFFSET_MIN = 180;
export const TIME_ZONE = 'Europe/Istanbul';

// Tarihler "YYYY-MM-DD", saatler "HH:MM" metni olarak tutulur
export function toDateStr(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Tarih metnini UTC öğlen saatine sabitlenmiş Date'e çevirir (gün hesapları için güvenli)
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function dayOfWeek(dateStr) {
  return parseDate(dateStr).getUTCDay();
}

export function dayOfMonth(dateStr) {
  return parseDate(dateStr).getUTCDate();
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

// Bir zaman damgasının Türkiye'deki tarihi
export function dateOfMs(ms) {
  return toDateStr(new Date(ms + TZ_OFFSET_MIN * 60000));
}

// Türkiye'de şu anki saat (dakika cinsinden)
export function nowMinutesTR() {
  const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

// Türkiye saatindeki tarih + saati zaman damgasına çevirir
export function dateTimeToMs(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const m = timeToMin(timeStr);
  return Date.UTC(y, mo - 1, d, Math.floor(m / 60), m % 60) - TZ_OFFSET_MIN * 60000;
}

const NAMES = {
  tr: {
    days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
    daysShort: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
    months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  },
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  }
};
const N = (lang) => NAMES[lang] || NAMES.tr;

export function weekdayName(dateStr, lang = 'tr') {
  return N(lang).days[dayOfWeek(dateStr)];
}

export function weekdayShort(dateStr, lang = 'tr') {
  return N(lang).daysShort[dayOfWeek(dateStr)];
}

export function monthShort(dateStr, lang = 'tr') {
  return N(lang).months[parseDate(dateStr).getUTCMonth()].slice(0, 3);
}

export function formatDate(dateStr, lang = 'tr') {
  const d = parseDate(dateStr);
  const mn = N(lang).months[d.getUTCMonth()];
  return lang === 'en' ? `${mn} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${mn} ${d.getUTCFullYear()}`;
}

export function formatDateShort(dateStr, lang = 'tr') {
  const d = parseDate(dateStr);
  const mn = N(lang).months[d.getUTCMonth()].slice(0, 3);
  return lang === 'en' ? `${mn} ${d.getUTCDate()}` : `${d.getUTCDate()} ${mn}`;
}

// Zaman damgasını Türkiye saatiyle "GG.AA.YYYY SS:DD" olarak yazar
export function formatDateTime(ms) {
  const d = new Date(ms + TZ_OFFSET_MIN * 60000);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function today() {
  return dateOfMs(Date.now());
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function maskTc(tc) {
  const s = String(tc || '');
  if (s.length !== 11) return s;
  return s.slice(0, 3) + '******' + s.slice(9);
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formBaseUrl() {
  const fromEnv = import.meta.env?.VITE_FORM_BASE_URL;
  return (fromEnv && fromEnv.trim()) || window.location.origin;
}
