// Sunucuya (server/) giden istemci. Her çağrı POST /api/rpc/<işlem> olarak gider.
// Oturum, tarayıcının httpOnly çerezinde tutulur (JavaScript göremez).

const listeners = new Set();
export function onSessionExpired(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

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
      headers: { 'Content-Type': 'application/json', 'X-Batilmer': '1' },
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
  return data.result;
}

export const remote = new Proxy({}, { get: (_, name) => (...args) => rpc(String(name), args) });
