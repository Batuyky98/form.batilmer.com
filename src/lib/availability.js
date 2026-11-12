// Uygun randevu saati hesabı.
// MySQL'e geçildiğinde bu hesap sunucuda yapılmalı ve randevu kaydı bir transaction içinde
// (SELECT ... FOR UPDATE ile) tekrar kontrol edilerek yazılmalı; böylece iki kişi aynı saati alamaz.

import { addDays, dateTimeToMs, dayOfWeek, minToTime, timeToMin, today } from './util.js';

export const DEFAULT_RANDEVU = {
  services: [{ id: 'svc1', name: 'Randevu', duration: 30, buffer: 0 }],
  resources: [],
  resourceLabel: 'Personel',
  hours: {
    1: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    2: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    3: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    4: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    5: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    6: [{ start: '10:00', end: '14:00' }],
    0: []
  },
  closedDates: [],
  // Randevular şu tarihten itibaren alınsın (örnek: işletme 1 Aralık'ta açılıyor). Boş = hemen.
  openFrom: '',
  // Formda ve bildirimlerde nasıl adlandırılsın: Randevu / Rezervasyon / Seans / Görüşme ... (boş = Randevu)
  term: '',
  interval: 30,
  capacityMode: 'randevu', // 'randevu' | 'kisi'
  capacity: 1,
  partySizeMax: 10,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  approval: 'auto', // 'auto' | 'manual'
  cancelCutoffHours: 2,
  perContactLimit: 2,
  reminderHours: 24,
  sms: { confirm: false, reminder: false } // canlıda SMS sağlayıcısı (Netgsm, İleti Merkezi vb.) ile gönderilecek
};

export const ACTIVE_STATUSES = ['bekliyor', 'onaylandi', 'geldi'];

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function serviceById(cfg, id) {
  return (cfg.services || []).find((s) => s.id === id) || (cfg.services || [])[0];
}

export function resourcesForService(cfg, serviceId) {
  return (cfg.resources || []).filter((r) => !r.serviceIds || r.serviceIds.length === 0 || r.serviceIds.includes(serviceId));
}

// Bir resource (veya null = genel) için t..t+d aralığı uygun mu?
function fits(cfg, { date, startMin, duration, buffer, resourceId, partySize, appointments, blocks, excludeId }) {
  const endWithBuffer = startMin + duration + buffer;
  for (const b of blocks) {
    if (b.date !== date) continue;
    if (b.resourceId && resourceId && b.resourceId !== resourceId) continue;
    if (overlaps(timeToMin(b.start), timeToMin(b.end), startMin, startMin + duration)) return false;
  }
  let count = 0;
  let persons = 0;
  for (const a of appointments) {
    if (a.id === excludeId) continue;
    if (a.date !== date || !ACTIVE_STATUSES.includes(a.status)) continue;
    if ((cfg.resources || []).length && a.resourceId !== resourceId) continue;
    const s = timeToMin(a.start);
    const e = timeToMin(a.end) + (a.buffer || 0);
    if (overlaps(s, e, startMin, endWithBuffer)) {
      count += 1;
      persons += Number(a.partySize || 1);
    }
  }
  const cap = Number(cfg.capacity || 1);
  if (cfg.capacityMode === 'kisi') return persons + Number(partySize || 1) <= cap;
  return count < cap;
}

// Randevu alınabilecek ilk gün: bugün ya da "şu tarihten itibaren" ayarı (hangisi ileriyse)
export function firstBookableDate(cfg) {
  const t = today();
  return cfg?.openFrom && cfg.openFrom > t ? cfg.openFrom : t;
}

// staff = true: panelden manuel randevu (açılış tarihi beklenmez)
export function isDateOpen(cfg, date, { staff = false } = {}) {
  if ((cfg.closedDates || []).includes(date)) return false;
  if (date < today()) return false;
  const base = staff ? today() : firstBookableDate(cfg);
  if (date < base) return false;
  if (date > addDays(base, Number(cfg.maxDaysAhead || 30))) return false;
  const ranges = cfg.hours?.[dayOfWeek(date)] || [];
  return ranges.length > 0;
}

/**
 * Bir gün için uygun saatleri döner: [{ time: '09:30', resources: ['r1', ...] }]
 */
export function getSlots(cfg, appointments, blocks, { date, serviceId, resourceId = null, partySize = 1, nowMs = Date.now(), excludeId = null, ignoreNotice = false }) {
  if (!cfg || !date || !isDateOpen(cfg, date, { staff: ignoreNotice })) return [];
  const service = serviceById(cfg, serviceId);
  if (!service) return [];
  const duration = Number(service.duration || 30);
  const buffer = Number(service.buffer || 0);
  const interval = Number(cfg.interval || 30);
  const minStartMs = nowMs + (ignoreNotice ? 0 : Number(cfg.minNoticeHours || 0) * 3600000);
  const ranges = cfg.hours?.[dayOfWeek(date)] || [];

  let candidates = [null];
  if ((cfg.resources || []).length) {
    const list = resourcesForService(cfg, service.id);
    candidates = resourceId ? list.filter((r) => r.id === resourceId).map((r) => r.id) : list.map((r) => r.id);
    if (!candidates.length) return [];
  }

  const slots = [];
  for (const range of ranges) {
    const open = timeToMin(range.start);
    const close = timeToMin(range.end);
    for (let t = open; t + duration <= close; t += interval) {
      if (dateTimeToMs(date, minToTime(t)) < minStartMs) continue;
      const free = candidates.filter((rid) =>
        fits(cfg, { date, startMin: t, duration, buffer, resourceId: rid, partySize, appointments, blocks, excludeId })
      );
      if (free.length) slots.push({ time: minToTime(t), resources: free.filter(Boolean) });
    }
  }
  return slots;
}

// Kayıt anında son kontrol: seçilen saat hâlâ boş mu? Uygunsa atanacak resource id'sini döner.
export function checkSlot(cfg, appointments, blocks, { date, time, serviceId, resourceId, partySize, excludeId, ignoreNotice }) {
  const slots = getSlots(cfg, appointments, blocks, { date, serviceId, resourceId, partySize, excludeId, ignoreNotice });
  const slot = slots.find((s) => s.time === time);
  if (!slot) return { ok: false };
  return { ok: true, resourceId: resourceId || slot.resources[0] || null };
}

export function endTime(cfg, serviceId, start) {
  const s = serviceById(cfg, serviceId);
  return minToTime(timeToMin(start) + Number(s?.duration || 30));
}
