import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { Modal, copyText, useToast } from './ui.jsx';
import { WaIcon } from './ContactButtons.jsx';
import { formBaseUrl } from '../lib/util.js';

// Formu paylaş: linki kopyala, WhatsApp'ta gönder, telefonun paylaş menüsü, QR kod (kapıya / masaya)
export default function ShareFormModal({ form, onClose }) {
  const toast = useToast();
  const url = `${formBaseUrl()}/f/${form.slug}`;
  const title = form.isletme ? `${form.isletme} – ${form.name}` : form.name;
  const qr = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    return { svg: q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }), png: q.createDataURL(12, 4) };
  }, [url]);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const notLive = !form.publishedAt || form.control?.status !== 'aktif';

  async function copy() {
    toast((await copyText(url)) ? 'Link kopyalandı.' : 'Kopyalanamadı; linki elle seçin.', 'ok');
  }
  async function share() {
    try {
      await navigator.share({ title, text: `${title} için online randevu / başvuru:`, url });
    } catch {
      /* kullanıcı vazgeçti */
    }
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;

  return (
    <Modal title="Formu paylaş" onClose={onClose}>
      <div className="stack share-modal">
        {notLive && <div className="notice notice-warn">Bu form şu an {form.publishedAt ? 'pasif' : 'yayınlanmamış'}; linki açan kişi formu dolduramaz.</div>}
        <div className="share-link">
          <input readOnly value={url} aria-label="Form linki" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-primary" onClick={copy}>Kopyala</button>
        </div>
        <div className="share-btns">
          <a className="share-btn share-wa" href={wa} target="_blank" rel="noopener noreferrer"><WaIcon /> WhatsApp</a>
          {canShare && <button type="button" className="share-btn" onClick={share}>📤 Diğer uygulamalar</button>}
          <a className="share-btn" href={url} target="_blank" rel="noopener noreferrer">↗ Formu aç</a>
        </div>
        <div className="share-qr">
          {/* SVG metni kütüphanenin kendi ürettiği; içinde kullanıcı girdisi yok */}
          <div className="qr" aria-label="Formun kare kodu" dangerouslySetInnerHTML={{ __html: qr.svg }} />
          <div className="stack-sm">
            <b>Kare kod (QR)</b>
            <span className="muted small">Kapıya, masaya, kartvizite koyun; telefon kamerasıyla okutan müşteri doğrudan forma gelir.</span>
            <a className="btn btn-sm" href={qr.png} download={`${form.slug}-qr.gif`}>QR'ı indir</a>
          </div>
        </div>
        <div className="pf-hint">Instagram biyografisine ve Google İşletme profilindeki "Randevu" bağlantısına da bu linki koyabilirsiniz.</div>
      </div>
    </Modal>
  );
}
