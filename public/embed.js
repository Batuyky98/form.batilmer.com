/*!
 * Batilmer Form – iframe otomatik yükseklik
 * Kullanım: <iframe data-batilmer-form src="https://form.batilmer.com/f/..."></iframe>
 *           <script src="https://form.batilmer.com/embed.js" defer></script>
 */
(function () {
  if (window.__batilmerEmbed) return; // Aynı sayfada iki kez eklenirse tek kez çalışsın
  window.__batilmerEmbed = true;

  var script = document.currentScript;
  var FORM_ORIGIN = script && script.src ? new URL(script.src, window.location.href).origin : window.location.origin;

  function frames() {
    return Array.prototype.slice.call(document.querySelectorAll('iframe[data-batilmer-form]'));
  }

  function prepare(frame) {
    if (frame.__batilmerReady) return;
    frame.__batilmerReady = true;
    frame.setAttribute('scrolling', 'no');
    frame.style.overflow = 'hidden';
    frame.style.border = '0';
    frame.style.width = '100%';
    frame.style.transition = 'height .15s ease';
    var ping = function () {
      try {
        frame.contentWindow.postMessage({ type: 'batilmer:ping' }, FORM_ORIGIN);
      } catch (e) {
        /* yoksay */
      }
    };
    frame.addEventListener('load', ping);
    ping();
  }

  window.addEventListener('message', function (e) {
    // Sadece form sunucusundan gelen mesajları dinle
    if (e.origin !== FORM_ORIGIN) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string' || d.type.indexOf('batilmer:') !== 0) return;
    var frame = null;
    var list = frames();
    for (var i = 0; i < list.length; i++) {
      if (list[i].contentWindow === e.source) {
        frame = list[i];
        break;
      }
    }
    if (!frame) return;

    if (d.type === 'batilmer:height' && typeof d.height === 'number' && d.height > 0) {
      frame.style.height = Math.ceil(d.height) + 'px';
      frame.style.minHeight = '0';
    } else if (d.type === 'batilmer:scroll') {
      var rect = frame.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight) {
        window.scrollTo({ top: rect.top + window.pageYOffset - 16, behavior: 'smooth' });
      }
    } else if (d.type === 'batilmer:redirect' && typeof d.url === 'string' && /^https?:\/\//.test(d.url)) {
      window.location.href = d.url;
    }
  });

  function init() {
    frames().forEach(prepare);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Sonradan eklenen iframe'ler için (SPA siteler)
  if (window.MutationObserver) {
    new MutationObserver(init).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
