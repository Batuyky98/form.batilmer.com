import { useEffect, useMemo, useRef, useState } from 'react';
import { FILE_TYPES, formatPhone, validateAll, validateField } from '../lib/validators.js';
import { addDays, dayOfMonth, formatBytes, formatDate, formatDateShort, monthShort, weekdayName, weekdayShort } from '../lib/util.js';
import { firstBookableDate, isDateOpen, resourcesForService } from '../lib/availability.js';
import { visibilityMap } from '../lib/conditions.js';
import { t } from '../lib/i18n.js';
import { displayValue, servicePrice } from '../lib/shared.js';
import { DEFAULT_STYLE } from '../lib/formStyles.js';
import LineIcon, { splitEmoji } from './LineIcon.jsx';
import ManageMine from './ManageMine.jsx';
import { DEFAULT_MARKETING_LABEL, MARKETING_FEATURE } from '../lib/kvkkTemplate.js';

// Başlık / kutu içi yazı seçimi yapılabilen alan türleri
const TEXTLIKE = ['text', 'email', 'tel', 'tc', 'number', 'textarea'];

const RADIUS = { keskin: '2px', hafif: '10px', tam: '22px' };

export function useGoogleFont(font) {
  useEffect(() => {
    if (!font || font === 'site') return;
    const id = `gf-${font.replace(/\s/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [font]);
}

const okColor = (v) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? v : '');

export function appearanceStyle(a) {
  const dark = !!a.dark;
  const c = a.colors || {};
  let bg = 'transparent';
  if (a.background === 'beyaz') bg = dark ? '#111827' : '#FFFFFF';
  if (a.background === 'ozel') bg = a.bgColor || '#FFFFFF';
  const style = {
    '--bf-primary': a.primary || '#2F5BEA',
    '--bf-text': a.text || (dark ? '#F8FAFC' : '#0F172A'),
    '--bf-bg': bg,
    '--bf-radius': RADIUS[a.radius] || RADIUS.hafif,
    '--bf-field-bg': okColor(c.fieldBg) || (dark ? 'rgba(255,255,255,0.06)' : '#FFFFFF'),
    '--bf-border': okColor(c.fieldBorder) || (dark ? 'rgba(255,255,255,0.22)' : '#CBD5E1'),
    '--bf-muted': okColor(c.help) || (dark ? 'rgba(248,250,252,0.72)' : '#475569'),
    fontFamily: a.font && a.font !== 'site' ? `'${a.font}', system-ui, sans-serif` : 'inherit'
  };
  // Ayrıntılı renkler (boşsa CSS'teki varsayılan kullanılır)
  const map = { title: '--bf-title', label: '--bf-label', fieldText: '--bf-field-text', buttonText: '--bf-btn-text', link: '--bf-link', error: '--bf-error', selectedBg: '--bf-sel-bg', selectedText: '--bf-sel-text' };
  for (const [k, v] of Object.entries(map)) if (okColor(c[k])) style[v] = c[k];
  return style;
}

// ------------------------------------------------------------ Cloudflare Turnstile (anahtar tanımlıysa)
// Sekmeli tasarımda seçenek kutucuğu: emoji varsa üstte çizgi simge, altta metin
function ChoiceTile({ o }) {
  const { emoji, text } = splitEmoji(o);
  return (
    <span className="bf-tile">
      {emoji && <span className="bf-tile-ic"><LineIcon emoji={emoji} /></span>}
      <span className="bf-tile-t">{text}</span>
    </span>
  );
}

function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!siteKey) return;
    let widgetId = null;
    const render = () => {
      if (!window.turnstile || !ref.current) return;
      widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken('') });
    };
    if (window.turnstile) render();
    else {
      let s = document.getElementById('cf-turnstile');
      if (!s) {
        s = document.createElement('script');
        s.id = 'cf-turnstile';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener('load', render);
    }
    return () => {
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken]);
  if (!siteKey) return null;
  return <div ref={ref} className="bf-turnstile" />;
}

// ------------------------------------------------------------ dosya alanı
function FileInput({ field, value, onChange, lang, common }) {
  const inputRef = useRef(null);
  const accept = field.accept?.length ? field.accept : ['pdf', 'jpg', 'png'];
  const acceptAttr = accept.flatMap((e) => [`.${e}`, ...(FILE_TYPES[e] || [])]).join(',');
  const [reading, setReading] = useState(false);

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const meta = { name: file.name, size: file.size, type: file.type };
    // Önce boyut/tür kontrolü (büyük dosyayı boşuna okumayalım)
    const err = validateField({ ...field, required: false }, meta, lang);
    if (err) {
      onChange(meta); // hata gösterilsin diye
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReading(false);
      onChange({ ...meta, dataUrl: reader.result });
    };
    reader.onerror = () => setReading(false);
    reader.readAsDataURL(file);
  }

  return (
    <div className="bf-file">
      <input ref={inputRef} type="file" className="sr-only" accept={acceptAttr} onChange={pick} tabIndex={-1} aria-hidden="true" />
      {value?.name ? (
        <div className="bf-file-chosen">
          <span className="bf-file-name">{value.name}</span>
          <span className="bf-muted">{formatBytes(value.size || 0)}</span>
          <button type="button" className="bf-link" onClick={() => onChange(undefined)}>{t(lang, 'removeFile')}</button>
        </div>
      ) : (
        <button type="button" {...common} className="bf-file-btn" onClick={() => inputRef.current?.click()} disabled={reading}>
          {reading ? '…' : t(lang, 'chooseFile')}
        </button>
      )}
      <div className="bf-help">{t(lang, 'allowedFiles', { n: accept.join(', ').toUpperCase(), m: field.maxMB || 2 })}</div>
    </div>
  );
}

// ------------------------------------------------------------ randevu seçici
function AppointmentPicker({ field, cfg, value, onChange, loadSlots, error, inputId, refreshKey, lang, joinWaitlist }) {
  const v = value || {};
  const services = cfg.services || [];
  const serviceId = v.serviceId || services[0]?.id;
  const resources = resourcesForService(cfg, serviceId);
  const hasResources = (cfg.resources || []).length > 0;
  const partySize = Number(v.partySize || 1);
  const [slots, setSlots] = useState(null);
  const [daysShown, setDaysShown] = useState(14);
  const stripRef = useRef(null);

  const first = firstBookableDate(cfg);
  const days = useMemo(() => {
    const out = [];
    const max = Number(cfg.maxDaysAhead || 30);
    for (let i = 0; i <= max && out.length < daysShown; i++) {
      const d = addDays(first, i);
      out.push({ date: d, open: isDateOpen(cfg, d) });
    }
    return out;
  }, [cfg, daysShown, first]);

  const set = (patch) => onChange({ ...v, serviceId, partySize, ...patch });

  useEffect(() => {
    let alive = true;
    if (!v.date) {
      setSlots(null);
      return;
    }
    setSlots(null);
    Promise.resolve(loadSlots({ date: v.date, serviceId, resourceId: v.resourceId || null, partySize })).then((s) => alive && setSlots(s || []));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.date, serviceId, v.resourceId, partySize, refreshKey]);

  const scroll = (dir) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: 'smooth' });
  };
  const canMore = days.length >= daysShown && daysShown < Number(cfg.maxDaysAhead || 30) + 1;

  return (
    <div className="bf-appt" id={inputId}>
      {services.length > 1 && (
        <div className="bf-svc" role="radiogroup" aria-label={t(lang, 'service')}>
          {services.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={serviceId === s.id} className={`bf-svc-card ${serviceId === s.id ? 'is-on' : ''}`} onClick={() => set({ serviceId: s.id, resourceId: '', time: '' })}>
              <span className="bf-svc-tick" aria-hidden="true">✓</span>
              <b>{s.name}</b>
              <span>{s.duration} {lang === 'en' ? 'min' : 'dk'}{servicePrice(cfg, s) && <> · <strong className="bf-svc-price">{servicePrice(cfg, s)}</strong></>}</span>
            </button>
          ))}
        </div>
      )}
      {services.length === 1 && servicePrice(cfg, services[0]) && (
        <div className="bf-price-one">{lang === 'en' ? 'Price' : 'Ücret'}: <strong>{servicePrice(cfg, services[0])}</strong></div>
      )}
      <div className="bf-appt-row">
        {hasResources && (
          <label className="bf-mini">
            <span>{cfg.resourceLabel || 'Personel'}</span>
            <select value={v.resourceId || ''} onChange={(e) => set({ resourceId: e.target.value, time: '' })}>
              <option value="">{t(lang, 'anyone')}</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        )}
        {cfg.capacityMode === 'kisi' && (
          <label className="bf-mini">
            <span>{t(lang, 'partySize')}</span>
            <select value={partySize} onChange={(e) => set({ partySize: Number(e.target.value), time: '' })}>
              {Array.from({ length: Number(cfg.partySizeMax || 10) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {cfg.openFrom && first === cfg.openFrom && <div className="bf-help">{t(lang, 'opensFrom', { d: formatDate(cfg.openFrom, lang) })}</div>}
      <div className="bf-days-wrap">
        <button type="button" className="bf-arrow" aria-label={t(lang, 'prevDays')} onClick={() => scroll(-1)}>‹</button>
        <div className="bf-days" role="radiogroup" aria-label={t(lang, 'pickDate')} ref={stripRef}>
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={v.date === d.date}
              disabled={!d.open}
              className={`bf-day ${v.date === d.date ? 'is-on' : ''}`}
              onClick={() => set({ date: d.date, time: '' })}
              aria-label={`${weekdayName(d.date, lang)} ${formatDateShort(d.date, lang)}${d.open ? '' : ` (${t(lang, 'closedDay')})`}`}
            >
              <span className="bf-day-w">{weekdayShort(d.date, lang)}</span>
              <span className="bf-day-n">{dayOfMonth(d.date)}</span>
              <span className="bf-day-m">{monthShort(d.date, lang)}</span>
            </button>
          ))}
          {canMore && (
            <button type="button" className="bf-day bf-day-more" onClick={() => setDaysShown((n) => n + 14)}>+14</button>
          )}
        </div>
        <button type="button" className="bf-arrow" aria-label={t(lang, 'nextDays')} onClick={() => scroll(1)}>›</button>
      </div>

      {v.date && (
        <div className="bf-slots-wrap">
          <div className="bf-slots-title">{t(lang, 'slotsFor', { d: `${weekdayName(v.date, lang)}, ${formatDateShort(v.date, lang)}` })}</div>
          {slots === null ? (
            <div className="bf-muted">{t(lang, 'loadingSlots')}</div>
          ) : slots.length === 0 ? (
            cfg.waitlist?.enabled && joinWaitlist ? <WaitBox key={`${v.date}${serviceId}`} date={v.date} serviceId={serviceId} lang={lang} join={joinWaitlist} /> : <div className="bf-muted">{t(lang, 'noSlots')}</div>
          ) : (
            <div className="bf-slots" role="radiogroup" aria-label={t(lang, 'pickTime')}>
              {slots.map((s) => (
                <button key={s.time} type="button" role="radio" aria-checked={v.time === s.time} className={`bf-slot ${v.time === s.time ? 'is-on' : ''}`} onClick={() => set({ time: s.time })}>
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {v.date && v.time && (
        <div className="bf-pick-sum" role="status">
          <span aria-hidden="true">📅</span>
          <span>{weekdayName(v.date, lang)}, {formatDate(v.date, lang)} · <b>{v.time}</b>{services.length > 1 ? ` · ${services.find((x) => x.id === serviceId)?.name || ''}` : ''}</span>
        </div>
      )}
      {error && <div className="bf-error" role="alert">{error}</div>}
      {field.help && <div className="bf-help">{field.help}</div>}
    </div>
  );
}

// ------------------------------------------------------------ Bekleme listesi (dolu gün)
// Formun içinde olduğu için <form> değil; Enter tuşu ana formu göndermesin.
const WAIT_TXT = {
  tr: { full: 'Bu gün tamamen dolu.', q: 'Yer açılırsa haber verelim mi?', p: 'Bu gün bir randevu iptal olursa size WhatsApp\'tan yazarız; ilk dokunan alır.', when: 'Hangi saatler uyar?', prefs: { hepsi: 'Fark etmez', sabah: 'Sabah', ogle: 'Öğle', aksam: 'Akşam' }, name: 'Ad soyad', phone: 'Cep telefonu', btn: 'Bekleme listesine yaz', sending: 'Kaydediliyor…', ok: 'Tamam! Yer açılırsa size WhatsApp\'tan haber vereceğiz.', other: 'Ya da yukarıdan başka bir gün seçin.', kvkk: 'Adınız ve telefonunuz sadece yer açıldığında size haber vermek için kullanılır; gün geçince silinir.' },
  en: { full: 'This day is fully booked.', q: 'Shall we let you know if a spot opens?', p: 'If someone cancels, we will message you on WhatsApp; first come, first served.', when: 'Which times suit you?', prefs: { hepsi: 'Any time', sabah: 'Morning', ogle: 'Midday', aksam: 'Evening' }, name: 'Full name', phone: 'Mobile phone', btn: 'Join the waiting list', sending: 'Saving…', ok: 'Done! We will message you on WhatsApp if a spot opens.', other: 'Or pick another day above.', kvkk: 'Your name and phone are only used to tell you about an opening and are deleted after the day passes.' }
};
function WaitBox({ date, serviceId, lang, join }) {
  const L = WAIT_TXT[lang] || WAIT_TXT.tr;
  const [pref, setPref] = useState('hepsi');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [err, setErr] = useState('');
  const noEnter = (e) => e.key === 'Enter' && e.preventDefault();
  async function send() {
    setErr('');
    if (name.trim().length < 2) return setErr(L.name + '?');
    if (String(phone).replace(/\D/g, '').length < 10) return setErr(L.phone + '?');
    setState('sending');
    try {
      await join({ date, serviceId, pref, name: name.trim(), phone });
      setState('ok');
    } catch (e) {
      setState('');
      setErr(e.message);
    }
  }
  return (
    <div className="bf-wait-wrap">
      <div className="bf-full">😕 {L.full}</div>
      {state === 'ok' ? (
        <div className="bf-wait bf-wait-ok" role="status">✅ {L.ok}</div>
      ) : (
        <div className="bf-wait">
          <b className="bf-wait-q">🔔 {L.q}</b>
          <p>{L.p}</p>
          <div className="bf-wait-l">{L.when}</div>
          <div className="bf-wait-prefs" role="radiogroup" aria-label={L.when}>
            {Object.entries(L.prefs).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={pref === k} className={`bf-chip ${pref === k ? 'is-on' : ''}`} onClick={() => setPref(k)}>{l}</button>
            ))}
          </div>
          <input aria-label={L.name} placeholder={L.name} autoComplete="name" value={name} onKeyDown={noEnter} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <input aria-label={L.phone} placeholder={L.phone} type="tel" inputMode="tel" autoComplete="tel" value={phone} onKeyDown={noEnter} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
          {err && <div className="bf-error" role="alert">{err}</div>}
          <button type="button" className="bf-wait-btn" disabled={state === 'sending'} onClick={send}>{state === 'sending' ? L.sending : L.btn}</button>
          <div className="bf-wait-note">{L.kvkk}</div>
        </div>
      )}
      <div className="bf-help">{L.other}</div>
    </div>
  );
}

// ------------------------------------------------------------ KVKK / açık rıza metni bağlantısı
// Metin panelden yazıldıysa form içinde pencerede açılır (iframe'de de çalışır); yoksa verilen link açılır.
function LegalLink({ doc, title, onOpen }) {
  if (doc?.text?.trim()) {
    return (
      <>
        {' '}
        <button type="button" className="bf-link" onClick={(e) => { e.preventDefault(); onOpen({ title, text: doc.text }); }}>{title}</button>
      </>
    );
  }
  if (doc?.url) {
    return (
      <>
        {' '}
        <a href={doc.url} target="_blank" rel="noreferrer">{title}</a>
      </>
    );
  }
  return null;
}

// ------------------------------------------------------------ randevu sonrası bilgi kartı
// Müşteriye mail gitmediği için onay, iptal bağlantısı ve takvime ekleme bu ekranda.
function AppointmentCard({ a, lang }) {
  const [copied, setCopied] = useState(false);
  if (!a.cancelUrl) {
    // Eski biçim / önizleme
    return <p className="bf-muted">{t(lang, 'yourAppointment', { d: `${formatDateShort(a.date, lang)} ${a.start}` })}{a.status === 'bekliyor' ? ` ${t(lang, 'pending')}` : ''}</p>;
  }
  const pending = a.status === 'bekliyor';
  async function copy() {
    try {
      await navigator.clipboard.writeText(a.cancelUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('', a.cancelUrl);
    }
  }
  const rows = [
    [t(lang, 'business'), a.isletme],
    [t(lang, 'date'), `${weekdayName(a.date, lang)}, ${formatDate(a.date, lang)} · ${a.start}${a.end ? `–${a.end}` : ''}`],
    a.service && a.service !== a.term ? [t(lang, 'service'), a.service] : null,
    a.resource ? [a.resourceLabel || t(lang, 'service'), a.resource] : null,
    a.price ? [lang === 'en' ? 'Price' : 'Ücret', a.price] : null,
    a.partySize ? [t(lang, 'partySize'), t(lang, 'persons', { n: a.partySize })] : null,
    a.address ? [t(lang, 'address'), a.address] : null,
    [t(lang, 'status'), t(lang, 'statusLabels')[a.status] || a.status]
  ].filter(Boolean);
  return (
    <div className="bf-card">
      <div className="bf-card-title">{t(lang, 'cardHeading', { t: a.term || 'Randevu' })}</div>
      <dl className="bf-card-rows">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {pending && <p className="bf-card-note">{t(lang, 'cardPendingNote')}</p>}
      {a.directionsUrl && (
        <a className="bf-btn bf-btn-light bf-dir" href={a.directionsUrl} target="_blank" rel="noopener noreferrer">📍 {t(lang, 'directions')}</a>
      )}
      <div className="bf-card-actions">
        <a className="bf-btn" href={a.icsUrl} target="_blank" rel="noopener">📅 {t(lang, 'addToCalendar')}</a>
        <a className="bf-btn bf-btn-light" href={a.googleUrl} target="_blank" rel="noopener noreferrer">{t(lang, 'googleCalendar')}</a>
      </div>
      <p className="bf-help">{t(lang, 'calendarHint')}</p>
      <div className="bf-card-cancel">
        <div className="bf-card-sub">{t(lang, 'cancelLinkTitle')}</div>
        <div className="bf-card-link">
          <a href={a.cancelUrl} target="_blank" rel="noopener">{a.cancelUrl.replace(/^https?:\/\//, '')}</a>
        </div>
        <div className="bf-card-actions">
          <button type="button" className="bf-btn bf-btn-light" onClick={copy}>{copied ? t(lang, 'copied') : t(lang, 'copyLink')}</button>
        </div>
        <p className="bf-help">{a.cancelCutoffHours > 0 ? t(lang, 'cancelLinkHint', { n: a.cancelCutoffHours }) : t(lang, 'cancelLinkHint0')}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ ana bileşen
export default function FormRenderer({ content, onSubmit, loadSlots, preview = false, onDone, turnstileKey = '', findMine, cancelMine, initial, joinWaitlist }) {
  const { fields = [], appearance: a = {}, settings: s = {}, randevu: cfg } = content;
  const lang = s.language || 'tr';
  useGoogleFont(a.font);
  const style = a.style || DEFAULT_STYLE;
  const [values, setValues] = useState(() => initial?.values || {});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [kvkk, setKvkk] = useState(false);
  const [kvkkError, setKvkkError] = useState('');
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [mineOpen, setMineOpen] = useState(() => !!initial?.manage);
  const pickedKey = useMemo(() => Object.keys(initial?.values || {})[0] || '', []);
  const pv = pickedKey ? values[pickedKey] : null;
  const picked = pv?.date && pv?.time ? { date: pv.date, time: pv.time, svc: (content.randevu?.services || []).find((x) => x.id === pv.serviceId)?.name || '' } : null;
  const [legal, setLegal] = useState(null); // { title, text } – form içinde açılan metin penceresi
  const [globalError, setGlobalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const honeypot = useRef(null);
  const startedAt = useRef(Date.now());

  const vis = useMemo(() => visibilityMap(fields, values), [fields, values]);
  const labelInside = a.labelPosition === 'ic' && style !== 'yuzen';
  const floating = style === 'yuzen';

  // "Adım adım" tasarımı: randevu alanı varsa 1) hizmet ve zaman 2) bilgiler 3) onay; yoksa 4'erli gruplar
  const steps = useMemo(() => {
    if (style === 'sekme') {
      // Sekmeli adımlar: 1) detaylar (ör. Dostunuz) 2) hizmet ve saat 3) iletişim; son adımda gönderilir
      const shown = fields.filter((f) => vis[f.key]);
      const isContact = (f) => ['tel', 'email', 'tc', 'textarea', 'dosya'].includes(f.type) || (f.type === 'text' && /^(ad\b|adı|adınız|ad soyad|ad-soyad|isim|full name|name)/i.test(String(f.label || '').trim()));
      const groups = [
        { keys: shown.filter((f) => f.type !== 'randevu' && !isContact(f)).map((f) => f.key), title: '' },
        { keys: shown.filter((f) => f.type === 'randevu').map((f) => f.key), title: lang === 'en' ? 'Service & Time' : 'Hizmet & Zaman' },
        { keys: shown.filter((f) => f.type !== 'randevu' && isContact(f)).map((f) => f.key), title: lang === 'en' ? 'Contact' : 'İletişim' }
      ].filter((g) => g.keys.length);
      if (groups[0] && !groups[0].title) {
        const g0 = shown.filter((f) => groups[0].keys.includes(f.key));
        const first = g0.find((f) => ['radio', 'select', 'checkbox'].includes(f.type)) || g0[0];
        groups[0].title = splitEmoji(first?.label || '').text.slice(0, 22) || t(lang, 'stepInfo');
      }
      if (groups.length < 2) return null;
      groups[groups.length - 1].final = true;
      return groups;
    }
    if (style !== 'adim') return null;
    const shown = fields.filter((f) => vis[f.key]);
    const appt = shown.filter((f) => f.type === 'randevu');
    const rest = shown.filter((f) => f.type !== 'randevu');
    const out = [];
    if (appt.length) out.push({ title: cfg?.term || t(lang, 'stepTime'), keys: appt.map((f) => f.key) });
    for (let i = 0; i < rest.length; i += appt.length ? 99 : 4) out.push({ title: t(lang, 'stepInfo'), keys: rest.slice(i, i + (appt.length ? 99 : 4)).map((f) => f.key) });
    out.push({ title: t(lang, 'stepConfirm'), keys: [], final: true });
    return out;
  }, [style, fields, vis, cfg, lang]);
  const stepNo = steps ? Math.min(step, steps.length - 1) : 0;
  const inStep = (f) => !steps || steps[stepNo].keys.includes(f.key);
  const lastStep = !steps || steps[stepNo].final;
  function nextStep() {
    const errs = {};
    for (const f of fields) if (vis[f.key] && inStep(f)) {
      const e = validateField(f, values[f.key], lang);
      if (e) errs[f.key] = e;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setStep(stepNo + 1);
  }
  const set = (key, val) => {
    setValues((x) => {
      const next = { ...x };
      if (val === undefined) delete next[key];
      else next[key] = val;
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  // Dosya seçilince boyut/tür hatasını hemen göster
  const setFile = (f, val) => {
    set(f.key, val);
    if (val && !val.dataUrl) setErrors((e) => ({ ...e, [f.key]: validateField({ ...f, required: false }, val, lang) }));
  };

  async function submit(e) {
    e.preventDefault();
    setGlobalError('');
    const errs = validateAll(fields, values, lang);
    // Okunamamış (hatalı) dosya kalmasın
    for (const f of fields) if (f.type === 'dosya' && vis[f.key] && values[f.key] && !values[f.key].dataUrl && !errs[f.key]) errs[f.key] = validateField({ ...f, required: false }, values[f.key], lang) || t(lang, 'genericError');
    setErrors(errs);
    const kErr = s.kvkk?.enabled && !kvkk ? t(lang, 'consentRequired') : '';
    const cErr = s.consent?.enabled && s.consent.required !== false && !consent ? t(lang, 'explicitConsentRequired') : '';
    setConsentError(cErr);
    setKvkkError(kErr);
    if (Object.keys(errs).length || kErr || cErr) {
      const first = fields.find((f) => errs[f.key]);
      const el = first ? document.getElementById(`bf-${first.key}`) : document.getElementById(kErr ? 'bf-kvkk' : 'bf-consent');
      el?.focus?.();
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (preview) {
      setDone({ ok: true, successMessage: s.successMessage, preview: true });
      return;
    }
    // Gizli alanların değerleri gönderilmez
    const payload = Object.fromEntries(Object.entries(values).filter(([k]) => vis[k]));
    setBusy(true);
    try {
      const res = await onSubmit(payload, { honeypot: honeypot.current?.value || '', startedAt: startedAt.current, kvkkAccepted: kvkk, consentAccepted: consent, marketingAccepted: !!(MARKETING_FEATURE && s.marketing?.enabled && marketing), turnstileToken });
      setDone(res);
      onDone?.(res);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      if (err.code === 'saat_doldu') {
        const rf = fields.find((f) => f.type === 'randevu');
        if (rf) {
          setValues((x) => ({ ...x, [rf.key]: { ...x[rf.key], time: '' } }));
          setSlotRefresh((n) => n + 1);
        }
      }
      setGlobalError(err.message || t(lang, 'genericError'));
    } finally {
      setBusy(false);
    }
  }

  const className = [
    'bf',
    `bf-bg-${a.background || 'beyaz'}`,
    a.width === 'dar' ? 'bf-narrow' : '',
    a.width === 'iki' ? 'bf-two' : '',
    labelInside ? 'bf-inside' : '',
    a.dark ? 'bf-dark' : '',
    `bf-style-${style}`
  ].join(' ');
  const decor = style === 'cam' ? (
    <span className="bf-glass-bg" aria-hidden="true"><i /><i /><i /></span>
  ) : null;

  if (done) {
    return (
      <div className={className} style={appearanceStyle(a)} lang={lang}>
        {decor}
        <div className="bf-success" role="status">
          <div className="bf-success-icon" aria-hidden="true">✓</div>
          <p>{done.successMessage || t(lang, 'thanks')}</p>
          {done.appointment && <AppointmentCard a={done.appointment} lang={lang} />}
          {done.preview && <p className="bf-muted">{t(lang, 'previewNote')}</p>}
          {preview && (
            <button type="button" className="bf-btn bf-btn-light" onClick={() => setDone(null)}>{t(lang, 'showAgain')}</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form className={className} style={appearanceStyle(a)} onSubmit={lastStep ? submit : (e) => { e.preventDefault(); nextStep(); }} noValidate lang={lang}>
      {decor}
      {cfg?.selfManage && fields.some((f) => f.type === 'randevu') && (
        <div className="bf-mine-link-row">
          <button type="button" className="bf-mine-link" onClick={() => !preview && setMineOpen(true)}>🗓 {lang === 'en' ? 'Manage my booking' : 'Randevumu yönet'}</button>
        </div>
      )}
      {picked && !done && (
        <div className="bf-picked">🗓 {lang === 'en' ? 'Selected' : 'Seçtiğiniz saat'}: <b>{formatDate(picked.date, lang)} · {picked.time}{picked.svc ? ` · ${picked.svc}` : ''}</b></div>
      )}
      {steps && style === 'sekme' && (
        <div className="bf-tabs" aria-label={`${stepNo + 1} / ${steps.length}`}>
          {steps.map((st, i) => (i < stepNo ? (
            <button key={i} type="button" className="bf-tab is-done" aria-label={`${i + 1}. ${st.title}`} onClick={() => { setErrors({}); setStep(i); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
          ) : (
            <div key={i} className={`bf-tab ${i === stepNo ? 'is-cur' : ''}`} aria-current={i === stepNo ? 'step' : undefined}>
              <span className="bf-tab-n">{i + 1}</span>
              {i === stepNo && <b>{st.title}</b>}
            </div>
          )))}
        </div>
      )}
      {steps && style !== 'sekme' && (
        <div className="bf-steps">
          <div className="bf-steps-bar">{steps.map((st, i) => <i key={i} className={i < stepNo ? 'done' : i === stepNo ? 'cur' : ''} />)}</div>
          <div className="bf-steps-meta"><span><b>{stepNo + 1}</b> / {steps.length} · {steps[stepNo].title}</span></div>
        </div>
      )}
      {a.logo && (
        <div className={`bf-logo bf-logo-${a.logoSize || 'orta'} bf-logo-${a.logoAlign === 'sol' ? 'sol' : 'orta'}`}>
          <img src={a.logo} alt={s.title || 'Logo'} />
        </div>
      )}
      {a.titleOn === true && (s.title || s.description) && (
        <div className="bf-header">
          {s.title && <h2 className="bf-title">{s.title}</h2>}
          {s.description && <p className="bf-desc">{s.description}</p>}
        </div>
      )}

      {steps && steps[stepNo].final && style !== 'sekme' && (
        <div className="bf-recap" key="recap">
          {fields.filter((f) => vis[f.key] && values[f.key] !== undefined && f.type !== 'dosya').map((f) => (
            <div key={f.key}><span>{f.label}</span><b>{f.type === 'randevu' ? displayValue('randevu', values[f.key], cfg) : Array.isArray(values[f.key]) ? values[f.key].join(', ') : String(values[f.key])}</b></div>
          ))}
          <button type="button" className="bf-link" onClick={() => setStep(0)}>{t(lang, 'edit')}</button>
        </div>
      )}
      <div className="bf-fields" key={steps ? `adim-${stepNo}` : 'tum'}>
        {fields.filter((f) => vis[f.key] && inStep(f)).map((f) => {
          const id = `bf-${f.key}`;
          const err = errors[f.key];
          const wide = ['textarea', 'radio', 'checkbox', 'randevu', 'dosya'].includes(f.type);
          const common = {
            id,
            'aria-invalid': !!err,
            'aria-describedby': err ? `${id}-err` : f.help ? `${id}-help` : undefined,
            onBlur: () => {
              if (values[f.key] !== undefined && f.type !== 'dosya') setErrors((e) => ({ ...e, [f.key]: validateField(f, values[f.key], lang) || undefined }));
            }
          };
          // Alan bazında görünüm: 'baslik' (sadece başlık) · 'kutu' (sadece kutu içi yazı) · 'ikisi'. Boş = tasarımın varsayılanı
          const mode = TEXTLIKE.includes(f.type) && ['baslik', 'kutu', 'ikisi'].includes(f.display) ? f.display : '';
          const isFloat = !mode && floating && ['text', 'email', 'tel', 'tc', 'number', 'textarea'].includes(f.type);
          const req = f.required ? ' *' : '';
          const ph = mode === 'baslik' ? '' : mode === 'kutu' ? `${f.placeholder || f.label}${req}` : mode === 'ikisi' ? f.placeholder : isFloat ? ' ' : labelInside ? `${f.label}${req}` : f.placeholder;
          const showLabel = mode ? mode !== 'kutu' : !labelInside || ['radio', 'checkbox', 'randevu', 'select', 'date', 'dosya'].includes(f.type);
          let control;
          switch (f.type) {
            case 'textarea':
              control = (
                <>
                  <textarea {...common} rows={4} placeholder={ph} maxLength={f.maxLength || undefined} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
                  {f.maxLength ? <div className="bf-counter">{(values[f.key] || '').length}/{f.maxLength}</div> : null}
                </>
              );
              break;
            case 'select':
              control = (
                <select {...common} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value || undefined)}>
                  <option value="">{f.placeholder || t(lang, 'select')}</option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              );
              break;
            case 'radio':
              control = (
                <div className="bf-choices" role="radiogroup" id={id} aria-labelledby={`${id}-l`} aria-invalid={!!err}>
                  {(f.options || []).map((o) => (
                    <label key={o} className="bf-choice">
                      <input type="radio" name={id} checked={values[f.key] === o} onChange={() => set(f.key, o)} />
                      {style === 'sekme' ? <ChoiceTile o={o} /> : <span>{o}</span>}
                    </label>
                  ))}
                </div>
              );
              break;
            case 'checkbox': {
              const arr = values[f.key] || [];
              control = (
                <div className="bf-choices" role="group" id={id} aria-labelledby={`${id}-l`}>
                  {(f.options || []).map((o) => (
                    <label key={o} className="bf-choice">
                      <input type="checkbox" checked={arr.includes(o)} onChange={(e) => {
                        const next = e.target.checked ? [...arr, o] : arr.filter((x) => x !== o);
                        set(f.key, next.length ? next : undefined);
                      }} />
                      {style === 'sekme' ? <ChoiceTile o={o} /> : <span>{o}</span>}
                    </label>
                  ))}
                </div>
              );
              break;
            }
            case 'tel':
              control = <input {...common} type="tel" inputMode="tel" autoComplete="tel" placeholder={ph || '05xx xxx xx xx'} value={values[f.key] || ''} onChange={(e) => set(f.key, formatPhone(e.target.value))} />;
              break;
            case 'tc':
              control = <input {...common} type="text" inputMode="numeric" maxLength={11} autoComplete="off" placeholder={ph} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value.replace(/\D/g, ''))} />;
              break;
            case 'email':
              control = <input {...common} type="email" autoComplete="email" placeholder={ph} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />;
              break;
            case 'number':
              control = <input {...common} type="number" inputMode="numeric" min={f.min} max={f.max} placeholder={ph} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
              break;
            case 'date':
              control = <input {...common} type="date" min={f.minDate || undefined} max={f.maxDate || undefined} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />;
              break;
            case 'dosya':
              control = <FileInput field={f} value={values[f.key]} onChange={(val) => setFile(f, val)} lang={lang} common={common} />;
              break;
            case 'randevu':
              control = cfg ? (
                <AppointmentPicker field={f} cfg={cfg} inputId={id} value={values[f.key]} onChange={(val) => set(f.key, val)} loadSlots={loadSlots} error={err} refreshKey={slotRefresh} lang={lang} joinWaitlist={preview ? null : joinWaitlist} />
              ) : null;
              break;
            default:
              control = (
                <input {...common} type="text" autoComplete={/(^|\s)(ad|isim|name)/i.test(f.label) ? 'name' : 'on'} placeholder={ph} maxLength={f.maxLength || undefined} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
              );
          }
          return (
            <div key={f.id} className={`bf-field ${wide ? 'bf-wide' : ''} ${err ? 'has-error' : ''} ${isFloat ? 'is-float' : ''}`}>
              <label htmlFor={id} id={`${id}-l`} className={showLabel ? 'bf-label' : 'sr-only'}>
                {f.label}
                {f.required && <span className="bf-req" aria-hidden="true"> *</span>}
              </label>
              {control}
              {f.type !== 'randevu' && err && <div className="bf-error" id={`${id}-err`} role="alert">{err}</div>}
              {f.type !== 'randevu' && f.help && <div className="bf-help" id={`${id}-help`}>{f.help}</div>}
            </div>
          );
        })}
      </div>

      {/* Bot tuzağı: insanlar görmez, botlar doldurur */}
      <div className="bf-hp" aria-hidden="true">
        <label htmlFor="bf-website">Web siteniz</label>
        <input id="bf-website" name="website" type="text" tabIndex={-1} autoComplete="off" ref={honeypot} />
      </div>

      {lastStep && s.kvkk?.enabled && (
        <div className={`bf-kvkk ${kvkkError ? 'has-error' : ''}`}>
          <label className="bf-choice">
            <input id="bf-kvkk" type="checkbox" checked={kvkk} onChange={(e) => { setKvkk(e.target.checked); setKvkkError(''); }} aria-invalid={!!kvkkError} />
            <span>
              {s.kvkk.label}
              <LegalLink lang={lang} doc={s.kvkk} title={t(lang, 'privacyLink')} onOpen={setLegal} />
            </span>
          </label>
          {kvkkError && <div className="bf-error" role="alert">{kvkkError}</div>}
        </div>
      )}

      {lastStep && s.consent?.enabled && (
        <div className={`bf-kvkk ${consentError ? 'has-error' : ''}`}>
          <label className="bf-choice">
            <input id="bf-consent" type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setConsentError(''); }} aria-invalid={!!consentError} />
            <span>
              {s.consent.label}
              {s.consent.required !== false && <span className="bf-req" aria-hidden="true"> *</span>}
              <LegalLink lang={lang} doc={s.consent} title={t(lang, 'consentLink')} onOpen={setLegal} />
            </span>
          </label>
          {consentError && <div className="bf-error" role="alert">{consentError}</div>}
        </div>
      )}

      {MARKETING_FEATURE && lastStep && s.marketing?.enabled && (
        <div className="bf-kvkk bf-marketing">
          <label className="bf-choice">
            <input id="bf-marketing" type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span>
              {s.marketing.label || DEFAULT_MARKETING_LABEL}
              {(s.marketing.text || s.marketing.url) && <LegalLink lang={lang} doc={s.marketing} title={lang === 'en' ? 'Details' : 'Ayrıntılar'} onOpen={setLegal} />}
            </span>
          </label>
        </div>
      )}

      {mineOpen && findMine && <ManageMine lang={lang} find={findMine} cancel={cancelMine} className={className} vars={appearanceStyle(a)} onClose={() => setMineOpen(false)} />}
      {legal && (
        <div className="bf-legal" role="dialog" aria-modal="true" aria-label={legal.title} onMouseDown={(e) => e.target === e.currentTarget && setLegal(null)}>
          <div className="bf-legal-box">
            <div className="bf-legal-head">
              <b>{legal.title}</b>
              <button type="button" className="bf-legal-x" aria-label={t(lang, 'close')} onClick={() => setLegal(null)}>✕</button>
            </div>
            <div className="bf-legal-text">{legal.text}</div>
            <button type="button" className="bf-btn" onClick={() => setLegal(null)}>{t(lang, 'close')}</button>
          </div>
        </div>
      )}

      {!preview && lastStep && <Turnstile siteKey={turnstileKey} onToken={setTurnstileToken} />}

      {globalError && <div className="bf-global-error" role="alert">{globalError}</div>}

      {steps ? (
        <div className="bf-nav">
          {stepNo > 0 && <button type="button" className="bf-back" aria-label={t(lang, 'back')} onClick={() => { setErrors({}); setStep(stepNo - 1); }}>{style === 'sekme' ? <>← {t(lang, 'back')}</> : '←'}</button>}
          <button type="submit" className="bf-btn" disabled={busy}>{busy ? t(lang, 'sending') : lastStep ? a.buttonText || t(lang, 'submit') : style === 'sekme' ? `${lang === 'en' ? 'Continue' : 'Devam'} →` : `${t(lang, 'next')} →`}</button>
        </div>
      ) : (
        <button type="submit" className="bf-btn" disabled={busy}>{busy ? t(lang, 'sending') : a.buttonText || t(lang, 'submit')}</button>
      )}
    </form>
  );
}
