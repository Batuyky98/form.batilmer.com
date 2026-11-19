import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import FormRenderer, { appearanceStyle } from '../components/FormRenderer.jsx';
import { Spinner } from '../components/ui.jsx';
import { t } from '../lib/i18n.js';
import { directionsUrl, telUrl, whatsappUrl } from '../lib/shared.js';
import { WaIcon } from '../components/ContactButtons.jsx';

// Sohbet asistanının penceresinde açılan form (?asistan=1): kendi içinde kaydırılır, yükseklik bildirmez
const inAssistant = new URLSearchParams(window.location.search).get('asistan') === '1';
const isEmbedded = (() => {
  if (inAssistant) return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

// Sohbet asistanından gelindiyse: ?tarih=2026-11-17&saat=14:00&hizmet=svc_asi → randevu hazır seçili; ?yonet=1 → Randevumu yönet açık
function initialFromUrl(content) {
  const q = new URLSearchParams(window.location.search);
  const out = {};
  const rf = (content?.fields || []).find((f) => f.type === 'randevu');
  const date = q.get('tarih');
  const time = q.get('saat');
  const svc = (content?.randevu?.services || []).find((s) => s.id === q.get('hizmet'));
  if (rf && /^\d{4}-\d{2}-\d{2}$/.test(date || '') && /^\d{2}:\d{2}$/.test(time || '')) {
    out[rf.key] = { date, time, ...(svc ? { serviceId: svc.id } : {}) };
  } else if (rf && svc) {
    // Tekrar çağırma linki: sadece hizmet seçili gelir
    out[rf.key] = { serviceId: svc.id };
  }
  return { values: out, manage: q.get('yonet') === '1' };
}

function post(msg) {
  if (!isEmbedded) return;
  // Yükseklik bilgisi hassas değil; site adresini bilmediğimiz için '*' kullanılıyor.
  window.parent.postMessage(msg, '*');
}

function useAutoHeight(slug) {
  useEffect(() => {
    if (!isEmbedded) return;
    document.documentElement.classList.add('is-embedded');
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      if (h !== last) {
        last = h;
        post({ type: 'batilmer:height', height: h, slug });
      }
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    const onMsg = (e) => {
      if (e.data && e.data.type === 'batilmer:ping') {
        last = 0;
        send();
      }
    };
    window.addEventListener('message', onMsg);
    send();
    return () => {
      ro.disconnect();
      window.removeEventListener('message', onMsg);
    };
  }, [slug]);
}

// Link olarak açılınca (Instagram bio, WhatsApp, QR) form kendi başına duran bir sayfa olur:
// işletme adı + logo, yol tarifi / ara / WhatsApp düğmeleri, marka renginde zemin.
const standalone = !isEmbedded && !inAssistant;

function LinkHeader({ data }) {
  const c = data.content;
  const s = c.settings || {};
  const a = c.appearance || {};
  const lp = s.linkPage || {};
  const name = lp.title || data.isletme || s.title || data.name;
  const hasAppt = (c.fields || []).some((f) => f.type === 'randevu');
  const en = data.lang === 'en';
  const sub = lp.subtitle || s.description || (hasAppt ? (en ? 'Book online in seconds' : 'Online randevu alın, sıra beklemeyin') : en ? 'Online form' : 'Online başvuru');
  const btn = lp.buttons !== false;
  const dir = btn ? directionsUrl(s) : '';
  const tel = btn ? telUrl(s.kvkk?.contactPhone) : '';
  const wa = btn ? whatsappUrl(s.assistant?.whatsapp) : '';
  const showT = lp.showTitle !== false;
  const showS = lp.showSubtitle !== false;
  if (!a.logo && !showT && !showS && !dir && !tel && !wa) return null;
  return (
    <header className="lp-head">
      {a.logo && <div className="lp-logo"><img src={a.logo} alt={name} /></div>}
      {showT && <h1 className="lp-name">{name}</h1>}
      {showS && <p className="lp-sub">{sub}</p>}
      {(dir || tel || wa) && (
        <div className="lp-actions">
          {dir && <a href={dir} target="_blank" rel="noopener noreferrer">📍 {en ? 'Directions' : 'Yol tarifi'}</a>}
          {tel && <a href={tel}>📞 {en ? 'Call' : 'Ara'}</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="lp-wa"><WaIcon /> WhatsApp</a>}
        </div>
      )}
    </header>
  );
}

export default function PublicForm({ slug }) {
  const [data, setData] = useState(undefined);
  useAutoHeight(slug);

  useEffect(() => {
    api.getPublicForm(slug).then((d) => {
      setData(d);
      if (d) {
        const hasAppt = (d.content.fields || []).some((f) => f.type === 'randevu');
        const lpt = d.content.settings.linkPage?.title || d.isletme;
        document.title = lpt ? `${lpt} · ${hasAppt ? (d.lang === 'en' ? 'Book online' : 'Online randevu') : d.content.settings.title || d.name}` : d.content.settings.title || d.name;
        if (standalone) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', d.content.appearance?.primary || '#2F5BEA');
        document.documentElement.lang = d.lang || 'tr';
      }
    });
  }, [slug]);

  if (data === undefined) return <div className="public-wrap"><Spinner /></div>;
  if (data === null) {
    return (
      <div className={`public-wrap ${isEmbedded ? 'embedded' : ''}`}>
        <div className="bf bf-bg-beyaz"><div className="bf-closed">{t(navigator.language?.startsWith('tr') ? 'tr' : 'en', 'notFound')}</div></div>
      </div>
    );
  }

  // Bağımsız sayfada logo üst başlıkta durur (formda tekrar etmez), şeffaf zeminli form kart içine alınır
  const content = standalone
    ? { ...data.content, appearance: { ...data.content.appearance, logo: '', background: data.content.appearance.background === 'seffaf' ? 'beyaz' : data.content.appearance.background } }
    : data.content;
  const a = content.appearance;
  // Not: bileşen değil düz fonksiyon; her çizimde formun yeniden kurulmasını (state kaybını) önler
  const page = (children) =>
    standalone ? (
      <div className={`lp ${a.dark ? 'lp-dark' : ''}`} style={{ '--lp-primary': a.primary || '#2F5BEA' }}>
        <div className="lp-inner">
          <LinkHeader data={data} />
          {children}
          <a className="lp-foot" href="https://form.batilmer.com" target="_blank" rel="noopener noreferrer">Batilmer ile online randevu</a>
        </div>
      </div>
    ) : (
      children
    );

  if (!data.open) {
    return page(
      <div className={`public-wrap ${isEmbedded ? 'embedded' : ''} ${standalone ? 'lp-wrap' : ''}`}>
        <div className={`bf bf-bg-${a.background} ${a.dark ? 'bf-dark' : ''} ${a.width === 'dar' ? 'bf-narrow' : ''}`} style={appearanceStyle(a)}>
          {a.titleOn === true && content.settings.title && <h2 className="bf-title">{content.settings.title}</h2>}
          <div className="bf-closed">{data.reason || t(data.lang, 'formClosed')}</div>
        </div>
      </div>
    );
  }

  return page(
    <div className={`public-wrap ${isEmbedded ? 'embedded' : ''} ${standalone ? 'lp-wrap' : ''}`}>
      {inAssistant && (
        <button type="button" className="pf-back-chat" onClick={() => window.location.assign(`/asistan/${slug}`)}>← Sohbete dön</button>
      )}
      <FormRenderer
        content={content}
        turnstileKey={data.turnstileKey || ''}
        loadSlots={(p) => api.getAvailability(slug, p)}
        onSubmit={(values, meta) => api.submitForm(slug, values, meta)}
        findMine={(p) => api.findMyAppointments(slug, p)}
        joinWaitlist={(p) => api.joinWaitlist(slug, p)}
        initial={initialFromUrl(content)}
        cancelMine={(tok) => api.cancelByToken(tok)}
        onDone={(res) => {
          if (res?.afterSubmit === 'yonlendir' && res.redirectUrl && /^https?:\/\//.test(res.redirectUrl)) {
            if (isEmbedded) post({ type: 'batilmer:redirect', url: res.redirectUrl });
            else window.location.href = res.redirectUrl;
            return;
          }
          post({ type: 'batilmer:scroll' });
          if (!isEmbedded) window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {inAssistant && (
        <div className="public-foot">
          {data.isletme && <span>{data.isletme} · </span>}
          <span>Batilmer Form</span>
        </div>
      )}
    </div>
  );
}
