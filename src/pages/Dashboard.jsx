import { useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link, navigate } from '../router.jsx';
import { Badge, Empty, Field, Modal, Spinner, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import { TEMPLATES, TEMPLATE_SECTORS } from '../lib/templates.js';
import { formatDate, formatDateTime, nowMinutesTR, slugify, formBaseUrl, today, weekdayName } from '../lib/util.js';

function greeting() {
  const h = Math.floor(nowMinutesTR() / 60);
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

// "Dr. Ayşe Yılmaz" → "Ayşe" (Dr., Av., Prof., Uzm. gibi unvanlar atlanır)
const firstName = (n) => String(n || '').split(/\s+/).find((w) => w && !/\.$/.test(w)) || '';

const monogram = (f) => (f.isletme || f.name || '?').trim().slice(0, 1).toLocaleUpperCase('tr');

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
  const [tq, setTq] = useState('');
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
          <Field label="İşletme adı" htmlFor="nf-i" hint="Örnek: Vital Veteriner, Kuaför Ali, Mavi Kafe">
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
        <div className="stack-sm">
          <div className="row-between">
            <div className="pf-label">Şablon <span className="muted small">(sonradan her alan değiştirilebilir)</span></div>
            <input className="search" type="search" placeholder="Sektör ara…" aria-label="Şablon ara" value={tq} onChange={(e) => setTq(e.target.value)} />
          </div>
          {TEMPLATE_SECTORS.map((sector) => {
            const q = tq.toLocaleLowerCase('tr');
            const list = TEMPLATES.filter((t) => t.sector === sector && (!q || `${t.sector} ${t.name}`.toLocaleLowerCase('tr').includes(q)));
            if (!list.length) return null;
            return (
              <div key={sector}>
                <div className="template-group">{sector}</div>
                <div className="template-grid" role="radiogroup" aria-label={sector}>
                  {list.map((t) => (
                    <button type="button" key={t.id} role="radio" aria-checked={templateId === t.id} className={`template ${templateId === t.id ? 'is-on' : ''}`} onClick={() => setTemplateId(t.id)}>
                      <span className="template-name">{t.name}</span>
                      <span className="template-sector">{t.fields().some((f) => f.type === 'randevu') ? 'Randevu / rezervasyon' : 'Bilgi toplama'}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="pf-hint">Listede sektörünüz yoksa "Boş form" ya da "Genel iletişim formu" ile başlayın; randevu gerekiyorsa Alanlar'dan "Randevu" alanı ekleyin.</div>
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
  const { isAdmin, user } = useAuth();
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

  const sum = (k) => (forms || []).reduce((a, f) => a + (f[k] || 0), 0);
  const live = (forms || []).filter((f) => f.publishedAt && f.control.status === 'aktif').length;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-date">{weekdayName(today())}, {formatDate(today())}</span>
          <h1>{greeting()}, {firstName(user?.name) || 'hoş geldiniz'}</h1>
          <p>{forms ? (sum('todayCount') ? `Bugün ${sum('todayCount')} yeni kayıt geldi.` : 'Bugün henüz yeni kayıt yok.') : ' '}</p>
        </div>
        <div className="kpis">
          <div className="kpi"><b>{forms ? sum('todayCount') : '–'}</b><span>Bugünkü kayıt</span></div>
          <div className="kpi"><b>{forms ? sum('upcomingAppointments') : '–'}</b><span>Yaklaşan randevu</span></div>
          <div className="kpi"><b>{forms ? live : '–'}</b><span>Yayındaki form</span></div>
        </div>
      </section>

      <div className="page-head">
        <div>
          <h2 className="section-title">Formlar</h2>
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
    </div>
  );
}
