/*!
 * Batilmer – ücretsiz sohbet asistanı (işletme sitesine tek satır)
 * <script src="https://form.batilmer.com/asistan.js" data-form="FORM-LINKI" defer></script>
 * İsteğe bağlı: data-renk="#3F6688" (balon rengi), data-selam="Merhaba 👋 ..." (balonun yanındaki kısa yazı)
 */
(function () {
  if (window.__batilmerAsistan) return;
  window.__batilmerAsistan = true;
  var s = document.currentScript;
  if (!s) return;
  var slug = s.getAttribute('data-form');
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return;
  var ORIGIN = new URL(s.src, location.href).origin;
  var color = /^#[0-9a-fA-F]{3,8}$/.test(s.getAttribute('data-renk') || '') ? s.getAttribute('data-renk') : '#3F6688';
  var hello = s.getAttribute('data-selam') || '';
  var css = '.bta-btn{position:fixed;right:18px;bottom:20px;z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;color:#fff;font-size:26px;display:grid;place-items:center;box-shadow:0 14px 30px -8px rgba(0,0,0,.45);transition:transform .15s}' +
    '.bta-btn:hover{transform:scale(1.05)}.bta-btn svg{width:28px;height:28px}' +
    '.bta-peek{position:fixed;right:18px;bottom:92px;z-index:2147483000;max-width:240px;background:#fff;color:#16222f;border-radius:18px 18px 4px 18px;padding:11px 14px;font:500 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.35);cursor:pointer}' +
    '.bta-peek b{position:absolute;top:-8px;right:-6px;width:22px;height:22px;border-radius:50%;background:#fff;color:#667;font:700 13px system-ui;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.2)}' +
    '.bta-box{position:fixed;right:18px;bottom:92px;z-index:2147483001;width:380px;height:min(640px,calc(100vh - 120px));border:0;border-radius:22px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5);background:#f7f9fc;display:none}' +
    '.bta-box.on{display:block}' +
    '@media (max-width:520px){.bta-box{left:8px;top:8px;right:auto;bottom:auto;width:calc(100% - 16px);height:calc(100% - 16px)}.bta-box.on~.bta-btn{display:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var box = document.createElement('iframe');
  box.className = 'bta-box'; box.title = 'Sohbet asistanı'; box.setAttribute('loading', 'lazy');
  var btn = document.createElement('button');
  btn.className = 'bta-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Sohbet asistanını aç'); btn.style.background = color;
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  btn.innerHTML = ICON_CHAT;
  var peek = null;
  if (hello) {
    peek = document.createElement('div'); peek.className = 'bta-peek'; peek.textContent = hello;
    var px = document.createElement('b'); px.textContent = '×'; px.addEventListener('click', function (e) { e.stopPropagation(); peek.remove(); peek = null; });
    peek.appendChild(px);
  }
  function open(on) {
    if (on && !box.src) box.src = ORIGIN + '/asistan/' + slug;
    box.classList.toggle('on', on);
    btn.innerHTML = on ? ICON_X : ICON_CHAT;
    btn.setAttribute('aria-label', on ? 'Sohbeti kapat' : 'Sohbet asistanını aç');
    if (peek) { peek.remove(); peek = null; }
  }
  btn.addEventListener('click', function () { open(!box.classList.contains('on')); });
  if (peek) peek.addEventListener('click', function () { open(true); });
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.type !== 'batilmer:asistan-kapat') return;
    open(false);
  });
  function mount() {
    document.body.appendChild(box);
    if (peek) document.body.appendChild(peek);
    document.body.appendChild(btn);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
