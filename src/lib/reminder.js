// Randevu hatırlatma (WhatsApp tek tık) ve müşteri tanıma için ortak yardımcılar.
// Hem sunucu hem panel kullanır.
import { addDays, dayOfWeek, parseDate, today } from './util.js';

// Telefonu tek biçime indirir: "0532 111 22 33", "+90 532…", "5321112233" → "5321112233"
// Müşteri kartı aynı kişiyi bu anahtarla tanır.
export function phoneKey(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length >= 10 && d.length <= 15 ? d : '';
}

// Ekranda gösterim: 0532 111 22 33
export function phonePretty(raw) {
  const k = phoneKey(raw);
  if (k.length === 10) return `0${k.slice(0, 3)} ${k.slice(3, 6)} ${k.slice(6, 8)} ${k.slice(8)}`;
  return String(raw || '');
}

// Türkiye cep telefonu mu (WhatsApp'a gidebilir mi)?
export const waPhoneOk = (raw) => /^5\d{9}$/.test(phoneKey(raw)) || (phoneKey(raw).length >= 11 && !phoneKey(raw).startsWith('0'));

export const DEFAULT_WA = {
  enabled: true,
  when: 'once', // 'once' = 1 gün önce · 'ayni' = aynı gün · 'ikisi'
  notifyAt: '10:00', // personele "hatırlatmaları gönderin" bildirimi
  text: ''
};

export const DEFAULT_WA_TEXT =
  'Merhaba {ad}, {isletme} randevunuzu hatırlatırız: {gun}, {tarih} saat {saat} – {hizmet}. Gelemeyecekseniz lütfen bu linkten iptal edin: {iptal_linki}';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function longDate(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${DAYS[dayOfWeek(dateStr)]}`;
}

export function dayWord(dateStr, ref = today()) {
  if (dateStr === ref) return 'bugün';
  if (dateStr === addDays(ref, 1)) return 'yarın';
  return DAYS[dayOfWeek(dateStr)];
}

// Mesaj metnindeki yer tutucular (panelde tıklanabilir kutucuk olarak gösterilir)
export const WA_VARS = [
  ['{ad}', 'Ad soyad'],
  ['{gun}', 'yarın / bugün'],
  ['{tarih}', 'Tarih'],
  ['{saat}', 'Saat'],
  ['{isletme}', 'İşletme'],
  ['{hizmet}', 'Hizmet'],
  ['{personel}', 'Personel'],
  ['{kisi}', 'Kişi sayısı'],
  ['{iptal_linki}', 'İptal linki']
];

// vals: formdaki diğer alanlar ({hayvan_adi} gibi) da metinde kullanılabilsin
export function fillReminder(text, p, vals = {}) {
  const map = {
    ad: p.name || '',
    gun: dayWord(p.date, p.ref),
    tarih: longDate(p.date),
    saat: p.start || '',
    isletme: p.isletme || '',
    hizmet: p.service || '',
    personel: p.resource || '',
    kisi: p.partySize > 1 ? `${p.partySize} kişi` : '',
    iptal_linki: p.cancelUrl || ''
  };
  const out = String(text || DEFAULT_WA_TEXT).replace(/\{([a-z0-9_]{1,60})\}/g, (m, k) => {
    if (k in map) return map[k];
    const v = vals[k];
    if (v === undefined || v === null || typeof v === 'object') return '';
    return String(v);
  });
  // Boş kalan yer tutuculardan arta kalan " – ." gibi izleri toparla
  return out.replace(/\s+–\s*\./g, '.').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

export function waLink(phone, text) {
  const k = phoneKey(phone);
  if (!k) return '';
  const intl = k.length === 10 ? `90${k}` : k;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

// Bir randevu tarihi için hangi gün hatırlatılır?
export function reminderTargets(when, ref = today()) {
  if (when === 'ayni') return [ref];
  if (when === 'ikisi') return [addDays(ref, 1), ref];
  return [addDays(ref, 1)];
}
