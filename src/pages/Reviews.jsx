import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Link, useLocation } from '../router.jsx';
import { Empty, Segmented, Spinner, useAsync, useToast } from '../components/ui.jsx';
import { WaIcon } from '../components/ContactButtons.jsx';
import { dayLabel } from '../components/ApptSheet.jsx';
import { formatDateTime } from '../lib/util.js';

const Stars = ({ n, size = 15 }) => (
  <span className="rw-stars" style={{ fontSize: size }} aria-label={`${n} yıldız`}>
    {'★'.repeat(n)}<i>{'★'.repeat(5 - n)}</i>
  </span>
);

// Google yorum isteği: "Geldi" olan müşterilerden puan iste; gelen puanları gör
export default function Reviews() {
  const { search } = useLocation();
  const [tab, setTab] = useState(search.get('sekme') === 'gelen' ? 'gelen' : 'iste');
  const queue = useAsync(() => api.listReviewQueue(), []);
  const list = useAsync(() => api.listReviews(), []);
  const [items, setItems] = useState([]);
  const toast = useToast();
  useEffect(() => setItems(queue.data?.items || []), [queue.data]);

  const s = list.data?.stats;
  const noForms = queue.data && list.data && !queue.data.forms.length && !list.data.forms.length;

  async function sent(i) {
    setItems((l) => l.filter((x) => x.id !== i.id));
    try {
      await api.markReviewSent(i.id);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <div className="page rw">
      <header>
        <h1>Yorumlar</h1>
        <p className="muted">Gelen müşterilerden puan isteyin; memnun olan Google'da da paylaşsın.</p>
      </header>

      {(queue.loading && !queue.data) || (list.loading && !list.data) ? <Spinner /> : noForms ? (
        <Empty title="Yorum isteği kapalı">Formun Randevu sekmesinden "Google yorum isteği"ni açıp Google yorum linkinizi girin.</Empty>
      ) : (
        <>
          {s && (
            <div className="rw-kpis">
              {s.rated > 0 ? <div className="rw-kpi rw-kpi-main"><b>{s.avg ?? '–'}</b><Stars n={Math.round(s.avg || 0)} size={18} /><span>{s.rated} puan (bizim sayfada)</span></div> : <div className="rw-kpi rw-kpi-main"><b>{s.sent ? `%${Math.round((s.google / s.sent) * 100)}` : '–'}</b><span>Google'a gitme oranı</span></div>}
              <div className="rw-kpi"><b>{s.sent}</b><span>İstek gönderildi</span></div>
              <div className="rw-kpi"><b>{s.google}</b><span>Google'a yönlendi</span></div>
            </div>
          )}
          <Segmented label="Sekme" value={tab} onChange={setTab} options={[{ value: 'iste', label: `Puan iste · ${items.length}` }, { value: 'gelen', label: `Sonuçlar · ${list.data?.items.length || 0}` }]} />

          {tab === 'iste' && (
            !items.length ? (
              <div className="td-empty"><span aria-hidden="true">✨</span><b>Şu an istenecek kimse yok</b><span>Randevuyu "Geldi" olarak işaretlediğiniz müşteriler burada görünür (son 7 gün).</span></div>
            ) : (
              <div className="rm-list">
                {items.map((i) => (
                  <div key={i.id} className="rm-item">
                    <div className="rm-time">{i.start}<small>{dayLabel(i.date)}</small></div>
                    <div className="rm-body">
                      <div className="rm-name">{i.customerKey ? <Link to={`/panel/musteriler/${i.customerKey}`}>{i.name || 'İsimsiz'}</Link> : i.name || 'İsimsiz'}</div>
                      <div className="rm-meta">{[i.service, (queue.data.forms.length > 1 && i.isletme) || ''].filter(Boolean).join(' · ')}</div>
                      <div className="rm-meta">{i.phone}</div>
                    </div>
                    <div className="rm-act">
                      {i.waUrl ? (
                        <a className="rm-wa" href={i.waUrl} target="_blank" rel="noopener noreferrer" onClick={() => sent(i)}><WaIcon /> Puan iste</a>
                      ) : <div className="rm-bad">⚠ Telefon numarası yok</div>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'gelen' && (
            !list.data?.items.length ? (
              <div className="td-empty"><span aria-hidden="true">⭐</span><b>Henüz sonuç yok</b><span>İstek gönderdiğiniz müşteriler linke dokununca burada görünür.</span></div>
            ) : (
              <>
                {s?.rated > 0 && (
                  <div className="rw-dist">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <div key={n} className="rw-bar"><span>{n}★</span><i style={{ width: `${(s.dist[n - 1] / s.rated) * 100}%` }} className={n <= 2 ? 'is-low' : ''} /><b>{s.dist[n - 1]}</b></div>
                    ))}
                  </div>
                )}
                <div className="td-list">
                  {list.data.items.map((r) => (
                    <div key={r.id} className={`rw-row ${r.rating && r.rating <= 2 ? 'is-low' : ''}`}>
                      <div className="rw-row-top">
                        {r.rating ? <Stars n={r.rating} /> : <span className="rw-g">Google yorum ekranını açtı ✓</span>}
                        <span className="muted small">{formatDateTime(r.ratedAt)}</span>
                      </div>
                      {r.comment && <p className="rw-comment">“{r.comment}”</p>}
                      <div className="muted small">
                        {r.customerKey ? <Link to={`/panel/musteriler/${r.customerKey}`}>{r.name || 'İsimsiz'}</Link> : r.name || 'İsimsiz'} · {[r.service, list.data.forms.length > 1 ? r.isletme : ''].filter(Boolean).join(' · ')}
                        {r.google && r.rating && <span className="rw-g"> · Google'a gitti ✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}
          <p className="muted small">Google kuralları gereği puan isteği herkese aynı şekilde gönderilir ve puan ne olursa olsun müşteriye "Google'da paylaş" düğmesi gösterilir. 1-2 yıldız gelince size hemen bildirim gelir; müşteriyi arayıp sorunu çözebilirsiniz.</p>
        </>
      )}
    </div>
  );
}
