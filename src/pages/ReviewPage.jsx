import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { formatDate, weekdayName } from '../lib/util.js';

// Müşterinin WhatsApp'tan açtığı puan sayfası: 1-5 yıldız + isteğe bağlı yorum.
// Google kuralı gereği puan ne olursa olsun herkese "Google'da paylaş" düğmesi gösterilir.
const WORDS = ['', 'Çok kötü', 'Kötü', 'İdare eder', 'İyi', 'Harika!'];

export default function ReviewPage({ token }) {
  const [d, setD] = useState(undefined);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = 'Değerlendirme';
    api.getReviewPage(token).then(setD).catch(() => setD(null));
  }, [token]);

  async function send() {
    if (!rating) return setErr('Lütfen bir yıldız seçin.');
    setBusy(true);
    setErr('');
    try {
      await api.submitReview(token, { rating, comment });
      setDone(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    const url = (await api.reviewGoogleClick(token).catch(() => null)) || d?.googleUrl;
    if (url) window.location.href = url;
  }

  if (d === undefined) return <div className="rv-wrap"><div className="rv-card"><div className="spinner" /></div></div>;
  if (!d) return <div className="rv-wrap"><div className="rv-card"><h1>Bağlantı geçersiz</h1><p className="rv-muted">Bu değerlendirme bağlantısı artık kullanılamıyor.</p></div></div>;

  const style = { '--rv': d.primary || '#2F5BEA' };
  const finished = done || d.rated;
  return (
    <div className="rv-wrap" style={style}>
      <div className="rv-card">
        {d.logo ? <img className="rv-logo" src={d.logo} alt={d.isletme} /> : <div className="rv-biz">{d.isletme}</div>}
        {!finished ? (
          <>
            <h1>Deneyiminizi puanlar mısınız?</h1>
            <p className="rv-muted">{weekdayName(d.date)}, {formatDate(d.date)}{d.service ? ` · ${d.service}` : ''}</p>
            <div className="rv-stars" role="radiogroup" aria-label="Puan" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} yıldız`} className={(hover || rating) >= n ? 'is-on' : ''} onMouseEnter={() => setHover(n)} onClick={() => { setRating(n); setErr(''); }}>★</button>
              ))}
            </div>
            <div className="rv-word">{WORDS[hover || rating] || ' '}</div>
            {rating > 0 && (
              <textarea rows={3} maxLength={1000} placeholder={rating <= 3 ? 'Neyi daha iyi yapabilirdik? (isteğe bağlı)' : 'Eklemek istediğiniz bir şey var mı? (isteğe bağlı)'} value={comment} onChange={(e) => setComment(e.target.value)} />
            )}
            {err && <div className="rv-err" role="alert">{err}</div>}
            <button type="button" className="rv-btn" disabled={busy} onClick={send}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button>
          </>
        ) : (
          <>
            <div className="rv-thanks" aria-hidden="true">🙏</div>
            <h1>Teşekkür ederiz!</h1>
            <p className="rv-muted">Görüşünüz {d.isletme} ekibine ulaştı.</p>
            <div className="rv-google">
              <b>Deneyiminizi Google'da da paylaşır mısınız?</b>
              <span>Yorumunuz, bizi arayan diğer kişilere yol gösterir.</span>
              <button type="button" className="rv-btn rv-btn-g" onClick={google}>
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                Google'da yorum yaz
              </button>
            </div>
          </>
        )}
      </div>
      <div className="rv-foot">{d.isletme} · Batilmer Form</div>
    </div>
  );
}
