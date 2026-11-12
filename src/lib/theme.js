// Panel teması (açık / karanlık). Seçim bu cihazda saklanır; tekrar değiştirilene kadar kalır.
// Müşterinin gördüğü sayfalar (/f/..., /iptal/..., /test-sitesi) panel temasından etkilenmez:
// onların görünümü form ayarlarından gelir.
const KEY = 'bf_tema';
export const isPublicPath = (p = window.location.pathname) => /^\/(f|iptal|test-sitesi)(\/|$)/.test(p);

export function storedTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme = storedTheme()) {
  const dark = theme === 'dark' && !isPublicPath();
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f1c' : '#ffffff');
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* gizli sekme: sadece bu oturumda */
  }
  applyTheme(theme);
  window.dispatchEvent(new Event('bf-theme'));
}
