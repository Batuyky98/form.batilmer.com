import { useEffect, useState } from 'react';
import { formBaseUrl } from '../lib/util.js';

// Müşteri sitesini taklit eden test sayfası: iframe kodunun gerçek bir sitede nasıl duracağını gösterir.
export default function EmbedTest() {
  const params = new URLSearchParams(window.location.search);
  const [slug, setSlug] = useState(params.get('f') || '');
  const [input, setInput] = useState(slug);
  const [dark, setDark] = useState(false);
  const base = formBaseUrl();

  useEffect(() => {
    document.title = 'Test sitesi – Batilmer Form';
    if (document.querySelector('script[data-test-embed]')) return;
    const s = document.createElement('script');
    s.src = `${base}/embed.js`;
    s.defer = true;
    s.dataset.testEmbed = '1';
    document.body.appendChild(s);
  }, [base]);

  return (
    <div className={`fake-site ${dark ? 'is-dark' : ''}`}>
      <div className="fake-toolbar">
        <strong>Test sitesi</strong>
        <span>Formun bir müşteri sitesine gömüldüğünde nasıl göründüğünü burada deneyin.</span>
        <form onSubmit={(e) => { e.preventDefault(); setSlug(input.trim()); window.history.replaceState({}, '', `/test-sitesi?f=${encodeURIComponent(input.trim())}`); }}>
          <input aria-label="Form linki" placeholder="form-linki" value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit">Göster</button>
        </form>
        <label><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Koyu site</label>
      </div>
      <header className="fake-header">
        <div className="fake-logo">Örnek İşletme</div>
        <nav><span>Ana sayfa</span><span>Hizmetler</span><span>Hakkımızda</span><span>İletişim</span></nav>
      </header>
      <section className="fake-hero">
        <h1>Size yardımcı olmaktan mutluluk duyarız</h1>
        <p>Aşağıdaki formu doldurun, en kısa sürede dönüş yapalım. Bu bölüm müşterinin kendi sitesi; altındaki form Batilmer'den iframe ile geliyor.</p>
      </section>
      <main className="fake-content">
        {slug ? (
          <iframe
            key={slug}
            src={`${base}/f/${slug}`}
            data-batilmer-form=""
            title="Form"
            style={{ width: '100%', border: 0, overflow: 'hidden', minHeight: 400 }}
            scrolling="no"
          />
        ) : (
          <p>Yukarıya bir form linki yazın (örnek: isletme-adi-randevu).</p>
        )}
      </main>
      <footer className="fake-footer">© Örnek İşletme · Adres · Telefon</footer>
    </div>
  );
}
