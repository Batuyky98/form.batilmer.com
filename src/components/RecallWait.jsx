import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Link } from '../router.jsx';
import { Badge, Empty, Spinner, useToast } from './ui.jsx';
import { WaIcon } from './ContactButtons.jsx';
import { dayLabel } from './ApptSheet.jsx';
import { diffDays, formatDateTime, today } from '../lib/util.js';
import { longDate } from '../lib/reminder.js';

const PREF = { hepsi: 'Fark etmez', sabah: 'Sabah', ogle: 'Öğle', aksam: 'Akşam' };
const since = (days) => (days >= 365 ? `${Math.round(days / 365)} yıl` : days >= 60 ? `${Math.round(days / 30)} ay` : days >= 14 ? `${Math.round(days / 7)} hafta` : `${days} gün`);
const Name = ({ i }) => (i.customerKey ? <Link to={`/panel/musteriler/${i.customerKey}`}>{i.name || 'İsimsiz'}</Link> : i.name || 'İsimsiz');

function dueChip(due) {
  const d = diffDays(today(), due);
  if (d === 0) return <span className="rw-chip is-blue">Bugün</span>;
  if (d < 0) return <span className="rw-chip is-red">{-d} gün geçti</span>;
  return <span className="rw-chip">{d} gün sonra</span>;
}

// ---------------------------------------------------------------- Tekrar çağır
export function RecallTab({ data, loading, error, reload }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [done, setDone] = useState([]);
  useEffect(() => {
    setItems(data?.items || []);
    setDone(data?.done || []);
  }, [data]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="notice notice-err">{error.message}</div>;
  if (!data?.forms.length) return <Empty title="Tekrar çağırma kapalı">Formun Randevu sekmesinden "Tekrar çağırma"yı açıp hizmetlere süre verin.</Empty>;

  async function act(i, action) {
    const prevItems = items;
    const prevDone = done;
    if (action === 'sent') {
      setItems((l) => l.filter((x) => x.id !== i.id));
      setDone((l) => [{ ...i, status: 'cagrildi', sentAt: Date.now(), sentBy: 'Siz' }, ...l]);
    } else if (action === 'undo') {
      setDone((l) => l.filter((x) => x.id !== i.id));
      setItems((l) => [{ ...i, status: 'bekliyor', sentAt: null }, ...l]);
    } else setItems((l) => l.filter((x) => x.id !== i.id));
    try {
      await api.markRecall(i.id, action);
      if (action === 'snooze') toast(`${i.name || 'Müşteri'} 1 hafta sonra tekrar listede.`, 'ok');
      if (action === 'dismiss') toast(`${i.name || 'Müşteri'} bu hizmet için bir daha listeye düşmeyecek.`, 'ok');
    } catch (e) {
      setItems(prevItems);
      setDone(prevDone);
      toast(e.message, 'err');
      reload();
    }
  }
  const multi = data.forms.length > 1;
  return (
    <>
      <div className="card rc-hero">
        <div className="rc-hero-ic" aria-hidden="true">🔁</div>
        <div>
          <h2>{items.length ? `${items.length} müşteriyi çağırma zamanı` : 'Şu an çağrılacak kimse yok'}</h2>
          <p className="muted small">
            {data.stats.sent ? <>Bu ay tekrar çağrılan {data.stats.sent} kişiden <b>{data.stats.booked}'{data.stats.booked === 1 ? 'i' : 'si'} randevu aldı</b>{data.stats.booked ? ' 🎉' : ''}</> : 'Zamanı gelen müşteriler 7 gün önceden burada görünür.'}
          </p>
        </div>
      </div>
      {items.length === 0 && done.length === 0 && (
        <div className="td-empty"><span aria-hidden="true">✨</span><b>Liste boş</b><span>Randevusu "Geldi" olarak işaretlenen müşteriler, hizmet süresi dolunca buraya düşer.</span></div>
      )}
      <div className="rm-list">
        {items.map((i) => (
          <div key={i.id} className="rm-item">
            <div className="rm-time rc-due">{dueChip(i.dueDate)}</div>
            <div className="rm-body">
              <div className="rm-name"><Name i={i} /></div>
              <div className="rm-meta">{[i.service, multi ? i.isletme : ''].filter(Boolean).join(' · ')}</div>
              <div className="rc-why">Son geliş: {longDate(i.lastDate)} · {since(diffDays(i.lastDate, today()))} oldu</div>
            </div>
            <div className="rm-act rc-acts">
              {i.waUrl ? (
                <a className="rm-wa" href={i.waUrl} target="_blank" rel="noopener noreferrer" onClick={() => act(i, 'sent')}><WaIcon /> Çağır</a>
              ) : <div className="rm-bad">⚠ Telefon numarası yok</div>}
              <div className="rc-row">
                <button type="button" className="rc-small" onClick={() => act(i, 'snooze')}>1 hafta ertele</button>
                <button type="button" className="rc-small" onClick={() => act(i, 'dismiss')}>Gerek yok</button>
              </div>
            </div>
          </div>
        ))}
        {done.map((i) => (
          <div key={i.id} className="rm-item is-done">
            <div className="rm-time rc-due"><span className={`rw-chip ${i.status === 'geldi' ? 'is-green' : ''}`}>{i.status === 'geldi' ? 'Geldi ✓' : 'Çağrıldı'}</span></div>
            <div className="rm-body">
              <div className="rm-name"><Name i={i} /> {i.status === 'geldi' && <Badge tone="green">Randevu aldı ✓</Badge>}</div>
              <div className="rm-meta">{[i.service, multi ? i.isletme : ''].filter(Boolean).join(' · ')}</div>
              <div className="rc-why">{i.sentAt ? `${formatDateTime(i.sentAt)} · ${i.sentBy}` : ''}</div>
            </div>
            <div className="rm-act">
              {i.status === 'cagrildi' && (
                <div className="rm-again-row">
                  {i.waUrl && <a className="rm-again" href={i.waUrl} target="_blank" rel="noopener noreferrer">Tekrar aç</a>}
                  <button type="button" className="rm-again" onClick={() => act(i, 'undo')}>Geri al</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="rm-tip muted small">
        <span aria-hidden="true">💡</span>
        <span>"Gerek yok" denilen müşteri o hizmet için bir daha listeye düşmez. Müşteri kendisi yeni randevu alırsa listeden otomatik çıkar. Süreleri ve mesajı formun Randevu sekmesinden değiştirebilirsiniz.</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Bekleme listesi
export function WaitTab({ data, loading, error, reload }) {
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  useEffect(() => setGroups(data?.groups || []), [data]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="notice notice-err">{error.message}</div>;
  if (!data?.forms.length) return <Empty title="Bekleme listesi kapalı">Formun Randevu sekmesinden "Bekleme listesi"ni açın.</Empty>;

  const patch = (id, fn) => setGroups((gs) => gs.map((g) => ({ ...g, entries: fn(g.entries.filter(Boolean), id) })));
  async function act(e, action) {
    const prev = groups;
    if (action === 'remove') patch(e.id, (l, id) => l.filter((x) => x.id !== id));
    else patch(e.id, (l, id) => l.map((x) => (x.id === id ? { ...x, notifiedAt: action === 'notified' ? Date.now() : null, notifiedBy: 'Siz' } : x)));
    try {
      await api.markWaitlist(e.id, action);
    } catch (err) {
      setGroups(prev);
      toast(err.message, 'err');
      reload();
    }
  }
  const shown = groups.filter((g) => g.entries.length);
  const multi = data.forms.length > 1;
  return (
    <>
      {!shown.length && (
        <div className="td-empty"><span aria-hidden="true">🔔</span><b>Bekleyen kimse yok</b><span>Dolu bir güne randevu almak isteyen müşteriler "Yer açılırsa haber ver" dediğinde burada görünür.</span></div>
      )}
      {shown.map((g) => (
        <section key={`${g.formId}${g.date}${g.serviceId}`} className="stack wl-group">
          <div className={`card wl-head ${g.open ? 'is-open' : ''}`}>
            <span className="wl-ic" aria-hidden="true">{g.open ? '🔔' : '⏳'}</span>
            <div>
              <b>{g.open ? `${dayLabel(g.date)} ${g.slots.length === 1 ? `${g.slots[0]} boşaldı` : `${g.slots.length} saat boş`}` : `${dayLabel(g.date)} · dolu`}</b>
              <div className="muted small">
                {[g.service, multi ? g.isletme : '', `${g.entries.length} kişi bekliyor`].filter(Boolean).join(' · ')}
                {g.open && g.slots.length > 1 && <> · Boş: {g.slots.slice(0, 5).join(', ')}</>}
              </div>
            </div>
          </div>
          <div className="rm-list">
            {g.entries.map((e, n) => (
              <div key={e.id} className={`rm-item ${e.notifiedAt ? 'is-done' : ''}`}>
                <div className="rm-time wl-n">{n + 1}.</div>
                <div className="rm-body">
                  <div className="rm-name"><Name i={e} /> <span className={`rw-chip ${e.pref === 'hepsi' ? 'is-blue' : ''}`}>{PREF[e.pref] || 'Fark etmez'}</span></div>
                  <div className="rm-meta">{e.phone}</div>
                  <div className="rc-why">{e.notifiedAt ? `Haber verildi · ${formatDateTime(e.notifiedAt)} · ${e.notifiedBy}` : `${formatDateTime(e.createdAt)} yazıldı`}</div>
                </div>
                <div className="rm-act rc-acts">
                  {e.notifiedAt ? (
                    <div className="rm-again-row">
                      {e.waUrl && <a className="rm-again" href={e.waUrl} target="_blank" rel="noopener noreferrer">Tekrar aç</a>}
                      <button type="button" className="rm-again" onClick={() => act(e, 'undo')}>Geri al</button>
                    </div>
                  ) : e.waUrl ? (
                    <a className="rm-wa" href={e.waUrl} target="_blank" rel="noopener noreferrer" onClick={() => act(e, 'notified')}><WaIcon /> Haber ver{e.time ? ` · ${e.time}` : ''}</a>
                  ) : (
                    <div className="rc-why">{g.open ? 'İstediği saatlerde yer yok' : 'Yer açılınca düğme çıkar'}</div>
                  )}
                  <button type="button" className="rc-small" onClick={() => act(e, 'remove')}>Listeden çıkar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="rm-tip muted small">
        <span aria-hidden="true">💡</span>
        <span>Randevu iptal olunca size bildirim gelir. Müşteri linke dokununca form o saat seçili açılır; saat başkası tarafından alındıysa diğer boş saatleri görür. Randevu alan kişi listeden kendiliğinden düşer; gün geçince adı ve telefonu silinir.</span>
      </div>
    </>
  );
}
