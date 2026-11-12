import { useState } from 'react';
import * as api from '../lib/api.js';
import { Badge, Empty, Spinner, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import { formatDateTime } from '../lib/util.js';
import { navigate } from '../router.jsx';

export function Trash() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useAsync(() => api.listTrash(), []);

  async function restore(kind, id) {
    try {
      await api.restoreItem(kind, id);
      toast('Geri alındı.');
      reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  async function purge(kind, id, label) {
    const ok = await confirm({ title: 'Kalıcı olarak sil', message: `"${label}" kalıcı olarak silinecek. Bu işlem geri alınamaz.${kind === 'form' ? '\nFormun tüm kayıtları ve randevuları da silinir.' : ''}`, confirmText: 'Kalıcı olarak sil', danger: true });
    if (!ok) return;
    await api.purgeItem(kind, id);
    toast('Kalıcı olarak silindi.');
    reload();
  }

  if (!data) return <div className="page"><Spinner /></div>;
  const empty = !data.forms.length && !data.submissions.length && !data.users.length;

  return (
    <div className="page">
      <div className="page-head"><div><h1>Çöp kutusu</h1><p className="muted">Silinen formlar, kayıtlar ve kullanıcılar burada bekler; geri alınabilir.</p></div></div>
      {empty && <Empty title="Çöp kutusu boş" />}
      {data.forms.length > 0 && (
        <section className="card stack">
          <h2>Formlar</h2>
          <table className="tbl"><tbody>
            {data.forms.map((f) => (
              <tr key={f.id}><td><b>{f.name}</b><div className="muted small">/f/{f.slug}</div></td><td className="muted small">{formatDateTime(f.deletedAt)}</td>
                <td className="right"><button type="button" className="btn btn-sm" onClick={() => restore('form', f.id)}>Geri al</button> <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => purge('form', f.id, f.name)}>Kalıcı sil</button></td></tr>
            ))}
          </tbody></table>
        </section>
      )}
      {data.submissions.length > 0 && (
        <section className="card stack">
          <h2>Kayıtlar</h2>
          <table className="tbl"><tbody>
            {data.submissions.map((s) => (
              <tr key={s.id}><td><b>{s.preview || 'Kayıt'}</b><div className="muted small">{s.formName} · {formatDateTime(s.createdAt)}</div></td><td className="muted small">{formatDateTime(s.deletedAt)}</td>
                <td className="right"><button type="button" className="btn btn-sm" onClick={() => restore('submission', s.id)}>Geri al</button> <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => purge('submission', s.id, s.preview || 'Kayıt')}>Kalıcı sil</button></td></tr>
            ))}
          </tbody></table>
          <p className="muted small">Not: Kayıt geri alınsa da bağlı randevu iptal olarak kalır; gerekirse randevu takviminden yeniden ekleyin.</p>
        </section>
      )}
      {data.users.length > 0 && (
        <section className="card stack">
          <h2>Kullanıcılar</h2>
          <table className="tbl"><tbody>
            {data.users.map((u) => (
              <tr key={u.id}><td><b>{u.name}</b><div className="muted small">{u.email}</div></td><td className="muted small">{formatDateTime(u.deletedAt)}</td>
                <td className="right"><button type="button" className="btn btn-sm" onClick={() => restore('user', u.id)}>Geri al</button> <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => purge('user', u.id, u.name)}>Kalıcı sil</button></td></tr>
            ))}
          </tbody></table>
        </section>
      )}
    </div>
  );
}

export function Logs() {
  const { data } = useAsync(() => api.listLogs(), []);
  const [q, setQ] = useState('');
  if (!data) return <div className="page"><Spinner /></div>;
  const list = data.filter((l) => `${l.userName} ${l.action} ${l.target}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>İşlem kayıtları</h1><p className="muted">Kim, ne zaman, ne yaptı. KVKK açısından Excel indirme ve silme işlemleri burada tutulur.</p></div>
        <input className="search" type="search" placeholder="Ara…" aria-label="İşlem kayıtlarında ara" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!list.length ? <Empty title="Kayıt yok" /> : (
        <div className="table-wrap card">
          <table className="tbl">
            <thead><tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Hedef</th></tr></thead>
            <tbody>{list.map((l) => <tr key={l.id}><td className="nowrap">{formatDateTime(l.at)}</td><td>{l.userName}</td><td>{l.action}</td><td className="muted">{l.target}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const MAIL_STATUS = {
  bekliyor: { label: 'Sırada', tone: 'amber' },
  hata: { label: 'Gönderilemedi', tone: 'red' },
  'ayar-yok': { label: 'Mail servisi ayarlı değil', tone: 'gray' }
};

const KIND_TONE = { bildirim: 'blue', randevu: 'green', hatirlatma: 'amber', sifre: 'red', hesap: 'gray', bilgi: 'gray', sms: 'amber', 'otomatik-cevap': 'blue' };

function linkify(text) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const local = part.startsWith(window.location.origin);
    return (
      <a key={i} href={part} onClick={(e) => { if (local) { e.preventDefault(); navigate(part.replace(window.location.origin, '')); } }} target={local ? undefined : '_blank'} rel="noreferrer">{part}</a>
    );
  });
}

export function Outbox() {
  const toast = useToast();
  const { data, reload } = useAsync(() => api.listOutbox(), []);
  const [open, setOpen] = useState(null);
  if (!data) return <div className="page"><Spinner /></div>;
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Giden mailler ve SMS</h1><p className="muted">Sistemin gönderdiği tüm mail ve SMS'lerin geçmişi. Mail servisi (Brevo) ayarlıysa mailler gerçekten gönderilir; gönderilemeyenler burada işaretlenir. Yerel demo modunda hiçbir şey gönderilmez.</p></div>
        <div className="row">
          <button type="button" className="btn" onClick={reload}>Yenile</button>
          {data.length > 0 && <button type="button" className="btn btn-ghost" onClick={async () => { await api.clearOutbox(); toast('Temizlendi.'); reload(); }}>Temizle</button>}
        </div>
      </div>
      {!data.length ? <Empty title="Henüz mail yok">Bir form doldurulduğunda, randevu alındığında veya şifre sıfırlandığında mailler burada görünür.</Empty> : (
        <div className="mail-list card">
          {data.map((m) => (
            <div key={m.id} className={`mail ${open === m.id ? 'is-open' : ''}`}>
              <button type="button" className="mail-head" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
                <Badge tone={KIND_TONE[m.kind] || 'gray'}>{m.kind}</Badge>
                <span className="mail-subject">{m.subject}</span>
                {m.status && m.status !== 'gonderildi' && <Badge tone={MAIL_STATUS[m.status]?.tone || 'gray'}>{m.status === 'ayar-yok' && m.kind === 'sms' ? 'SMS servisi ayarlı değil' : MAIL_STATUS[m.status]?.label || m.status}</Badge>}
                <span className="mail-to">{m.to}</span>
                <span className="mail-at">{formatDateTime(m.at)}</span>
              </button>
              {open === m.id && (
                <div className="mail-body pre">
                  {m.error && <div className="notice notice-err mail-err">Gönderilemedi: {m.error}</div>}
                  {linkify(m.body)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
