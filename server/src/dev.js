// Yerel geliştirme: MySQL kurmadan, SQLite ile çalışır (Windows/Mac/Linux).
// Kullanım: proje kökünde "npm run sunucu", ayrı terminalde "npm run dev" (.env içinde VITE_API_MODE=server)
const defaults = {
  DB_DRIVER: 'sqlite',
  PORT: '3000',
  PUBLIC_URL: 'http://localhost:5180',
  SEED_ADMIN_EMAIL: 'info@batilmer.com',
  SEED_ADMIN_PASSWORD: 'Gecici.Sifre1'
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;
await import('./index.js');
