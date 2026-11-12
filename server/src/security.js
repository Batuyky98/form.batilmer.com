import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

// Şifreler scrypt ile tuzlanıp hash'lenir (bcrypt ile aynı güvenlik sınıfında, Node'a yerleşik).
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize('NFC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, n, r, p, saltB64, keyB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(String(password).normalize('NFC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Zamanlama saldırısına karşı: kullanıcı yoksa da aynı sürede cevap ver
let dummyHash = null;
export async function burnTime(password) {
  if (!dummyHash) dummyHash = await hashPassword('batilmer-dummy-password');
  await verifyPassword(password, dummyHash);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

// Bellekte basit hız sınırı (tek sunucu için yeterli)
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const t = Date.now();
  const list = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  if (list.length >= limit) {
    buckets.set(key, list);
    return false;
  }
  list.push(t);
  buckets.set(key, list);
  return true;
}
setInterval(() => {
  const t = Date.now();
  for (const [k, list] of buckets) if (!list.some((x) => t - x < 3600000)) buckets.delete(k);
}, 600000).unref();
