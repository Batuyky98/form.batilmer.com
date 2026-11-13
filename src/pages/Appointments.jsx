import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Link } from '../router.jsx';
import { Badge, Field, Modal, Segmented, Spinner, useConfirm, useIsMobile, useToast } from '../components/ui.jsx';
import { addDays, dayOfMonth, dayOfWeek, formatDate, formatDateShort, today, weekdayName, weekdayShort } from '../lib/util.js';
import { serviceById } from '../lib/availability.js';
import ApptActions from '../components/ApptActions.jsx';

const STATUS_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };

function weekStart(dateStr) {
  const day = (dayOfWeek(dateStr) + 6) % 7; // Pazartesi = 0
  return addDays(dateStr, -day);
}

function SlotPicker({ formId, cfg, date, serviceId, resourceId, partySize, excludeId, value, onChange }) {
  const [slots, setSlots] = useState(null);
  useEffect(() => {
    if (!date) return;
    setSlots(null);
    api.adminSlots(formId, { date, serviceId, resourceId, partySize, excludeId }).then(setSlots);
  }, [formId, date, serviceId, resourceId, partySize, excludeId]);
  if (!date) return null;
  if (!slots) return <Spinner />;
  if (!slots.length) return <div className="muted small">Bu gün için boş saat yok (çalışma saatleri, kapalı gün veya kapasite).</div>;
  return (
    <div className="slot-grid" role="radiogroup" aria-label="Saat">
      {slots.map((s) => (
        <button key={s.time} type="button" role="radio" aria-checked={value === s.time} className={`slot ${value === s.time ? 'is-on' : ''}`} onClick={() => onChange(s.time)}>{s.time}</button>
      ))}
    </div>
  );
  // cfg şu an kullanılmıyor ama ileride kaynak gösterimi için tutuluyor
}

function ManualModal({ formId, cfg, initialDate, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', phone: '', email: '', note: '', date: initialDate || today(), time: '', serviceId: cfg.services[0]?.id, resourceId: '', partySize: 1 });
  const [error, setError] = useState('');
  const set = (p) => setV((x) => ({ ...x, ...p }));
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!v.time) return setError('Bir saat seçin.');
    try {
      await api.createManualAppointment(formId, v);
      toast('Randevu eklendi.');
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Modal title="Manuel randevu ekle" onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">Telefonla ya da yüz yüze alınan randevular için. Saat, form ile aynı kurallara göre kontrol edilir (önceden bildirim süresi hariç).</p>
        <div className="grid-3">
          <Field label="Ad Soyad *"><input required value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Telefon"><input type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="E-posta (onay maili için)"><input type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        </div>
        <div className="grid-3">
          <Field label="Hizmet">
            <select value={v.serviceId} onChange={(e) => set({ serviceId: e.target.value, time: '' })}>
              {cfg.services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration} dk)</option>)}
            </select>
          </Field>
          {cfg.resources.length > 0 && (
            <Field label={cfg.resourceLabel}>
              <select value={v.resourceId} onChange={(e) => set({ resourceId: e.target.value, time: '' })}>
                <option value="">Fark etmez</option>
                {cfg.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          )}
          {cfg.capacityMode === 'kisi' && (
            <Field label="Kişi sayısı"><input type="number" min="1" max={cfg.partySizeMax} value={v.partySize} onChange={(e) => set({ partySize: Number(e.target.value), time: '' })} /></Field>
          )}
          <Field label="Tarih"><input type="date" value={v.date} onChange={(e) => set({ date: e.target.value, time: '' })} /></Field>
        </div>
        <Field label="Saat">
          <SlotPicker formId={formId} cfg={cfg} date={v.date} serviceId={v.serviceId} resourceId={v.resourceId} partySize={v.partySize} value={v.time} onChange={(t) => set({ time: t })} />
        </Field>
        <Field label="Not"><input value={v.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <div className="row-end"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary">Randevuyu ekle</button></div>
      </form>
    </Modal>
  );
}

function BlockModal({ formId, cfg, initialDate, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ date: initialDate || today(), start: '12:00', end: '13:00', resourceId: '', note: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await api.addBlock(formId, v);
      toast('Saat bloklandı; bu aralıkta randevu alınamaz.');
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Modal title="Saat blokla" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">Toplantı, izin, bakım gibi durumlarda bu aralık formda kapalı görünür.</p>
        <div className="grid-3">
          <Field label="Tarih"><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="Başlangıç"><input type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></Field>
          <Field label="Bitiş"><input type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></Field>
        </div>
        {cfg.resources.length > 0 && (
          <Field label={cfg.resourceLabel}>
            <select value={v.resourceId} onChange={(e) => setV({ ...v, resourceId: e.target.value })}>
              <option value="">Hepsi</option>
              {cfg.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Not (sadece panelde görünür)"><input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <div className="row-end"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary">Blokla</button></div>
      </form>
    </Modal>
  );
}

function DetailModal({ appt, cfg, formId, onClose, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [moving, setMoving] = useState(false);
  const [mv, setMv] = useState({ date: appt.date, time: '', resourceId: appt.resourceId || '' });
  const svc = serviceById(cfg, appt.serviceId);
  const res = cfg.resources.find((r) => r.id === appt.resourceId);
  const sub = appt.submission;

  async function status(s) {
    if (s === 'iptal') {
      const ok = await confirm({ title: 'Randevuyu iptal et', message: `Randevu iptal edilecek, saat yeniden açılacak${appt.contact?.email ? ' ve müşteriye iptal maili gidecek' : ''}.`, confirmText: 'İptal et', danger: true });
      if (!ok) return;
    }
    try {
      await api.setAppointmentStatus(appt.id, s);
      toast(`Durum: ${api.STATUS_LABELS[s]}`);
      onDone();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  async function move() {
    if (!mv.time) return toast('Yeni bir saat seçin.', 'err');
    try {
      await api.moveAppointment(appt.id, mv);
      toast('Randevu taşındı.');
      onDone();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  const isPast = appt.date < today();
  return (
    <Modal title={`${formatDate(appt.date)} · ${appt.start}–${appt.end}`} onClose={onClose} wide>
      <div className="stack">
        <div className="row"><Badge tone={STATUS_TONE[appt.status]}>{api.STATUS_LABELS[appt.status]}</Badge>{appt.source === 'manuel' && <Badge tone="gray">Manuel</Badge>}</div>
        <dl className="detail">
          <div><dt>Hizmet</dt><dd>{svc?.name}</dd></div>
          {res && <div><dt>{cfg.resourceLabel}</dt><dd>{res.name}</dd></div>}
          {cfg.capacityMode === 'kisi' && <div><dt>Kişi sayısı</dt><dd>{appt.partySize}</dd></div>}
          {sub && (sub.order || []).filter((k) => sub.types[k] !== 'randevu').map((k) => (
            <div key={k}><dt>{sub.labels[k]}</dt><dd className="pre">{api.displayValue(sub.types[k], sub.values[k], cfg, { mask: true }) || '—'}</dd></div>
          ))}
        </dl>
        {appt.status !== 'iptal' && (
          <div className="row wrap">
            {appt.status === 'bekliyor' && <button type="button" className="btn btn-primary" onClick={() => status('onaylandi')}>Onayla</button>}
            {(isPast || appt.date === today()) && appt.status !== 'geldi' && <button type="button" className="btn" onClick={() => status('geldi')}>Geldi</button>}
            {(isPast || appt.date === today()) && appt.status !== 'gelmedi' && <button type="button" className="btn" onClick={() => status('gelmedi')}>Gelmedi</button>}
            {!isPast && <button type="button" className="btn" onClick={() => setMoving((m) => !m)}>Taşı</button>}
            <button type="button" className="btn btn-danger-ghost" onClick={() => status('iptal')}>İptal et</button>
          </div>
        )}
        {moving && (
          <div className="sub-card stack">
            <h3>Yeni saat</h3>
            <div className="grid-2">
              <Field label="Tarih"><input type="date" min={today()} value={mv.date} onChange={(e) => setMv({ ...mv, date: e.target.value, time: '' })} /></Field>
              {cfg.resources.length > 0 && (
                <Field label={cfg.resourceLabel}>
                  <select value={mv.resourceId} onChange={(e) => setMv({ ...mv, resourceId: e.target.value, time: '' })}>
                    <option value="">Fark etmez</option>
                    {cfg.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <SlotPicker formId={formId} cfg={cfg} date={mv.date} serviceId={appt.serviceId} resourceId={mv.resourceId} partySize={appt.partySize} excludeId={appt.id} value={mv.time} onChange={(t) => setMv({ ...mv, time: t })} />
            <div><button type="button" className="btn btn-primary btn-sm" onClick={move}>Taşı ve müşteriye bildir</button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Appointments({ id }) {
  const toast = useToast();
  // Bildirimden gelindiyse (?tarih=2026-11-14) o güne git
  const [anchor, setAnchor] = useState(() => {
    const d = new URLSearchParams(window.location.search).get('tarih');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today();
  });
  const [view, setView] = useState('hafta');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [resFilter, setResFilter] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [modal, setModal] = useState(null);
  const mobile = useIsMobile();

  // Telefonda: üstte haftanın günleri (şerit), altında seçili günün ajandası. Veri her zaman haftalık çekilir.
  const effView = mobile ? 'gun' : view;
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  const start = mobile || view === 'hafta' ? week[0] : anchor;
  const end = mobile || view === 'hafta' ? week[6] : anchor;
  const days = effView === 'hafta' ? week : [anchor];

  async function load() {
    try {
      setData(await api.listAppointments(id, { from: start, to: end }));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, start, end]);

  if (error) return <div className="page"><div className="notice notice-err">{error}</div></div>;
  if (!data) return <div className="page"><Spinner /></div>;
  const { cfg, form } = data;
  const items = data.items.filter((a) => (showCancelled || a.status !== 'iptal') && (!resFilter || a.resourceId === resFilter));
  const pending = data.items.filter((a) => a.status === 'bekliyor').length;
  const done = () => {
    setModal(null);
    load();
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <Link to="/panel" className="back">← Formlar</Link>
          <div className="eyebrow">{[form.isletme, form.name].filter(Boolean).join(' · ')}</div>
          <h1>Randevular</h1>
        </div>
        <div className="row wrap">
          <Link to={`/panel/formlar/${id}/kayitlar`} className="btn">Kayıtlar</Link>
          <button type="button" className="btn" onClick={() => setModal({ type: 'block' })}>Saat blokla</button>
          {!mobile && <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'manual' })}>+ Manuel randevu</button>}
        </div>
      </div>

      {pending > 0 && <div className="notice notice-warn">Bu aralıkta onay bekleyen {pending} randevu var.</div>}

      <div className="cal-toolbar card">
        <div className="row cal-nav">
          <button type="button" className="btn btn-sm" aria-label={mobile ? 'Önceki hafta' : 'Önceki'} onClick={() => setAnchor(addDays(anchor, mobile || view === 'hafta' ? -7 : -1))}>←</button>
          <button type="button" className="btn btn-sm" onClick={() => setAnchor(today())}>Bugün</button>
          <button type="button" className="btn btn-sm" aria-label={mobile ? 'Sonraki hafta' : 'Sonraki'} onClick={() => setAnchor(addDays(anchor, mobile || view === 'hafta' ? 7 : 1))}>→</button>
          <strong className="cal-range">{effView === 'hafta' ? `${formatDateShort(start)} – ${formatDate(end)}` : `${weekdayName(anchor)}, ${formatDate(anchor)}`}</strong>
        </div>
        {mobile && (
          <div className="week-strip" role="tablist" aria-label="Haftanın günleri">
            {week.map((d) => {
              const n = data.items.filter((a) => a.date === d && a.status !== 'iptal').length;
              const wait = data.items.some((a) => a.date === d && a.status === 'bekliyor');
              return (
                <button key={d} type="button" role="tab" aria-selected={d === anchor} className={`ws-day ${d === anchor ? 'is-on' : ''} ${d === today() ? 'is-today' : ''}`} onClick={() => setAnchor(d)} aria-label={`${weekdayName(d)} ${formatDate(d)}, ${n} randevu`}>
                  <span className="ws-w">{weekdayShort(d)}</span>
                  <span className="ws-n">{dayOfMonth(d)}</span>
                  <span className={`ws-count ${wait ? 'is-wait' : ''}`}>{n || ''}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="row wrap">
          {cfg.resources.length > 0 && (
            <select aria-label="Kaynak filtresi" value={resFilter} onChange={(e) => setResFilter(e.target.value)}>
              <option value="">Tüm {cfg.resourceLabel.toLocaleLowerCase('tr')}</option>
              {cfg.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <button type="button" className={`pill-toggle ${showCancelled ? 'is-on' : ''}`} aria-pressed={showCancelled} onClick={() => setShowCancelled((v) => !v)}>{showCancelled ? '✓ ' : ''}İptalleri göster</button>
          {!mobile && <Segmented value={view} onChange={setView} label="Görünüm" options={[{ value: 'gun', label: 'Gün' }, { value: 'hafta', label: 'Hafta' }]} />}
        </div>
      </div>

      <div className={`calendar ${effView === 'gun' ? 'calendar-day' : ''}`}>
        {days.map((d) => {
          const list = items.filter((a) => a.date === d);
          const blocks = data.blocks.filter((b) => b.date === d && (!resFilter || !b.resourceId || b.resourceId === resFilter));
          const closed = cfg.closedDates.includes(d) || !(cfg.hours?.[dayOfWeek(d)] || []).length;
          return (
            <section key={d} className={`cal-day ${d === today() ? 'is-today' : ''} ${closed ? 'is-closed' : ''}`} aria-label={`${weekdayName(d)} ${formatDate(d)}`}>
              <header>
                <button type="button" className="cal-day-title" onClick={() => { setAnchor(d); if (!mobile) setView('gun'); }}>
                  <span>{weekdayName(d)}</span>
                  <b>{formatDateShort(d)}</b>
                </button>
                {closed && <span className="muted small">Kapalı</span>}
              </header>
              <div className="cal-items">
                {blocks.map((b) => (
                  <div key={b.id} className="cal-block">
                    <span>{b.start}–{b.end} · Bloklu{b.note ? ` · ${b.note}` : ''}</span>
                    <button type="button" className="icon-btn" aria-label="Bloğu kaldır" onClick={async () => { await api.removeBlock(b.id); toast('Blok kaldırıldı.'); load(); }}>✕</button>
                  </div>
                ))}
                {list.map((a) => (
                  <div key={a.id} className={`cal-item status-${a.status}`}>
                    <button type="button" className="cal-main" onClick={() => setModal({ type: 'detail', appt: a })}>
                      <span className="cal-time">{a.start}<small>{a.end}</small></span>
                      <span className="cal-name">{a.contact?.name || 'İsimsiz'}{cfg.capacityMode === 'kisi' ? ` · ${a.partySize} kişi` : ''}</span>
                      <span className="cal-meta">{serviceById(cfg, a.serviceId)?.name}{a.resourceId ? ` · ${cfg.resources.find((r) => r.id === a.resourceId)?.name || ''}` : ''}</span>
                      <Badge tone={STATUS_TONE[a.status]}>{api.STATUS_LABELS[a.status]}</Badge>
                    </button>
                    <ApptActions appt={a} phone={a.contact?.phone} compact={effView === 'hafta'} onDone={load} />
                  </div>
                ))}
                {!list.length && !blocks.length && !closed && <div className="cal-empty cal-empty-nice"><span aria-hidden="true">🗓️</span><b>Randevu yok</b></div>}
              </div>
            </section>
          );
        })}
      </div>

      {mobile && (
        <button type="button" className="fab" aria-label="Manuel randevu ekle" onClick={() => setModal({ type: 'manual' })}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
      {modal?.type === 'manual' && <ManualModal formId={id} cfg={cfg} initialDate={effView === 'gun' ? anchor : today()} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'block' && <BlockModal formId={id} cfg={cfg} initialDate={effView === 'gun' ? anchor : today()} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'detail' && <DetailModal appt={modal.appt} cfg={cfg} formId={id} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}
