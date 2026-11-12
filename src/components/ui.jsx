import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------------- Bildirim (toast)
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Modal
export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Kapat" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- Onay penceresi (tarayıcı confirm() yerine)
const ConfirmCtx = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const ask = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve });
      }),
    []
  );
  const close = (v) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && (
        <Modal
          title={state.title || 'Emin misiniz?'}
          onClose={() => close(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => close(false)}>Vazgeç</button>
              <button type="button" className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {state.confirmText || 'Onayla'}
              </button>
            </>
          }
        >
          <p className="pre">{state.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---------------- Küçük parçalar
export function Toggle({ checked, onChange, label, disabled, id }) {
  return (
    <label className={`toggle ${disabled ? 'is-disabled' : ''}`} htmlFor={id}>
      <input id={id} type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="pf">
      {label && <label className="pf-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <div className="pf-hint">{hint}</div>}
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Yükleniyor" />;
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fn();
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------------- Ekran genişliği (telefon görünümü için)
export function useMedia(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia?.(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    m.addEventListener?.('change', fn);
    fn();
    return () => m.removeEventListener?.('change', fn);
  }, [query]);
  return !!on;
}
export const useIsMobile = () => useMedia('(max-width: 720px)');

// ---------------- Şifre alanı (göz simgesiyle göster / gizle)
export function PasswordInput({ id, value, onChange, autoComplete = 'current-password', required, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} required={required} autoComplete={autoComplete} value={value} onChange={onChange} spellCheck={false} autoCapitalize="none" {...rest} />
      <button type="button" className="pw-eye" aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'} aria-pressed={show} aria-controls={id} onClick={() => setShow((s) => !s)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? (
            <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3.2 4.3M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7a9.8 9.8 0 0 0 4.4-1" />
          ) : (
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          )}
        </svg>
      </button>
    </div>
  );
}
