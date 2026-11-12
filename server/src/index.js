// Batilmer Form Paneli – HTTP sunucusu
//   /api/rpc/<işlem>   panel ve formların çağırdığı işlemler (JSON)
//   /api/files/<id>    yüklenen dosyayı indir (giriş + yetki gerekir)
//   /api/health        Docker sağlık kontrolü
//   diğer her şey      derlenmiş ön yüz (dist/), tek sayfa uygulaması
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, isHttps } from './config.js';
import { connect } from './db.js';
import { ApiError, dispatch, seedAdmin, authorizeFile, BIG_BODY } from './handlers.js';
import { ensureDirs, filePath } from './files.js';
import { startMailer } from './mailer.js';
import { startScheduler } from './scheduler.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.webp': 'image/webp'
};
const SAFE_INLINE = new Set(['image/png', 'image/jpeg', 'application/pdf']);

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function clientIp(req) {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('çok büyük'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function securityHeaders(res, pathname) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isHttps) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  // Formlar (/f/...) her siteye iframe ile gömülebilir; panel sadece kendi içinde
  if (!pathname.startsWith('/f/') && !pathname.startsWith('/embed.js')) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function makeCtx(db, req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const setCookies = [];
  return {
    db,
    req,
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || ''),
    cookies,
    setCookie(name, value, { maxAge }) {
      const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
      if (isHttps) parts.push('Secure');
      setCookies.push(parts.join('; '));
      res.setHeader('Set-Cookie', setCookies);
    }
  };
}

async function handleRpc(db, req, res, name) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'Yöntem desteklenmiyor.', code: 'yontem' } });
  // CSRF koruması: başka sitelerden gelen düz form gönderimleri bu başlığı ekleyemez
  if (req.headers['x-batilmer'] !== '1' || !String(req.headers['content-type'] || '').includes('application/json')) {
    return sendJson(res, 403, { error: { message: 'Geçersiz istek.', code: 'istek' } });
  }
  const limit = BIG_BODY.has(name) ? Math.ceil(config.maxUploadMB * 1.4 + 1) * 1024 * 1024 : 2 * 1024 * 1024;
  let args;
  try {
    const raw = await readBody(req, limit);
    args = raw ? JSON.parse(raw) : [];
  } catch (e) {
    if (e.status === 413) return sendJson(res, 413, { error: { message: 'Gönderilen veri çok büyük.', code: 'buyuk' } });
    return sendJson(res, 400, { error: { message: 'Geçersiz istek.', code: 'istek' } });
  }
  const ctx = makeCtx(db, req, res);
  try {
    const result = await dispatch(ctx, name, args);
    sendJson(res, 200, { result: result === undefined ? null : result });
  } catch (e) {
    if (e instanceof ApiError) {
      return sendJson(res, e.status || 400, { error: { message: e.message, code: e.code, fields: e.fields } });
    }
    console.error(`[rpc] ${name}:`, e);
    sendJson(res, 500, { error: { message: 'Sunucuda bir hata oluştu. Lütfen tekrar deneyin.', code: 'sunucu' } });
  }
}

async function handleFile(db, req, res, id) {
  const ctx = makeCtx(db, req, res);
  try {
    const f = await authorizeFile(ctx, id);
    const p = filePath(f.id);
    await fsp.access(p);
    const mime = SAFE_INLINE.has(f.mime) ? f.mime : 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': f.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 404;
    res.writeHead(status === 401 ? 302 : status, status === 401 ? { Location: '/giris' } : { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 401 ? '' : 'Dosya bulunamadı veya yetkiniz yok.');
  }
}

let indexHtml = null;
async function serveStatic(req, res, pathname) {
  const root = config.staticDir;
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = '/';
  }
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(path.normalize(root))) {
    res.writeHead(400);
    return res.end();
  }
  try {
    const st = await fsp.stat(full);
    if (st.isFile()) {
      const ext = path.extname(full).toLowerCase();
      const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : rel === '/embed.js' ? 'public, max-age=3600' : 'public, max-age=300';
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(full).pipe(res);
    }
  } catch {
    /* dosya yok → uygulama sayfası */
  }
  if (path.extname(rel) && !rel.startsWith('/f/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bulunamadı');
  }
  if (!indexHtml) indexHtml = await fsp.readFile(path.join(root, 'index.html')).catch(() => null);
  if (!indexHtml) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Ön yüz derlenmemiş (dist/index.html yok).');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : indexHtml);
}

async function main() {
  await ensureDirs();
  const db = await connect();
  await seedAdmin(db);
  const stopMailer = startMailer(db);
  const stopScheduler = startScheduler(db);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const pathname = url.pathname;
    securityHeaders(res, pathname);
    try {
      if (pathname === '/api/health') return sendJson(res, 200, { ok: true });
      let m;
      if ((m = /^\/api\/rpc\/([A-Za-z]+)$/.exec(pathname))) return await handleRpc(db, req, res, m[1]);
      if ((m = /^\/api\/files\/([a-z0-9_]+)$/i.exec(pathname)) && req.method === 'GET') return await handleFile(db, req, res, m[1]);
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: { message: 'Bulunamadı.', code: 'yok' } });
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end();
      }
      return await serveStatic(req, res, pathname);
    } catch (e) {
      console.error('[http]', e);
      if (!res.headersSent) sendJson(res, 500, { error: { message: 'Sunucu hatası.', code: 'sunucu' } });
      else res.end();
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 30000;
  server.listen(config.port, () => console.log(`[sunucu] Batilmer Form Paneli ${config.port} portunda (${config.db.driver}) – ${config.publicUrl}`));

  const shutdown = async (sig) => {
    console.log(`[sunucu] ${sig} alındı, kapanıyor…`);
    stopMailer();
    stopScheduler();
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[sunucu] başlatılamadı:', e);
  process.exit(1);
});
