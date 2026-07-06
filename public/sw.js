/* Service Worker — caching + push notifications */

const CACHE = "app-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ── Install: precache shell assets ─────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

// ── Activate: delete old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip API routes, auth, Next.js internals
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.includes("__nextjs")
  ) return;

  // Static assets from Next.js build (_next/static) — cache-first (they're content-hashed)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ?? fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }),
      ),
    );
    return;
  }

  // Public static files (icons, images) — cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|svg|ico|webp|jpg|jpeg|gif|woff2|woff)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ?? fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }),
      ),
    );
    return;
  }

  // Navigation requests — network-first, fallback to offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = { title: "Programări", body: "", url: "/dashboard" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
      vibrate: [80, 40, 80],
    }),
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlPath = (event.notification.data && event.notification.data.url) || "/dashboard";
  const scope = self.registration.scope;
  const origin = new URL(scope).origin;
  const targetUrl = urlPath.startsWith("http") ? urlPath : origin + urlPath;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === targetUrl) return client.focus();
      }
      for (const client of list) {
        if (client.url.startsWith(scope)) {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then((c) =>
              c ? c.focus() : self.clients.openWindow(targetUrl),
            ).catch(() => self.clients.openWindow(targetUrl));
          }
          return self.clients.openWindow(targetUrl);
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// ── SW update message ─────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
