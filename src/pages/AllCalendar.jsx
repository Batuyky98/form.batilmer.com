import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { navigate } from '../router.jsx';
import { Badge, Empty, Spinner, useIsMobile } from '../components/ui.jsx';
import { addDays, dayOfMonth, dayOfWeek, formatDate, formatDateShort, today, weekdayName, weekdayShort } from '../lib/util.js';

const STATUS_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };

export default function AllCalendar() {
  const [anchor, setAnchor] = useState(today());
  const [formFilter, setFormFilter] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [data, setData] = useState(null);
  const mobile = useIsMobile();
  const start = addDays(anchor, -((dayOfWeek(anchor) + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];

  useEffect(() => {
    api.listAllAppointments({ from: start, to: end }).then(setData);
  }, [start, end]);

  if (!data) return <div className="page"><Spinner /></div>;
  const items = data.items.filter((a) => (!formFilter || a.formId === formFilter) && (showCancelled || a.status !== 'iptal'));
  const pending = data.items.filter((a) => a.status === 'bekliyor' && (!formFilter || a.formId === formFilter)).length;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Tüm randevular</h1>
          <p className="muted">Yetkili olduğunuz tüm formların randevuları tek takvimde. Bir randevuya tıklayınca o formun takvimi açılır.</p>
        </div>
      </div>
      {!data.forms.length ? (
        <Empty title="Randevulu form yok">Randevu alanı olan ve randevu yetkiniz bulunan formlar burada görünür.</Empty>
      ) : (
        <>
          {pending > 0 && <div className="notice notice-warn">Bu hafta onay bekleyen {pending} randevu var.</div>}
          <div className="cal-toolbar card">
            <div className="row">
              <button type="button" className="btn btn-sm" aria-label="Önceki hafta" onClick={() => setAnchor(addDays(anchor, -7))}>←</button>
              <button type="button" className="btn btn-sm" onClick={() => setAnchor(today())}>Bugün</button>
              <button type="button" className="btn btn-sm" aria-label="Sonraki hafta" onClick={() => setAnchor(addDays(anchor, 7))}>→</button>
              <strong className="cal-range">{mobile ? `${weekdayName(anchor)}, ${formatDate(anchor)}` : `${formatDateShort(start)} – ${formatDate(end)}`}</strong>
            </div>
            {mobile && (
              <div className="week-strip" role="tablist" aria-label="Haftanın günleri">
                {days.map((d) => {
                  const n = items.filter((a) => a.date === d && a.status !== 'iptal').length;
                  const wait = items.some((a) => a.date === d && a.status === 'bekliyor');
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
              <select aria-label="Form filtresi" value={formFilter} onChange={(e) => setFormFilter(e.target.value)}>
                <option value="">Tüm formlar ({data.forms.length})</option>
                {data.forms.map((f) => <option key={f.id} value={f.id}>{f.isletme ? `${f.isletme} – ` : ''}{f.name}</option>)}
              </select>
              <label className="inline-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> İptalleri göster</label>
            </div>
          </div>
          <div className={`calendar ${mobile ? 'calendar-day' : ''}`}>
            {(mobile ? [anchor] : days).map((d) => {
              const list = items.filter((a) => a.date === d);
              return (
                <section key={d} className={`cal-day ${d === today() ? 'is-today' : ''}`} aria-label={`${weekdayName(d)} ${formatDate(d)}`}>
                  <header>
                    <div className="cal-day-title"><span>{weekdayName(d)}</span><b>{formatDateShort(d)}</b></div>
                    {list.length > 0 && <span className="muted small">{list.length}</span>}
                  </header>
                  <div className="cal-items">
                    {list.map((a) => {
                      const f = data.forms.find((x) => x.id === a.formId);
                      return (
                        <button key={a.id} type="button" className={`cal-item status-${a.status}`} onClick={() => navigate(`/panel/formlar/${a.formId}/randevular?tarih=${a.date}`)}>
                          <span className="cal-time">{a.start}<small>{a.end}</small></span>
                          <span className="cal-name">{a.name || 'İsimsiz'}{a.partySize > 1 ? ` · ${a.partySize} kişi` : ''}</span>
                          <span className="cal-meta">{a.service}{a.resource ? ` · ${a.resource}` : ''}</span>
                          <span className="cal-form">{f?.isletme || f?.name}</span>
                          <Badge tone={STATUS_TONE[a.status]}>{api.STATUS_LABELS[a.status]}</Badge>
                        </button>
                      );
                    })}
                    {!list.length && <div className="muted small cal-empty">Randevu yok</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
