// DigitalSkillX service worker (PRD §17).
const CACHE = "digitalskillx-v1";
const OFFLINE_URLS = ["/", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first for navigations, falling back to cache when offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
  }
});

// Web push (requires VAPID + a subscription store to fully enable).
self.addEventListener("push", (event) => {
  let data = { title: "DigitalSkillX", body: "You have a new update." };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/dashboard"));
});
