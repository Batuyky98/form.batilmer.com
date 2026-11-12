import { useEffect, useState } from 'react';
import { setTheme, storedTheme } from '../lib/theme.js';

// Sağ üstteki ay / güneş düğmesi
export default function ThemeToggle({ className = '' }) {
  const [theme, setT] = useState(storedTheme());
  useEffect(() => {
    const on = () => setT(storedTheme());
    window.addEventListener('bf-theme', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('bf-theme', on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`icon-btn theme-btn ${className}`}
      aria-label={dark ? 'Açık temaya geç' : 'Karanlık temaya geç'}
      title={dark ? 'Açık tema' : 'Karanlık tema'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? (
          <path d="M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
        ) : (
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        )}
      </svg>
    </button>
  );
}
