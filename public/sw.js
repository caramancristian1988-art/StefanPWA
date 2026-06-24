/* Service Worker — notificări push pentru Programări. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      data: { url: payload.url },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlPath = (event.notification.data && event.notification.data.url) || "/dashboard";
  const scope = self.registration.scope; // e.g. "https://example.com/"
  const origin = new URL(scope).origin;
  const targetUrl = urlPath.startsWith("http") ? urlPath : origin + urlPath;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // 1. A window is already showing the target URL → just focus it
      const exact = list.find(function (c) { return c.url === targetUrl; });
      if (exact) return exact.focus();

      // 2. Navigate an existing PWA window (within our scope) to the target
      const pwa = list.find(function (c) { return c.url.startsWith(scope); });
      if (pwa) {
        return pwa.navigate(targetUrl).then(function (c) {
          return c ? c.focus() : self.clients.openWindow(targetUrl);
        });
      }

      // 3. No suitable window open — open a new one
      return self.clients.openWindow(targetUrl);
    }),
  );
});
