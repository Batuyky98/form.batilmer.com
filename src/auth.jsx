import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from './lib/api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

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
  useEffect(() => api.onSessionExpired(() => setUser(null)), []);

  const login = async (email, password) => {
    const u = await api.login(email, password);
    setUser(u);
    return u;
  };
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  return <AuthCtx.Provider value={{ user, setUser, refresh, login, logout, isAdmin: user?.role === 'admin' }}>{children}</AuthCtx.Provider>;
}
