import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Badge, Empty, Field, Modal, Spinner, Toggle, copyText, useAsync, useConfirm, useToast } from '../components/ui.jsx';
import { formatDateTime } from '../lib/util.js';
import { useAuth } from '../auth.jsx';

// [anahtar, tam ad, tablo başlığı]
const PERMS = [
  ['view', 'Kayıtları görüntüle', 'Görüntüle'],
  ['excel', 'Excel indir', 'Excel'],
  ['delete', 'Kayıt sil', 'Sil'],
  ['edit', 'Formu düzenle', 'Düzenle'],
  ['randevu', 'Randevuları yönet', 'Randevular'],
  ['notify', 'Bildirim', 'Bildirim 🔔']
];

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPRSTUVYZabcdefghijkmnprstuvyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(10));
  let s = Array.from(arr, (n) => chars[n % chars.length]).join('');
  return s.slice(0, 4) + 'A' + s.slice(4, 7) + 'k' + '7' + s.slice(7);
}

function UserModal({ user, onClose, onDone }) {
  const toast = useToast();
  const isNew = !user;
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState(isNew ? genPassword() : '');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (isNew) {
        await api.createUser({ name, email, password, role });
        toast('Kullanıcı eklendi. Geçici şifreyi kullanıcıya iletin.');
      } else {
        await api.updateUser(user.id, { name, email, active });
        if (password) await api.adminSetPassword(user.id, password);
        toast('Kullanıcı güncellendi.');
      }
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={isNew ? 'Yeni kullanıcı' : 'Kullanıcıyı düzenle'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Ad Soyad" htmlFor="um-n"><input id="um-n" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-posta (giriş adı)" htmlFor="um-e"><input id="um-e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={isNew ? 'Geçici şifre' : 'Yeni geçici şifre (boş = değişmesin)'} htmlFor="um-p" hint="Kullanıcı ilk girişte şifresini değiştirmek zorunda kalır.">
          <div className="copy-row">
            <input id="um-p" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <button type="button" className="btn btn-sm" onClick={() => setPassword(genPassword())}>Üret</button>
            <button type="button" className="btn btn-sm" disabled={!password} onClick={async () => toast((await copyText(password)) ? 'Kopyalandı.' : 'Kopyalanamadı.')}>Kopyala</button>
          </div>
        </Field>
        {isNew && (
          <Field label="Hesap türü" hint={role === 'admin' ? 'Ana Admin tüm formları, kullanıcıları ve ayarları yönetir. İlk girişte Authenticator kurması zorunludur.' : 'Sadece yetki verdiğiniz formları görür.'}>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">Kullanıcı (işletme çalışanı)</option>
              <option value="admin">Ana Admin (Batilmer ekibi)</option>
            </select>
          </Field>
        )}
        {!isNew && <Toggle id="um-a" checked={active} onChange={setActive} label={active ? 'Aktif (giriş yapabilir)' : 'Pasif (giriş yapamaz)'} />}
        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <div className="row-end"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary">{isNew ? 'Ekle' : 'Kaydet'}</button></div>
      </form>
    </Modal>
  );
}

function PermissionMatrix({ user, forms }) {
  const toast = useToast();
  const [perms, setPerms] = useState(null);
  useEffect(() => {
    api.getUserPermissions(user.id).then(setPerms);
  }, [user.id]);

  async function toggle(formId, key, value) {
    const current = perms[formId] || {};
    const next = { ...current, [key]: value };
    if (user.role !== 'admin') {
      if (key !== 'view' && value) next.view = true; // diğer yetkiler görüntülemeyi gerektirir
      if (key === 'view' && !value) Object.keys(next).forEach((k) => (next[k] = false));
    }
    setPerms((p) => ({ ...p, [formId]: next })); // anında göster
    try {
      const saved = await api.setPermission(user.id, formId, next);
      setPerms((p) => ({ ...p, [formId]: saved }));
      toast('Yetki kaydedildi.');
    } catch (e) {
      setPerms((p) => ({ ...p, [formId]: current }));
      toast(e.message, 'err');
    }
  }

  if (!perms) return <Spinner />;
  if (!forms.length) return <Empty title="Henüz form yok" />;
  if (user.role === 'admin') {
    return (
      <div className="stack">
        <div className="notice notice-info">Ana Admin tüm formlarda tüm yetkilere sahiptir. <b>Bildirimler varsayılan olarak kapalıdır</b>; sadece aşağıda tik atılan formlardan bildirim alır (100 formun bildirimi size yağmasın diye).</div>
        <div className="table-wrap">
          <table className="tbl perm-table">
            <thead><tr><th>Form</th><th className="center">Bildirim</th></tr></thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.name}</b><div className="muted small">{f.isletme}</div></td>
                  <td className="center"><input type="checkbox" aria-label={`${f.name}: Bildirim`} checked={!!perms[f.id]?.notify} onChange={(e) => toggle(f.id, 'notify', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="tbl perm-table">
        <thead>
          <tr>
            <th>Form</th>
            {PERMS.map(([k, label, short]) => <th key={k} className="center" title={label}>{short}</th>)}
          </tr>
        </thead>
        <tbody>
          {forms.map((f) => {
            const p = perms[f.id] || {};
            return (
              <tr key={f.id}>
                <td><b>{f.name}</b><div className="muted small">{f.isletme}</div></td>
                {PERMS.map(([k, label]) => (
                  <td key={k} className="center">
                    <input type="checkbox" aria-label={`${f.name}: ${label}`} checked={!!p[k]} disabled={k === 'randevu' && !f.hasRandevu && !p[k]} onChange={(e) => toggle(f.id, k, e.target.checked)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small mt-sm"><b>Bildirim:</b> o formda yeni kayıt/randevu olunca kişiye panelde sesli uyarı ve telefon bildirimi gider (randevu bildirimi için "Randevuları yönet" de açık olmalı). Kişi telefonunda bir kez "İzin ver" demeli; tiki kaldırdığınız anda bildirimler durur.<br />"Kayıtları görüntüle" kapatılırsa o formdaki diğer yetkiler de kapanır. "Formu düzenle" ile kullanıcı alanları, seçenekleri ve görünümü değiştirebilir; form silme, link değiştirme, KVKK ayarları ve yetki verme yalnızca Ana Admin'dedir.</p>
    </div>
  );
}

function NotifyStatus({ u }) {
  if (!u.notifyFormCount) return null;
  if (!u.notifyEnabled) return <Badge tone="gray">Bildirimlerini kapatmış</Badge>;
  return u.pushDevices ? <Badge tone="green">Bildirim: {u.pushDevices} cihazda açık</Badge> : <Badge tone="amber">Bildirim: telefonda henüz açılmadı</Badge>;
}

export default function Users() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: users, reload } = useAsync(() => api.listUsers(), []);
  const { data: forms } = useAsync(() => api.listForms(), []);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);

  const sel = users?.find((u) => u.id === selected) || users?.find((u) => u.role !== 'admin') || users?.[0];

  async function resetTotp(u) {
    const ok = await confirm({ title: 'İki adımlı doğrulamayı sıfırla', message: `${u.name} telefonunu kaybettiyse ya da değiştirdiyse kullanın. Tüm oturumları kapanır; bir sonraki girişte Authenticator'ı yeniden kurması ${u.role === 'admin' ? 'gerekir' : 'istenmez (isteğe bağlı)'}.`, confirmText: 'Sıfırla', danger: true });
    if (!ok) return;
    try {
      await api.adminResetTotp(u.id);
      toast('İki adımlı doğrulama sıfırlandı.');
      reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function remove(u) {
    const ok = await confirm({ title: 'Kullanıcıyı sil', message: `${u.name} silinecek ve tüm oturumları kapanacak. Çöp kutusundan geri alınabilir.`, confirmText: 'Sil', danger: true });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
    } catch (e) {
      return toast(e.message, 'err');
    }
    toast('Kullanıcı silindi.');
    setSelected(null);
    reload();
  }

  if (!users || !forms) return <div className="page"><Spinner /></div>;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Kullanıcılar ve yetkiler</h1>
          <p className="muted">Kullanıcı ekleyin, sonra form bazında yetki verin.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ user: null })}>+ Yeni kullanıcı</button>
      </div>
      <div className="users-layout">
        <div className="card user-list">
          {users.map((u) => (
            <button key={u.id} type="button" className={`user-row ${sel?.id === u.id ? 'is-on' : ''}`} onClick={() => setSelected(u.id)}>
              <div className="avatar" aria-hidden="true">{u.name.slice(0, 1)}</div>
              <div className="user-row-text">
                <b>{u.name}</b>
                <span>{u.email}</span>
              </div>
              {u.role === 'admin' ? <Badge tone="blue">Ana Admin</Badge> : !u.active ? <Badge tone="gray">Pasif</Badge> : <Badge tone="gray">{u.formCount} form</Badge>}
            </button>
          ))}
        </div>
        {sel && (
          <div className="card stack">
            <div className="row-between">
              <div>
                <h2>{sel.name}</h2>
                <div className="muted small">{sel.email} · Eklenme: {formatDateTime(sel.createdAt)}{sel.mustChange ? ' · İlk girişte şifre değiştirecek' : ''}</div>
                <div className="row mt-sm">
                  {sel.twofaEnabled ? <Badge tone="green">Authenticator açık</Badge> : <Badge tone={sel.role === 'admin' ? 'amber' : 'gray'}>{sel.role === 'admin' ? 'Authenticator kurulmadı (ilk girişte zorunlu)' : 'Authenticator kapalı'}</Badge>}
                  <NotifyStatus u={sel} />
                </div>
              </div>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => setModal({ user: sel })}>Düzenle</button>
                {sel.twofaEnabled && sel.id !== me?.id && <button type="button" className="btn btn-sm" onClick={() => resetTotp(sel)}>2FA sıfırla</button>}
                {sel.id !== me?.id && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => remove(sel)}>Sil</button>}
              </div>
            </div>
            <h3>{sel.role === 'admin' ? 'Bildirim alacağı formlar' : 'Form yetkileri'}</h3>
            <PermissionMatrix user={sel} forms={forms} />
          </div>
        )}
      </div>
      {modal && <UserModal user={modal.user} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}
