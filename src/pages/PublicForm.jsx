import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import FormRenderer, { appearanceStyle } from '../components/FormRenderer.jsx';
import { Spinner } from '../components/ui.jsx';
import { t } from '../lib/i18n.js';

const isEmbedded = (() => {
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

export default function PublicForm({ slug }) {
  const [data, setData] = useState(undefined);
  useAutoHeight(slug);

  useEffect(() => {
    api.getPublicForm(slug).then((d) => {
      setData(d);
      if (d) {
        document.title = d.content.settings.title || d.name;
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

  const content = data.content;
  const a = content.appearance;

  if (!data.open) {
    return (
      <div className={`public-wrap ${isEmbedded ? 'embedded' : ''}`}>
        <div className={`bf bf-bg-${a.background} ${a.dark ? 'bf-dark' : ''} ${a.width === 'dar' ? 'bf-narrow' : ''}`} style={appearanceStyle(a)}>
          {a.titleOn === true && content.settings.title && <h2 className="bf-title">{content.settings.title}</h2>}
          <div className="bf-closed">{data.reason || t(data.lang, 'formClosed')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`public-wrap ${isEmbedded ? 'embedded' : ''}`}>
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
      {!isEmbedded && (
        <div className="public-foot">
          {data.isletme && <span>{data.isletme} · </span>}
          <span>Batilmer Form</span>
        </div>
      )}
    </div>
  );
}
