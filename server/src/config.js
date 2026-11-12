// Tüm ayarlar ortam değişkenlerinden (.env) okunur. Gizli bilgiler koda yazılmaz.
import path from 'node:path';

const env = process.env;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export const config = {
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  // Ön yüzün derlenmiş dosyaları (vite build çıktısı)
  staticDir: env.STATIC_DIR || path.resolve(root, '..', 'dist'),
  dataDir: env.DATA_DIR || path.resolve(root, 'data'),
  db: {
    driver: env.DB_DRIVER || 'mysql',
    host: env.DB_HOST || 'db',
    port: Number(env.DB_PORT || 3306),
    name: env.DB_NAME || 'batilmer_form',
    user: env.DB_USER || 'batilmer',
    password: env.DB_PASSWORD || '',
    sqliteFile: env.SQLITE_FILE || path.resolve(env.DATA_DIR || path.resolve(root, 'data'), 'batilmer.sqlite')
  },
  seedAdmin: {
    email: (env.SEED_ADMIN_EMAIL || '').trim().toLowerCase(),
    password: env.SEED_ADMIN_PASSWORD || ''
  },
  mail: {
    provider: env.MAIL_PROVIDER || (env.BREVO_API_KEY ? 'brevo' : 'none'),
    brevoKey: env.BREVO_API_KEY || '',
    from: env.MAIL_FROM || 'info@batilmer.com',
    fromName: env.MAIL_FROM_NAME || 'Batilmer Form'
  },
  sms: {
    provider: env.SMS_PROVIDER || 'none'
  },
  turnstile: {
    siteKey: env.TURNSTILE_SITE_KEY || '',
    secret: env.TURNSTILE_SECRET || ''
  },
  maxUploadMB: Number(env.MAX_UPLOAD_MB || 10),
  // Caddy gibi bir ters vekilin arkasında çalışıyorsak gerçek IP'yi X-Forwarded-For'dan al
  trustProxy: (env.TRUST_PROXY || '1') === '1'
};

export const isHttps = config.publicUrl.startsWith('https://');
