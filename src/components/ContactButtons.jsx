import { telUrl, whatsappUrl } from '../lib/shared.js';

// Kayıt / randevu sahibini tek dokunuşla arama ve WhatsApp'tan yazma
export function TelIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></svg>;
}
export function WaIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4ZM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8Zm0-21.6A11.8 11.8 0 0 0 1.9 18L.2 24l6.2-1.6A11.8 11.8 0 1 0 12 .2Z" /></svg>;
}

export default function ContactButtons({ phone, compact = false, className = '' }) {
  const tel = telUrl(phone);
  const wa = whatsappUrl(phone);
  if (!tel) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <span className={`contact-btns ${className}`}>
      <a className="qa-btn qa-call" href={tel} onClick={stop} aria-label={`Ara: ${phone}`} title={`Ara: ${phone}`}>
        <TelIcon />
        {!compact && <span>Ara</span>}
      </a>
      {wa && (
        <a className="qa-btn qa-wa" href={wa} target="_blank" rel="noopener noreferrer" onClick={stop} aria-label={`WhatsApp: ${phone}`} title={`WhatsApp: ${phone}`}>
          <WaIcon />
          {!compact && <span>WhatsApp</span>}
        </a>
      )}
    </span>
  );
}
