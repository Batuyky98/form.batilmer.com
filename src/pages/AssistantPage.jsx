import { useEffect, useRef, useState } from 'react';
import * as api from '../lib/api.js';
import { addDays, dayOfMonth, dayOfWeek, today, weekdayShort } from '../lib/util.js';
import { whatsappUrl, telUrl } from '../lib/shared.js';

// Ücretsiz sohbet asistanı (yapay zekâ yok). İşletme sitesindeki balonun içinde (iframe) ya da tek başına açılır.
// Bilgiler panelden gelir: hizmetler/fiyatlar, çalışma saatleri, adres, boş saatler, sık sorulanlar.
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const embedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const closeParent = () => embedded && window.parent.postMessage({ type: 'batilmer:asistan-kapat' }, '*');

function Slots({ d, svc }) {
  const [day, setDay] = useState('');
  const [slots, setSlots] = useState(null);
  const [days, setDays] = useState(null);
  const boxRef = useRef(null);
  useEffect(() => {
    if (slots) boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [slots]);
  useEffect(() => {
    // En yakın 4 açık gün
    const out = [];
    const closed = new Set(d.closedDates);
    for (let i = 0; i <= d.maxDaysAhead && out.length < 4; i++) {
      const x = addDays(d.firstDate || today(), i);
      if (!closed.has(x) && (d.hours?.[dayOfWeek(x)] || []).length) out.push(x);
    }
    setDays(out);
    setDay(out[0] || '');
  }, []);
  useEffect(() => {
    if (!day) return;
    setSlots(null);
    api.getAvailability(d.slug, { date: day, serviceId: svc.id }).then((s) => setSlots(s || [])).catch(() => setSlots([]));
  }, [day]);
  const label = (x) => (x === today() ? 'Bugün' : x === addDays(today(), 1) ? 'Yarın' : weekdayShort(x));
  if (!days) return <div className="asx-bot">…</div>;
  if (!days.length) return <div className="asx-bot">Yakın tarihte boş gün görünmüyor. Bize yazabilirsiniz.</div>;
  return (
    <div className="asx-bot asx-wide" ref={boxRef}>
      En yakın boş saatler{svc.name ? ` · ${svc.name}` : ''}:
      <div className="asx-days">{days.map((x) => <button key={x} type="button" className={`asx-d ${x === day ? 'on' : ''}`} onClick={() => setDay(x)}>{label(x)}<b>{dayOfMonth(x)}</b></button>)}</div>
      {slots === null ? <div className="asx-note">Saatler yükleniyor…</div> : !slots.length ? <div className="asx-note">Bu gün dolu. Başka bir gün seçin.</div> : (
        <div className="asx-slots">
          {slots.slice(0, 9).map((s) => (
            <a key={s.time} className="asx-s" target="_top" href={`/f/${d.slug}?tarih=${day}&saat=${s.time}&hizmet=${svc.id}`}>{s.time}</a>
          ))}
        </div>
      )}
      {slots?.length > 9 && <a className="asx-more" target="_top" href={`/f/${d.slug}?tarih=${day}&hizmet=${svc.id}`}>Tüm saatleri gör ›</a>}
    </div>
  );
}

export default function AssistantPage({ slug }) {
  const [d, setD] = useState(undefined);
  const [log, setLog] = useState([]); // { who: 'bot' | 'me', node }
  const endRef = useRef(null);

  useEffect(() => {
    document.title = 'Asistan';
    document.documentElement.classList.add('as-doc');
    api.getAssistant(slug).then(setD).catch(() => setD(null));
  }, [slug]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [log]);

  if (d === undefined) return <div className="asx"><div className="asx-load"><div className="spinner" /></div></div>;
  if (!d) {
    return (
      <div className="asx">
        <div className="asx-load"><p>Asistan şu anda kullanılamıyor.</p></div>
      </div>
    );
  }

  const wa = whatsappUrl(d.whatsapp);
  const formUrl = (q = '') => `/f/${d.slug}${q}`;
  const say = (me, bot) => setLog((l) => [...l, ...(me ? [{ who: 'me', node: me }] : []), { who: 'bot', node: bot }]);
  const chips = (list) => <div className="asx-chips">{list.filter(Boolean).map(([label, fn]) => <button key={label} type="button" className="asx-chip" onClick={fn}>{label}</button>)}</div>;
  const back = () => ['☰ Menü', () => say(null, menu())];

  function showPrices() {
    say('💰 Fiyatlar', (
      <>
        <div className="asx-bot asx-wide">
          {d.services.map((s) => (
            <div key={s.id} className="asx-price"><span>{s.name}</span><span>{s.duration} dk{s.price ? <> · <b>{s.price}</b></> : ''}</span></div>
          ))}
          {!d.services.some((s) => s.price) && <div className="asx-note">Fiyat bilgisi için bize yazabilirsiniz.</div>}
        </div>
        {chips([d.items.randevu && d.hasAppt && ['🗓 Randevu al', startBooking], back()])}
      </>
    ));
  }
  function showHours() {
    const order = [1, 2, 3, 4, 5, 6, 0];
    say('🕒 Çalışma saatleri', (
      <>
        <div className="asx-bot asx-wide">
          {d.hours ? order.map((n) => {
            const r = d.hours[n] || [];
            return <div key={n} className={`asx-price ${n === dayOfWeek(today()) ? 'is-today' : ''}`}><span>{DAYS[n]}</span><span>{r.length ? r.map((x) => `${x.start}–${x.end}`).join(', ') : 'Kapalı'}</span></div>;
          }) : <div className="asx-note">Çalışma saatleri için bize yazabilirsiniz.</div>}
          {d.closedDates.length > 0 && <div className="asx-note">Kapalı günler: {d.closedDates.slice(0, 5).map((x) => `${dayOfMonth(x)}.${x.slice(5, 7)}`).join(', ')}</div>}
        </div>
        {chips([d.items.randevu && d.hasAppt && ['🗓 Randevu al', startBooking], back()])}
      </>
    ));
  }
  function showAddress() {
    say('📍 Adres', (
      <>
        <div className="asx-bot">{d.address || 'Adres bilgisi için bize yazabilirsiniz.'}</div>
        {chips([d.directions && ['🧭 Yol tarifi', () => window.open(d.directions, '_blank', 'noopener')], d.phone && telUrl(d.phone) && ['📞 Ara', () => (window.top.location.href = telUrl(d.phone))], back()])}
      </>
    ));
  }
  function showFaq() {
    say('❓ Sık sorulanlar', (
      <>
        <div className="asx-bot asx-wide">
          {d.faq.length ? d.faq.map((f) => (
            <button key={f.q} type="button" className="asx-q" onClick={() => say(f.q, <><div className="asx-bot">{f.a}</div>{chips([wa && ['💬 WhatsApp', openWa], back()])}</>)}>{f.q}<span>›</span></button>
          )) : <div className="asx-note">Henüz soru eklenmemiş. Bize WhatsApp'tan yazabilirsiniz.</div>}
        </div>
        {chips([back()])}
      </>
    ));
  }
  function openWa() {
    if (wa) window.open(`${wa}?text=${encodeURIComponent(`Merhaba, ${d.isletme} için yazıyorum.`)}`, '_blank', 'noopener');
  }
  function startBooking() {
    if (!d.open) return say('🗓 Randevu al', <div className="asx-bot">Şu anda online randevu alınamıyor. Bize WhatsApp'tan ya da telefonla ulaşabilirsiniz.</div>);
    if (d.services.length > 1) {
      say('🗓 Randevu al', <><div className="asx-bot">Hangi hizmet için?</div>{chips(d.services.map((s) => [s.name, () => pickDay(s)]))}</>);
    } else pickDay(d.services[0], '🗓 Randevu al');
  }
  function pickDay(svc, meText) {
    say(meText || svc.name, <Slots d={d} svc={svc} />);
  }
  function menu() {
    const it = d.items;
    return (
      <div className="asx-menu">
        {it.randevu && d.hasAppt && <button type="button" className="asx-mb" onClick={startBooking}>🗓 Randevu al</button>}
        {it.fiyat && d.services.length > 0 && <button type="button" className="asx-mb" onClick={showPrices}>💰 Fiyatlar</button>}
        {it.saat && d.hours && <button type="button" className="asx-mb" onClick={showHours}>🕒 Çalışma saatleri</button>}
        {it.adres && d.address && <button type="button" className="asx-mb" onClick={showAddress}>📍 Adres / yol tarifi</button>}
        {it.sss && d.faq.length > 0 && <button type="button" className="asx-mb" onClick={showFaq}>❓ Sık sorulanlar</button>}
        {it.yonet && d.selfManage && <a className="asx-mb" target="_top" href={formUrl('?yonet=1')}>📅 Randevumu yönet</a>}
        {it.wa && wa && <button type="button" className="asx-mb asx-wa" onClick={openWa}>💬 WhatsApp'tan yazın</button>}
      </div>
    );
  }

  return (
    <div className="asx" style={{ '--asx': d.primary }}>
      <header className="asx-h">
        <span className="asx-av">{d.logo ? <img src={d.logo} alt="" /> : '💬'}</span>
        <span className="asx-ht"><b>{d.isletme}</b><span>Size nasıl yardımcı olabiliriz?</span></span>
        {embedded && <button type="button" className="asx-x" aria-label="Kapat" onClick={closeParent}>✕</button>}
      </header>
      <main className="asx-body">
        <div className="asx-bot">{d.greeting || `Merhaba 👋 ${d.isletme}'e hoş geldiniz. Size nasıl yardımcı olabilirim?`}</div>
        {menu()}
        {log.map((m, i) => (m.who === 'me' ? <div key={i} className="asx-me">{m.node}</div> : <div key={i} className="asx-grp">{m.node}</div>))}
        <div ref={endRef} />
      </main>
      <footer className="asx-f">
        <button type="button" className="asx-fb" onClick={() => say(null, menu())}>☰ Menü</button>
        {wa && <button type="button" className="asx-fb asx-wa" onClick={openWa}>💬 WhatsApp</button>}
      </footer>
    </div>
  );
}
