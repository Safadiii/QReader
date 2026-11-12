/* QReader: shows the "order ready" push and opens the order page when tapped.
 * Payload from the backend: { title, body, order_number, url }. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "QReader";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      // One notification per order, but "ring again" must still buzz the phone.
      tag: data.order_number ? `order-${data.order_number}` : "qreader",
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 600],
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === target) || windows.find((w) => "focus" in w);
      if (open) return open.url === target ? open.focus() : open.navigate(target).then((w) => w && w.focus());
      return self.clients.openWindow(target);
    }),
  );
});
