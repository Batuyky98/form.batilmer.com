import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth.jsx';
import { matchPath, navigate, useLocation } from './router.jsx';
import { ConfirmProvider, Spinner, ToastProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { runScheduler } from './lib/api.js';

import Login, { ResetPassword, ChangePassword } from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FormBuilder from './pages/FormBuilder.jsx';
import Submissions from './pages/Submissions.jsx';
import Appointments from './pages/Appointments.jsx';
import Users from './pages/Users.jsx';
import { Trash, Logs, Outbox } from './pages/AdminPages.jsx';
import PublicForm from './pages/PublicForm.jsx';
import CancelPage from './pages/CancelPage.jsx';
import EmbedTest from './pages/EmbedTest.jsx';
import Stats from './pages/Stats.jsx';
import AllCalendar from './pages/AllCalendar.jsx';
import Security from './pages/Security.jsx';
import NotificationSettings from './pages/NotificationSettings.jsx';
import { registerWorker } from './lib/push.js';

const PANEL_ROUTES = [
  ['/panel', Dashboard],
  ['/panel/formlar/:id/duzenle', FormBuilder],
  ['/panel/formlar/:id/kayitlar', Submissions],
  ['/panel/formlar/:id/randevular', Appointments],
  ['/panel/formlar/:id/istatistik', Stats],
  ['/panel/takvim', AllCalendar],
  ['/panel/kullanicilar', Users, true],
  ['/panel/cop-kutusu', Trash, true],
  ['/panel/islem-kayitlari', Logs, true],
  ['/panel/giden-mailler', Outbox, true],
  ['/panel/sifre', ChangePassword],
  ['/panel/guvenlik', Security],
  ['/panel/bildirimler', NotificationSettings]
];

function NotFound() {
  return (
    <div className="center-page">
      <div className="card narrow">
        <h1>Sayfa bulunamadı</h1>
        <p className="muted">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
        <a className="btn btn-primary" href="/panel">Panele dön</a>
      </div>
    </div>
  );
}

function Redirect({ to }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

function Routes() {
  const { path } = useLocation();
  const { user } = useAuth();

  // Herkese açık sayfalar
  let m;
  if ((m = matchPath('/f/:slug', path))) return <PublicForm slug={m.slug} />;
  if ((m = matchPath('/iptal/:token', path))) return <CancelPage token={m.token} />;
  if (path === '/test-sitesi') return <EmbedTest />;
  if ((m = matchPath('/sifre-sifirla/:token', path))) return <ResetPassword token={m.token} />;

  if (user === undefined) return <div className="center-page"><Spinner /></div>;

  if (path === '/' || path === '') return <Redirect to={user ? '/panel' : '/giris'} />;
  if (path === '/giris') return user ? <Redirect to="/panel" /> : <Login />;

  for (const [pattern, Comp, adminOnly] of PANEL_ROUTES) {
    const params = matchPath(pattern, path);
    if (!params) continue;
    if (!user) return <Redirect to="/giris" />;
    if (user.mustChange && pattern !== '/panel/sifre') return <Redirect to="/panel/sifre" />;
    // Ana Admin: Authenticator kurulmadan panel açılmaz
    if (!user.mustChange && user.twofaSetupRequired && pattern !== '/panel/guvenlik') return <Redirect to="/panel/guvenlik" />;
    if (adminOnly && user.role !== 'admin') return <Layout><NotFound /></Layout>;
    return (
      <Layout>
        <Comp {...params} key={path} />
      </Layout>
    );
  }
  return <NotFound />;
}

export default function App() {
  useEffect(() => {
    // Bildirim servis çalışanı sadece panelde (herkese açık formlarda gerekmez)
    if (!window.location.pathname.startsWith('/f/') && !window.location.pathname.startsWith('/iptal/')) registerWorker();
  }, []);
  useEffect(() => {
    try {
      runScheduler();
    } catch {
      /* ilk açılışta veri yoksa sorun değil */
    }
    const t = setInterval(() => {
      try {
        runScheduler();
      } catch {
        /* yoksay */
      }
    }, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
