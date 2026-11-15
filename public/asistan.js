/*!
 * Batilmer – ücretsiz sohbet asistanı (işletme sitesine tek satır)
 * <script src="https://form.batilmer.com/asistan.js" data-form="FORM-LINKI" defer></script>
 * Renk ve yazılar panelden ayarlanır (Form → Ayarlar → Sohbet asistanı).
 * İsteğe bağlı, paneli ezmek için: data-renk="#3F6688", data-selam="Merhaba 👋 ..." (boş verilirse yazı çıkmaz)
 */
(function () {
  if (window.__batilmerAsistan) return;
  window.__batilmerAsistan = true;
  var s = document.currentScript;
  if (!s) return;
  var slug = s.getAttribute('data-form');
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return;
  var ORIGIN = new URL(s.src, location.href).origin;
  var forceColor = /^#[0-9a-fA-F]{6}$/.test(s.getAttribute('data-renk') || '') ? s.getAttribute('data-renk') : '';
  var forceHello = s.getAttribute('data-selam');
  function onColor(hex) {
    var n = parseInt(hex.slice(1), 16);
    function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.45 ? '#16222f' : '#fff';
  }
  // Renk ve balon yazısı panelden gelir; asistan kapalıysa balon hiç çıkmaz
  fetch(ORIGIN + '/api/asistan/' + slug).then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
    if (!cfg) return;
    start(forceColor || (/^#[0-9a-fA-F]{6}$/.test(cfg.color || '') ? cfg.color : '#3F6688'), forceHello != null ? forceHello : (cfg.peek || ''));
  }).catch(function () {});

  function start(color, hello) {
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
  btn.className = 'bta-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Sohbet asistanını aç'); btn.style.background = color; btn.style.color = onColor(color);
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  btn.innerHTML = ICON_CHAT;
  var peek = null;
  var peekClosed = false;
  try { peekClosed = sessionStorage.getItem('bta-peek-kapali') === '1'; } catch (x) {}
  if (hello && !peekClosed) {
    peek = document.createElement('div'); peek.className = 'bta-peek'; peek.textContent = hello;
    var px = document.createElement('b'); px.textContent = '×'; px.setAttribute('role', 'button'); px.setAttribute('aria-label', 'Kapat');
    px.addEventListener('click', function (e) { e.stopPropagation(); peek.remove(); peek = null; try { sessionStorage.setItem('bta-peek-kapali', '1'); } catch (x) {} });
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
  }
})();
