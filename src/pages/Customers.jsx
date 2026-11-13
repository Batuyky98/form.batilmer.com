import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Link } from '../router.jsx';
import { Badge, Empty, Spinner, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import ContactButtons from '../components/ContactButtons.jsx';
import { formatDateTime, formatDateShort, weekdayShort } from '../lib/util.js';

const STATUS_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr') || '?';
const dateOnly = (ms) => (ms ? formatDateTime(ms).split(' ')[0] : '');

// Müşteri listesi: aynı telefon numarasıyla gelen bütün kayıtlar tek kişi sayılır
export default function Customers() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error } = useAsync(() => api.listCustomers({ q: term }), [term]);

  return (
    <div className="page stack">
      <div className="page-head">
        <div>
          <h1>Müşteriler</h1>
          <p className="muted small">Aynı telefonla gelen bütün kayıt ve randevular tek müşteri kartında toplanır.</p>
        </div>
      </div>
      <input className="search cu-search" type="search" placeholder="İsim veya telefon ara…" aria-label="Müşteri ara" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data && <Spinner />}
      {error && <div className="notice notice-err">{error.message}</div>}
      {data && !data.items.length && (
        <Empty title={term ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok'}>{term ? 'Farklı bir isim ya da numara deneyin.' : 'Telefon numarası olan ilk kayıt gelince burada görünür.'}</Empty>
      )}
      {data && data.items.length > 0 && (
        <>
          <div className="muted small">{data.total} müşteri{data.total > data.items.length ? ` (ilk ${data.items.length} gösteriliyor)` : ''}</div>
          <div className="cu-list">
            {data.items.map((c) => (
              <Link key={c.key} to={`/panel/musteriler/${c.key}`} className="cu-row">
                <span className="cu-av" aria-hidden="true">{initials(c.name)}</span>
                <span className="cu-main">
                  <b>{c.name || 'İsimsiz'}</b>
                  <span className="muted">{c.phone}{c.forms.length ? ` · ${c.forms.join(', ')}` : ''}</span>
                </span>
                <span className="cu-stats">
                  {c.next && <Badge tone="green">Randevu: {formatDateShort(c.next.slice(0, 10))} {c.next.slice(11)}</Badge>}
                  {c.visits > 0 && <Badge tone="blue">{c.visits} ziyaret</Badge>}
                  {c.noShow > 0 && <Badge tone="red">{c.noShow} gelmedi</Badge>}
                  <span className="muted small">{c.records} kayıt</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CustomerCard({ tel }) {
  return <CustomerCardInner phoneKey={tel} />;
}

function CustomerCardInner({ phoneKey }) {
  const { data, loading, error, reload } = useAsync(() => api.getCustomer(phoneKey), [phoneKey]);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [formId, setFormId] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  useEffect(() => {
    setNotes(data?.notes || []);
    setFormId(data?.noteForms?.[0]?.id || '');
  }, [data]);

  if (loading && !data) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page stack"><Link to="/panel/musteriler" className="back">← Müşteriler</Link><div className="notice notice-err">{error.message}</div></div>;
  const c = data;

  async function addNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const n = await api.addCustomerNote(c.key, formId, text);
      setNotes((x) => [n, ...x]);
      setText('');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }
  async function delNote(n) {
    if (!(await confirm({ title: 'Not silinsin mi?', message: n.text.slice(0, 120), confirmText: 'Sil', danger: true }))) return;
    try {
      await api.deleteCustomerNote(n.id);
      setNotes((x) => x.filter((y) => y.id !== n.id));
    } catch (err) {
      toast(err.message, 'err');
      reload();
    }
  }

  const s = c.stats;
  return (
    <div className="page stack cu-page">
      <Link to="/panel/musteriler" className="back">← Müşteriler</Link>
      <div className="card cu-head">
        <span className="cu-av cu-av-lg" aria-hidden="true">{initials(c.name)}</span>
        <div className="cu-head-main">
          <h1>{c.name || 'İsimsiz müşteri'}</h1>
          <div className="muted">{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
          <div className="muted small">İlk kayıt {dateOnly(c.firstAt)} · son {dateOnly(c.lastAt)}</div>
        </div>
        <ContactButtons phone={c.phoneRaw} className="cu-contact" />
      </div>

      <div className="cu-kpis">
        <div className="cu-kpi"><b>{s.records}</b><span>Kayıt</span></div>
        <div className="cu-kpi"><b>{s.geldi}</b><span>Geldi</span></div>
        <div className={`cu-kpi ${s.gelmedi ? 'is-bad' : ''}`}><b>{s.gelmedi}</b><span>Gelmedi</span></div>
        <div className="cu-kpi"><b>{s.iptal}</b><span>İptal</span></div>
      </div>
      {s.gelmedi >= 2 && <div className="notice notice-warn">Bu müşteri {s.gelmedi} randevusuna gelmedi. Randevudan önce mutlaka hatırlatın veya arayın.</div>}

      <div className="cu-grid">
        <div className="stack">
          {c.upcoming.length > 0 && (
            <section className="card stack-sm">
              <h2 className="cu-h">Yaklaşan randevular</h2>
              {c.upcoming.map((a) => (
                <Link key={a.id} to={`/panel/formlar/${a.formId}/randevular?tarih=${a.date}`} className="cu-up">
                  <span className="cu-up-date"><b>{formatDateShort(a.date)}</b><small>{weekdayShort(a.date)} {a.start}</small></span>
                  <span>{[a.service, a.resource].filter(Boolean).join(' · ')}<br /><span className="muted small">{a.isletme}</span></span>
                  <Badge tone={STATUS_TONE[a.status]}>{api.STATUS_LABELS[a.status]}</Badge>
                </Link>
              ))}
            </section>
          )}
          <section className="card stack-sm">
            <h2 className="cu-h">Geçmiş</h2>
            <ol className="cu-timeline">
              {c.items.map((i) => (
                <li key={i.id}>
                  <div className="cu-tl-head">
                    <b>{i.appt ? `${formatDateShort(i.appt.date)} ${i.appt.start}` : dateOnly(i.createdAt)}</b>
                    {i.appt ? <Badge tone={STATUS_TONE[i.appt.status]}>{api.STATUS_LABELS[i.appt.status]}</Badge> : <Badge>{api.submissionStatusLabel ? api.submissionStatusLabel(i.status) : i.status}</Badge>}
                    {i.manual && <span className="muted small">panelden eklendi</span>}
                  </div>
                  <div className="muted small">{[i.appt?.service, i.appt?.resource, i.isletme === i.formName ? i.formName : `${i.isletme} · ${i.formName}`].filter(Boolean).join(' · ')}</div>
                  {i.details.length > 0 && (
                    <dl className="cu-details">
                      {i.details.map((d) => (
                        <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>
                      ))}
                    </dl>
                  )}
                  <Link className="small" to={`/panel/formlar/${i.formId}/kayitlar?kayit=${i.id}`}>Kaydı aç{i.notesCount ? ` (${i.notesCount} not)` : ''} →</Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <section className="card stack-sm cu-notes">
          <h2 className="cu-h">Notlar</h2>
          <form onSubmit={addNote} className="stack-sm">
            <textarea rows="3" placeholder='Örn. "Kuduz aşısı Mart 2027" veya "Sadece öğleden sonra gelebiliyor"' value={text} onChange={(e) => setText(e.target.value)} aria-label="Not" />
            <div className="row-between">
              {c.noteForms.length > 1 ? (
                <select aria-label="Hangi işletme için" className="auto-w" value={formId} onChange={(e) => setFormId(e.target.value)}>
                  {c.noteForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              ) : <span />}
              <button className="btn btn-primary" disabled={busy || !text.trim()}>Not ekle</button>
            </div>
          </form>
          {!notes.length && <div className="muted small">Henüz not yok. Notları bu formu görebilen herkes görür.</div>}
          <ul className="cu-note-list">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="cu-note-text">{n.text}</div>
                <div className="muted small">
                  {n.by} · {formatDateTime(n.at)}
                  {n.mine && <button type="button" className="nf-link" onClick={() => delNote(n)}>Sil</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
