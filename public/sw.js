// Batilmer Form Paneli – bildirim servis çalışanı.
// Sadece telefon/bilgisayar bildirimini gösterir ve bildirime tıklanınca paneli açar.
// Sayfa önbelleği (offline) YOK: panel her zaman sunucudaki güncel hâliyle açılır.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Batilmer Form', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Batilmer Form';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    timestamp: data.ts || Date.now(),
    data: { url: data.url || '/panel' },
    requireInteraction: false,
    renotify: !!data.tag,
    actions: [{ action: 'ac', title: 'Aç' }]
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Panel açıksa hemen yenilensin
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => c.postMessage({ type: 'bf-push' }));
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/panel', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const panel = list.find((c) => new URL(c.url).pathname.startsWith('/panel')) || list.find((c) => new URL(c.url).origin === self.location.origin);
      if (panel) {
        await panel.focus();
        panel.postMessage({ type: 'bf-open', url: url.pathname + url.search });
        return;
      }
      // Oturum kapalıysa panel giriş ekranını gösterir; detaylar ancak giriş yapınca görünür
      await self.clients.openWindow(url.pathname + url.search);
    })()
  );
});

// Tarayıcı aboneliği yenilerse (nadiren) panel bir sonraki açılışta yeniden kaydeder
self.addEventListener('pushsubscriptionchange', () => {});
