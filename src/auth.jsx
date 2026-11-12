import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from './lib/api.js';
import { currentEndpoint, disablePush } from './lib/push.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Oturum süre dolduğu için kapandıysa giriş ekranında bunu söyleyelim
export const EXPIRED_KEY = 'bf_oturum_bitti';
function markExpired() {
  try {
    sessionStorage.setItem(EXPIRED_KEY, '1');
  } catch {
    /* gizli sekme */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = yükleniyor

  const refresh = useCallback(async () => {
    try {
      await api.ensureSeed();
      setUser(await api.currentUser());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sunucu "oturum bitti" derse kullanıcıyı çıkar; ekranlar giriş sayfasına yönlenir
  useEffect(
    () =>
      api.onSessionExpired(() => {
        markExpired();
        setUser(null);
      }),
    []
  );

  // Dönüş: kullanıcı ya da { twofa: true, ticket } (Authenticator kodu bekleniyor)
  const login = async (email, password) => {
    const r = await api.login(email, password);
    if (r?.twofa) return r;
    setUser(r);
    return r;
  };
  const loginTotp = async (ticket, code) => {
    const u = await api.loginTotp(ticket, code);
    setUser(u);
    return u;
  };
  // "Çıkış yap": bu cihazın bildirimleri de durur
  const logout = async () => {
    try {
      const endpoint = await currentEndpoint();
      await api.logout(endpoint);
      if (endpoint) await disablePush();
    } catch {
      /* yoksay */
    } finally {
      setUser(null);
    }
  };
  // Süre dolduğu için (uyarıdan sonra) çıkış
  const expire = () => {
    markExpired();
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, setUser, refresh, login, loginTotp, logout, expire, isAdmin: user?.role === 'admin' }}>{children}</AuthCtx.Provider>;
}
