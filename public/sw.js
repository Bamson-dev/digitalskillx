// DigitalSkillX service worker — classroom continuity cache.
const CACHE = "digitalskillx-v3";
const OFFLINE_URLS = ["/", "/dashboard", "/continue", "/login"];
const CLASSROOM_PREFIXES = ["/courses", "/lessons", "/continue", "/dashboard", "/my-learning"];
const MAX_CACHED_NAV = 48;

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

function shouldCacheNavigation(pathname) {
  return CLASSROOM_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHED_NAV) return;
  const overflow = keys.length - MAX_CACHED_NAV;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}

// Network-first for navigations, falling back to cache when offline / outage.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/_next")) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && shouldCacheNavigation(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then(async (cache) => {
              await cache.put(req, copy);
              await trimCache(cache);
            });
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("/continue") || caches.match("/")),
        ),
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
      data: { url: data.url || "/continue" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/continue"));
});
