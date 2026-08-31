const CACHE_NAME = "imoney-v1-online-first";
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = ["/manifest.webmanifest", "/icon.svg", "/icons/icon-192.svg", "/icons/icon-512.svg", "/offline.html"];
const EXCLUDED_PATH_PREFIXES = ["/api/", "/auth/", "/_next/"];

function isExcludedRequest(request, url) {
  return EXCLUDED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) || request.headers.has("next-action");
}

async function fetchNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const offlineResponse = await caches.match(OFFLINE_URL);
    return (
      offlineResponse ||
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    );
  }
}

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    }

    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    return (
      cachedResponse ||
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isExcludedRequest(request, url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetchNavigation(request));
    return;
  }

  event.respondWith(fetchAndCache(request));
});
