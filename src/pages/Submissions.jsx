import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { Link } from '../router.jsx';
import { Badge, Empty, Modal, Spinner, useConfirm, useIsMobile, useToast } from '../components/ui.jsx';
import { buildXlsx } from '../lib/xlsx.js';
import { dateOfMs, download, formatBytes, formatDateTime, maskTc, today } from '../lib/util.js';

const APPT_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };
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
              <dd className="pre"><ValueCell type={s.types[k]} value={s.values[k]} randevu={data.randevu} showTc={showTc} /></dd>
            </div>
          ))}
          <div><dt>Kayıt zamanı</dt><dd>{formatDateTime(s.createdAt)}</dd></div>
          {s.kvkkAt && <div><dt>KVKK onayı</dt><dd>{formatDateTime(s.kvkkAt)} · {s.ip}</dd></div>}
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
  const todayStr = today();
  const filtered = q || from || to || status;
  const todayCount = data.rows.filter((r) => dateOfMs(r.createdAt) === todayStr).length;
  const hasTc = data.fields.some((f) => f.type === 'tc');
  // Filtre yüzünden listeden düşse bile açık detay penceresi kapanmasın
  const detail = detailId ? data.rows.find((r) => r.id === detailId) || detailSnap : null;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <Link to="/panel" className="back">← Formlar</Link>
          <div className="eyebrow">{[form.isletme, form.name].filter(Boolean).join(' · ')}</div>
          <h1>Kayıtlar</h1>
        </div>
        <div className="row">
          <Link to={`/panel/formlar/${id}/istatistik`} className="btn">İstatistik</Link>
          {form.perms.randevu && data.fields.some((f) => f.type === 'randevu') && <Link to={`/panel/formlar/${id}/randevular`} className="btn">Randevu takvimi</Link>}
          {perms.excel && <button type="button" className="btn btn-primary" onClick={exportExcel} disabled={!data.rows.length}>Excel indir ({data.rows.length})</button>}
        </div>
      </div>

      <div className="stat-row">
        <div className="stat"><b>{data.rows.length}</b><span>{filtered ? 'Filtreye uyan' : 'Toplam kayıt'}</span></div>
        <div className="stat"><b>{todayCount}</b><span>Bugün</span></div>
        <button type="button" className={`stat stat-btn ${status === 'yeni' ? 'is-on' : ''}`} onClick={() => setStatus(status === 'yeni' ? '' : 'yeni')}>
          <b>{data.counts.yeni || 0}</b><span>Yeni (bakılmamış)</span>
        </button>
      </div>

      <div className="filters card">
        <div className="filter-search">
          <input type="search" placeholder="Kayıtlarda ve notlarda ara…" aria-label="Kayıtlarda ara" value={q} onChange={(e) => setQ(e.target.value)} />
          {mobile && (
            <button type="button" className={`btn ${filtersOpen || status || from || to ? 'btn-primary' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
              Filtreler{status || from || to ? ' •' : ''}
            </button>
          )}
        </div>
        {(!mobile || filtersOpen) && (<>
        <select aria-label="Durum filtresi" value={status} onChange={(e) => setStatus(e.target.value)} className="auto-w">
          <option value="">Tüm durumlar</option>
          {api.SUBMISSION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label} ({data.counts[s.value] || 0})</option>)}
        </select>
        <label className="inline-field"><span>Başlangıç</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline-field"><span>Bitiş</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {filtered && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setFrom(''); setTo(''); setStatus(''); }}>Filtreyi temizle</button>}
        {hasTc && <label className="inline-check"><input type="checkbox" checked={showTc} onChange={(e) => setShowTc(e.target.checked)} /> TC'yi açık göster</label>}
        </>)}
      </div>

      {!data.rows.length ? (
        <Empty title={filtered ? 'Filtreye uyan kayıt yok' : 'Henüz kayıt yok'}>Form doldurulduğunda kayıtlar burada görünecek.</Empty>
      ) : mobile ? (
        // Telefonda tablo yerine kartlar
        <ul className="sub-cards">
          {data.rows.map((s) => {
            const titleCol = columns.find((c) => c.type === 'text') || columns[0];
            const rest = columns.filter((c) => c !== titleCol);
            const lastNote = (s.notes || []).filter((n) => !n.system).slice(-1)[0];
            const telCol = data.fields.find((f) => f.type === 'tel' && s.values[f.key]);
            return (
              <li key={s.id} className="sub-li">
                <button type="button" className={`sub-card-m tone-${statusTone(s.status)}`} onClick={() => setDetailId(s.id)}>
                  <div className="scm-top">
                    <b className="scm-title">{titleCol ? <ValueCell type={titleCol.type} value={s.values[titleCol.key]} randevu={data.randevu} showTc={showTc} /> : 'Kayıt'}</b>
                    <Badge tone={statusTone(s.status)}>{api.submissionStatusLabel(s.status)}</Badge>
                  </div>
                  {rest.map((c) => s.values[c.key] !== undefined && (
                    <div key={c.key} className="scm-row">
                      <span>{c.label}</span>
                      <span>
                        <ValueCell type={c.type} value={s.values[c.key]} randevu={data.randevu} showTc={showTc} />
                        {c.type === 'randevu' && s.appointmentStatus && <> <Badge tone={APPT_TONE[s.appointmentStatus]}>{api.STATUS_LABELS[s.appointmentStatus]}</Badge></>}
                      </span>
                    </div>
                  ))}
                  {lastNote && <div className="scm-note">“{lastNote.text}”</div>}
                  <div className="scm-foot">{formatDateTime(s.createdAt)}{s.manual ? ' · Manuel' : ''}<span aria-hidden="true">›</span></div>
                </button>
                {telCol && (
                  <a className="scm-call" href={`tel:${String(s.values[telCol.key]).replace(/[^\d+]/g, '')}`} aria-label={`Ara: ${s.values[telCol.key]}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></svg>
                    Ara
                  </a>
                )}
              </li>
            );
          })}
        </ul>
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
                    <td className="nowrap">{formatDateTime(s.createdAt)} {s.manual && <Badge tone="gray">Manuel</Badge>}</td>
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
