import { useState } from 'react';
import * as api from '../lib/api.js';
import { Link } from '../router.jsx';
import { Segmented, Spinner, useAsync } from '../components/ui.jsx';
import { formatDateShort, weekdayName } from '../lib/util.js';

// Günlük kayıt sayısı: tek seri, tek renk (marka mavisi), üzerine gelince değer
function DailyBars({ daily }) {
  const [hover, setHover] = useState(null);
  const W = 720;
  const H = 220;
  const pad = { l: 32, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...daily.map((d) => d.count));
  const niceMax = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const ticks = niceMax <= 4 ? Array.from({ length: niceMax + 1 }, (_, i) => i) : [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / daily.length;
  const bw = Math.max(3, Math.min(18, step - 2));
  const y = (v) => pad.t + ih - (v / niceMax) * ih;
  const labelEvery = daily.length > 14 ? 5 : 1;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Günlere göre kayıt sayısı">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} className="grid" />
            <text x={pad.l - 6} y={y(tk)} className="axis" textAnchor="end" dominantBaseline="middle">{tk}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const h = Math.max(d.count ? 2 : 0, ih - (y(d.count) - pad.t));
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${formatDateShort(d.date)}: ${d.count} kayıt`}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
              {h > 0 && <path d={roundedTop(x, y(d.count), bw, h)} className={`bar ${hover === i ? 'is-hover' : ''}`} />}
              {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 8} className="axis" textAnchor="middle">{formatDateShort(d.date)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((pad.l + hover * step + step / 2) / W) * 100}%` }}>
          <b>{daily[hover].count}</b> kayıt
          <span>{weekdayName(daily[hover].date)}, {formatDateShort(daily[hover].date)}</span>
        </div>
      )}
    </div>
  );
}

function roundedTop(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// Kategori karşılaştırması: yatay çubuk, tek renk, değer metin renginde
function HBars({ items, unit = '' }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <div className="muted small">Veri yok.</div>;
  return (
    <div className="hbars">
      {items.map((it) => (
        <div key={it.label} className="hbar-row">
          <span className="hbar-label">{it.label}</span>
          <span className="hbar-track" aria-hidden="true"><span className="hbar-fill" style={{ width: `${(it.count / max) * 100}%` }} /></span>
          <span className="hbar-value">{it.count}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export default function Stats({ id }) {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useAsync(() => api.formStats(id, days), [id, days]);
  if (error) return <div className="page"><div className="notice notice-err">{error.message}</div></div>;
  if (!data) return <div className="page"><Spinner /></div>;
  const r = data.randevu;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <Link to={`/panel/formlar/${id}/kayitlar`} className="back">← Kayıtlar</Link>
          <h1>{data.form.name} <span className="muted">· İstatistik</span></h1>
          <div className="small muted">{data.form.isletme}</div>
        </div>
        <Segmented value={days} onChange={setDays} label="Zaman aralığı" options={[{ value: 7, label: 'Son 7 gün' }, { value: 30, label: 'Son 30 gün' }, { value: 90, label: 'Son 90 gün' }]} />
      </div>

      <div className="stat-row">
        <div className="stat"><b>{data.inRange}</b><span>Son {data.days} günde kayıt</span></div>
        <div className="stat"><b>{data.total}</b><span>Toplam kayıt</span></div>
        {r && <div className="stat"><b>{r.upcoming}</b><span>Önümüzdeki 7 gün randevu</span></div>}
        {r && <div className="stat"><b>{r.noShowRate === null ? '—' : `%${r.noShowRate}`}</b><span>Gelmeme oranı</span></div>}
      </div>

      <section className="card stack">
        <h2>Günlere göre kayıt</h2>
        {loading ? <Spinner /> : <DailyBars daily={data.daily} />}
      </section>

      <div className="grid-2">
        <section className="card stack">
          <h2>Kayıt durumları</h2>
          <HBars items={data.statusCounts} />
        </section>
        {r && (
          <section className="card stack">
            <h2>Hizmetlere göre randevu <span className="muted small">(son {data.days} gün, iptaller hariç)</span></h2>
            <HBars items={r.byService} />
          </section>
        )}
        {r && (
          <section className="card stack">
            <h2>Randevu durumları <span className="muted small">(son {data.days} gün)</span></h2>
            <HBars items={r.byStatus} />
          </section>
        )}
      </div>
    </div>
  );
}
