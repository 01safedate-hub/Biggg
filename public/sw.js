/* LaundryPoint service worker. It makes the app installable and shows a friendly page when offline.
   It never stores signed-in pages or data, so nothing private is kept on the device by the app shell. */
const CACHE = "lp-shell-v1";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/brand/icon/192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((r) => r || new Response("You are offline.", { status: 503 }))));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "New WhatsApp message" }; }
  event.waitUntil(self.registration.showNotification(data.title || "LaundryPoint support", {
    body: data.body || "A customer sent a WhatsApp message.",
    icon: "/brand/icon/192.png",
    badge: "/brand/icon/192.png",
    tag: data.tag || "laundrypoint-support",
    data: { url: data.url || "/staff/support" },
    renotify: true,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/staff/support";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) { client.navigate(url); return client.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
