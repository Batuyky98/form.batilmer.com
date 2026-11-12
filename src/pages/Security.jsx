import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useAuth } from '../auth.jsx';
import * as api from '../lib/api.js';
import { navigate } from '../router.jsx';
import { Field, Spinner, copyText, useToast } from '../components/ui.jsx';
import { download } from '../lib/util.js';

function Qr({ text }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  // SVG metni kütüphanenin kendi ürettiği; içinde kullanıcı girdisi yok
  return <div className="qr" aria-label="Kare kod" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) }} />;
}

function BackupCodes({ codes, onDone }) {
  const toast = useToast();
  const text = `Batilmer Form Paneli – yedek kodlar\nHer kod bir kez kullanılabilir. Telefonunuz yanınızda değilse girişte kullanın.\n\n${codes.join('\n')}\n`;
  return (
    <div className="stack">
      <div className="notice notice-warn">
        <b>Bu kodları şimdi kaydedin.</b> Telefonunuz kaybolursa ya da değişirse bu kodlarla giriş yapabilirsiniz. Kodlar bir daha gösterilmez.
      </div>
      <div className="backup-codes">
        {codes.map((c) => <code key={c}>{c}</code>)}
      </div>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => download('batilmer-yedek-kodlar.txt', new Blob([text], { type: 'text/plain' }))}>İndir (.txt)</button>
        <button type="button" className="btn btn-sm" onClick={async () => toast((await copyText(codes.join('\n'))) ? 'Kopyalandı.' : 'Kopyalanamadı.')}>Kopyala</button>
        <button type="button" className="btn btn-sm" onClick={() => window.print()}>Yazdır</button>
      </div>
      <div><button type="button" className="btn btn-primary" onClick={onDone}>Kodları kaydettim, devam et</button></div>
    </div>
  );
}

function Setup({ onEnabled }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    api.totpSetupStart().then(setSetup).catch((e) => setError(e.message));
  }, []);

  async function confirm(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.totpSetupConfirm(code);
      onEnabled(r.backupCodes);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!setup) return error ? <div className="notice notice-err">{error}</div> : <Spinner />;
  return (
    <form className="stack" onSubmit={confirm}>
      <ol className="steps">
        <li>Telefonunuza <b>Google Authenticator</b> ya da <b>Microsoft Authenticator</b> uygulamasını kurun (App Store / Google Play, ücretsiz).</li>
        <li>Uygulamada <b>+</b> → <b>QR kodu tara</b> deyip aşağıdaki kareyi okutun.</li>
        <li>Uygulamada beliren 6 haneli kodu aşağıya yazın.</li>
      </ol>
      <div className="qr-wrap">
        <Qr text={setup.url} />
        <div className="stack-sm">
          <div className="muted small">Kareyi okutamıyorsanız (panel telefonda açıksa) uygulamada "Kurulum anahtarı gir" deyip bu anahtarı yazın:</div>
          {showKey ? <code className="secret-key">{setup.secret.match(/.{1,4}/g).join(' ')}</code> : <button type="button" className="btn btn-sm" onClick={() => setShowKey(true)}>Anahtarı göster</button>}
          <a className="link-sm" href={setup.url}>Bu telefondaki uygulamada aç</a>
        </div>
      </div>
      <Field label="Uygulamadaki 6 haneli kod" htmlFor="sc">
        <input id="sc" className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {error && <div className="notice notice-err" role="alert">{error}</div>}
      <div><button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Kontrol ediliyor…' : 'Doğrula ve aç'}</button></div>
    </form>
  );
}

function ConfirmWithCode({ title, buttonText, danger, onSubmit, onCancel }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="sub-card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          await onSubmit(password, code);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h3>{title}</h3>
      <div className="grid-2">
        <Field label="Şifreniz" htmlFor="cw-p"><input id="cw-p" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Authenticator kodu" htmlFor="cw-c"><input id="cw-c" className="otp-input" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      {error && <div className="notice notice-err" role="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>Vazgeç</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>{buttonText}</button>
      </div>
    </form>
  );
}

export default function Security() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [codes, setCodes] = useState(null);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState(null); // 'kapat' | 'kodlar'

  const [loadError, setLoadError] = useState('');
  const load = () => api.totpStatus().then(setStatus).catch((e) => setLoadError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (!status) return <div className="page narrow-page">{loadError ? <div className="notice notice-err">{loadError}</div> : <Spinner />}</div>;

  const required = user?.twofaSetupRequired;

  return (
    <div className="page narrow-page">
      <h1>İki adımlı doğrulama</h1>
      <p className="muted">Girişte şifrenize ek olarak telefonunuzdaki uygulamanın ürettiği 6 haneli kod istenir. Şifreniz çalınsa bile telefonunuz olmadan kimse giremez.</p>

      {status.demo && <div className="notice notice-info">Demo modunda (sunucusuz) iki adımlı doğrulama kullanılamaz.</div>}

      {required && !codes && (
        <div className="notice notice-warn">Ana Admin hesabı tüm işletmelerin verilerine erişebildiği için iki adımlı doğrulama <b>zorunludur</b>. Kurulumu tamamlamadan panele devam edemezsiniz.</div>
      )}

      {codes ? (
        <div className="card stack">
          <h2>Yedek kodlarınız</h2>
          <BackupCodes
            codes={codes}
            onDone={async () => {
              setCodes(null);
              await refresh();
              await load();
              if (required) navigate('/panel');
            }}
          />
        </div>
      ) : status.enabled ? (
        <div className="stack">
          <div className="card stack">
            <div className="row-between">
              <h2>Durum</h2>
              <span className="badge badge-green">Açık</span>
            </div>
            <p className="muted small">Kalan yedek kod: <b>{status.backupLeft}</b>{status.backupLeft <= 3 ? ' – yeni kodlar oluşturmanız önerilir.' : ''}</p>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => setMode('kodlar')}>Yeni yedek kodlar oluştur</button>
              {!status.required && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setMode('kapat')}>Kapat</button>}
            </div>
            {status.required && <p className="muted small">Ana Admin hesaplarında kapatılamaz. Telefonunuzu değiştirirseniz başka bir Ana Admin, Kullanıcılar ekranından sıfırlayabilir.</p>}
          </div>
          {mode === 'kodlar' && (
            <ConfirmWithCode
              title="Yeni yedek kodlar"
              buttonText="Oluştur"
              onCancel={() => setMode(null)}
              onSubmit={async (p, c) => {
                const r = await api.regenerateBackupCodes(p, c);
                setMode(null);
                setCodes(r.backupCodes);
              }}
            />
          )}
          {mode === 'kapat' && (
            <ConfirmWithCode
              title="İki adımlı doğrulamayı kapat"
              buttonText="Kapat"
              danger
              onCancel={() => setMode(null)}
              onSubmit={async (p, c) => {
                await api.totpDisable(p, c);
                setMode(null);
                toast('İki adımlı doğrulama kapatıldı.');
                await refresh();
                load();
              }}
            />
          )}
        </div>
      ) : !status.demo && (
        <div className="card stack">
          {starting ? (
            <Setup onEnabled={setCodes} />
          ) : (
            <>
              <p>Kurulum 2 dakika sürer. Telefonunuz yanınızda olsun.</p>
              <div><button type="button" className="btn btn-primary" onClick={() => setStarting(true)}>Kuruluma başla</button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
