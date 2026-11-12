import { useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link, navigate } from '../router.jsx';
import { Badge, Empty, Field, Modal, Spinner, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import { TEMPLATES } from '../lib/templates.js';
import { formatDateTime, slugify, formBaseUrl } from '../lib/util.js';

function StatusBadge({ f }) {
  if (!f.publishedAt) return <Badge tone="gray">Yayınlanmadı</Badge>;
  if (f.control.status !== 'aktif') return <Badge tone="gray">Pasif</Badge>;
  return <Badge tone="green">Yayında</Badge>;
}

function NewFormModal({ onClose }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [isletme, setIsletme] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [templateId, setTemplateId] = useState('iletisim');
  const [error, setError] = useState('');
  const autoSlug = slugify(`${isletme} ${name}`);
  const finalSlug = slugTouched ? slug : autoSlug;

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const id = await api.createForm({ name, isletme, slug: finalSlug, templateId });
      toast('Form oluşturuldu.');
      navigate(`/panel/formlar/${id}/duzenle`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Yeni form" onClose={onClose} wide>
      <form onSubmit={submit} className="stack" id="new-form">
        <div className="grid-2">
          <Field label="İşletme adı" htmlFor="nf-i" hint="Örnek: Vital Veteriner">
            <input id="nf-i" value={isletme} onChange={(e) => setIsletme(e.target.value)} />
          </Field>
          <Field label="Form adı" htmlFor="nf-n" hint="Örnek: Randevu formu">
            <input id="nf-n" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label="Form linki" htmlFor="nf-s" hint="Linki sonradan sadece Ana Admin değiştirebilir; değişirse sitelere gömülen formlar bozulur.">
          <div className="input-prefix">
            <span>{formBaseUrl().replace(/^https?:\/\//, '')}/f/</span>
            <input id="nf-s" value={finalSlug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
          </div>
        </Field>
        <div>
          <div className="pf-label">Şablon</div>
          <div className="template-grid" role="radiogroup" aria-label="Şablon">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.id} role="radio" aria-checked={templateId === t.id} className={`template ${templateId === t.id ? 'is-on' : ''}`} onClick={() => setTemplateId(t.id)}>
                <span className="template-sector">{t.sector}</span>
                <span className="template-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn btn-primary">Oluştur ve düzenle</button>
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
          <p className="muted">{isAdmin ? 'Tüm formlar' : 'Yetkili olduğunuz formlar'}</p>
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
                <div>
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
                <Link to={`/panel/formlar/${f.id}/kayitlar`} className="btn btn-sm">Kayıtlar</Link>
                <Link to={`/panel/formlar/${f.id}/istatistik`} className="btn btn-sm btn-ghost">İstatistik</Link>
                {f.hasRandevu && f.perms.randevu && <Link to={`/panel/formlar/${f.id}/randevular`} className="btn btn-sm">Randevular</Link>}
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
    </div>
  );
}
