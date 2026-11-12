// Sunucuya (server/) giden istemci. Her çağrı POST /api/rpc/<işlem> olarak gider.
// Oturum, tarayıcının httpOnly çerezinde tutulur (JavaScript göremez).

const listeners = new Set();
export function onSessionExpired(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Kişinin kendi yaptığı (arka plan olmayan) her başarılı işlem oturum süresini uzatır
const activity = new Set();
export function onActivity(fn) {
  activity.add(fn);
  return () => activity.delete(fn);
}

// Panelin kendi kendine yaptığı kontroller: sunucu bunlarla oturum süresini UZATMAZ
const BACKGROUND = new Set(['pollNotifications', 'sessionInfo']);
const NO_SESSION = new Set(['login', 'loginTotp', 'logout', 'publicConfig', 'getPublicForm', 'getAvailability', 'submitForm', 'getAppointmentByToken', 'cancelByToken', 'requestPasswordReset', 'resetPassword']);

class ApiError extends Error {
  constructor(message, code, fields) {
    super(message);
    this.code = code;
    if (fields) this.fields = fields;
  }
}

async function rpc(name, args) {
  let res;
  try {
    res = await fetch(`/api/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Batilmer': '1', ...(BACKGROUND.has(name) ? { 'X-Batilmer-Bg': '1' } : {}) },
      body: JSON.stringify(args)
    });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.', 'ag');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* boş ya da JSON olmayan cevap */
  }
  if (!res.ok || !data || data.error) {
    const err = data?.error || {};
    if (res.status === 413) throw new ApiError('Gönderilen dosya çok büyük.', 'buyuk');
    if (err.code === 'oturum' && name !== 'currentUser') listeners.forEach((fn) => fn());
    throw new ApiError(err.message || 'Bir hata oluştu, lütfen tekrar deneyin.', err.code || 'hata', err.fields);
  }
  if (!BACKGROUND.has(name) && !NO_SESSION.has(name)) activity.forEach((fn) => fn());
  return data.result;
}

export const remote = new Proxy({}, { get: (_, name) => (...args) => rpc(String(name), args) });
