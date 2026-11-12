import { useState } from 'react';
import * as api from '../lib/api.js';
import { useToast } from './ui.jsx';
import { dateTimeToMs } from '../lib/util.js';

// Randevu kartındaki tek dokunuşluk işlemler: Ara · Onayla · Geldi / Gelmedi
export function quickStatuses(a) {
  if (a.status === 'bekliyor') return [['onaylandi', 'Onayla', 'ok']];
  if (a.status === 'onaylandi' && dateTimeToMs(a.date, a.start) <= Date.now() + 30 * 60000) {
    return [['geldi', 'Geldi', 'ok'], ['gelmedi', 'Gelmedi', 'no']];
  }
  return [];
}

const telHref = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`;

export default function ApptActions({ appt, phone, onDone, compact = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const list = quickStatuses(appt);
  if (!list.length && !phone) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <div className={`qa ${compact ? 'qa-compact' : ''}`} onClick={stop} onKeyDown={stop}>
      {phone && (
        <a className="qa-btn qa-call" href={telHref(phone)} aria-label={`Ara: ${phone}`} title={phone}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></svg>
          {!compact && <span>Ara</span>}
        </a>
      )}
      {list.map(([st, label, tone]) => (
        <button
          key={st}
          type="button"
          className={`qa-btn qa-${tone}`}
          disabled={!!busy}
          onClick={async () => {
            setBusy(st);
            try {
              await api.setAppointmentStatus(appt.id, st);
              toast(`${label}: ${appt.start}`);
              onDone?.();
            } catch (e) {
              toast(e.message, 'err');
            } finally {
              setBusy('');
            }
          }}
        >
          {busy === st ? '…' : label}
        </button>
      ))}
    </div>
  );
}
