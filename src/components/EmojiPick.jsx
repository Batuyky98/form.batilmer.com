import { useEffect, useRef, useState } from 'react';

// Seçenek / hizmet adının başına simge ekleme (🐱 Kedi, ✂️ Saç kesimi…). Formda hap düğmede ve kartta görünür.
const GROUPS = [
  ['Hayvan', '🐱 🐶 🐦 🐰 🐹 🐠 🐢 🐴 🐾'],
  ['Sağlık', '🩺 💉 💊 🦷 🧠 👁️ 🩻 🧪 ❤️ 📋'],
  ['Bakım', '✂️ 💈 💇‍♀️ 💅 🧔 🎨 ✨ 💆 🧖 💄'],
  ['Spor', '🏋️ 🧘 🏃 🚴 🏊 🥊 ⚽ 🎾 💪 🔥'],
  ['Yeme-içme', '☕ 🍽️ 🍕 🍰 🍷 🥗 🎂 🌿 🏠 🪑'],
  ['Hizmet', '🔧 🔍 🛞 🚗 🏡 🧹 📦 💻 📷 🎓'],
  ['Genel', '✅ ❌ 👋 🤝 💬 📞 📅 ⭐ 🎁 🌱 💡 🤷']
];
const LEAD = /^(\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}]*\s*/u;
export const stripEmoji = (s) => String(s || '').replace(LEAD, '');
export const leadingEmoji = (s) => (String(s || '').match(LEAD)?.[0] || '').trim();

export default function EmojiPick({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    const onScroll = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);
  const cur = leadingEmoji(value);
  const pick = (e) => {
    onChange(e ? `${e} ${stripEmoji(value)}` : stripEmoji(value));
    setOpen(false);
  };
  return (
    <span className="emoji-pick" ref={ref}>
      <button type="button" className="icon-btn emoji-btn" aria-label="Simge seç" aria-expanded={open} title="Simge seç" onClick={(e) => {
        // Kaydırılan tablo/kart içinde kesilmesin diye ekrana göre konumlanır
        const r = e.currentTarget.getBoundingClientRect();
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 308));
        const below = window.innerHeight - r.bottom > 350;
        setPos(below ? { top: r.bottom + 6, left } : { bottom: window.innerHeight - r.top + 6, left });
        setOpen((o) => !o);
      }}>{cur || '🙂'}</button>
      {open && (
        <div className="emoji-pop" role="dialog" aria-label="Simge seç" style={pos || undefined}>
          {GROUPS.map(([g, list]) => (
            <div key={g}>
              <div className="emoji-g">{g}</div>
              <div className="emoji-row">
                {list.split(' ').map((e) => <button key={e} type="button" onClick={() => pick(e)} aria-label={e}>{e}</button>)}
              </div>
            </div>
          ))}
          {cur && <button type="button" className="link-sm" onClick={() => pick('')}>Simgeyi kaldır</button>}
        </div>
      )}
    </span>
  );
}
