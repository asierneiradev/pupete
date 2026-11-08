/* Pupete · service worker: solo avisos push del buzón secreto. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pupete", body: event.data ? event.data.text() : "" };
  }
  const url = data.url || "/";
  event.waitUntil(
    (async () => {
      // Si ya tienes esa conversación abierta y delante, no hace falta avisar
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const watching = wins.some((w) => w.focused && w.visibilityState === "visible" && new URL(w.url).pathname === url);
      if (watching) return;
      await self.registration.showNotification(data.title || "Pupete", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url },
        lang: "es",
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) return w.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
