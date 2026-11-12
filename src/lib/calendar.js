// Randevu için "Takvimime ekle" (.ics) ve Google Takvim bağlantısı.
// Müşteriye mail/SMS göndermeden hatırlatma: randevu müşterinin kendi telefon takvimine eklenir,
// telefonu 1 gün ve 2 saat önce kendisi hatırlatır. Ücretsiz, Android ve iPhone'da çalışır.
import { dateTimeToMs, timeToMin } from './util.js';

// Formun randevu alanı hangi adla geçiyor? ("Randevu", "Rezervasyon", "Seans"...)
export const APPOINTMENT_TERMS = ['Randevu', 'Rezervasyon', 'Seans', 'Görüşme', 'Ders', 'Muayene', 'Ön görüşme'];
export function appointmentTerm(cfg) {
  const t = String(cfg?.term || '').trim();
  return t || 'Randevu';
}

const pad = (n) => String(n).padStart(2, '0');
function utcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// iCalendar satırları 75 bayttan uzun olmamalı
const enc = new TextEncoder();
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 74) {
      out.push(cur);
      cur = ` ${ch}`;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

function endMs(date, start, end) {
  const s = dateTimeToMs(date, start);
  let e = dateTimeToMs(date, end);
  if (timeToMin(end) <= timeToMin(start)) e = s + 30 * 60000;
  return e;
}

export function buildIcs({ uid, date, start, end, title, description = '', url = '', location = '', lang = 'tr' }) {
  const s = dateTimeToMs(date, start);
  const e = endMs(date, start, end);
  const remind = lang === 'en' ? 'Reminder' : 'Hatırlatma';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Batilmer//Form//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@batilmer-form`,
    `DTSTAMP:${utcStamp(Date.now())}`,
    `DTSTART:${utcStamp(s)}`,
    `DTEND:${utcStamp(e)}`,
    `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    location ? `LOCATION:${esc(location)}` : null,
    url ? `URL:${url}` : null,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`${remind}: ${title}`)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`${remind}: ${title}`)}`,
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarUrl({ date, start, end, title, description = '' }) {
  const s = dateTimeToMs(date, start);
  const e = endMs(date, start, end);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${utcStamp(s)}/${utcStamp(e)}`, details: description, ctz: 'Europe/Istanbul' });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
