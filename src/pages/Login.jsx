import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import * as api from '../lib/api.js';
import { Link, navigate } from '../router.jsx';
import { Field, useToast } from '../components/ui.jsx';
import { Logo } from '../components/Logo.jsx';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-page">
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
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (forgot) {
        await api.requestPasswordReset(email);
        setSent(true);
      } else {
        const u = await login(email, password);
        navigate(u.mustChange ? '/panel/sifre' : '/panel');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (forgot) {
    return (
      <AuthCard title="Şifremi unuttum" subtitle="E-posta adresinizi yazın, size şifre sıfırlama bağlantısı gönderelim.">
        {sent ? (
          <div className="notice notice-ok">
            Hesap kayıtlıysa sıfırlama bağlantısı gönderildi. (Yerel testte bağlantıyı Ana Admin hesabıyla <b>Giden mailler</b> sayfasında görebilirsiniz.)
          </div>
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

  return (
    <AuthCard title="Giriş yap" subtitle="Formlarınızı ve kayıtlarınızı yönetmek için giriş yapın.">
      <form onSubmit={submit} className="stack">
        <Field label="E-posta" htmlFor="le">
          <input id="le" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Şifre" htmlFor="lp">
          <input id="lp" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
      navigate('/panel');
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
          <input id="op" type="password" required autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} />
        </Field>
        <Field label="Yeni şifre" htmlFor="np">
          <input id="np" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <PasswordRules />
        </Field>
        <Field label="Yeni şifre (tekrar)" htmlFor="np2">
          <input id="np2" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
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
            <input id="rp" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <PasswordRules />
          </Field>
          <Field label="Yeni şifre (tekrar)" htmlFor="rp2">
            <input id="rp2" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          {error && <div className="notice notice-err" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block">Şifreyi kaydet</button>
        </form>
      )}
    </AuthCard>
  );
}
