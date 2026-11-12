// Web Push (telefon / tarayıcı bildirimi) – dış pakete ve ücretli servise gerek yok.
//  • Mesaj içeriği RFC 8291 (aes128gcm) ile şifrelenir: Google / Apple / Mozilla içeriği okuyamaz.
//  • Sunucu kimliği RFC 8292 (VAPID) ile kanıtlanır. Anahtar çifti ilk açılışta üretilip veritabanında saklanır
//    (yedeğe de girer; anahtar değişirse telefonlardaki bildirim izinleri geçersiz olur).
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

function hkdf(salt, ikm, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length);
}

// ---------------------------------------------------------------- VAPID anahtarları
export function generateVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])), privateJwk: jwk };
}

function vapidHeader(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------- şifreleme (RFC 8291)
export function encryptPayload(plaintext, p256dh, authSecret, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  if (uaPublic.length !== 65 || auth.length < 16) throw new Error('geçersiz abonelik anahtarı');
  const server = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) server.generateKeys();
  const asPublic = server.getPublicKey();
  const shared = server.computeSecret(uaPublic);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Test için: tarayıcının yaptığı çözme işlemi
export function decryptPayload(data, uaEcdh, authSecret) {
  const salt = data.subarray(0, 16);
  const idlen = data[20];
  const asPublic = data.subarray(21, 21 + idlen);
  const body = data.subarray(21 + idlen);
  const uaPublic = uaEcdh.getPublicKey();
  const shared = uaEcdh.computeSecret(asPublic);
  const ikm = hkdf(fromB64u(authSecret), shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(body.subarray(body.length - 16));
  const out = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  return out.subarray(0, out.lastIndexOf(2)).toString();
}

// ---------------------------------------------------------------- gönderim
// Dönüş: 'ok' | 'gone' (abonelik silinmeli) | 'error'
export async function sendPush(sub, payload, keys, subject, { ttl = 86400, urgency = 'high', topic } = {}) {
  let url;
  try {
    url = new URL(sub.endpoint);
    if (url.protocol !== 'https:') return { status: 'gone', detail: 'https değil' };
  } catch {
    return { status: 'gone', detail: 'geçersiz adres' };
  }
  const body = encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: String(ttl),
    Urgency: urgency,
    Authorization: vapidHeader(sub.endpoint, keys, subject)
  };
  if (topic) headers.Topic = topic;
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
    if (res.status === 404 || res.status === 410) return { status: 'gone', detail: String(res.status) };
    if (!res.ok) return { status: 'error', detail: `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` };
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', detail: e.message };
  }
}

// Push servislerinin bilinen adresleri (rastgele bir sunucuya istek atılmasın diye)
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/];
export function endpointAllowed(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}
