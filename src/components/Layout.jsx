import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Link, navigate, useLocation } from '../router.jsx';
import { Logo } from './Logo.jsx';
import { Bell, LiveProvider, useLive } from './Live.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const I = {
  forms: 'M4 5h16M4 12h16M4 19h10',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.75',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  log: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7Z',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  today: 'M3 12h4l3-8 4 16 3-8h4',
  remind: 'M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-5A8.4 8.4 0 1 1 21 11.5ZM12 8v4l2.5 1.5',
  people: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1'
};

const NAV = [
  { to: '/panel', label: 'Bugün', icon: I.today },
  { to: '/panel/takvim', label: 'Takvim', icon: I.cal },
  { to: '/panel/musteriler', label: 'Müşteriler', icon: I.people },
  { to: '/panel/formlar', label: 'Formlar', icon: I.forms },
  { to: '/panel/hatirlatmalar', label: 'Hatırlatmalar', icon: I.remind },
  { to: '/panel/bildirimler', label: 'Bildirimler', icon: I.bell },
  { to: '/panel/kullanicilar', label: 'Kullanıcılar', icon: I.users, admin: true },
  { to: '/panel/giden-mailler', label: 'Giden mailler', icon: I.mail, admin: true },
  { to: '/panel/islem-kayitlari', label: 'İşlem kayıtları', icon: I.log, admin: true },
  { to: '/panel/cop-kutusu', label: 'Çöp kutusu', icon: I.trash, admin: true }
];

function Icon({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// "Dr. Ayşe Yılmaz" → "A" (unvan atlanır)
const initialOf = (n) => (String(n || '?').trim().split(/\s+/).find((w) => w && !/\.$/.test(w)) || '?').slice(0, 1).toLocaleUpperCase('tr');

const isActive = (path, to) => (to === '/panel' ? path === '/panel' : path.startsWith(to));

// Telefonda alttaki sekme çubuğu (uygulama gibi)
function TabBar({ onMenu, menuOpen }) {
  const { path } = useLocation();
  const live = useLive();
  const tabs = NAV.slice(0, 4);
  return (
    <nav className="tabbar" aria-label="Hızlı menü">
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} className={`tab ${isActive(path, t.to) && !menuOpen ? 'is-active' : ''}`} aria-current={isActive(path, t.to) ? 'page' : undefined}>
          <span className="tab-icon">
            <Icon d={t.icon} size={22} />
            {t.to === '/panel/bildirimler' && live?.unread > 0 && <span className="tab-badge">{live.unread > 9 ? '9+' : live.unread}</span>}
          </span>
          <span>{t.short || t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { path } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const out = async () => {
    await logout();
    navigate('/giris');
  };

  return (
    <LiveProvider>
      <div className="shell">
        <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Ana menü">
          <div className="side-head">
            <Link to="/panel" className="brand brand-side"><Logo size={34} /><span><b>batilmer</b><small>Form Paneli</small></span></Link>
            <button type="button" className="icon-btn side-close" aria-label="Menüyü kapat" onClick={() => setOpen(false)}>✕</button>
          </div>
          <nav>
            {NAV.filter((n) => !n.admin || isAdmin).map((n, i, arr) => (
              <div key={n.to}>
                {n.admin && !arr[i - 1]?.admin && <div className="nav-group">Yönetim</div>}
                <Link to={n.to} className={`nav-item ${isActive(path, n.to) ? 'is-active' : ''}`} aria-current={isActive(path, n.to) ? 'page' : undefined}>
                  <Icon d={n.icon} />
                  {n.label}
                </Link>
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <div className="me">
              <div className="avatar" aria-hidden="true">{initialOf(user?.name)}</div>
              <div>
                <div className="me-name">{user?.name}</div>
                <div className="me-mail">{user?.email}</div>
              </div>
            </div>
            <div className="side-links">
              <Link to="/panel/guvenlik" className="side-link"><Icon d={I.shield} size={16} />Güvenlik</Link>
              <Link to="/panel/sifre" className="side-link"><Icon d={I.key} size={16} />Şifre</Link>
              <button type="button" className="side-link" onClick={out}><Icon d={I.out} size={16} />Çıkış yap</button>
            </div>
          </div>
        </aside>
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

        <div className="main-col">
          <header className="appbar">
            <Link to="/panel" className="brand appbar-brand"><Logo size={30} /><span><b>batilmer</b></span></Link>
            <div className="appbar-actions">
              <ThemeToggle />
              <Bell className="bell-top" />
              {/* Telefonda profil simgesi menüyü açar (ayarlar, hatırlatmalar, kullanıcılar, çıkış) */}
              <button
                type="button"
                className="appbar-me"
                title={user?.email}
                aria-label="Menü"
                aria-expanded={open}
                onClick={() => (window.matchMedia('(max-width: 900px)').matches ? setOpen((o) => !o) : navigate('/panel/guvenlik'))}
              >
                <span className="avatar avatar-sm" aria-hidden="true">{initialOf(user?.name)}</span>
                <span className="appbar-me-name">{user?.name}</span>
              </button>
            </div>
          </header>
          <main className="main">{children}</main>
        </div>
        <TabBar onMenu={() => setOpen((o) => !o)} menuOpen={open} />
      </div>
    </LiveProvider>
  );
}
