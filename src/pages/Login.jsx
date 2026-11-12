import { useEffect, useState } from 'react';
import { EXPIRED_KEY, useAuth } from '../auth.jsx';
import * as api from '../lib/api.js';
import { Link, navigate } from '../router.jsx';
import { Field, PasswordInput, useToast } from '../components/ui.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { Logo } from '../components/Logo.jsx';

const FEATURES = [
  ['Randevu ve kayıt formları', 'Her sektöre hazır şablonlar, sitenize tek satırla eklenir.'],
  ['Anında bildirim', 'Yeni randevu telefonunuza saniyeler içinde düşer.'],
  ['Güvenli', 'İki adımlı doğrulama, form bazında yetki, kişisel veri korumalı.']
];

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <ThemeToggle className="auth-theme" />
      <aside className="auth-hero" aria-hidden="true">
        <div className="auth-hero-inner">
          <div className="auth-hero-brand"><Logo size={40} /><span>batilmer</span></div>
          <h2>Randevularınız ve kayıtlarınız<br />tek panelde.</h2>
          <ul>
            {FEATURES.map(([t, d]) => (
              <li key={t}><b>{t}</b><span>{d}</span></li>
            ))}
          </ul>
          <div className="auth-hero-card">
            <div className="ahc-dot" />
            <div><b>Yeni randevu</b><span>Per 14 Kas 14:30 · Muayene</span></div>
            <small>şimdi</small>
          </div>
        </div>
      </aside>
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={44} />
          <div>
            <div className="wordmark">batilmer</div>
            <div className="wordmark-sub">FORM PANELİ</div>
          </div>
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default function Login() {
  const { login, loginTotp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [mailEnabled, setMailEnabled] = useState(true);
  const [expired] = useState(() => {
    try {
      const v = sessionStorage.getItem(EXPIRED_KEY);
      sessionStorage.removeItem(EXPIRED_KEY);
      return !!v;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api.publicConfig().then((c) => setMailEnabled(!!c?.mailEnabled)).catch(() => {});
  }, []);

  const go = (u) => navigate(u.mustChange ? '/panel/sifre' : u.twofaSetupRequired ? '/panel/guvenlik' : '/panel');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (forgot) {
        await api.requestPasswordReset(email);
        setSent(true);
      } else if (ticket) {
        go(await loginTotp(ticket, code));
      } else {
        const r = await login(email, password);
        if (r?.twofa) {
          setTicket(r.ticket);
          setCode('');
        } else go(r);
      }
    } catch (err) {
      if (err.code === 'bilet') {
        setTicket(null);
        setPassword('');
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (forgot) {
    return (
      <AuthCard title="Şifremi unuttum" subtitle={mailEnabled ? 'E-posta adresinizi yazın, size şifre sıfırlama bağlantısı gönderelim.' : undefined}>
        {!mailEnabled ? (
          <div className="notice notice-info">
            Şifrenizi unuttuysanız <b>panel yöneticinize</b> başvurun. Yönetici, Kullanıcılar ekranından size yeni bir geçici şifre verir; ilk girişte kendi şifrenizi belirlersiniz.
          </div>
        ) : sent ? (
          <div className="notice notice-ok">Hesap kayıtlıysa sıfırlama bağlantısı e-posta adresinize gönderildi.</div>
        ) : (
          <form onSubmit={submit} className="stack">
            <Field label="E-posta" htmlFor="fe">
              <input id="fe" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <div className="notice notice-err">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>Bağlantı gönder</button>
          </form>
        )}
        <button type="button" className="link-sm mt" onClick={() => { setForgot(false); setSent(false); }}>← Girişe dön</button>
      </AuthCard>
    );
  }

  if (ticket) {
    return (
      <AuthCard title="Doğrulama kodu" subtitle={useBackup ? 'Yedek kodlarınızdan birini girin (örnek: k7m2-p9qx). Her kod bir kez kullanılabilir.' : 'Telefonunuzdaki Authenticator uygulamasında görünen 6 haneli kodu girin.'}>
        <form onSubmit={submit} className="stack">
          <Field label={useBackup ? 'Yedek kod' : 'Kod'} htmlFor="tc">
            {useBackup ? (
              <input id="tc" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
            ) : (
              <input id="tc" required className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ''))} />
            )}
          </Field>
          {error && <div className="notice notice-err" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Kontrol ediliyor…' : 'Giriş yap'}</button>
        </form>
        <button type="button" className="link-sm mt" onClick={() => { setUseBackup((b) => !b); setCode(''); setError(''); }}>
          {useBackup ? 'Authenticator koduyla gir' : 'Telefonum yanımda değil – yedek kod kullan'}
        </button>
        <button type="button" className="link-sm mt" onClick={() => { setTicket(null); setPassword(''); setError(''); }}>← Girişe dön</button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Giriş yap" subtitle="Formlarınızı ve kayıtlarınızı yönetmek için giriş yapın.">
      {expired && <div className="notice notice-warn mb">Güvenliğiniz için oturumunuz kapatıldı (2 saat işlem yapılmadı ya da 12 saatlik süre doldu). Lütfen tekrar giriş yapın.</div>}
      <form onSubmit={submit} className="stack">
        <Field label="E-posta" htmlFor="le">
          <input id="le" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Şifre" htmlFor="lp">
          <PasswordInput id="lp" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </form>
      <button type="button" className="link-sm mt" onClick={() => setForgot(true)}>Şifremi unuttum</button>
    </AuthCard>
  );
}

function PasswordRules() {
  return <div className="pf-hint">En az 8 karakter; büyük harf, küçük harf ve rakam içermeli.</div>;
}

export function ChangePassword() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [oldPw, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pw !== pw2) return setError('Yeni şifreler eşleşmiyor.');
    try {
      await api.changePassword(oldPw, pw);
      await refresh();
      toast('Şifreniz değiştirildi.');
      navigate(user?.twofaSetupRequired ? '/panel/guvenlik' : '/panel');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page narrow-page">
      <h1>Şifre değiştir</h1>
      {user?.mustChange && <div className="notice notice-warn">Güvenliğiniz için ilk girişte şifrenizi değiştirmeniz gerekiyor.</div>}
      <form className="card stack" onSubmit={submit}>
        <Field label="Mevcut şifre" htmlFor="op">
          <PasswordInput id="op" required autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} />
        </Field>
        <Field label="Yeni şifre" htmlFor="np">
          <PasswordInput id="np" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <PasswordRules />
        </Field>
        <Field label="Yeni şifre (tekrar)" htmlFor="np2">
          <PasswordInput id="np2" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        {error && <div className="notice notice-err" role="alert">{error}</div>}
        <div><button className="btn btn-primary">Şifreyi kaydet</button></div>
      </form>
    </div>
  );
}

export function ResetPassword({ token }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pw !== pw2) return setError('Şifreler eşleşmiyor.');
    try {
      await api.resetPassword(token, pw);
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthCard title="Yeni şifre belirle">
      {done ? (
        <>
          <div className="notice notice-ok">Şifreniz güncellendi.</div>
          <Link to="/giris" className="btn btn-primary btn-block mt">Giriş yap</Link>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <Field label="Yeni şifre" htmlFor="rp">
            <PasswordInput id="rp" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <PasswordRules />
          </Field>
          <Field label="Yeni şifre (tekrar)" htmlFor="rp2">
            <PasswordInput id="rp2" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          {error && <div className="notice notice-err" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block">Şifreyi kaydet</button>
        </form>
      )}
    </AuthCard>
  );
}
