// Telefon / bilgisayar bildirimleri (Web Push) – tarayıcı tarafı.
// Android: Chrome'da doğrudan çalışır.
// iPhone (iOS 16.4+): panel önce Safari'den "Ana Ekrana Ekle" ile eklenmeli ve o simgeden açılmalı.
import * as api from './api.js';

const ua = () => navigator.userAgent || '';
export const isIOS = () => /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua());
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Cihazın şu anki durumu:
//  'unsupported'   tarayıcı desteklemiyor
//  'ios-install'   iPhone: önce Ana Ekrana Ekle gerekli
//  'denied'        kişi daha önce "Engelle" demiş (ayarlardan açılmalı)
//  'off'           izin verilmemiş / bu cihaz kayıtlı değil
//  'on'            bu cihaza bildirim geliyor
export async function deviceState() {
  if (isIOS() && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

let regPromise = null;
export function registerWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!regPromise) regPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  return regPromise;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await registerWorker();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function currentEndpoint() {
  try {
    return (await currentSubscription())?.endpoint || '';
  } catch {
    return '';
  }
}

function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function deviceLabel() {
  const u = ua();
  const os = isIOS() ? (/iPad/.test(u) ? 'iPad' : 'iPhone') : isAndroid() ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Cihaz';
  const br = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /Firefox\//.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Tarayıcı';
  return `${os} · ${br}${isStandalone() ? ' (uygulama)' : ''}`;
}

// "Bildirimleri aç" butonu. Mutlaka bir tıklamanın içinden çağrılmalı (tarayıcı kuralı).
export async function enablePush() {
  if (isIOS() && !isStandalone()) throw new Error('iPhone\'da önce paneli Ana Ekrana ekleyin ve o simgeden açın.');
  if (!pushSupported()) throw new Error('Bu tarayıcı bildirimleri desteklemiyor. Android\'de Chrome, bilgisayarda Chrome veya Edge kullanın.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Bildirim izni verilmedi. Tarayıcı ayarlarından bu site için bildirimlere izin verin.' : 'Bildirim izni verilmedi.');
  const reg = await registerWorker();
  if (!reg) throw new Error('Bildirim servisi başlatılamadı. Sayfayı yenileyip tekrar deneyin.');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.pushConfig();
  let sub = await reg.pushManager.getSubscription();
  // Sunucu anahtarı değiştiyse eski aboneliği yenile
  if (sub && sub.options?.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = keyToBytes(publicKey);
    if (cur.length !== want.length || cur.some((b, i) => b !== want[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  await api.savePushSubscription(sub.toJSON(), deviceLabel());
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.deletePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
