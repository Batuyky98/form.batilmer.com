import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Link } from '../router.jsx';
import { Modal, Spinner, Toggle, useConfirm, useToast } from '../components/ui.jsx';
import { dayLabel } from '../components/ApptSheet.jsx';
import { addDays, formatDateShort, today, weekdayName } from '../lib/util.js';

const WEEK = [[1, 'Pazartesi'], [2, 'Salı'], [3, 'Çarşamba'], [4, 'Perşembe'], [5, 'Cuma'], [6, 'Cumartesi'], [0, 'Pazar']];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const listAffected = (list) => list.slice(0, 5).map((a) => `• ${dayLabel(a.date)} ${a.start}${a.name ? ` – ${a.name}` : ''}`).join('\n') + (list.length > 5 ? `\n… ve ${list.length - 5} randevu daha` : '');

// İşletmenin kendisinin yönettiği müsaitlik: belirli saati kapat, tatil günü, haftalık çalışma saatleri.
// Formun alanları, hizmetleri vb. Batilmer'de; burada sadece gün ve saat.
export default function Schedule({ id }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hours, setHours] = useState(null);
  const [closeDay, setCloseDay] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.getSchedule(id).then((d) => {
      setData(d);
      setHours(d.hours);
    }).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="page"><div className="notice notice-err">{error}</div></div>;
  if (!data || !hours) return <div className="page"><Spinner /></div>;
  const dirty = !same(hours, data.hours);
  const setDay = (d, ranges) => setHours({ ...hours, [d]: ranges });

  async function save(patch, okText) {
    setBusy(true);
    try {
      const pre = await api.saveSchedule(id, patch, { dryRun: true });
      if (pre.affected.length) {
        const ok = await confirm({
          title: `${pre.affected.length} randevu bu saatlerin dışında kalıyor`,
          message: `${listAffected(pre.affected)}\n\nBu randevular iptal EDİLMEZ, yerinde kalır. Gerekirse müşteriyi arayıp başka saate taşıyın. Kaydedilsin mi?`,
          confirmText: 'Kaydet'
        });
        if (!ok) return;
      }
      await api.saveSchedule(id, patch);
      toast(okText);
      await load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }
  const closedSet = new Set(data.closedDates);
  const toggleClosed = (d) => save({ closedDates: closedSet.has(d) ? data.closedDates.filter((x) => x !== d) : [...data.closedDates, d] }, closedSet.has(d) ? `${dayLabel(d)} yeniden açıldı.` : `${dayLabel(d)} kapatıldı; o gün randevu alınamaz.`);

  return (
    <div className="page sc">
      <Link to={`/panel/formlar/${id}`} className="back">← {data.form.isletme || data.form.name}</Link>
      <header>
        <h1>Müsaitlik</h1>
        <p className="muted">Hangi gün ve saatlerde randevu alınacağını buradan siz yönetirsiniz. Değişiklik hemen geçerli olur.</p>
      </header>

      {/* 1) En sık iş: belirli bir saati kapat */}
      <section className="sc-card">
        <div className="sc-title">
          <div><b>Belirli saatleri kapat</b><span>"Yarın 14:00–15:00 müsait değilim" gibi</span></div>
          <button type="button" className="btn btn-primary" onClick={() => setBlockOpen(true)}>+ Saat kapat</button>
        </div>
        {data.blocks.length > 0 ? (
          <div className="td-list">
            {data.blocks.map((b) => (
              <div key={b.id} className="td-row sc-row">
                <span className="td-who"><b>{dayLabel(b.date)} · {b.start}–{b.end}</b><span>{b.note || 'Kapalı'}{b.resourceId ? ` · ${data.resources.find((r) => r.id === b.resourceId)?.name || ''}` : ''}</span></span>
                <button type="button" className="btn btn-sm" onClick={async () => { await api.removeBlock(b.id); toast('Saat yeniden açıldı.'); load(); }}>Aç</button>
              </div>
            ))}
          </div>
        ) : <div className="muted small">Kapatılmış saat yok.</div>}
      </section>

      {/* 2) Tatil / izin günleri */}
      <section className="sc-card">
        <div className="sc-title"><div><b>Kapalı günler</b><span>Tatil, izin, bayram — o gün hiç randevu alınmaz</span></div></div>
        <div className="sc-quick">
          {[0, 1, 2].map((n) => {
            const d = addDays(today(), n);
            const on = closedSet.has(d);
            return (
              <button key={d} type="button" disabled={busy} className={`sc-day ${on ? 'is-closed' : ''}`} onClick={() => toggleClosed(d)}>
                <b>{n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : weekdayName(d)}</b>
                <span>{on ? 'Kapalı · aç' : 'Kapat'}</span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <input type="date" min={today()} aria-label="Kapatılacak gün" value={closeDay} onChange={(e) => setCloseDay(e.target.value)} />
          <button type="button" className="btn" disabled={!closeDay || busy || closedSet.has(closeDay)} onClick={() => { toggleClosed(closeDay); setCloseDay(''); }}>Bu günü kapat</button>
        </div>
        {data.closedDates.length > 0 && (
          <div className="chips">
            {data.closedDates.map((d) => (
              <span key={d} className="chip">{weekdayName(d)}, {formatDateShort(d)} <button type="button" aria-label={`${d} aç`} onClick={() => toggleClosed(d)}>✕</button></span>
            ))}
          </div>
        )}
      </section>

      {/* 3) Haftalık düzen */}
      <section className="sc-card">
        <div className="sc-title"><div><b>Haftalık çalışma saatleri</b><span>Her hafta tekrarlanır</span></div></div>
        <div className="sc-week">
          {WEEK.map(([d, name]) => {
            const ranges = hours[d] || [];
            return (
              <div key={d} className={`sc-wd ${ranges.length ? '' : 'is-off'}`}>
                <div className="sc-wd-head">
                  <Toggle id={`sc-${d}`} checked={ranges.length > 0} onChange={(v) => setDay(d, v ? [{ start: '09:00', end: '18:00' }] : [])} label={name} />
                  {!ranges.length && <span className="muted small">Kapalı</span>}
                </div>
                {ranges.map((r, i) => (
                  <div key={i} className="sc-range">
                    <input type="time" aria-label={`${name} başlangıç`} value={r.start} onChange={(e) => setDay(d, ranges.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
                    <span>–</span>
                    <input type="time" aria-label={`${name} bitiş`} value={r.end} onChange={(e) => setDay(d, ranges.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
                    {ranges.length > 1 && <button type="button" className="icon-btn" aria-label="Aralığı sil" onClick={() => setDay(d, ranges.filter((_, k) => k !== i))}>✕</button>}
                  </div>
                ))}
                {ranges.length === 1 && <button type="button" className="nf-link" onClick={() => setDay(d, [{ start: ranges[0].start, end: '12:00' }, { start: '13:00', end: ranges[0].end }])}>+ öğle arası ekle</button>}
              </div>
            );
          })}
        </div>
      </section>

      {dirty && (
        <div className="sc-save">
          <span>Kaydedilmemiş değişiklik var</span>
          <div className="row">
            <button type="button" className="btn" onClick={() => setHours(data.hours)}>Vazgeç</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save({ hours }, 'Çalışma saatleri kaydedildi.')}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </div>
      )}

      <p className="muted small">Hizmetler, süreler, form alanları gibi diğer değişiklikler için Batilmer'e yazmanız yeterli.</p>

      {blockOpen && <BlockSheet formId={id} resources={data.resources} resourceLabel={data.resourceLabel} onClose={() => setBlockOpen(false)} onDone={() => { setBlockOpen(false); load(); }} />}
    </div>
  );
}

function BlockSheet({ formId, resources, resourceLabel, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ date: addDays(today(), 1), start: '14:00', end: '15:00', note: '', resourceId: '' });
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      await api.addBlock(formId, v);
      toast(`${dayLabel(v.date)} ${v.start}–${v.end} kapatıldı.`);
      onDone();
    } catch (x) {
      setErr(x.message);
    }
  }
  return (
    <Modal title="Saat kapat" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="sc-quick">
          {[0, 1, 2].map((n) => {
            const d = addDays(today(), n);
            return <button key={d} type="button" className={`sc-day ${v.date === d ? 'is-on' : ''}`} onClick={() => setV({ ...v, date: d })}><b>{n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : weekdayName(d)}</b><span>{formatDateShort(d)}</span></button>;
          })}
        </div>
        <label className="inline-field"><span>Başka gün</span><input type="date" min={today()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
        <div className="sc-range sc-range-big">
          <input type="time" aria-label="Başlangıç" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
          <span>–</span>
          <input type="time" aria-label="Bitiş" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} />
        </div>
        {resources.length > 0 && (
          <select aria-label={resourceLabel} value={v.resourceId} onChange={(e) => setV({ ...v, resourceId: e.target.value })}>
            <option value="">Herkes için kapat</option>
            {resources.map((r) => <option key={r.id} value={r.id}>Sadece {r.name}</option>)}
          </select>
        )}
        <input placeholder="Not (isteğe bağlı): toplantı, izin…" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        {err && <div className="notice notice-err">{err}</div>}
        <button className="as-big as-ok">Bu saati kapat</button>
        <div className="muted small">O saatte zaten randevu varsa iptal edilmez; sadece yeni randevu alınamaz.</div>
      </form>
    </Modal>
  );
}
