import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Link, navigate, useLocation } from '../router.jsx';
import { Logo } from './Logo.jsx';
import { Bell, LiveProvider } from './Live.jsx';

const NAV = [
  { to: '/panel', label: 'Formlar', icon: 'M4 5h16M4 12h16M4 19h10' },
  { to: '/panel/takvim', label: 'Tüm randevular', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { to: '/panel/bildirimler', label: 'Bildirimler', icon: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0' },
  { to: '/panel/kullanicilar', label: 'Kullanıcılar', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.75', admin: true },
  { to: '/panel/giden-mailler', label: 'Giden mailler', icon: 'M4 6h16v12H4zM4 7l8 6 8-6', admin: true },
  { to: '/panel/islem-kayitlari', label: 'İşlem kayıtları', icon: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', admin: true },
  { to: '/panel/cop-kutusu', label: 'Çöp kutusu', icon: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3', admin: true }
];

function Icon({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { path } = useLocation();
  const [open, setOpen] = useState(false);

  const active = (to) => (to === '/panel' ? path === '/panel' || path.startsWith('/panel/formlar') : path.startsWith(to));

  return (
    <LiveProvider>
    <div className="shell">
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" aria-label="Menüyü aç" onClick={() => setOpen((o) => !o)}>☰</button>
        <Link to="/panel" className="brand"><Logo size={28} /><span>Form Paneli</span></Link>
        <Bell className="bell-top" />
      </header>
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="side-head">
          <Link to="/panel" className="brand brand-side"><Logo size={32} /><span><b>batilmer</b><small>Form Paneli</small></span></Link>
          <Bell className="bell-side" />
        </div>
        <nav aria-label="Ana menü">
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
            <Link key={n.to} to={n.to} className={`nav-item ${active(n.to) ? 'is-active' : ''}`} onClick={() => setOpen(false)}>
              <Icon d={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="me">
            <div className="avatar" aria-hidden="true">{(user?.name || '?').slice(0, 1)}</div>
            <div>
              <div className="me-name">{user?.name}</div>
              <div className="me-mail">{user?.email}</div>
            </div>
          </div>
          <div className="side-actions">
            <Link to="/panel/sifre" className="link-sm" onClick={() => setOpen(false)}>Şifre</Link>
            <Link to="/panel/guvenlik" className="link-sm" onClick={() => setOpen(false)}>Güvenlik</Link>
            <button type="button" className="link-sm" onClick={async () => { await logout(); navigate('/giris'); }}>Çıkış yap</button>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <main className="main">{children}</main>
    </div>
    </LiveProvider>
  );
}
