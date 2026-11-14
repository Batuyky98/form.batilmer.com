import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link, navigate } from '../router.jsx';
import { Badge, Empty, Field, Modal, Spinner, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import { TEMPLATES, TEMPLATE_SECTORS } from '../lib/templates.js';
import StylePicker from '../components/StylePicker.jsx';
import ShareFormModal from '../components/ShareForm.jsx';
import { formatDateTime, slugify, formBaseUrl } from '../lib/util.js';

const APPT_TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };

const monogram = (f) => (f.isletme || f.name || '?').trim().slice(0, 1).toLocaleUpperCase('tr');

function StatusBadge({ f }) {
  if (!f.publishedAt) return <Badge tone="gray">Yayınlanmadı</Badge>;
  if (f.control.status !== 'aktif') return <Badge tone="gray">Pasif</Badge>;
  return <Badge tone="green">Yayında</Badge>;
}

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

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: forms, loading, reload } = useAsync(() => api.listForms(), []);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [q, setQ] = useState('');

  const list = (forms || []).filter((f) => `${f.name} ${f.isletme} ${f.slug}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));

  async function duplicate(f) {
    const id = await api.duplicateForm(f.id);
    toast('Form kopyalandı (pasif olarak).');
    navigate(`/panel/formlar/${id}/duzenle`);
  }
  async function remove(f) {
    const ok = await confirm({ title: 'Formu sil', message: `"${f.name}" çöp kutusuna taşınacak. Sitelere gömülü form çalışmayı durdurur. Çöp kutusundan geri alınabilir.`, confirmText: 'Çöp kutusuna taşı', danger: true });
    if (!ok) return;
    await api.deleteForm(f.id);
    toast('Form çöp kutusuna taşındı.');
    reload();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Formlar</h1>
          <p className="muted small">{isAdmin ? 'Tüm formlar' : 'Yetkili olduğunuz formlar'}</p>
        </div>
        <div className="row">
          <input className="search" type="search" placeholder="Form ara…" aria-label="Form ara" value={q} onChange={(e) => setQ(e.target.value)} />
          {isAdmin && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>+ Yeni form</button>}
        </div>
      </div>

      {loading && !forms ? (
        <Spinner />
      ) : !list.length ? (
        <Empty title={forms?.length ? 'Aramaya uyan form yok' : 'Henüz form yok'}>
          {isAdmin ? 'Yeni form butonuyla bir şablondan başlayın.' : 'Size bir form atandığında burada görünecek.'}
        </Empty>
      ) : (
        <div className="form-cards">
          {list.map((f) => (
            <article key={f.id} className="form-card">
              <div className="form-card-head">
                <span className="monogram" aria-hidden="true">{monogram(f)}</span>
                <div className="form-card-title">
                  <div className="eyebrow">{f.isletme || 'İşletme belirtilmedi'}</div>
                  <h2>{f.name}</h2>
                  <a className="slug" href={`/f/${f.slug}`} target="_blank" rel="noreferrer">/f/{f.slug} ↗</a>
                </div>
                <StatusBadge f={f} />
              </div>
              <div className="stats">
                <div><b>{f.total}</b><span>Toplam kayıt</span></div>
                <div><b>{f.todayCount}</b><span>Bugün</span></div>
                {f.hasRandevu && <div><b>{f.upcomingAppointments}</b><span>Yaklaşan randevu</span></div>}
              </div>
              {f.hasDraftChanges && f.perms.edit && <div className="draft-note">Yayınlanmamış değişiklikler var</div>}
              <div className="form-card-actions">
                <button type="button" className="btn btn-sm share-open" onClick={() => setSharing(f)}>🔗 Paylaş</button>
                <Link to={`/panel/formlar/${f.id}/kayitlar`} className="btn btn-sm">Kayıtlar</Link>
                <Link to={`/panel/formlar/${f.id}/istatistik`} className="btn btn-sm btn-ghost">İstatistik</Link>
                {f.hasRandevu && f.perms.randevu && <Link to={`/panel/formlar/${f.id}/randevular`} className="btn btn-sm btn-primary">Randevular</Link>}
                {f.perms.edit && <Link to={`/panel/formlar/${f.id}/duzenle`} className="btn btn-sm">Düzenle</Link>}
                {isAdmin && (
                  <>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => duplicate(f)}>Kopyala</button>
                    <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => remove(f)}>Sil</button>
                  </>
                )}
              </div>
              <div className="form-card-foot">Son güncelleme: {formatDateTime(f.updatedAt)}</div>
            </article>
          ))}
        </div>
      )}
      {creating && <NewFormModal onClose={() => setCreating(false)} />}
      {sharing && <ShareFormModal form={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
