import { appearanceStyle, useGoogleFont } from './FormRenderer.jsx';
import { FORM_STYLES, applyFormStyle } from '../lib/formStyles.js';
import LineIcon from './LineIcon.jsx';

function Fonts() {
  // Önizlemelerin doğru yazı tipiyle görünmesi için (liste sabit, kanca sırası değişmez)
  for (const s of FORM_STYLES) useGoogleFont(s.font); // eslint-disable-line react-hooks/rules-of-hooks
  return null;
}

// Küçük, gerçek CSS'le çizilmiş tasarım önizlemesi
function Thumb({ id }) {
  const ap = applyFormStyle({ background: 'beyaz', buttonText: 'Gönder' }, id);
  return (
    <div className="style-thumb" aria-hidden="true" inert="">
      <div className={`bf bf-bg-${ap.background} ${ap.dark ? 'bf-dark' : ''} bf-style-${id}`} style={{ ...appearanceStyle(ap), fontFamily: `'${ap.font}', system-ui, sans-serif` }}>
        {id === 'cam' && <span className="bf-glass-bg"><i /><i /><i /></span>}
        {id === 'sekme' ? (
          <>
            <div className="bf-tabs"><div className="bf-tab is-cur"><span className="bf-tab-n">1</span><b>Dostunuz</b></div><div className="bf-tab"><span className="bf-tab-n">2</span></div></div>
            <div className="bf-choices">
              <label className="bf-choice"><input type="radio" readOnly checked tabIndex={-1} /><span className="bf-tile"><span className="bf-tile-ic"><LineIcon emoji="🐱" size={22} /></span><span className="bf-tile-t">Kedi</span></span></label>
              <label className="bf-choice"><input type="radio" readOnly tabIndex={-1} /><span className="bf-tile"><span className="bf-tile-ic"><LineIcon emoji="🐶" size={22} /></span><span className="bf-tile-t">Köpek</span></span></label>
            </div>
            <div className="bf-btn">Devam →</div>
          </>
        ) : (<>
        <div className="bf-field is-float">
          <span className="bf-label">Ad Soyad</span>
          <input readOnly tabIndex={-1} value="Elif Şahin" placeholder=" " />
        </div>
        <div className="bf-choices">
          <label className="bf-choice"><input type="radio" readOnly checked tabIndex={-1} />🐱 Kedi</label>
          <label className="bf-choice"><input type="radio" readOnly tabIndex={-1} />🐶 Köpek</label>
        </div>
        <div className="bf-btn">Randevu al</div>
        </>)}
      </div>
    </div>
  );
}

export default function StylePicker({ value, onChange }) {
  return (
    <div className="style-grid" role="radiogroup" aria-label="Form tasarımı">
      <Fonts />
      {FORM_STYLES.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={`style-card ${value === s.id ? 'is-on' : ''}`} onClick={() => onChange(s.id)}>
          <Thumb id={s.id} />
          <span className="style-name">{s.name}{value === s.id && <span className="style-on">✓ Seçili</span>}</span>
          <span className="style-desc">{s.desc}</span>
        </button>
      ))}
    </div>
  );
}
