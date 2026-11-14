import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Link, useLocation } from '../router.jsx';
import { Badge, Empty, Segmented, Spinner, useAsync, useIsMobile, useToast } from '../components/ui.jsx';
import { WaIcon } from '../components/ContactButtons.jsx';
import { longDate } from '../lib/reminder.js';
import { formatDateTime } from '../lib/util.js';
import { markStepNow } from '../lib/onboarding.js';

// Yarının (ve bugünün) randevularına WhatsApp'tan tek tıkla hatırlatma.
// Düğme WhatsApp'ı müşterinin sohbetiyle ve hazır mesajla açar; personel gönder'e basar.
export default function Reminders() {
  const { search } = useLocation();
  const [day, setDay] = useState(search.get('gun') === 'bugun' ? 'bugun' : 'yarin');
  const { data, loading, error, reload } = useAsync(() => api.listReminders({ day }), [day]);
  const [items, setItems] = useState([]);
  const mobile = useIsMobile();
  const toast = useToast();
  useEffect(() => setItems(data?.items || []), [data]);

  const done = items.filter((i) => i.waAt).length;
  const bad = items.filter((i) => !i.waUrl).length;
  const waiting = items.length - done - bad;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  async function mark(item, on) {
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, waAt: on ? Date.now() : null, waBy: on ? 'Siz' : '' } : x)));
    try {
      const r = await api.markReminded(item.id, on);
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, ...r } : x)));
    } catch (e) {
      toast(e.message, 'err');
      reload();
    }
  }

  return (
    <div className="page stack">
      <div className="page-head">
        <div>
          <h1>Hatırlatmalar</h1>
          {!mobile && <p className="muted small">Düğmeye basınca WhatsApp mesajı hazır açılır, siz sadece gönder'e basarsınız.</p>}
        </div>
      </div>
      <Segmented
        label="Gün"
        value={day}
        onChange={setDay}
        options={[
          { value: 'yarin', label: `Yarın · ${data?.counts?.yarin ?? '…'}` },
          { value: 'bugun', label: `Bugün · ${data?.counts?.bugun ?? '…'}` }
        ]}
      />
      {loading && !data && <Spinner />}
      {error && <div className="notice notice-err">{error.message}</div>}
      {data && !data.forms.length && (
        <Empty title="Hatırlatma yapılacak form yok">Randevu yönetme yetkiniz olan, hatırlatması açık bir form olmalı.</Empty>
      )}
      {data && data.forms.length > 0 && (
        <>
          <div className="card rm-hero">
            <div className="rm-ring" style={{ '--p': pct }}><b>{done}/{items.length}</b></div>
            <div className="rm-hero-text">
              <h2>{data.date ? longDate(data.date) : ''}</h2>
              <p className="muted">
                {!items.length ? 'Bu gün için hatırlatılacak randevu yok.' : [done && `${done} kişiye hatırlatıldı`, waiting && `${waiting} kişi bekliyor`, bad && `${bad} numara hatalı`].filter(Boolean).join(', ') + '.'}
              </p>
            </div>
          </div>
          <div className="rm-list">
            {items.map((i) => (
              <div key={i.id} className={`rm-item ${i.waAt ? 'is-done' : ''}`}>
                <div className="rm-time">{i.start}<small>{i.end}</small></div>
                <div className="rm-body">
                  <div className="rm-name">
                    {i.customerKey ? <Link to={`/panel/musteriler/${i.customerKey}`}>{i.name || 'İsimsiz'}</Link> : i.name || 'İsimsiz'}
                    {i.status === 'bekliyor' && <Badge tone="amber">Onay bekliyor</Badge>}
                    {i.firstTime && <Badge tone="blue">İlk kez</Badge>}
                    {i.noShow > 0 && <Badge tone="red">{i.noShow} kez gelmedi</Badge>}
                  </div>
                  <div className="rm-meta">{[i.service, i.resource, i.partySize > 1 ? `${i.partySize} kişi` : ''].filter(Boolean).join(' · ')}{data.forms.length > 1 && <> · <b className="rm-biz">{i.isletme}</b></>}</div>
                  <div className="rm-meta">
                    {i.phone || 'Telefon yok'}
                    {i.emailAuto && <> <span className="badge badge-blue rm-mail">✉ {i.emailSent ? 'E-posta da gitti' : 'E-posta otomatik gidecek'}</span></>}
                  </div>
                </div>
                <div className="rm-act">
                  {i.waAt ? (
                    <>
                      <div className="rm-done">✓ Hatırlatıldı <span>{formatDateTime(i.waAt).split(' ')[1]} · {i.waBy}</span></div>
                      <div className="rm-again-row">
                        {i.waUrl && <a className="rm-again" href={i.waUrl} target="_blank" rel="noopener noreferrer">Tekrar aç</a>}
                        <button type="button" className="rm-again" onClick={() => mark(i, false)}>Geri al</button>
                      </div>
                    </>
                  ) : i.waUrl ? (
                    <a className="rm-wa" href={i.waUrl} target="_blank" rel="noopener noreferrer" onClick={() => { markStepNow('hatirlat'); mark(i, true); }}>
                      <WaIcon /> WhatsApp ile hatırlat
                    </a>
                  ) : (
                    <div className="rm-bad">⚠ Telefon numarası eksik veya hatalı<br /><span className="muted small">Kayıttan düzeltin veya arayın</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {items.length > 0 && (
            <div className="rm-tip muted small">
              <span aria-hidden="true">💡</span>
              <span>Mesaj, bu cihazda açık olan WhatsApp'tan gider (işletme telefonu ise işletme numarasından). Müşteri cevap yazarsa size gelir. Metni formun Randevu sekmesinden değiştirebilirsiniz.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
