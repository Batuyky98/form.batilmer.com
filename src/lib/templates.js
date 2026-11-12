import { DEFAULT_RANDEVU } from './availability.js';
import { clone, uid } from './util.js';

export const FIELD_TYPES = [
  { type: 'text', label: 'Kısa metin', icon: 'T' },
  { type: 'email', label: 'E-posta', icon: '@' },
  { type: 'tel', label: 'Telefon', icon: '☎' },
  { type: 'tc', label: 'TC Kimlik No', icon: '#' },
  { type: 'textarea', label: 'Uzun metin', icon: '¶' },
  { type: 'select', label: 'Açılır liste', icon: '▾' },
  { type: 'radio', label: 'Tekli seçim', icon: '◉' },
  { type: 'checkbox', label: 'Çoklu seçim', icon: '☑' },
  { type: 'date', label: 'Tarih', icon: '▦' },
  { type: 'number', label: 'Sayı', icon: '1' },
  { type: 'dosya', label: 'Dosya yükleme', icon: '⇪' },
  { type: 'randevu', label: 'Randevu', icon: '◷' }
];

export const typeLabel = (t) => FIELD_TYPES.find((x) => x.type === t)?.label || t;
export const hasOptions = (t) => ['select', 'radio', 'checkbox'].includes(t);

export const DEFAULT_APPEARANCE = {
  background: 'beyaz', // 'seffaf' | 'beyaz' | 'ozel'
  bgColor: '#FFFFFF',
  primary: '#2F5BEA',
  text: '#0F172A',
  font: 'site', // 'site' veya Google Font adı
  radius: 'hafif', // 'keskin' | 'hafif' | 'tam'
  labelPosition: 'ust', // 'ust' | 'ic'
  width: 'tam', // 'tam' | 'dar' | 'iki'
  showHeader: true,
  buttonText: 'Gönder',
  dark: false
};

export const DEFAULT_SETTINGS = {
  title: '',
  description: '',
  duplicateCheck: 'yok', // 'yok' | 'email' | 'tc' | 'tel'
  notifyEmails: [],
  kvkk: {
    enabled: true,
    label: 'Kişisel verilerimin işlenmesine ilişkin aydınlatma metnini okudum, onaylıyorum.',
    url: ''
  },
  afterSubmit: 'mesaj', // 'mesaj' | 'yonlendir'
  successMessage: 'Teşekkürler! Bilgileriniz bize ulaştı.',
  redirectUrl: '',
  retentionMonths: 24,
  notifyAdminOnEdit: false,
  language: 'tr', // 'tr' | 'en' – formun sistem metinlerinin dili
  autoReply: {
    enabled: false,
    subject: 'Bilgileriniz bize ulaştı',
    body: 'Merhaba,\n\nFormunuzu aldık. En kısa sürede sizinle iletişime geçeceğiz.\n\nTeşekkürler.'
  }
};

export const DEFAULT_CONTROL = {
  status: 'aktif', // 'aktif' | 'pasif'
  startDate: '',
  endDate: '',
  quota: '',
  closedMessage: 'Bu form şu anda kayıt kabul etmiyor.'
};

export function newField(type, existingKeys = []) {
  const base = { id: uid('fld_'), type, label: typeLabel(type), placeholder: '', help: '', required: false };
  let key = type;
  let i = 2;
  while (existingKeys.includes(key)) key = `${type}_${i++}`;
  base.key = key;
  if (hasOptions(type)) base.options = ['Seçenek 1', 'Seçenek 2'];
  if (type === 'randevu') {
    base.label = 'Randevu';
    base.required = true;
  }
  if (type === 'dosya') {
    base.label = 'Dosya';
    base.accept = ['pdf', 'jpg', 'png'];
    base.maxMB = 2;
  }
  return base;
}

// Eski sürümde kaydedilmiş formlara yeni ayarları varsayılanlarıyla ekler
export function normalizeContent(c) {
  if (!c) return c;
  const settings = { ...clone(DEFAULT_SETTINGS), ...(c.settings || {}) };
  settings.kvkk = { ...clone(DEFAULT_SETTINGS.kvkk), ...(c.settings?.kvkk || {}) };
  settings.autoReply = { ...clone(DEFAULT_SETTINGS.autoReply), ...(c.settings?.autoReply || {}) };
  const randevu = { ...clone(DEFAULT_RANDEVU), ...(c.randevu || {}) };
  randevu.sms = { ...clone(DEFAULT_RANDEVU.sms), ...(c.randevu?.sms || {}) };
  return {
    ...c,
    fields: c.fields || [],
    appearance: { ...clone(DEFAULT_APPEARANCE), ...(c.appearance || {}) },
    settings,
    randevu
  };
}

const f = (key, type, label, extra = {}) => ({ id: uid('fld_'), key, type, label, placeholder: '', help: '', required: false, ...extra });

export const TEMPLATES = [
  {
    id: 'bos',
    name: 'Boş form',
    sector: 'Genel',
    fields: () => [f('ad_soyad', 'text', 'Ad Soyad', { required: true })]
  },
  {
    id: 'iletisim',
    name: 'Genel iletişim formu',
    sector: 'Genel',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('email', 'email', 'E-posta', { required: true }),
      f('telefon', 'tel', 'Telefon', { placeholder: '05xx xxx xx xx' }),
      f('mesaj', 'textarea', 'Mesajınız', { required: true, maxLength: 1000 })
    ]
  },
  {
    id: 'veteriner',
    name: 'Veteriner randevu formu',
    sector: 'Veteriner',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('email', 'email', 'E-posta', { required: true }),
      f('hayvan_adi', 'text', 'Hayvanınızın adı', { required: true }),
      f('hayvan_turu', 'select', 'Hayvan türü', { required: true, options: ['Kedi', 'Köpek', 'Kuş', 'Diğer'] }),
      f('randevu', 'randevu', 'Randevu', { required: true }),
      f('aciklama', 'textarea', 'Şikayet / açıklama', { maxLength: 500 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      services: [
        { id: 'svc_muayene', name: 'Muayene', duration: 30, buffer: 10 },
        { id: 'svc_asi', name: 'Aşı', duration: 15, buffer: 5 },
        { id: 'svc_tiras', name: 'Tıraş / bakım', duration: 60, buffer: 10 }
      ],
      interval: 15
    })
  },
  {
    id: 'kafe',
    name: 'Kafe rezervasyon formu',
    sector: 'Kafe',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('randevu', 'randevu', 'Rezervasyon', { required: true }),
      f('not', 'textarea', 'Notunuz (doğum günü, özel istek...)', { maxLength: 300 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      services: [{ id: 'svc_masa', name: 'Masa rezervasyonu', duration: 90, buffer: 0 }],
      capacityMode: 'kisi',
      capacity: 40,
      partySizeMax: 12,
      interval: 30,
      minNoticeHours: 1,
      hours: {
        0: [{ start: '10:00', end: '23:00' }], 1: [{ start: '10:00', end: '23:00' }], 2: [{ start: '10:00', end: '23:00' }],
        3: [{ start: '10:00', end: '23:00' }], 4: [{ start: '10:00', end: '23:00' }], 5: [{ start: '10:00', end: '24:00' }],
        6: [{ start: '10:00', end: '24:00' }]
      }
    })
  },
  {
    id: 'guzellik',
    name: 'Güzellik merkezi randevu formu',
    sector: 'Güzellik merkezi',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('email', 'email', 'E-posta'),
      f('randevu', 'randevu', 'Randevu', { required: true }),
      f('not', 'textarea', 'Notunuz', { maxLength: 300 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      services: [
        { id: 'svc_sac', name: 'Saç kesimi', duration: 45, buffer: 15 },
        { id: 'svc_boya', name: 'Saç boyama', duration: 120, buffer: 15 },
        { id: 'svc_cilt', name: 'Cilt bakımı', duration: 60, buffer: 10 }
      ],
      resources: [
        { id: 'res_ayse', name: 'Ayşe', serviceIds: [] },
        { id: 'res_elif', name: 'Elif', serviceIds: ['svc_sac', 'svc_boya'] }
      ],
      resourceLabel: 'Uzman',
      interval: 15
    })
  }
];

export function buildFormContent(templateId) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  return {
    fields: t.fields(),
    appearance: clone(DEFAULT_APPEARANCE),
    settings: clone(DEFAULT_SETTINGS),
    randevu: t.randevu ? t.randevu() : clone(DEFAULT_RANDEVU)
  };
}

export const GOOGLE_FONTS = ['Inter', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Nunito', 'Lato', 'Raleway', 'Playfair Display', 'Space Grotesk'];
