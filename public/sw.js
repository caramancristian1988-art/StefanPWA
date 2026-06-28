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
  var urlPath = (event.notification.data && event.notification.data.url) || "/dashboard";
  var scope = self.registration.scope; // e.g. "https://example.com/"
  var origin = new URL(scope).origin;
  var targetUrl = urlPath.startsWith("http") ? urlPath : origin + urlPath;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      // 1. Fereastra exactă deja deschisă → focus
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === targetUrl) {
          return list[i].focus();
        }
      }

      // 2. Navighează o fereastră PWA existentă
      for (var j = 0; j < list.length; j++) {
        if (list[j].url.startsWith(scope)) {
          var client = list[j];
          if ("navigate" in client) {
            return client.navigate(targetUrl).then(function (c) {
              return c ? c.focus() : self.clients.openWindow(targetUrl);
            }).catch(function () {
              return self.clients.openWindow(targetUrl);
            });
          }
          // navigate nu e disponibil → deschide fereastră nouă
          return self.clients.openWindow(targetUrl);
        }
      }

      // 3. Nicio fereastră → deschide una nouă
      return self.clients.openWindow(targetUrl);
    }),
  );
});
