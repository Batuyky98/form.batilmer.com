import { useState } from 'react';
import * as api from '../lib/api.js';
import { useToast } from './ui.jsx';
import { dateTimeToMs } from '../lib/util.js';
import ContactButtons from './ContactButtons.jsx';
import { navigate } from '../router.jsx';
import { phoneKey } from '../lib/reminder.js';

// Randevu kartındaki tek dokunuşluk işlemler: Ara · Onayla · Geldi / Gelmedi
export function quickStatuses(a) {
  if (a.status === 'bekliyor') return [['onaylandi', 'Onayla', 'ok']];
  if (a.status === 'onaylandi' && dateTimeToMs(a.date, a.start) <= Date.now() + 30 * 60000) {
    return [['geldi', 'Geldi', 'ok'], ['gelmedi', 'Gelmedi', 'no']];
  }
  return [];
}


export default function ApptActions({ appt, phone, onDone, compact = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const list = quickStatuses(appt);
  if (!list.length && !phone) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <div className={`qa ${compact ? 'qa-compact' : ''}`} onClick={stop} onKeyDown={stop}>
      {phone && <ContactButtons phone={phone} compact={compact} />}
      {phone && !compact && phoneKey(phone) && (
        <a className="qa-btn" href={`/panel/musteriler/${phoneKey(phone)}`} title="Müşteri kartı" aria-label="Müşteri kartı" onClick={(e) => { e.preventDefault(); navigate(`/panel/musteriler/${phoneKey(phone)}`); }}>
          👤 <span>Kart</span>
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
