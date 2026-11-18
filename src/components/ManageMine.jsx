import { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, weekdayName } from '../lib/util.js';
import { formatPhone } from '../lib/validators.js';

// Formdaki "Randevumu yönet" penceresi: telefon + ad soyadla aktif randevuyu bul, iptal et.
// Form içinde açılır (iframe'den çıkmaz); KVKK gereği sadece iki bilgi de eşleşirse randevu gösterilir.
const TX = {
  tr: { title: 'Randevumu yönet', intro: 'Randevu alırken yazdığınız telefon numarası ve ad soyadla aktif randevunuzu görebilir, iptal edebilirsiniz.', phone: 'Telefon', name: 'Ad soyad', find: 'Randevumu bul', none: 'Bu bilgilerle aktif randevu bulunamadı. Telefon ve ad soyadı randevu alırken yazdığınız gibi yazın.', cancel: 'Randevuyu iptal et', sure: 'Bu randevu iptal edilsin mi?', yes: 'Evet, iptal et', no: 'Vazgeç, kalsın', done: 'Randevunuz iptal edildi', late: (n) => `Randevuya ${n} saatten az kaldığı için online iptal edilemez; lütfen işletmeyi arayın.`, close: 'Kapat', again: 'Başka randevu ara', pending: 'Onay bekliyor', ok: 'Onaylandı' },
  en: { title: 'Manage my booking', intro: 'Enter the phone number and full name you used when booking to see or cancel your active appointment.', phone: 'Phone', name: 'Full name', find: 'Find my booking', none: 'No active booking found with these details. Please type them exactly as when booking.', cancel: 'Cancel booking', sure: 'Cancel this booking?', yes: 'Yes, cancel', no: 'Keep it', done: 'Your booking was cancelled', late: (n) => `Less than ${n} hours left; online cancellation is closed. Please call the business.`, close: 'Close', again: 'Search again', pending: 'Pending', ok: 'Confirmed' }
};

export default function ManageMine({ lang = 'tr', find, cancel, onClose, className = 'bf', vars = {} }) {
  const x = TX[lang] || TX.tr;
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState('');
  const [doneMsg, setDoneMsg] = useState('');

  async function search(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setErr('');
    setBusy(true);
    try {
      setList(await find({ phone, name }));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  async function doCancel(a) {
    setBusy(true);
    setErr('');
    try {
      await cancel(a.token);
      setDoneMsg(`${weekdayName(a.date, lang)}, ${formatDate(a.date, lang)} · ${a.start}${a.service ? ` · ${a.service}` : ''}`);
      setList((l) => l.filter((y) => y.token !== a.token));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      setAsking('');
    }
  }

  // Formun DIŞINA çizilir (iç içe form olmasın, gönder olayı ana forma gitmesin)
  return createPortal(
    <div className={`${className} bf-mine-host`} style={vars}>
    <div className="bf-legal bf-mine-wrap" role="dialog" aria-modal="true" aria-label={x.title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bf-legal-box bf-mine">
        <div className="bf-legal-head">
          <b>{x.title}</b>
          <button type="button" className="bf-legal-x" aria-label={x.close} onClick={onClose}>✕</button>
        </div>

        {doneMsg && (
          <div className="bf-mine-done">
            <span className="bf-mine-x" aria-hidden="true">✕</span>
            <b>{x.done}</b>
            <span>{doneMsg}</span>
          </div>
        )}

        {list === null ? (
          <div className="bf-mine-form" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}>
            <p className="bf-help">{x.intro}</p>
            <label className="bf-label" htmlFor="bf-mine-tel">{x.phone}</label>
            <input id="bf-mine-tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} required />
            <label className="bf-label" htmlFor="bf-mine-ad">{x.name}</label>
            <input id="bf-mine-ad" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            {err && <div className="bf-error" role="alert">{err}</div>}
            <button type="button" className="bf-btn" disabled={busy} onClick={search}>{busy ? '…' : x.find}</button>
          </div>
        ) : (
          <div className="bf-mine-list">
            {!list.length && !doneMsg && <p className="bf-help">{x.none}</p>}
            {list.map((a) => (
              <div key={a.token} className="bf-mine-item">
                <div className="bf-mine-top">
                  <b>{a.service || x.title}</b>
                  <span className={`bf-mine-st ${a.status === 'bekliyor' ? 'is-wait' : ''}`}>{a.status === 'bekliyor' ? x.pending : x.ok}</span>
                </div>
                <div className="bf-mine-when">📅 {weekdayName(a.date, lang)}, {formatDate(a.date, lang)} · {a.start}–{a.end}</div>
                {!a.canCancel ? (
                  <p className="bf-help">{x.late(a.cutoffHours)}</p>
                ) : asking === a.token ? (
                  <div className="bf-mine-ask">
                    <b>{x.sure}</b>
                    <button type="button" className="bf-btn bf-btn-danger" disabled={busy} onClick={() => doCancel(a)}>{busy ? '…' : x.yes}</button>
                    <button type="button" className="bf-btn bf-btn-light" onClick={() => setAsking('')}>{x.no}</button>
                  </div>
                ) : (
                  <button type="button" className="bf-btn bf-btn-danger" onClick={() => setAsking(a.token)}>{x.cancel}</button>
                )}
              </div>
            ))}
            {err && <div className="bf-error" role="alert">{err}</div>}
            <button type="button" className="bf-link bf-mine-again" onClick={() => { setList(null); setDoneMsg(''); setErr(''); }}>{x.again}</button>
          </div>
        )}
      </div>
    </div>
  </div>,
    document.body
  );
}
