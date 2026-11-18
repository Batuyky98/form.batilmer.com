import { phoneKey } from '../lib/reminder.js';
import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { Link, navigate } from '../router.jsx';
import { Badge, Empty, Modal, Spinner, useConfirm, useIsMobile, useToast } from '../components/ui.jsx';
import ContactButtons from '../components/ContactButtons.jsx';
import { buildXlsx } from '../lib/xlsx.js';
import { download, formatBytes, formatDateTime, maskTc } from '../lib/util.js';

const APPT_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };
// "10 dk", "3 sa", "dün", "4 g", sonra tarih
function ago(ms) {
  const d = (Date.now() - ms) / 60000;
  if (d < 60) return `${Math.max(1, Math.round(d))} dk`;
  if (d < 24 * 60) return `${Math.round(d / 60)} sa`;
  if (d < 48 * 60) return 'dün';
  if (d < 7 * 24 * 60) return `${Math.round(d / 1440)} g`;
  return formatDateTime(ms).split(' ')[0];
}
const statusTone = (v) => api.SUBMISSION_STATUSES.find((s) => s.value === v)?.tone || 'gray';

function ValueCell({ type, value, randevu, showTc }) {
  if (value === undefined || value === null || value === '') return <span className="muted">—</span>;
  const fileHref = type === 'dosya' ? value?.url || value?.dataUrl : null;
  if (fileHref) {
    return (
      <a href={fileHref} download={value.name} target={value.url ? '_blank' : undefined} rel="noreferrer" onClick={(e) => e.stopPropagation()} className="file-link">
        {value.name} <span className="muted small">({formatBytes(value.size || 0)})</span>
      </a>
    );
  }
  if (type === 'tc') return showTc ? value : maskTc(value);
  return api.displayValue(type, value, randevu) || <span className="muted">—</span>;
}

function DetailModal({ sub, data, showTc, perms, onClose, onChanged, onDelete }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [s, setS] = useState(sub);
  useEffect(() => setS(sub), [sub]);

  async function changeStatus(status) {
    try {
      const next = await api.setSubmissionStatus(s.id, status);
      setS({ ...s, ...next });
      onChanged();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  async function addNote(e) {
    e.preventDefault();
    try {
      const next = await api.addSubmissionNote(s.id, note);
      setS({ ...s, ...next });
      setNote('');
      onChanged();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  return (
    <Modal title="Kayıt detayı" onClose={onClose} wide footer={perms.delete ? <button type="button" className="btn btn-danger" onClick={() => onDelete(s)}>Kaydı sil</button> : null}>
      <div className="stack">
        <div className="status-picker" role="radiogroup" aria-label="Kayıt durumu">
          {api.SUBMISSION_STATUSES.map((st) => (
            <button key={st.value} type="button" role="radio" aria-checked={s.status === st.value} className={`status-chip tone-${st.tone} ${s.status === st.value ? 'is-on' : ''}`} onClick={() => changeStatus(st.value)}>
              {st.label}
            </button>
          ))}
        </div>
        <dl className="detail">
          {(s.order || Object.keys(s.values)).filter((k) => s.values[k] !== undefined).map((k) => (
            <div key={k}>
              <dt>{s.labels[k] || k}{!data.fields.some((f) => f.key === k) && <span className="muted small"> (eski alan)</span>}</dt>
              <dd className="pre">
                <ValueCell type={s.types[k]} value={s.values[k]} randevu={data.randevu} showTc={showTc} />
                {s.types[k] === 'tel' && <ContactButtons phone={s.values[k]} className="dd-contact" />}
                {s.types[k] === 'tel' && phoneKey(s.values[k]) && <a className="cu-link" href={`/panel/musteriler/${phoneKey(s.values[k])}`} onClick={(e) => { e.preventDefault(); navigate(`/panel/musteriler/${phoneKey(s.values[k])}`); }}>👤 Müşteri kartı</a>}
              </dd>
            </div>
          ))}
          <div><dt>Kayıt zamanı</dt><dd>{formatDateTime(s.createdAt)}</dd></div>
          {s.kvkkAt && <div><dt>KVKK onayı</dt><dd>{formatDateTime(s.kvkkAt)} · {s.ip}</dd></div>}
          {s.consentAt && <div><dt>Açık rıza</dt><dd>{formatDateTime(s.consentAt)}</dd></div>}
          {s.appointmentStatus && <div><dt>Randevu durumu</dt><dd><Badge tone={APPT_TONE[s.appointmentStatus]}>{api.STATUS_LABELS[s.appointmentStatus]}</Badge></dd></div>}
        </dl>
        <section className="stack-sm">
          <h3>Notlar</h3>
          {!(s.notes || []).length && <div className="muted small">Henüz not yok. "Arandı, salı tekrar aranacak" gibi notlar ekleyebilirsiniz.</div>}
          <ul className="notes">
            {(s.notes || []).map((n) => (
              <li key={n.id} className={n.system ? 'is-system' : ''}>
                <div className="note-meta">{n.by} · {formatDateTime(n.at)}</div>
                <div className="pre">{n.text}</div>
              </li>
            ))}
          </ul>
          <form className="copy-row" onSubmit={addNote}>
            <input aria-label="Not ekle" placeholder="Not ekle…" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-sm btn-primary" disabled={!note.trim()}>Ekle</button>
          </form>
        </section>
      </div>
    </Modal>
  );
}

export default function Submissions({ id }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [detailId, setDetailIdState] = useState(null);
  const [detailSnap, setDetailSnap] = useState(null);
  const setDetailId = (idOrNull) => {
    setDetailIdState(idOrNull);
    setDetailSnap(idOrNull ? data?.rows.find((r) => r.id === idOrNull) || null : null);
  };
  const [showTc, setShowTc] = useState(false);

  async function load() {
    try {
      const [f, d] = await Promise.all([api.getForm(id), api.listSubmissions(id, { q, from, to, status })]);
      setForm(f);
      setData(d);
      // Müşteri kartından "Kaydı aç" ile gelindiyse o kaydı aç
      const want = new URLSearchParams(window.location.search).get('kayit');
      if (want && d.rows.some((r) => r.id === want)) {
        setDetailIdState(want);
        setDetailSnap(d.rows.find((r) => r.id === want));
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    const tm = setTimeout(load, 200);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, q, from, to, status]);

  useEffect(() => {
    const on = () => load();
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, q, from, to, status]);

  const mobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const columns = useMemo(() => (data?.fields || []).filter((f) => !['textarea', 'dosya'].includes(f.type)).slice(0, 4), [data]);

  async function exportExcel() {
    try {
      const { headers, data: rows, filename } = await api.exportSubmissions(id, data.rows);
      const blob = await buildXlsx(headers, rows, form.name);
      download(filename, blob);
      toast(`${rows.length} kayıt indirildi.`);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function remove(s) {
    const ok = await confirm({ title: 'Kaydı sil', message: `Kayıt çöp kutusuna taşınacak${s.appointmentId ? ' ve bağlı randevu iptal edilecek' : ''}. Ana Admin çöp kutusundan geri alabilir.`, confirmText: 'Sil', danger: true });
    if (!ok) return;
    try {
      await api.deleteSubmission(s.id);
      toast('Kayıt silindi.');
      setDetailId(null);
      load();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  if (error) return <div className="page"><div className="notice notice-err">{error}</div></div>;
  if (!form || !data) return <div className="page"><Spinner /></div>;

  const perms = data.perms;
  const filtered = q || from || to || status;
  const hasTc = data.fields.some((f) => f.type === 'tc');
  const totalAll = Object.values(data.counts).reduce((x, y) => x + y, 0);
  // Filtre yüzünden listeden düşse bile açık detay penceresi kapanmasın
  const detail = detailId ? data.rows.find((r) => r.id === detailId) || detailSnap : null;

  return (
    <div className="page page-wide">
      <div className="page-head sb-head">
        <div>
          <Link to={`/panel/formlar/${id}`} className="back">← {form.isletme || form.name}</Link>
          <h1>Kayıtlar</h1>
        </div>
        {perms.excel && !mobile && <button type="button" className="btn" onClick={exportExcel} disabled={!data.rows.length}>⬇ Excel ({data.rows.length})</button>}
      </div>

      <input className="fl-search" type="search" placeholder="🔍  İsim, telefon veya not ara" aria-label="Kayıtlarda ara" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="sb-chips" role="tablist" aria-label="Durum">
        <button type="button" role="tab" aria-selected={!status} className={`nf-chip ${!status ? 'is-on' : ''}`} onClick={() => setStatus('')}>Tümü {totalAll}</button>
        {api.SUBMISSION_STATUSES.filter((x) => data.counts[x.value] || status === x.value).map((x) => (
          <button type="button" role="tab" key={x.value} aria-selected={status === x.value} className={`nf-chip ${status === x.value ? 'is-on' : ''}`} onClick={() => setStatus(status === x.value ? '' : x.value)}>{x.label} {data.counts[x.value] || 0}</button>
        ))}
        <button type="button" className={`nf-chip ${filtersOpen || from || to ? 'is-on' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>📅 Tarih{from || to ? ' •' : ''}</button>
      </div>
      {(filtersOpen || from || to) && (
        <div className="sb-dates">
          <label className="inline-field"><span>Başlangıç</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline-field"><span>Bitiş</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          {filtered && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setFrom(''); setTo(''); setStatus(''); }}>Temizle</button>}
          {hasTc && <label className="inline-check"><input type="checkbox" checked={showTc} onChange={(e) => setShowTc(e.target.checked)} /> TC'yi açık göster</label>}
          {perms.excel && mobile && <button type="button" className="btn btn-sm" onClick={exportExcel} disabled={!data.rows.length}>⬇ Excel ({data.rows.length})</button>}
        </div>
      )}

      {!data.rows.length ? (
        <Empty title={filtered ? 'Filtreye uyan kayıt yok' : 'Henüz kayıt yok'}>Form doldurulduğunda kayıtlar burada görünecek.</Empty>
      ) : mobile ? (
        // Telefonda sade liste: isim, kısa bilgi, durum; dokununca detay
        <div className="td-list">
          {data.rows.map((s) => {
            const titleCol = columns.find((c) => c.type === 'text') || columns[0];
            const lastNote = (s.notes || []).filter((n) => !n.system).slice(-1)[0];
            const info = columns
              .filter((c) => c !== titleCol && !['tel', 'email', 'tc'].includes(c.type) && s.values[c.key] !== undefined && s.values[c.key] !== '')
              .slice(0, 2)
              .map((c) => api.displayValue(c.type, s.values[c.key], data.randevu))
              .join(' · ');
            return (
              <button type="button" key={s.id} className="td-row sb-row" onClick={() => setDetailId(s.id)}>
                <span className="td-who">
                  <b>{titleCol ? api.displayValue(titleCol.type, s.values[titleCol.key], data.randevu, { mask: !showTc }) || 'Kayıt' : 'Kayıt'}</b>
                  <span>{lastNote ? `“${lastNote.text}”` : info || (s.manual ? 'Panelden eklendi' : '')}</span>
                </span>
                <span className="sb-right">
                  <Badge tone={statusTone(s.status)}>{api.submissionStatusLabel(s.status)}</Badge>
                  <small>{ago(s.createdAt)}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="tbl tbl-hover">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Durum</th>
                {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                <th aria-label="İşlem" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((s) => {
                const lastNote = (s.notes || []).filter((n) => !n.system).slice(-1)[0];
                return (
                  <tr key={s.id} onClick={() => setDetailId(s.id)} className="clickable">
                    <td className="nowrap">{formatDateTime(s.createdAt)} {s.manual && <Badge tone="gray">Panelden</Badge>}</td>
                    <td>
                      <Badge tone={statusTone(s.status)}>{api.submissionStatusLabel(s.status)}</Badge>
                      {lastNote && <div className="muted small note-preview" title={lastNote.text}>{lastNote.text}</div>}
                    </td>
                    {columns.map((c) => (
                      <td key={c.key}>
                        <ValueCell type={c.type} value={s.values[c.key]} randevu={data.randevu} showTc={showTc} />
                        {c.type === 'randevu' && s.appointmentStatus && <> <Badge tone={APPT_TONE[s.appointmentStatus]}>{api.STATUS_LABELS[s.appointmentStatus]}</Badge></>}
                      </td>
                    ))}
                    <td><button type="button" className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setDetailId(s.id); }}>Detay</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && <DetailModal sub={detail} data={data} showTc={showTc} perms={perms} onClose={() => setDetailId(null)} onChanged={load} onDelete={remove} />}
    </div>
  );
}
