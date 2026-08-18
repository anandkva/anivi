/* Anivi service worker.
 *
 * Scope is deliberately small: cache the app shell so Anivi opens instantly
 * (and shows something when offline). Realtime traffic and the API are never
 * cached — a stale canvas would be worse than no canvas.
 */

const CACHE = 'anivi-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Anything realtime or room-specific goes straight to the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, cached shell as the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Static assets: cache first, refreshed in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});

/* ---------------------------------------------------------------------------
 * PWA widget support (Web App Manifest `widgets`).
 *
 * Only Windows 11's widget board implements this today; iOS and Android Home
 * Screens do not. It is wired up so Anivi works where the standard exists,
 * while the phone widgets are served by /widget and the widget card image.
 * ------------------------------------------------------------------------- */

async function widgetPayload() {
  const roomId = await readRoomId();
  const fallback = {
    lastActivity: 'Open Anivi to connect ❤️',
    lastActivityTimestamp: Date.now(),
    hasPreview: false,
    previewUrl: '',
  };
  if (!roomId) return fallback;

  try {
    const apiBase = await readApiBase();
    const res = await fetch(`${apiBase}/api/room/${encodeURIComponent(roomId)}`);
    if (!res.ok) return fallback;
    const state = await res.json();
    return {
      lastActivity: state.lastActivity ?? 'Anivi ❤️',
      lastActivityTimestamp: state.lastActivityTimestamp ?? Date.now(),
      hasPreview: Boolean(state.hasPreview),
      previewUrl: state.hasPreview
        ? `${apiBase}/api/room/${encodeURIComponent(roomId)}/preview?v=${state.previewUpdatedAt}`
        : '',
    };
  } catch {
    return fallback;
  }
}

/* The service worker cannot read localStorage, so the app mirrors the pairing
 * into a cache entry the worker can see. */
async function readRoomId() {
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match('/__anivi_pairing');
    if (!res) return '';
    const data = await res.json();
    return data.roomId ?? '';
  } catch {
    return '';
  }
}

async function readApiBase() {
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match('/__anivi_pairing');
    if (!res) return '';
    const data = await res.json();
    return data.apiBase ?? '';
  } catch {
    return '';
  }
}

async function renderWidgets() {
  if (!self.widgets) return;
  const data = await widgetPayload();
  const installed = await self.widgets.matchAll({ tag: 'anivi-space' });
  await Promise.all(
    installed.map((widget) =>
      self.widgets.updateByInstanceId(widget.instanceId, {
        template: widget.definition.template,
        data: JSON.stringify(data),
      }),
    ),
  );
}

self.addEventListener('widgetinstall', (event) => event.waitUntil(renderWidgets()));
self.addEventListener('widgetresume', (event) => event.waitUntil(renderWidgets()));
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'anivi-widget') event.waitUntil(renderWidgets());
});

/* The app posts its pairing here so the worker (and therefore the widget)
 * knows which room to show. */
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'anivi:pairing') return;
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.put(
          '/__anivi_pairing',
          new Response(JSON.stringify({ roomId: msg.roomId, apiBase: msg.apiBase }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      )
      .then(renderWidgets),
  );
});

/* ---------------------------------------------------------------------------
 * Push notifications.
 *
 * The payload deliberately carries no message text — Anivi encrypts the
 * conversation at rest, and a notification travels through a push service and
 * lands on a lock screen. The notification says who, not what.
 * ------------------------------------------------------------------------- */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'Anivi ❤️';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Something new in your space',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // One notification per room: a second message replaces the first
      // rather than stacking a pile of buzzes.
      tag: data.tag || 'anivi',
      renotify: true,
      data: { roomId: data.roomId || '' },
    }).catch((err) => {
      console.info('[anivi:sw] showNotification failed', err);
      throw err;
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const roomId = event.notification.data && event.notification.data.roomId;
  const url = roomId ? `/?room=${encodeURIComponent(roomId)}` : '/';

  // Focus the app if it is already open rather than opening a second copy.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(self.location.origin)) {
          client.postMessage({ type: 'anivi:open-room', roomId });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
