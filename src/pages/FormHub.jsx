import { useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link, navigate } from '../router.jsx';
import { Modal, Spinner, Toggle, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import ShareFormModal from '../components/ShareForm.jsx';
import { formColor, formLive, monogram } from './Dashboard.jsx';

// Forma dokununca açılan sayfa: o formla yapılabilecek her şey büyük kutucuklarla
export default function FormHub({ id }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: forms, error, reload } = useAsync(() => api.listForms(), [id]);
  const [sharing, setSharing] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <div className="page"><div className="notice notice-err">{error.message}</div></div>;
  if (!forms) return <div className="page"><Spinner /></div>;
  const f = forms.find((x) => x.id === id);
  if (!f) return <div className="page stack"><Link to="/panel/formlar" className="back">← Formlar</Link><div className="notice notice-err">Form bulunamadı ya da yetkiniz yok.</div></div>;
  const live = formLive(f);
  const base = `/panel/formlar/${f.id}`;

  async function setOpen(on) {
    if (!on && !(await confirm({ title: 'Form kapatılsın mı?', message: 'Kapalıyken müşteriler formu dolduramaz, randevu alamaz. İstediğiniz zaman tekrar açabilirsiniz.', confirmText: 'Kapat' }))) return;
    setBusy(true);
    try {
      await api.updateControl(f.id, { status: on ? 'aktif' : 'pasif' });
      toast(on ? 'Form açıldı.' : 'Form kapatıldı.');
      reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    const nid = await api.duplicateForm(f.id);
    toast('Form kopyalandı (kapalı olarak).');
    navigate(`/panel/formlar/${nid}/duzenle`);
  }
  async function remove() {
    const ok = await confirm({ title: 'Form silinsin mi?', message: `"${f.name}" çöp kutusuna taşınacak; sitelere gömülü form çalışmayı durdurur. Çöp kutusundan geri alınabilir.`, confirmText: 'Çöp kutusuna taşı', danger: true });
    if (!ok) return;
    await api.deleteForm(f.id);
    toast('Form çöp kutusuna taşındı.');
    navigate('/panel/formlar');
  }

  return (
    <div className="page fh">
      <Link to="/panel/formlar" className="back">← Formlar</Link>
      <header className="fh-head">
        <span className="fl-mono fl-mono-lg" style={{ background: formColor(f) }} aria-hidden="true">{monogram(f)}</span>
        <div>
          {f.isletme && <div className="fh-biz">{f.isletme}</div>}
          <h1>{f.name}</h1>
        </div>
      </header>

      <div className="fh-tiles">
        {f.hasRandevu && f.perms.randevu && (
          <Link to={`${base}/randevular`} className="fh-tile fh-tile-main">
            <span className="fh-ic" aria-hidden="true">🗓️</span>
            <span className="fh-t"><b>Randevular</b><span>{f.upcomingAppointments ? `${f.upcomingAppointments} yaklaşan randevu` : 'Yaklaşan randevu yok'}</span></span>
            <span className="td-chev" aria-hidden="true">›</span>
          </Link>
        )}
        <Link to={`${base}/kayitlar`} className="fh-tile">
          <span className="fh-ic" aria-hidden="true">📥</span>
          <span className="fh-t"><b>Kayıtlar</b><span>{f.total ? `${f.total} kayıt${f.todayCount ? ` · bugün ${f.todayCount}` : ''}` : 'Henüz kayıt yok'}</span></span>
        </Link>
        <button type="button" className="fh-tile" onClick={() => setSharing(true)}>
          <span className="fh-ic" aria-hidden="true">🔗</span>
          <span className="fh-t"><b>Paylaş</b><span>Link · WhatsApp · QR</span></span>
        </button>
        {f.perms.edit && (
          <Link to={`${base}/duzenle`} className="fh-tile">
            <span className="fh-ic" aria-hidden="true">✏️</span>
            <span className="fh-t"><b>Düzenle</b><span>{f.hasDraftChanges ? 'Kaydedilmemiş değişiklik var' : 'Alanlar, görünüm, saatler'}</span></span>
          </Link>
        )}
        <Link to={`${base}/istatistik`} className="fh-tile">
          <span className="fh-ic" aria-hidden="true">📊</span>
          <span className="fh-t"><b>İstatistik</b><span>Kayıtlar gün gün</span></span>
        </Link>
      </div>

      <div className="td-list">
        <div className="td-row fh-row">
          <span className="td-who">
            <b>{live ? 'Form açık' : 'Form kapalı'}</b>
            <span>{!f.publishedAt ? 'Henüz yayınlanmadı' : live ? (f.hasRandevu ? 'Müşteriler randevu alabiliyor' : 'Müşteriler formu doldurabiliyor') : 'Müşteriler formu dolduramıyor'}</span>
          </span>
          {f.perms.edit && f.publishedAt ? <Toggle id="fh-open" disabled={busy} checked={live} onChange={setOpen} label="" /> : <span className={`fl-dot ${live ? 'is-on' : ''}`} />}
        </div>
        {isAdmin && (
          <button type="button" className="td-row" onClick={() => setMore(true)}>
            <span className="td-who"><b>Daha fazla</b><span>Kopyala, sil</span></span>
            <span className="td-chev" aria-hidden="true">›</span>
          </button>
        )}
      </div>

      {sharing && <ShareFormModal form={f} onClose={() => setSharing(false)} />}
      {more && (
        <Modal title="Daha fazla" onClose={() => setMore(false)}>
          <div className="as-links">
            <button type="button" onClick={() => { setMore(false); duplicate(); }}>Formu kopyala<span>›</span></button>
            <button type="button" className="as-danger" onClick={() => { setMore(false); remove(); }}>Formu sil<span>›</span></button>
          </div>
        </Modal>
      )}
    </div>
  );
}
