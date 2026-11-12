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
  // Formun üstünde başlık: varsayılan KAPALI (sitede zaten başlık olur). Görünüm → "Forma başlık ekle" ile açılır.
  // (Eski "showHeader" ayarı artık kullanılmıyor; bu sürümde tüm formlarda başlık gizlenir.)
  titleOn: false,
  buttonText: 'Gönder',
  dark: false,
  // Ayrıntılı renkler: boş = otomatik (ana renk / yazı renginden). Formdaki her parça ayrı boyanabilir.
  colors: {
    title: '',
    label: '',
    help: '',
    fieldBg: '',
    fieldBorder: '',
    fieldText: '',
    buttonText: '',
    link: '',
    error: '',
    selectedBg: '',
    selectedText: ''
  }
};

// Görünüm sekmesindeki renk seçicileri: [anahtar, etiket, açıklama]
export const COLOR_FIELDS = [
  ['title', 'Başlık', 'Formun üstündeki başlık'],
  ['label', 'Alan etiketleri', '"Ad Soyad", "Telefon" gibi'],
  ['help', 'Yardım metinleri', 'Açıklama, alt bilgi, sayaç'],
  ['fieldText', 'Alan içindeki yazı', 'Müşterinin yazdığı metin'],
  ['fieldBg', 'Alan zemini', 'Kutuların içi'],
  ['fieldBorder', 'Alan kenarlığı', 'Kutuların çerçevesi'],
  ['buttonText', 'Buton yazısı', '"Gönder" yazısının rengi'],
  ['selectedBg', 'Seçili gün / saat zemini', 'Randevu seçicide (boş = ana renk)'],
  ['selectedText', 'Seçili gün / saat yazısı', ''],
  ['link', 'Bağlantılar', 'Aydınlatma metni linki vb.'],
  ['error', 'Hata mesajları', '"Bu alan zorunlu" uyarıları']
];

export const DEFAULT_SETTINGS = {
  title: '',
  description: '',
  duplicateCheck: 'yok', // 'yok' | 'email' | 'tc' | 'tel'
  // Müşteriye mail (randevu onayı, hatırlatma, otomatik cevap). Varsayılan KAPALI: ücretli ek özellik.
  // Yetkili kişilere bildirim mail ile değil, panel + telefon bildirimiyle gider.
  customerMails: false,
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
  // Eski sürümdeki "bildirim gidecek e-postalar" kaldırıldı (elle yazılan adreslere kişisel veri gitmesin)
  delete settings.notifyEmails;
  const randevu = { ...clone(DEFAULT_RANDEVU), ...(c.randevu || {}) };
  randevu.sms = { ...clone(DEFAULT_RANDEVU.sms), ...(c.randevu?.sms || {}) };
  const appearance = { ...clone(DEFAULT_APPEARANCE), ...(c.appearance || {}) };
  appearance.colors = { ...clone(DEFAULT_APPEARANCE.colors), ...(c.appearance?.colors || {}) };
  return {
    ...c,
    fields: c.fields || [],
    appearance,
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
    sector: 'Yeme-içme',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('randevu', 'randevu', 'Rezervasyon', { required: true }),
      f('not', 'textarea', 'Notunuz (doğum günü, özel istek...)', { maxLength: 300 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      term: 'Rezervasyon',
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
    sector: 'Kişisel bakım',
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
  },
  {
    id: 'klinik',
    name: 'Klinik / muayenehane randevu formu',
    sector: 'Sağlık',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('dogum_tarihi', 'date', 'Doğum tarihi'),
      f('ilk_ziyaret', 'radio', 'Daha önce bize geldiniz mi?', { options: ['Evet', 'Hayır, ilk kez geliyorum'] }),
      f('randevu', 'randevu', 'Randevu', { required: true }),
      f('aciklama', 'textarea', 'Şikayetiniz (isteğe bağlı)', { maxLength: 500 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      services: [
        { id: 'svc_muayene', name: 'Muayene', duration: 20, buffer: 5 },
        { id: 'svc_kontrol', name: 'Kontrol', duration: 15, buffer: 5 }
      ],
      interval: 10
    })
  },
  {
    id: 'kuafor',
    name: 'Kuaför / berber randevu formu',
    sector: 'Kişisel bakım',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('randevu', 'randevu', 'Randevu', { required: true }),
      f('not', 'textarea', 'Notunuz', { maxLength: 300 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      services: [
        { id: 'svc_kesim', name: 'Saç kesimi', duration: 30, buffer: 5 },
        { id: 'svc_sakal', name: 'Sakal', duration: 15, buffer: 5 },
        { id: 'svc_kesim_sakal', name: 'Saç + sakal', duration: 45, buffer: 5 }
      ],
      resources: [{ id: 'res_1', name: 'Usta 1', serviceIds: [] }],
      resourceLabel: 'Usta',
      interval: 15,
      minNoticeHours: 1
    })
  },
  {
    id: 'restoran',
    name: 'Restoran rezervasyon formu',
    sector: 'Yeme-içme',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('randevu', 'randevu', 'Rezervasyon', { required: true }),
      f('alan', 'radio', 'Oturma tercihi', { options: ['İç mekan', 'Bahçe / teras', 'Fark etmez'] }),
      f('not', 'textarea', 'Özel isteğiniz (alerji, doğum günü...)', { maxLength: 300 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      term: 'Rezervasyon',
      services: [{ id: 'svc_masa', name: 'Masa rezervasyonu', duration: 120, buffer: 0 }],
      capacityMode: 'kisi',
      capacity: 60,
      partySizeMax: 12,
      interval: 30,
      minNoticeHours: 2,
      hours: {
        0: [{ start: '12:00', end: '23:00' }], 1: [{ start: '12:00', end: '23:00' }], 2: [{ start: '12:00', end: '23:00' }],
        3: [{ start: '12:00', end: '23:00' }], 4: [{ start: '12:00', end: '23:00' }], 5: [{ start: '12:00', end: '24:00' }],
        6: [{ start: '12:00', end: '24:00' }]
      }
    })
  },
  {
    id: 'spor',
    name: 'Spor salonu / özel ders formu',
    sector: 'Spor ve eğitim',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('seviye', 'select', 'Seviyeniz', { options: ['Yeni başlıyorum', 'Orta', 'İleri'] }),
      f('randevu', 'randevu', 'Ders', { required: true }),
      f('saglik', 'textarea', 'Bilmemiz gereken bir sağlık durumu var mı?', { maxLength: 300 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      term: 'Ders',
      services: [
        { id: 'svc_ozel', name: 'Özel ders', duration: 60, buffer: 0 },
        { id: 'svc_deneme', name: 'Ücretsiz deneme dersi', duration: 45, buffer: 0 }
      ],
      resources: [{ id: 'res_1', name: 'Eğitmen 1', serviceIds: [] }],
      resourceLabel: 'Eğitmen',
      interval: 60
    })
  },
  {
    id: 'danismanlik',
    name: 'Danışmanlık / terapi seansı formu',
    sector: 'Danışmanlık',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('email', 'email', 'E-posta'),
      f('gorusme_sekli', 'radio', 'Görüşme şekli', { required: true, options: ['Yüz yüze', 'Online'] }),
      f('randevu', 'randevu', 'Seans', { required: true }),
      f('konu', 'textarea', 'Kısaca konu (isteğe bağlı)', { maxLength: 500 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      term: 'Seans',
      services: [
        { id: 'svc_ilk', name: 'Ön görüşme', duration: 30, buffer: 10 },
        { id: 'svc_seans', name: 'Seans', duration: 50, buffer: 10 }
      ],
      interval: 60,
      minNoticeHours: 12,
      cancelCutoffHours: 24
    })
  },
  {
    id: 'oto',
    name: 'Oto servis randevu formu',
    sector: 'Otomotiv',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('plaka', 'text', 'Plaka', { required: true, maxLength: 12 }),
      f('arac', 'text', 'Marka / model', { placeholder: 'Örnek: Renault Clio 2019' }),
      f('randevu', 'randevu', 'Randevu', { required: true }),
      f('sikayet', 'textarea', 'Aracınızla ilgili şikayet / istek', { maxLength: 500 })
    ],
    randevu: () => ({
      ...clone(DEFAULT_RANDEVU),
      services: [
        { id: 'svc_bakim', name: 'Periyodik bakım', duration: 120, buffer: 0 },
        { id: 'svc_ariza', name: 'Arıza tespiti', duration: 60, buffer: 0 },
        { id: 'svc_lastik', name: 'Lastik değişimi', duration: 30, buffer: 0 }
      ],
      capacity: 2,
      interval: 30
    })
  },
  {
    id: 'kurs',
    name: 'Kurs / eğitim ön kayıt formu',
    sector: 'Spor ve eğitim',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('email', 'email', 'E-posta'),
      f('program', 'select', 'İlgilendiğiniz program', { required: true, options: ['Program 1', 'Program 2'] }),
      f('zaman', 'checkbox', 'Uygun olduğunuz zamanlar', { options: ['Hafta içi gündüz', 'Hafta içi akşam', 'Hafta sonu'] }),
      f('not', 'textarea', 'Notunuz', { maxLength: 500 })
    ]
  },
  {
    id: 'etkinlik',
    name: 'Etkinlik / seminer kayıt formu',
    sector: 'Etkinlik',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('email', 'email', 'E-posta', { required: true }),
      f('telefon', 'tel', 'Telefon', { placeholder: '05xx xxx xx xx' }),
      f('kurum', 'text', 'Kurum / şirket'),
      f('katilim', 'radio', 'Katılım şekli', { required: true, options: ['Yüz yüze', 'Online'] })
    ]
  },
  {
    id: 'teklif',
    name: 'Teklif / keşif talep formu',
    sector: 'Hizmet',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('email', 'email', 'E-posta'),
      f('hizmet', 'select', 'Hangi hizmet için?', { required: true, options: ['Hizmet 1', 'Hizmet 2', 'Diğer'] }),
      f('hizmet_diger', 'text', 'Hangi hizmet?', { required: true, condition: { fieldKey: 'hizmet', operator: 'esit', value: 'Diğer' } }),
      f('adres', 'text', 'İlçe / adres'),
      f('detay', 'textarea', 'İhtiyacınızı kısaca anlatın', { required: true, maxLength: 1000 }),
      f('fotograf', 'dosya', 'Fotoğraf (isteğe bağlı)', { accept: ['jpg', 'png', 'pdf'], maxMB: 5 })
    ]
  },
  {
    id: 'basvuru',
    name: 'İş başvuru formu',
    sector: 'İnsan kaynakları',
    fields: () => [
      f('ad_soyad', 'text', 'Ad Soyad', { required: true }),
      f('telefon', 'tel', 'Telefon', { required: true, placeholder: '05xx xxx xx xx' }),
      f('email', 'email', 'E-posta', { required: true }),
      f('pozisyon', 'select', 'Başvurduğunuz pozisyon', { required: true, options: ['Pozisyon 1', 'Pozisyon 2'] }),
      f('cv', 'dosya', 'Özgeçmiş (CV)', { required: true, accept: ['pdf', 'doc'], maxMB: 5 }),
      f('not', 'textarea', 'Ön yazı (isteğe bağlı)', { maxLength: 1500 })
    ]
  }
];

// Şablon seçerken gruplar
export const TEMPLATE_SECTORS = [...new Set(TEMPLATES.map((t) => t.sector))];

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
