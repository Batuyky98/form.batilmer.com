// "Sekmeli adımlar" tasarımında seçenek kutucuklarındaki çizgi simgeler.
// Seçenek metninin başındaki emojiye göre seçilir (🐱 Kedi → kedi simgesi). Eşleşmeyen emoji olduğu gibi gösterilir.
// Simgeler Lucide (ISC lisansı) çizimlerinden uyarlanmıştır.
const P = {
  cat: ['M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z', 'M8 14v.5', 'M16 14v.5', 'M11.25 16.25h1.5L12 17l-.75-.75Z'],
  dog: ['M11.25 16.25h1.5L12 17z', 'M16 14v.5', 'M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309', 'M8 14v.5', 'M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5'],
  bird: ['M16 7h.01', 'M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20', 'm20 7 2 .5-2 .5', 'M10 18v3', 'M14 17.75V21', 'M7 18a6 6 0 0 0 3.84-10.61'],
  rabbit: ['M13 16a3 3 0 0 1 2.24 5', 'M18 12h.01', 'M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3', 'M20 8.54V4a2 2 0 1 0-4 0v3', 'M7.612 12.524a3 3 0 1 0-1.6 4.3'],
  paw: ['M11 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0', 'M20 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0', 'M22 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0', 'M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z'],
  scissors: ['M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M20 4 8.12 15.88', 'M14.47 14.48 20 20', 'M8.12 8.12 12 12'],
  syringe: ['m18 2 4 4', 'm17 7 3-3', 'M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5', 'm9 11 4 4', 'm5 19-3 3', 'm14 4 6 6'],
  stethoscope: ['M11 2v2', 'M5 2v2', 'M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1', 'M8 15a6 6 0 0 0 12 0v-3', 'M22 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0']
};
const BY_EMOJI = { '🐱': 'cat', '🐈': 'cat', '🐶': 'dog', '🐕': 'dog', '🐦': 'bird', '🦜': 'bird', '🐰': 'rabbit', '🐇': 'rabbit', '🐾': 'paw', '✂': 'scissors', '💉': 'syringe', '🩺': 'stethoscope' };

// "🐱 Kedi" → { emoji: '🐱', text: 'Kedi' }
export function splitEmoji(s) {
  const m = String(s || '').match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
  return m ? { emoji: m[1], text: m[2] || m[1] } : { emoji: '', text: String(s || '') };
}

export default function LineIcon({ emoji, size = 30 }) {
  const name = BY_EMOJI[String(emoji || '').replace(/️/g, '')];
  if (!name) return emoji ? <span className="bf-tile-emoji" aria-hidden="true">{emoji}</span> : null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
