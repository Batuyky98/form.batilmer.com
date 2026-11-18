import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useLocation } from '../router.jsx';
import { Empty, Spinner, useAsync } from '../components/ui.jsx';
import { WaIcon } from '../components/ContactButtons.jsx';
import { formBaseUrl } from '../lib/util.js';

const DAY_FULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const tl = (n) => `${Math.round(n).toLocaleString('tr-TR')} ₺`;
const pctOf = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="rp-kpi">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <em className={tone || ''}>{sub}</em>}
    </div>
  );
}

function summaryText(r) {
  const ch = pctOf(r.total, r.prev.total);
  const lines = [
    `📊 ${r.isletme} · ${r.label} özeti${r.partial ? ' (ay devam ediyor)' : ''}`,
    '',
    `🗓 ${r.total} randevu${ch !== null && r.prev.total ? ` (${r.prev.label.split(' ')[0]}'e göre %${Math.abs(ch)} ${ch >= 0 ? 'fazla' : 'az'})` : ''}`,
    `📵 ${r.noShow} kişi gelmedi (%${String(r.noShowRate).replace('.', ',')})`,
    `🆕 ${r.newCustomers} yeni müşteri · ${r.returning} eski müşteri geri geldi`,
    r.revenue !== null && `💰 Tahmini ciro: ${tl(r.revenue)}`,
    r.recall.sent > 0 && `🔁 Tekrar çağrılan ${r.recall.sent} kişiden ${r.recall.booked}'i randevu aldı`,
    r.waitlist.booked > 0 && `🔔 Bekleme listesiyle ${r.waitlist.booked} boş saat doldu`,
    r.reviews.google > 0 && `⭐ ${r.reviews.google} kişi Google yorumuna yönlendi`,
    '',
    r.weekdays.some((d) => d.count) && `En yoğun gün: ${DAY_FULL[[...r.weekdays].sort((a, b) => b.count - a.count)[0].day]}${r.peakHour ? ` · En yoğun saat: ${r.peakHour}` : ''}`,
    `Ayrıntılı rapor: ${formBaseUrl()}/panel/rapor?ay=${r.month}`
  ];
  return lines.filter((x) => x !== false && x !== null && x !== undefined).join('\n');
}

// Ay sonu raporu: tek sayfada ayın özeti, sistemin katkısı ve öneriler
export default function Report() {
  const { search } = useLocation();
  const [month, setMonth] = useState(search.get('ay') || '');
  const [formId, setFormId] = useState(search.get('form') || '');
  const { data, loading, error } = useAsync(() => api.monthReport({ month, formId }), [month, formId]);
  useEffect(() => {
    document.title = 'Rapor';
  }, []);
  const r = data?.report;
  if (loading && !data) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><div className="notice notice-err">{error.message}</div></div>;
  if (!r) {
    return (
      <div className="page stack">
        <h1>Rapor</h1>
        <Empty title="Rapor için randevulu form yok">Randevu alanı olan bir formu görme yetkiniz olmalı.</Empty>
      </div>
    );
  }
  const ch = pctOf(r.total, r.prev.total);
  const maxDay = Math.max(1, ...r.weekdays.map((d) => d.count));
  const topDay = [...r.weekdays].sort((a, b) => b.count - a.count)[0];
  const maxSvc = Math.max(1, ...r.services.map((s) => s.count));
  const cur = month || r.month;
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(summaryText(r))}`, '_blank', 'noopener');

  return (
    <div className={`page stack rp ${loading ? 'is-loading' : ''}`}>
      <div className="page-head">
        <div>
          <h1>{r.label} raporu</h1>
          <p className="muted small">{r.isletme} · {Number(r.from.slice(8))}–{Number(r.to.slice(8))} {r.label.split(' ')[0]}{r.partial ? ' · ay devam ediyor' : ''}</p>
        </div>
      </div>
      <div className="rp-bar no-print">
        <div className="rp-months" role="radiogroup" aria-label="Ay">
          {data.months.slice(-3).map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={cur === m.value} className={cur === m.value ? 'is-on' : ''} onClick={() => setMonth(m.value)}>
              {m.label.split(' ')[0]}{m.partial ? ' (devam)' : ''}
            </button>
          ))}
          <select aria-label="Daha eski aylar" value={cur} onChange={(e) => setMonth(e.target.value)}>
            {data.months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {data.forms.length > 1 && (
          <select aria-label="İşletme" value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">Tüm işletmeler</option>
            {data.forms.map((f) => <option key={f.id} value={f.id}>{f.isletme || f.name}</option>)}
          </select>
        )}
        <span className="rp-sp" />
        <button type="button" className="btn btn-sm" onClick={share}><WaIcon /> WhatsApp'tan gönder</button>
        <button type="button" className="btn btn-sm" onClick={() => window.print()}>🖨 Yazdır / PDF</button>
      </div>

      <div className="rp-kpis">
        <Kpi label="Randevu" value={r.total} sub={r.prev.total ? `${ch >= 0 ? '▲' : '▼'} %${Math.abs(ch)} (${r.prev.label.split(' ')[0]}: ${r.prev.total})` : `${r.cancelled} iptal`} tone={ch === null ? '' : ch >= 0 ? 'up' : 'down'} />
        <Kpi label="Gelmeyen" value={r.noShow} sub={`%${String(r.noShowRate).replace('.', ',')}${r.prev.total ? ` · ${r.prev.label.split(' ')[0]} %${String(r.prev.noShowRate).replace('.', ',')}` : ''}`} tone={r.noShowRate <= r.prev.noShowRate ? 'up' : 'down'} />
        <Kpi label="Yeni müşteri" value={r.newCustomers} sub={`${r.returning} eski müşteri geri geldi`} />
        <Kpi label="Tahmini ciro" value={r.revenue === null ? '—' : tl(r.revenue)} sub={r.revenue === null ? 'Hizmetlere fiyat girilirse hesaplanır' : r.unmarked ? `"Geldi" işaretlenmemiş ${r.unmarked} randevu hariç` : 'Hizmet fiyatlarından (gelmeyenler hariç)'} tone={r.unmarked ? 'down' : ''} />
      </div>

      <div className="rp-grid">
        <section className="card">
          <b>Haftanın günleri</b>
          <div className="rp-bars" role="img" aria-label={r.weekdays.map((d) => `${d.label} ${d.count}`).join(', ')}>
            {r.weekdays.map((d) => (
              <div key={d.day}>
                <b>{d.count || ''}</b>
                <i className={d.count && d === topDay ? 'is-top' : ''} style={{ height: `${Math.max(3, (d.count / maxDay) * 120)}px`, ...(d.count ? {} : { background: 'var(--surface-3)' }) }} />
                <small>{d.label}</small>
              </div>
            ))}
          </div>
          {topDay?.count > 0 && <div className="muted small">En yoğun: <b>{DAY_FULL[topDay.day]}</b>{r.peakHour && <> · En yoğun saat: <b>{r.peakHour}</b></>}</div>}
        </section>
        <section className="card">
          <b>Hizmetler</b>
          {r.services.length ? r.services.map((s) => (
            <div key={s.label} className="rp-hbar"><span>{s.label}</span><i style={{ width: `${(s.count / maxSvc) * 100}%` }} /><b>{s.count}</b></div>
          )) : <p className="muted small">Bu ay randevu yok.</p>}
        </section>
      </div>

      <div className="rp-kpis">
        <Kpi label="🔁 Tekrar çağrılan" value={r.recall.sent} sub={r.recall.sent ? `${r.recall.booked}'i randevu aldı` : 'Hatırlatmalar → Çağır'} tone={r.recall.booked ? 'up' : ''} />
        <Kpi label="🔔 Bekleme listesi" value={r.waitlist.joined} sub={r.waitlist.booked ? `${r.waitlist.booked} boş saat doldu` : 'Dolu günde yazılanlar'} tone={r.waitlist.booked ? 'up' : ''} />
        <Kpi label="⭐ Google'a yönlenen" value={r.reviews.google} sub={`${r.reviews.sent} istek gönderildi`} />
        <Kpi label="📲 Hatırlatma" value={r.reminders.sent} sub={r.reminders.base ? `Randevuların %${Math.round(r.reminders.rate)}'i` : 'WhatsApp hatırlatma'} />
      </div>

      {r.tips.length > 0 && (
        <section className="card stack">
          <b>Öneriler</b>
          {r.tips.map((t) => (
            <div key={t.text} className="rp-tip"><span aria-hidden="true">{t.icon}</span><span>{t.text}</span></div>
          ))}
        </section>
      )}
      <p className="muted small">İptal edilen randevular sayılara dahil değildir. "Gelmeyen" oranı, tarihi geçmiş randevulara göre hesaplanır. Ciro; "Geldi" işaretlenen ve günü henüz gelmemiş randevuların hizmet fiyatlarından tahmindir.</p>
    </div>
  );
}
