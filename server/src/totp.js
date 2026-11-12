// İki adımlı doğrulama (Google Authenticator, Microsoft Authenticator vb.) – RFC 6238 TOTP, 30 sn, 6 hane
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secretBuf, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

export const currentStep = (ms = Date.now()) => Math.floor(ms / 30000);

// Kod doğruysa kullanılan adımı döner (aynı kodun ikinci kez kullanılmasını engellemek için), yanlışsa null.
// Telefon saati biraz kaymış olabilir: bir önceki ve bir sonraki 30 saniyelik kod da kabul edilir.
export function verifyTotp(secret, code, { lastStep = null, ms = Date.now() } = {}) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secret);
  const now = currentStep(ms);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = hotp(key, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUrl(secret, account, issuer = 'Batilmer Form') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Telefon kaybolursa kullanılacak tek kullanımlık yedek kodlar: "k7m2-p9qx"
export function newBackupCodes(n = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, (x) => chars[x % chars.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const normBackup = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
