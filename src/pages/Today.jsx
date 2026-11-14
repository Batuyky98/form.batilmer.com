import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link, navigate } from '../router.jsx';
import { Modal, Spinner } from '../components/ui.jsx';
import { useLive } from '../components/Live.jsx';
import ApptSheet from '../components/ApptSheet.jsx';
import ShareFormModal from '../components/ShareForm.jsx';
import { TelIcon, WaIcon } from '../components/ContactButtons.jsx';
import { telUrl, whatsappUrl } from '../lib/shared.js';
import { deviceState } from '../lib/push.js';
import { getSteps, markStep, setOnboardingUser } from '../lib/onboarding.js';
import { formatDate, formBaseUrl, nowMinutesTR, timeToMin, today, weekdayName } from '../lib/util.js';

function greeting() {
  const h = Math.floor(nowMinutesTR() / 60);
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}
// "Dr. Ayşe Yılmaz" → "Ayşe"; "Ana Admin" → "Admin"
const firstName = (n) => {
  const s = String(n || '').trim();
  if (/admin/i.test(s)) return 'Admin';
  return s.split(/\s+/).find((w) => w && !/\.$/.test(w)) || '';
};
const TONE = { bekliyor: 'amber', geldi: 'blue', gelmedi: 'red' };
const SHORT = { bekliyor: 'Onay bekliyor', geldi: 'Geldi', gelmedi: 'Gelmedi' };

function untilText(a) {
  const d = timeToMin(a.start) - nowMinutesTR();
  if (d <= 0) return 'ŞU AN';
  if (d < 60) return `${d} DK SONRA`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return `${h} SA${m ? ` ${m} DK` : ''} SONRA`;
}

// İlk girişte: sistemi kullanarak öğreten 4 adım. Bitince ya da "Gizle" deyince kaybolur.
function GettingStarted({ uid, forms, onShare }) {
  const [steps, setSteps] = useState(() => getSteps(uid));
  const [push, setPush] = useState(null);
  useEffect(() => {
    deviceState().then(setPush).catch(() => setPush('unsupported'));
  }, []);
  if (steps.gizle || !forms.length) return null;
  const first = forms.find((f) => f.publishedAt) || forms[0];
  const hasRandevu = forms.some((f) => f.hasRandevu && f.perms.randevu);
  const list = [
    { key: 'bildirim', done: push === 'on', title: 'Telefonuna bildirimleri aç', desc: 'Yeni randevu gelince telefonun çalsın', action: 'Aç', go: () => navigate('/panel/bildirimler') },
    { key: 'paylas', done: !!steps.paylas, title: 'Form linkini paylaş', desc: 'WhatsApp, Instagram veya kapıya QR kod', action: 'Paylaş', go: () => onShare(first) },
    { key: 'deneme', done: forms.some((f) => f.total > 0), title: hasRandevu ? 'Kendine deneme randevusu al' : 'Formu bir kez dene', desc: 'Müşterin ne görüyor, gör', action: 'Dene', go: () => window.open(`${formBaseUrl()}/f/${first.slug}`, '_blank', 'noopener') },
    hasRandevu && { key: 'hatirlat', done: !!steps.hatirlat, title: 'Bir randevuya hatırlatma gönder', desc: 'WhatsApp ile tek dokunuş', action: 'Göster', go: () => navigate('/panel/hatirlatmalar') }
  ].filter(Boolean);
  const done = list.filter((s) => s.done).length;
  if (push === null) return null;
  if (done === list.length) return null;
  return (
    <section className="gs">
      <div className="gs-head">
        <div>
          <b>Başlarken</b>
          <span>{done}/{list.length} tamam · 2 dakikanı alır</span>
        </div>
        <button type="button" className="gs-hide" onClick={() => { markStep(uid, 'gizle'); setSteps(getSteps(uid)); }}>Gizle</button>
      </div>
      <div className="gs-bar"><i style={{ width: `${(done / list.length) * 100}%` }} /></div>
      <ol className="gs-list">
        {list.map((s) => (
          <li key={s.key} className={s.done ? 'is-done' : ''}>
            <span className="gs-check" aria-hidden="true">{s.done ? '✓' : ''}</span>
            <span className="gs-text"><b>{s.title}</b><span>{s.desc}</span></span>
            {!s.done && <button type="button" className="gs-go" onClick={s.go}>{s.action}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Today() {
  const { user } = useAuth();
  const live = useLive();
  const [forms, setForms] = useState(null);
  const [appts, setAppts] = useState(null);
  const [rem, setRem] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [picking, setPicking] = useState(false);
  setOnboardingUser(user?.id);

  const load = () => {
    api.listForms().then(setForms).catch(() => setForms([]));
    api.listAllAppointments({ from: today(), to: today() }).then(setAppts).catch(() => setAppts({ forms: [], items: [] }));
    api.listReminders({ day: 'yarin' }).then(setRem).catch(() => setRem(null));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  const newest = live?.items?.[0]?.id;
  useEffect(() => {
    if (newest) load();
  }, [newest]);

  if (!forms || !appts) return <div className="page"><Spinner /></div>;

  const nowMin = nowMinutesTR();
  const items = appts.items.filter((a) => a.status !== 'iptal');
  const next = items.find((a) => ['onaylandi', 'bekliyor'].includes(a.status) && timeToMin(a.end) > nowMin);
  const bizOf = (id) => {
    const f = appts.forms.find((x) => x.id === id);
    return f?.isletme || f?.name || '';
  };
  const multi = appts.forms.length > 1;
  const randevuForms = forms.filter((f) => f.hasRandevu && f.perms.randevu);
  const remLeft = rem ? rem.items.filter((i) => !i.waAt).length : 0;
  const newToday = forms.filter((f) => f.todayCount > 0);

  function addAppt() {
    if (randevuForms.length === 1) navigate(`/panel/formlar/${randevuForms[0].id}/randevular?yeni=1`);
    else setPicking(true);
  }

  return (
    <div className="page td">
      <header className="td-head">
        <span>{weekdayName(today())}, {formatDate(today()).replace(/ \d{4}$/, '')}</span>
        <h1>{greeting()}{firstName(user?.name) ? `, ${firstName(user?.name)}` : ''} 👋</h1>
      </header>

      <GettingStarted uid={user?.id} forms={forms} onShare={setSharing} />

      {next && (
        <section className="td-next" onClick={() => setSheet(next)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSheet(next)}>
          <small>SIRADAKİ · {untilText(next)}</small>
          <div className="td-next-time">{next.start}</div>
          <div className="td-next-name">{next.name || 'İsimsiz'}</div>
          <div className="td-next-meta">{[next.service, next.resource, multi ? bizOf(next.formId) : ''].filter(Boolean).join(' · ')}</div>
          <div className="td-next-acts" onClick={(e) => e.stopPropagation()}>
            {telUrl(next.phone) && <a className="td-pill" href={telUrl(next.phone)}><TelIcon /> Ara</a>}
            {whatsappUrl(next.phone) && <a className="td-pill" href={whatsappUrl(next.phone)} target="_blank" rel="noopener noreferrer"><WaIcon /> WhatsApp</a>}
            <button type="button" className="td-pill td-pill-solid" onClick={() => setSheet(next)}>{next.status === 'bekliyor' ? 'Onayla' : 'İşlemler'}</button>
          </div>
        </section>
      )}

      {rem && rem.items.length > 0 && (
        <Link to="/panel/hatirlatmalar" className={`td-nudge ${remLeft ? '' : 'is-done'}`}>
          <span className="td-nudge-ic" aria-hidden="true">{remLeft ? '📲' : '✓'}</span>
          <span className="td-nudge-text">
            <b>Yarın {rem.items.length} randevu var</b>
            <span>{remLeft ? `${remLeft} kişiye hatırlatma gönderilmedi · 1 dakikalık iş` : 'Hepsine hatırlatma gönderildi'}</span>
          </span>
          <span className="td-chev" aria-hidden="true">›</span>
        </Link>
      )}

      {appts.forms.length > 0 && (
        <section>
          <div className="td-sec"><b>Bugün · {items.length} randevu</b><Link to="/panel/takvim">Takvim</Link></div>
          {!items.length ? (
            <div className="td-empty">
              <span aria-hidden="true">🗓️</span>
              <b>Bugün randevu yok</b>
              <span>Linkini paylaş; yeni randevu gelince burada ve telefonunda görünür.</span>
              {forms[0] && <button type="button" className="btn btn-primary" onClick={() => setSharing(randevuForms[0] || forms[0])}>🔗 Linki paylaş</button>}
            </div>
          ) : (
            <div className="td-list">
              {items.map((a) => (
                <button type="button" key={a.id} className={`td-row ${timeToMin(a.end) <= nowMin ? 'is-past' : ''} ${next?.id === a.id ? 'is-next' : ''}`} onClick={() => setSheet(a)}>
                  <span className="td-time">{a.start}<small>{a.end}</small></span>
                  <span className="td-who">
                    <b>{a.name || 'İsimsiz'}</b>
                    <span>{[a.service, a.resource, multi ? bizOf(a.formId) : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  {SHORT[a.status] && <span className={`td-chip td-${TONE[a.status]}`}>{SHORT[a.status]}</span>}
                  <span className="td-chev" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {newToday.length > 0 && (
        <section>
          <div className="td-sec"><b>Bugün gelen kayıtlar</b></div>
          <div className="td-list">
            {newToday.map((f) => (
              <Link key={f.id} to={`/panel/formlar/${f.id}/kayitlar`} className="td-row">
                <span className="td-dot" aria-hidden="true" />
                <span className="td-who"><b>{f.todayCount} yeni kayıt</b><span>{[f.isletme, f.name].filter(Boolean).join(' · ')}</span></span>
                <span className="td-chev" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!forms.length && (
        <div className="td-empty">
          <span aria-hidden="true">👋</span>
          <b>Hoş geldiniz</b>
          <span>Size henüz bir form atanmadı. Batilmer ekibi formunuzu hazırlayınca burada görünecek.</span>
        </div>
      )}

      {randevuForms.length > 0 && (
        <button type="button" className="td-fab" aria-label="Randevu ekle" onClick={addAppt}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>Randevu ekle</span>
        </button>
      )}

      {sheet && <ApptSheet appt={sheet} isletme={multi ? bizOf(sheet.formId) : ''} onClose={() => setSheet(null)} onDone={load} />}
      {sharing && <ShareFormModal form={sharing} onClose={() => setSharing(null)} />}
      {picking && (
        <Modal title="Hangi işletmeye randevu?" onClose={() => setPicking(false)}>
          <div className="td-list">
            {randevuForms.map((f) => (
              <button type="button" key={f.id} className="td-row" onClick={() => navigate(`/panel/formlar/${f.id}/randevular?yeni=1`)}>
                <span className="td-who"><b>{f.isletme || f.name}</b><span>{f.name}</span></span>
                <span className="td-chev" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
