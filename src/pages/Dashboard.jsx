import { useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link, navigate } from '../router.jsx';
import { Empty, Field, Modal, Spinner, useAsync, useToast } from '../components/ui.jsx';
import { TEMPLATES, TEMPLATE_SECTORS } from '../lib/templates.js';
import StylePicker from '../components/StylePicker.jsx';
import { slugify, formBaseUrl } from '../lib/util.js';

const APPT_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };

export const monogram = (f) => (f.isletme || f.name || '?').trim().slice(0, 1).toLocaleUpperCase('tr');


const NF_STEPS = ['Bilgiler', 'Şablon', 'Tasarım'];

function NewFormModal({ onClose }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [isletme, setIsletme] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [showSlug, setShowSlug] = useState(false);
  const [templateId, setTemplateId] = useState('iletisim');
  const [sector, setSector] = useState('');
  const [error, setError] = useState('');
  const [tq, setTq] = useState('');
  const [styleId, setStyleId] = useState('yuzen');
  const [busy, setBusy] = useState(false);
  const autoSlug = slugify(`${isletme} ${name}`);
  const finalSlug = slugTouched ? slug : autoSlug;
  const tpl = TEMPLATES.find((t) => t.id === templateId);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (step === 0 && !name.trim()) return setError('Form adını yazın.');
    if (step < 2) return setStep(step + 1);
    setBusy(true);
    try {
      const id = await api.createForm({ name, isletme, slug: finalSlug, templateId, styleId });
      toast('Form oluşturuldu.');
      navigate(`/panel/formlar/${id}/duzenle`);
    } catch (err) {
      setError(err.message);
      if (/link|adres|slug/i.test(err.message)) { setStep(0); setShowSlug(true); }
    } finally {
      setBusy(false);
    }
  }

  const q = tq.toLocaleLowerCase('tr');
  const shown = TEMPLATES.filter((t) => (!sector || t.sector === sector) && (!q || `${t.sector} ${t.name}`.toLocaleLowerCase('tr').includes(q)));

  return (
    <Modal title="Yeni form" onClose={onClose} wide>
      <form onSubmit={submit} className="nf" id="new-form">
        <ol className="nf-steps" aria-label="Adımlar">
          {NF_STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-on' : i < step ? 'is-done' : ''}>
              <button type="button" disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="nf-dot">{i < step ? '✓' : i + 1}</span>
                <span className="nf-step-name">{s}</span>
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="nf-body stack">
            <div className="nf-lead">
              <h3>Formunuza bir ad verin</h3>
              <p className="muted">Müşterileriniz bu adı görmez; panelde formu bulmanız için.</p>
            </div>
            <Field label="İşletme adı" htmlFor="nf-i" hint="Örnek: Vital Veteriner, Kuaför Ali, Mavi Kafe">
              <input id="nf-i" autoFocus value={isletme} onChange={(e) => setIsletme(e.target.value)} />
            </Field>
            <Field label="Form adı" htmlFor="nf-n" hint="Örnek: Randevu formu">
              <input id="nf-n" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {!showSlug ? (
              <div className="nf-slug-peek">
                <span className="muted small">Link:</span> <code>/f/{finalSlug || '…'}</code>
                <button type="button" className="nf-link" onClick={() => setShowSlug(true)}>Değiştir</button>
              </div>
            ) : (
              <Field label="Form linki" htmlFor="nf-s" hint="Linki sonradan sadece Ana Admin değiştirebilir; değişirse sitelere gömülen formlar bozulur.">
                <div className="input-prefix">
                  <span>{formBaseUrl().replace(/^https?:\/\//, '')}/f/</span>
                  <input id="nf-s" value={finalSlug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
                </div>
              </Field>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="nf-body stack">
            <div className="nf-lead">
              <h3>Hangi işe göre hazırlayalım?</h3>
              <p className="muted">Şablon alanları hazır getirir; sonradan her şey değiştirilebilir.</p>
            </div>
            <div className="nf-filter">
              <div className="nf-chips" role="tablist" aria-label="Sektör">
                <button type="button" role="tab" aria-selected={!sector} className={`nf-chip ${!sector ? 'is-on' : ''}`} onClick={() => setSector('')}>Tümü</button>
                {TEMPLATE_SECTORS.map((s) => (
                  <button type="button" role="tab" key={s} aria-selected={sector === s} className={`nf-chip ${sector === s ? 'is-on' : ''}`} onClick={() => setSector(s)}>{s}</button>
                ))}
              </div>
              <input className="search" type="search" placeholder="Ara…" aria-label="Şablon ara" value={tq} onChange={(e) => setTq(e.target.value)} />
            </div>
            <div className="template-grid nf-templates" role="radiogroup" aria-label="Şablon">
              {shown.map((t) => (
                <button type="button" key={t.id} role="radio" aria-checked={templateId === t.id} className={`template ${templateId === t.id ? 'is-on' : ''}`} onClick={() => setTemplateId(t.id)}>
                  <span className="template-name">{t.name}</span>
                  <span className="template-sector">{t.sector} · {t.fields().some((f) => f.type === 'randevu') ? 'Randevulu' : 'Bilgi toplama'}</span>
                </button>
              ))}
              {!shown.length && <div className="muted small">Eşleşen şablon yok. "Boş form" ile başlayabilirsiniz.</div>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="nf-body stack">
            <div className="nf-lead">
              <h3>Bir tasarım seçin</h3>
              <p className="muted">Sonradan Görünüm sekmesinden tek tıkla değiştirebilirsiniz.</p>
            </div>
            <StylePicker value={styleId} onChange={setStyleId} />
          </div>
        )}

        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <div className="nf-foot">
          <span className="muted small nf-summary">
            {step > 0 && <>{isletme || name}{tpl ? ` · ${tpl.name}` : ''}</>}
          </span>
          <div className="row">
            {step === 0 ? (
              <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
            ) : (
              <button type="button" className="btn" onClick={() => { setError(''); setStep(step - 1); }}>← Geri</button>
            )}
            <button className="btn btn-primary" disabled={busy}>{step < 2 ? 'Devam →' : busy ? 'Oluşturuluyor…' : 'Oluştur ve düzenle'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Form satırının rengi: işletme adına göre hep aynı renk
const PALETTE = ['#2f5bea', '#0f766e', '#db2777', '#7c3aed', '#ea580c', '#0891b2', '#475569', '#16a34a', '#b45309', '#9333ea'];
export const formColor = (f) => {
  const s = String(f.isletme || f.name || '');
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
export const formLive = (f) => !!f.publishedAt && f.control?.status === 'aktif';

function summary(f) {
  const parts = [];
  if (f.hasRandevu && f.upcomingAppointments) parts.push(`${f.upcomingAppointments} yaklaşan randevu`);
  if (f.todayCount) parts.push(`bugün ${f.todayCount} kayıt`);
  else if (f.total) parts.push(`${f.total} kayıt`);
  return parts.join(' · ') || 'Henüz kayıt yok';
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { data: forms, loading } = useAsync(() => api.listForms(), []);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const list = (forms || []).filter((f) => `${f.name} ${f.isletme} ${f.slug}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));

  return (
    <div className="page fl">
      <div className="fl-head">
        <h1>Formlar</h1>
        {isAdmin && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>+ Yeni form</button>}
      </div>
      {(forms?.length || 0) > 4 && <input className="fl-search" type="search" placeholder="🔍  Form veya işletme ara" aria-label="Form ara" value={q} onChange={(e) => setQ(e.target.value)} />}

      {loading && !forms ? (
        <Spinner />
      ) : !list.length ? (
        <Empty title={forms?.length ? 'Aramaya uyan form yok' : 'Henüz form yok'}>
          {isAdmin ? 'Yeni form düğmesiyle bir şablondan başlayın.' : 'Formunuz hazırlanınca burada görünecek.'}
        </Empty>
      ) : (
        <div className="td-list">
          {list.map((f) => (
            <Link key={f.id} to={`/panel/formlar/${f.id}`} className="td-row fl-row">
              <span className="fl-mono" style={{ background: formColor(f) }} aria-hidden="true">{monogram(f)}</span>
              <span className="td-who">
                <b>{f.isletme || f.name}</b>
                <span>{f.isletme ? `${f.name} · ` : ''}{summary(f)}</span>
              </span>
              <span className={`fl-dot ${formLive(f) ? 'is-on' : ''}`} title={formLive(f) ? 'Yayında' : 'Kapalı'} aria-label={formLive(f) ? 'Yayında' : 'Kapalı'} />
              <span className="td-chev" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}
      {creating && <NewFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
