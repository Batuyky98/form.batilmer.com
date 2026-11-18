import { useState } from 'react';
import * as api from '../lib/api.js';
import { navigate } from '../router.jsx';
import { Badge, Modal, useConfirm, useToast } from './ui.jsx';
import { TelIcon, WaIcon } from './ContactButtons.jsx';
import { telUrl, whatsappUrl } from '../lib/shared.js';
import { dateTimeToMs, today, addDays, formatDateShort, weekdayName } from '../lib/util.js';

const TONE = { bekliyor: 'amber', onaylandi: 'green', iptal: 'gray', geldi: 'blue', gelmedi: 'red' };

export function dayLabel(date) {
  if (date === today()) return 'Bugün';
  if (date === addDays(today(), 1)) return 'Yarın';
  return `${weekdayName(date)}, ${formatDateShort(date)}`;
}

// Randevuya dokununca alttan açılan pencere: bütün işlemler tek yerde
export default function ApptSheet({ appt: a, isletme, onClose, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const tel = telUrl(a.phone);
  const wa = whatsappUrl(a.phone);
  const started = dateTimeToMs(a.date, a.start) <= Date.now() + 30 * 60000;
  const go = (url) => {
    onClose();
    navigate(url);
  };

  async function setStatus(status, label) {
    if (status === 'iptal') {
      const ok = await confirm({ title: 'Randevu iptal edilsin mi?', message: `${a.name || 'Müşteri'} · ${dayLabel(a.date)} ${a.start}. Saat başkalarına açılır.`, confirmText: 'İptal et', danger: true });
      if (!ok) return;
    }
    setBusy(status);
    try {
      await api.setAppointmentStatus(a.id, status);
      toast(`${label}: ${a.name || a.start}`);
      onDone?.();
      onClose();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  const live = ['bekliyor', 'onaylandi'].includes(a.status);
  return (
    <Modal title={a.name || 'İsimsiz'} onClose={onClose}>
      <div className="as">
        <div className="as-meta">
          <div><b>{dayLabel(a.date)} · {a.start}–{a.end}</b></div>
          <div className="muted">{[a.service, a.resource, a.partySize > 1 ? `${a.partySize} kişi` : '', isletme].filter(Boolean).join(' · ')}</div>
          <div className="as-badge"><Badge tone={TONE[a.status]}>{api.STATUS_LABELS[a.status]}</Badge></div>
        </div>

        <div className="as-icons">
          {tel ? <a className="as-ic" href={tel}><i><TelIcon /></i>Ara</a> : <span className="as-ic is-off"><i><TelIcon /></i>Ara</span>}
          {wa ? <a className="as-ic as-wa" href={wa} target="_blank" rel="noopener noreferrer"><i><WaIcon /></i>WhatsApp</a> : <span className="as-ic is-off"><i><WaIcon /></i>WhatsApp</span>}
          <button type="button" className="as-ic" onClick={() => go(`/panel/formlar/${a.formId}/randevular?tarih=${a.date}`)}><i>🗓️</i>Takvimde</button>
          {a.customerKey ? <button type="button" className="as-ic" onClick={() => go(`/panel/musteriler/${a.customerKey}`)}><i>👤</i>Müşteri</button> : <span className="as-ic is-off"><i>👤</i>Müşteri</span>}
        </div>

        {a.status === 'bekliyor' && (
          <button type="button" className="as-big as-ok" disabled={!!busy} onClick={() => setStatus('onaylandi', 'Onaylandı')}>{busy === 'onaylandi' ? '…' : '✓ Randevuyu onayla'}</button>
        )}
        {a.status === 'onaylandi' && started && (
          <div className="as-two">
            <button type="button" className="as-big as-ok" disabled={!!busy} onClick={() => setStatus('geldi', 'Geldi')}>{busy === 'geldi' ? '…' : '✓ Geldi'}</button>
            <button type="button" className="as-big as-no" disabled={!!busy} onClick={() => setStatus('gelmedi', 'Gelmedi')}>{busy === 'gelmedi' ? '…' : 'Gelmedi'}</button>
          </div>
        )}
        {a.status === 'onaylandi' && !started && <div className="as-note">Randevu saatine 30 dakika kala "Geldi / Gelmedi" düğmeleri burada çıkar.</div>}

        <div className="as-links">
          {a.submissionId && <button type="button" onClick={() => go(`/panel/formlar/${a.formId}/kayitlar?kayit=${a.submissionId}`)}>Formda yazdıkları<span>›</span></button>}
          <button type="button" onClick={() => go(`/panel/formlar/${a.formId}/randevular?tarih=${a.date}`)}>Başka saate taşı<span>›</span></button>
          {live && <button type="button" className="as-danger" disabled={!!busy} onClick={() => setStatus('iptal', 'İptal edildi')}>Randevuyu iptal et<span>›</span></button>}
        </div>
      </div>
    </Modal>
  );
}
