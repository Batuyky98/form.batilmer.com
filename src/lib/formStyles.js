// Müşteri formunun hazır tasarımları. Form oluştururken ya da sonradan Görünüm sekmesinden
// tek tıkla seçilir. Seçince o tasarımın renkleri, yazı tipi ve köşeleri uygulanır;
// sonra her şey (ana renk, ayrıntılı renkler) yine elle değiştirilebilir.
const EMPTY_COLORS = { title: '', label: '', help: '', fieldBg: '', fieldBorder: '', fieldText: '', buttonText: '', link: '', error: '', selectedBg: '', selectedText: '' };

export const FORM_STYLES = [
  {
    id: 'yuzen', name: 'Yüzen etiket', desc: 'Aydınlık; etiketler yazarken süzülür', font: 'Inter',
    apply: { primary: '#2F5BEA', text: '#0F172A', background: 'beyaz', bgColor: '#FFFFFF', dark: false, radius: 'hafif', colors: {} }
  },
  {
    id: 'adim', name: 'Adım adım', desc: 'Uygulama gibi; sorular adım adım gelir', font: 'Plus Jakarta Sans',
    apply: { primary: '#0F9F6E', text: '#0B1B16', background: 'beyaz', bgColor: '#FFFFFF', dark: false, radius: 'tam', colors: { selectedBg: '#0B1B16' } }
  },
  {
    id: 'cam', name: 'Cam', desc: 'Koyu; hareketli renkler üstünde buzlu cam', font: 'Outfit',
    apply: { primary: '#8B5CF6', text: '#F1F5FF', background: 'ozel', bgColor: '#0B0F1F', dark: true, radius: 'tam', colors: { fieldBg: '#FFFFFF12', fieldBorder: '#FFFFFF2E', help: '#F1F5FFB3', selectedBg: '#FFFFFF', selectedText: '#0B0F1F', link: '#C4B5FD' } }
  },
  {
    id: 'cizgi', name: 'Minimal çizgi', desc: 'Sade; kutu yok, sadece alt çizgi', font: 'Space Grotesk',
    apply: { primary: '#111111', text: '#111111', background: 'seffaf', bgColor: '#FFFFFF', dark: false, radius: 'keskin', colors: { fieldBorder: '#11111140', help: '#555555' } }
  },
  {
    id: 'pastel', name: 'Pastel', desc: 'Yumuşak renkler, yuvarlak hatlar', font: 'Nunito',
    apply: { primary: '#7C5CFC', text: '#2E2A4F', background: 'ozel', bgColor: '#F6F3FF', dark: false, radius: 'tam', colors: { fieldBg: '#FFFFFF', fieldBorder: '#E4DCFF', label: '#4B3F8F' } }
  },
  {
    id: 'kurumsal', name: 'Kurumsal', desc: 'Net, sıkı, profesyonel', font: 'Inter',
    apply: { primary: '#1D4ED8', text: '#111827', background: 'beyaz', bgColor: '#FFFFFF', dark: false, radius: 'keskin', colors: { fieldBorder: '#D1D5DB', label: '#374151' } }
  },
  {
    id: 'bento', name: 'Bento', desc: 'Her alan kendi kutucuğunda', font: 'Manrope',
    apply: { primary: '#0EA5E9', text: '#0F172A', background: 'ozel', bgColor: '#EEF2F7', dark: false, radius: 'tam', colors: { fieldBg: '#F8FAFC', fieldBorder: '#E2E8F0' } }
  },
  {
    id: 'luks', name: 'Lüks', desc: 'Siyah ve altın; zarif yazı', font: 'Playfair Display',
    apply: { primary: '#C9A45C', text: '#F5F1E8', background: 'ozel', bgColor: '#0E0D0B', dark: true, radius: 'keskin', colors: { fieldBg: '#FFFFFF08', fieldBorder: '#C9A45C66', label: '#C9A45C', help: '#F5F1E8A6', buttonText: '#0E0D0B', selectedText: '#0E0D0B', link: '#E2C88F' } }
  },
  {
    id: 'pop', name: 'Canlı', desc: 'Kalın çizgiler, cesur renkler', font: 'Space Grotesk',
    apply: { primary: '#FF5A1F', text: '#111111', background: 'ozel', bgColor: '#FFF4D6', dark: false, radius: 'hafif', colors: { fieldBg: '#FFFFFF', fieldBorder: '#111111', buttonText: '#111111', selectedBg: '#111111', selectedText: '#FFF4D6' } }
  },
  {
    id: 'doga', name: 'Doğa', desc: 'Sıcak tonlar, organik hatlar', font: 'Fraunces',
    apply: { primary: '#4D7C0F', text: '#2B2A1F', background: 'ozel', bgColor: '#FBF7EE', dark: false, radius: 'tam', colors: { fieldBg: '#FFFDF8', fieldBorder: '#DCD3BF', label: '#3F3A2A' } }
  }
];

export const DEFAULT_STYLE = 'yuzen';
export const styleById = (id) => FORM_STYLES.find((s) => s.id === id) || FORM_STYLES[0];

// Tasarımı görünüm ayarlarına uygular (buton metni, genişlik, başlık gibi ayarlar korunur)
export function applyFormStyle(appearance, id) {
  const st = styleById(id);
  return { ...appearance, ...st.apply, style: st.id, font: st.font, labelPosition: 'ust', colors: { ...EMPTY_COLORS, ...st.apply.colors } };
}
