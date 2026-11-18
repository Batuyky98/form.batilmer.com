// Panelin canlı parçaları (giriş yapılmışken):
//  • 15 saniyede bir yeni bildirim kontrolü (arka plan isteği: oturum süresini uzatmaz)
//  • Yeni randevu/kayıt gelince ses + köşede açılır kart + zil simgesinde sayaç
//  • Girişten sonra "Bildirimlere izin ver" penceresi (Ana Admin "Bildirim" tiki attıysa)
//  • Oturum: 2 saat işlem yoksa / 12 saat dolunca kapanır; 5 dakika önce uyarır
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { navigate, useLocation } from '../router.jsx';
import { Modal, useToast } from './ui.jsx';
import { deviceState, enablePush, isAndroid, isIOS, registerWorker } from '../lib/push.js';
import { SESSION_IDLE_MS, SESSION_WARN_MS } from '../lib/shared.js';
import { formatDateTime } from '../lib/util.js';
import { getSteps } from '../lib/onboarding.js';

const LiveCtx = createContext(null);
export const useLive = () => useContext(LiveCtx);

const POLL_MS = 15000;
const PROMPT_KEY = 'bf_bildirim_sor';
export const SOUND_KEY = 'bf_ses';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* gizli sekme */
    }
  }
};
export const soundOn = () => store.get(SOUND_KEY) !== '0';
export const setSound = (on) => store.set(SOUND_KEY, on ? '1' : '0');

// ---------------------------------------------------------------- ses (dosya gerekmez)
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* ses desteklenmiyor */
  }
}
export function chime() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [[880, 0], [1320, 0.18]].forEach(([freq, at]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.25, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + at);
      o.stop(t + at + 0.55);
    });
  } catch {
    /* yoksay */
  }
}

const NOOP = () => {};
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- sağlayıcı
export function LiveProvider({ children }) {
  const { user, expire, logout } = useAuth();
  const toast = useToast();
  const { path } = useLocation();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [info, setInfo] = useState({ enabled: true, hasForms: false });
  const [popups, setPopups] = useState([]);
  const [warn, setWarn] = useState(null); // { left, absolute }
  const [prompt, setPrompt] = useState(null); // 'off' | 'ios-install'
  const latest = useRef(0);
  const first = useRef(true);
  const deadline = useRef({ idle: Date.now() + SESSION_IDLE_MS, abs: Infinity });
  const lastTouch = useRef(Date.now());
  const warnOpen = useRef(false);
  const blocked = user?.mustChange || user?.twofaSetupRequired;
  const expireRef = useRef(expire);
  expireRef.current = expire;

  const applySession = (s) => {
    if (!s) return;
    const t = Date.now();
    deadline.current = { idle: t + s.idleLeftMs, abs: t + s.absLeftMs };
  };

  const poll = useCallback(async () => {
    if (blocked) return;
    try {
      const r = await api.pollNotifications(first.current ? 0 : latest.current);
      applySession(r.session);
      setInfo({ enabled: r.enabled, hasForms: r.hasForms });
      setUnread(r.unread);
      if (r.items.length) {
        const fresh = first.current ? [] : r.items.filter((x) => x.at > latest.current);
        latest.current = Math.max(latest.current, ...r.items.map((x) => x.at));
        setItems((old) => {
          const seen = new Set(old.map((x) => x.id));
          return [...r.items.filter((x) => !seen.has(x.id)), ...old].slice(0, 50);
        });
        if (fresh.length && r.enabled) {
          if (soundOn()) chime();
          setPopups((p) => [...fresh.slice(0, 3).map((x) => ({ ...x, shownAt: Date.now() })), ...p].slice(0, 4));
        }
      }
      first.current = false;
    } catch {
      /* ağ hatası: bir sonraki turda tekrar */
    }
  }, [blocked]);

  // Bildirim kontrolü
  useEffect(() => {
    if (blocked) return undefined;
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVis = () => document.visibilityState === 'visible' && poll();
    document.addEventListener('visibilitychange', onVis);
    // Telefon bildirimi gelince (servis çalışanından mesaj) hemen kontrol et; bildirime tıklanınca o sayfaya git
    const onMsg = (e) => {
      if (e.data?.type === 'bf-push') poll();
      if (e.data?.type === 'bf-open' && e.data.url?.startsWith('/')) navigate(e.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
    };
  }, [poll, blocked]);

  // Sekme başlığında okunmamış sayısı
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
  }, [unread, path]);

  // Oturum süresi
  useEffect(() => {
    api.sessionInfo().then(applySession).catch(() => {});
    const offAct = api.onActivity(() => {
      const t = Date.now();
      lastTouch.current = t;
      deadline.current = { ...deadline.current, idle: t + SESSION_IDLE_MS };
    });
    // Kişinin tıklaması / yazması işlem sayılır (en fazla dakikada bir sunucuya bildirilir)
    const onUser = () => {
      unlockAudio();
      if (warnOpen.current) return;
      if (Date.now() - lastTouch.current > 60000) {
        lastTouch.current = Date.now();
        api.touchSession().then(applySession).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', onUser, { passive: true });
    window.addEventListener('keydown', onUser, { passive: true });
    const tick = setInterval(() => {
      const { idle, abs } = deadline.current;
      const end = Math.min(idle, abs);
      const left = end - Date.now();
      if (left <= 0) {
        clearInterval(tick);
        warnOpen.current = false;
        setWarn(null);
        api.logout().catch(() => {});
        expireRef.current();
        navigate('/giris');
        return;
      }
      if (left <= SESSION_WARN_MS) {
        warnOpen.current = true;
        setWarn({ left, absolute: abs <= idle });
      } else if (warnOpen.current) {
        warnOpen.current = false;
        setWarn(null);
      }
    }, 1000);
    return () => {
      offAct();
      window.removeEventListener('pointerdown', onUser);
      window.removeEventListener('keydown', onUser);
      clearInterval(tick);
    };
  }, []);

  // Girişten sonra bildirim izni penceresi
  useEffect(() => {
    if (blocked || !info.hasForms || !info.enabled || path === '/panel/bildirimler') return;
    // İlk girişte "Başlarken" kartı bildirimi zaten adım adım açtırıyor; kart gizlenmeden ayrıca pencere açılmaz
    if (!getSteps(user?.id).gizle) return;
    if (Number(store.get(PROMPT_KEY) || 0) > Date.now()) return;
    let alive = true;
    registerWorker();
    deviceState().then((s) => {
      if (alive && (s === 'off' || s === 'ios-install')) setPrompt(s);
    });
    return () => {
      alive = false;
    };
  }, [info.hasForms, info.enabled, blocked, path]);

  const snooze = useCallback((days) => {
    store.set(PROMPT_KEY, String(Date.now() + days * 864e5));
    setPrompt(null);
  }, []);
  const closePrompt = useCallback(() => snooze(1), [snooze]);

  const markSeen = useCallback(async () => {
    setUnread(0);
    await api.markNotificationsSeen().catch(() => {});
  }, []);

  const value = { items, unread, info, markSeen, poll, refreshInfo: poll };

  return (
    <LiveCtx.Provider value={value}>
      {children}

      {popups.length > 0 && (
        <div className="live-popups" role="status" aria-live="assertive">
          {popups.map((p) => (
            <div key={p.id} className={`live-popup live-${p.kind}`}>
              <div className="live-popup-text">
                <b>{p.title}</b>
                <span>{p.body}</span>
              </div>
              <div className="live-popup-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => { setPopups((x) => x.filter((y) => y.id !== p.id)); markSeen(); navigate(p.url); }}>Görüntüle</button>
                <button type="button" className="icon-btn" aria-label="Kapat" onClick={() => setPopups((x) => x.filter((y) => y.id !== p.id))}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {warn && (
        <Modal title="Oturumunuz kapanmak üzere" onClose={NOOP}>
          <div className="stack">
            {warn.absolute ? (
              <p>Güvenliğiniz için 12 saatte bir yeniden giriş yapmanız gerekiyor. Oturumunuz <b>{mmss(warn.left)}</b> içinde kapanacak; yarım kalan işinizi kaydedin.</p>
            ) : (
              <p>Bir süredir işlem yapmadınız. Oturumunuz <b>{mmss(warn.left)}</b> içinde kapanacak. Devam etmek istiyor musunuz?</p>
            )}
            <div className="row-end">
              <button type="button" className="btn" onClick={async () => { await logout(); navigate('/giris'); }}>Çıkış yap</button>
              {warn.absolute ? (
                <button type="button" className="btn btn-primary" onClick={async () => { await logout(); navigate('/giris'); }}>Şimdi yeniden giriş yap</button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  autoFocus
                  onClick={async () => {
                    try {
                      applySession(await api.touchSession());
                      warnOpen.current = false;
                      setWarn(null);
                    } catch {
                      expire();
                      navigate('/giris');
                    }
                  }}
                >
                  Devam et
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {prompt && !warn && (
        <Modal title="Yeni randevulardan anında haberdar olun" onClose={closePrompt}>
          {prompt === 'ios-install' ? (
            <div className="stack">
              <p>iPhone'da bildirim alabilmek için paneli bir kere <b>Ana Ekrana</b> eklemeniz gerekiyor:</p>
              <ol className="steps">
                <li>Safari'nin altındaki <b>Paylaş</b> butonuna basın (yukarı ok olan kare).</li>
                <li><b>Ana Ekrana Ekle</b> → <b>Ekle</b> deyin.</li>
                <li>Ana ekrandaki <b>batilmer</b> simgesinden paneli açın ve giriş yapın.</li>
                <li>Çıkan pencerede <b>Bildirimlere izin ver</b> → <b>İzin Ver</b>.</li>
              </ol>
              <p className="muted small">iOS 16.4 veya üstü gerekir. Bildirimler sadece ana ekrandaki simgeden açılan panele gelir.</p>
              <div className="row-end"><button type="button" className="btn btn-primary" onClick={() => snooze(3)}>Anladım</button></div>
            </div>
          ) : (
            <div className="stack">
              <p>Size yeni bir randevu ya da kayıt geldiğinde bu {isAndroid() || isIOS() ? 'telefona' : 'bilgisayara'} bildirim gönderelim. Panel kapalıyken de gelir.</p>
              <p className="muted small">Bildirimde sadece tarih, saat ve hizmet yazar; müşterinin adı ve telefonu görünmez. Detaylar panele girince görünür. İstediğiniz zaman "Bildirimler" sayfasından kapatabilirsiniz.</p>
              <div className="row-end">
                <button type="button" className="btn" onClick={() => snooze(1)}>Daha sonra</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await enablePush();
                      setPrompt(null);
                      toast('Bildirimler bu cihazda açıldı.');
                    } catch (e) {
                      toast(e.message, 'err');
                      snooze(1);
                    }
                  }}
                >
                  Bildirimlere izin ver
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </LiveCtx.Provider>
  );
}

// ---------------------------------------------------------------- zil
export function Bell({ className = '' }) {
  const live = useLive();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!live) return null;
  const { items, unread, info, markSeen } = live;
  return (
    <div className={`bell ${className}`} ref={ref}>
      <button
        type="button"
        className="icon-btn bell-btn"
        aria-label={unread ? `Bildirimler, ${unread} yeni` : 'Bildirimler'}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) markSeen();
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Bildirimler">
          <div className="bell-head">
            <b>Bildirimler</b>
            <a href="/panel/bildirimler" className="link-sm" onClick={(e) => { e.preventDefault(); setOpen(false); navigate('/panel/bildirimler'); }}>Ayarlar</a>
          </div>
          {!info.hasForms ? (
            <div className="bell-empty">Henüz hiçbir formdan bildirim almıyorsunuz. Yöneticiniz Kullanıcılar ekranında "Bildirim" tikini işaretleyince burada görünür.</div>
          ) : !items.length ? (
            <div className="bell-empty">Son 30 günde bildirim yok.</div>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <a href={n.url} onClick={(e) => { e.preventDefault(); setOpen(false); navigate(n.url); }}>
                    <b className={`bell-kind bell-${n.kind}`}>{n.title}</b>
                    <span>{n.body}</span>
                    <small>{formatDateTime(n.at)}</small>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {!info.enabled && info.hasForms && <div className="bell-foot">Bildirimleriniz kapalı (ses ve telefon bildirimi gelmez).</div>}
        </div>
      )}
    </div>
  );
}
