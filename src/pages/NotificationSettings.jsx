import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Badge, Spinner, Toggle, useConfirm, useToast } from '../components/ui.jsx';
import { chime, setSound, soundOn, useLive } from '../components/Live.jsx';
import { currentEndpoint, deviceState, disablePush, enablePush, isAndroid, isIOS } from '../lib/push.js';
import { formatDateTime } from '../lib/util.js';

function DeviceHelp({ state }) {
  if (state === 'ios-install') {
    return (
      <div className="notice notice-info stack-sm">
        <b>iPhone'da bildirim için paneli Ana Ekrana ekleyin:</b>
        <ol className="steps">
          <li>Safari'nin altındaki <b>Paylaş</b> butonuna basın (yukarı ok olan kare).</li>
          <li><b>Ana Ekrana Ekle</b> → <b>Ekle</b>.</li>
          <li>Ana ekrandaki <b>batilmer</b> simgesinden paneli açın, giriş yapın ve bu sayfadan bildirimleri açın.</li>
        </ol>
        <span className="small">iOS 16.4 veya üstü gerekir (iPhone 8 ve sonrası). Ayarlar → Genel → Hakkında'dan bakabilirsiniz.</span>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="notice notice-warn stack-sm">
        <b>Bu cihazda bildirimler engellenmiş.</b>
        {isIOS() ? (
          <span>iPhone: Ayarlar → Bildirimler → <b>batilmer</b> → Bildirimlere İzin Ver'i açın, sonra bu sayfayı yenileyin.</span>
        ) : isAndroid() ? (
          <span>Android: adres çubuğundaki kilit simgesine dokunun → İzinler → Bildirimler → İzin ver. Sonra bu sayfayı yenileyin.</span>
        ) : (
          <span>Adres çubuğundaki kilit simgesine tıklayın → Bildirimler → İzin ver. Sonra bu sayfayı yenileyin.</span>
        )}
      </div>
    );
  }
  if (state === 'unsupported') {
    return <div className="notice notice-warn">Bu tarayıcı telefon/bilgisayar bildirimlerini desteklemiyor. Android'de Chrome, bilgisayarda Chrome veya Edge kullanın. Panel açıkken sesli uyarı yine çalışır.</div>;
  }
  return null;
}

export default function NotificationSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const live = useLive();
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSoundState] = useState(soundOn());

  async function load() {
    const [s, endpoint] = await Promise.all([deviceState(), currentEndpoint()]);
    setState(s);
    setData(await api.myNotificationSettings(endpoint));
  }
  useEffect(() => {
    load();
  }, []);

  if (!data || !state) return <div className="page narrow-page"><Spinner /></div>;
  if (data.demo) return <div className="page narrow-page"><h1>Bildirimler</h1><div className="notice notice-info">Demo modunda (sunucusuz) bildirimler kullanılamaz.</div></div>;

  const thisOn = state === 'on' && data.devices.some((d) => d.thisDevice);

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush();
      toast('Bildirimler bu cihazda açıldı. Deneme bildirimi gönderiliyor…');
      await api.sendTestNotification().catch(() => {});
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
      load();
    }
  }
  async function turnOff() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    toast('Bu cihazın bildirimleri kapatıldı.');
    load();
  }

  return (
    <div className="page narrow-page">
      <h1>Bildirimler</h1>
      <p className="muted">Yeni randevu ve kayıtlarda size haber verilir. Bildirimde müşterinin adı ve telefonu yazmaz; detaylar panele girince görünür.</p>

      <section className="card stack">
        <div className="row-between">
          <h2>Bildirimlerim</h2>
          <Toggle
            id="nt-on"
            checked={data.enabled}
            onChange={async (v) => {
              await api.setNotifyEnabled(v);
              toast(v ? 'Bildirimleriniz açıldı.' : 'Bildirimleriniz kapatıldı. Telefonunuza ve panele sesli uyarı gelmez.');
              load();
              live?.poll();
            }}
            label={data.enabled ? 'Açık' : 'Kapalı'}
          />
        </div>
        <p className="muted small">Kapatırsanız hiçbir cihazınıza bildirim gitmez. Panelin zil simgesindeki liste görünmeye devam eder.</p>
      </section>

      <section className="card stack">
        <div className="row-between">
          <h2>Bu cihaz</h2>
          {thisOn ? <Badge tone="green">Bildirim açık</Badge> : <Badge tone="gray">Bildirim kapalı</Badge>}
        </div>
        <DeviceHelp state={state} />
        <div className="row">
          {thisOn ? (
            <>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={async () => {
                const r = await api.sendTestNotification().catch((e) => toast(e.message, 'err'));
                if (r) toast(r.sent ? `Deneme bildirimi gönderildi (${r.sent} cihaz).` : 'Gönderilemedi. Bildirimleri kapatıp yeniden açmayı deneyin.', r.sent ? 'ok' : 'err');
                load();
              }}>Deneme bildirimi gönder</button>
              <button type="button" className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={turnOff}>Bu cihazda kapat</button>
            </>
          ) : (
            (state === 'off' || state === 'on') && <button type="button" className="btn btn-primary" disabled={busy || !data.enabled} onClick={turnOn}>{busy ? 'Açılıyor…' : 'Bu cihazda bildirimleri aç'}</button>
          )}
        </div>
        {!data.enabled && !thisOn && <p className="muted small">Önce yukarıdan bildirimlerinizi açın.</p>}
        <Toggle id="nt-ses" checked={sound} onChange={(v) => { setSound(v); setSoundState(v); if (v) chime(); }} label="Panel açıkken sesli uyarı" />
      </section>

      <section className="card stack">
        <h2>Bildirim aldığınız formlar</h2>
        {data.forms.length ? (
          <ul className="plain-list">
            {data.forms.map((f) => <li key={f.id}><b>{f.name}</b>{f.isletme ? <span className="muted"> · {f.isletme}</span> : null}</li>)}
          </ul>
        ) : (
          <p className="muted">Henüz hiçbir formdan bildirim almıyorsunuz. Hangi formlardan bildirim alacağınızı panel yöneticisi belirler (Kullanıcılar → "Bildirim" tiki).</p>
        )}
      </section>

      <section className="card stack">
        <h2>Bildirim açık cihazlarınız</h2>
        {!data.devices.length ? (
          <p className="muted">Henüz hiçbir cihazda açılmadı.</p>
        ) : (
          <ul className="device-list">
            {data.devices.map((d) => (
              <li key={d.id}>
                <div>
                  <b>{d.label || 'Cihaz'}</b> {d.thisDevice && <Badge tone="blue">Bu cihaz</Badge>} {d.failing && <Badge tone="amber">Son gönderim başarısız</Badge>}
                  <div className="muted small">Eklendi: {formatDateTime(d.createdAt)}{d.lastOkAt ? ` · Son bildirim: ${formatDateTime(d.lastOkAt)}` : ''}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-danger-ghost"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Cihazı kaldır', message: `"${d.label}" artık bildirim almayacak.`, confirmText: 'Kaldır', danger: true }))) return;
                    if (d.thisDevice) await disablePush();
                    else await api.deleteMyDevice(d.id);
                    load();
                  }}
                >
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card help">
        <summary>Android ve iPhone'da nasıl açılır?</summary>
        <div className="stack-sm">
          <b>Android (Chrome)</b>
          <ol className="steps">
            <li>Chrome'da paneli açıp giriş yapın.</li>
            <li>"Bu cihazda bildirimleri aç" → <b>İzin ver</b>.</li>
            <li>Deneme bildirimi geldiyse tamam. Chrome kapalıyken de gelir.</li>
          </ol>
          <span className="small muted">Bildirimler gecikiyorsa: Ayarlar → Uygulamalar → Chrome → Pil → "Kısıtlama yok". (Xiaomi, Oppo, Samsung'da pil tasarrufu bildirimleri geciktirebilir.)</span>
          <b>iPhone (Safari)</b>
          <ol className="steps">
            <li>Safari'de paneli açın → <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>.</li>
            <li>Ana ekrandaki <b>batilmer</b> simgesinden açıp giriş yapın.</li>
            <li>"Bu cihazda bildirimleri aç" → <b>İzin Ver</b>.</li>
          </ol>
          <span className="small muted">Bildirim sadece ana ekrandaki simgeden açılan panele gelir. Odaklanma / Rahatsız Etme açıksa sessiz gelir.</span>
        </div>
      </details>
    </div>
  );
}
