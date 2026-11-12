// Cloudflare Turnstile doğrulaması (TURNSTILE_SITE_KEY + TURNSTILE_SECRET tanımlıysa)
import { config } from './config.js';

export async function verifyTurnstile(token, ip) {
  if (!config.turnstile.secret) {
    console.warn('[turnstile] TURNSTILE_SITE_KEY var ama TURNSTILE_SECRET yok; doğrulama yapılamadı.');
    return false;
  }
  try {
    const body = new URLSearchParams({ secret: config.turnstile.secret, response: String(token).slice(0, 2048) });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('[turnstile] doğrulama hatası:', e.message);
    return false;
  }
}
