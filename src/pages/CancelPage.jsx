import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { Spinner } from '../components/ui.jsx';
import { formatDate } from '../lib/util.js';
import { t } from '../lib/i18n.js';

export default function CancelPage({ token }) {
  const [appt, setAppt] = useState(undefined);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getAppointmentByToken(token).then((a) => {
      setAppt(a);
      if (a) document.documentElement.lang = a.lang || 'tr';
    });
  }, [token]);

  const lang = appt?.lang || 'tr';

  async function cancel() {
    setError('');
    try {
      await api.cancelByToken(token);
      setDone(true);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="center-page">
      <div className="card narrow stack">
        {appt === undefined ? (
          <Spinner />
        ) : appt === null ? (
          <><h1>{t('tr', 'apptNotFound')}</h1><p className="muted">{t('tr', 'apptNotFoundDesc')}</p></>
        ) : done ? (
          <>
            <h1>{t(lang, 'cancelDone')}</h1>
            <p className="muted">{t(lang, 'cancelInformed', { x: appt.isletme })}</p>
            <a className="btn btn-primary" href={`/f/${appt.slug}`}>{t(lang, 'newAppointment')}</a>
          </>
        ) : (
          <>
            <h1>{t(lang, 'cancelTitle')}</h1>
            <dl className="detail">
              <div><dt>{t(lang, 'business')}</dt><dd>{appt.isletme}</dd></div>
              <div><dt>{t(lang, 'service')}</dt><dd>{appt.service}</dd></div>
              <div><dt>{t(lang, 'date')}</dt><dd>{formatDate(appt.date, lang)} · {appt.start}–{appt.end}</dd></div>
              <div><dt>{t(lang, 'status')}</dt><dd>{t(lang, 'statusLabels')[appt.status]}</dd></div>
              {appt.address && <div><dt>{t(lang, 'address')}</dt><dd>{appt.address}</dd></div>}
            </dl>
            {(appt.directionsUrl || (appt.icsUrl && appt.status !== 'iptal')) && (
              <div className="row">
                {appt.directionsUrl && <a className="btn" href={appt.directionsUrl} target="_blank" rel="noopener noreferrer">📍 {t(lang, 'directions')}</a>}
                {appt.icsUrl && <a className="btn" href={appt.icsUrl} target="_blank" rel="noopener">📅 {t(lang, 'addToCalendar')}</a>}
              </div>
            )}
            {appt.canCancel ? (
              <button type="button" className="btn btn-danger" onClick={cancel}>{t(lang, 'cancelBtn')}</button>
            ) : appt.status === 'iptal' ? (
              <div className="notice notice-info">{t(lang, 'alreadyCancelled')}</div>
            ) : (
              <div className="notice notice-warn">{t(lang, 'cutoffPassed', { n: appt.cutoffHours })}</div>
            )}
            {error && <div className="notice notice-err" role="alert">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
