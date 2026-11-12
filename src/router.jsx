import { useEffect, useState } from 'react';

// Küçük, bağımlılıksız yönlendirici (History API)

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  window.dispatchEvent(new Event('batilmer-navigate'));
  window.scrollTo(0, 0);
}

export function useLocation() {
  const get = () => ({ path: window.location.pathname, search: new URLSearchParams(window.location.search) });
  const [loc, setLoc] = useState(get);
  useEffect(() => {
    const on = () => setLoc(get());
    window.addEventListener('popstate', on);
    window.addEventListener('batilmer-navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('batilmer-navigate', on);
    };
  }, []);
  return loc;
}

export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, children, className, onClick, ...rest }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || rest.target === '_blank') return;
        e.preventDefault();
        onClick?.(e);
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
