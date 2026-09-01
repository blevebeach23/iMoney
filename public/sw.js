const CACHE_NAME = "imoney-v1-online-first";
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = ["/manifest.webmanifest", "/favicon.ico", "/icons/favicon-32.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/offline.html"];
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

self.addEventListener("push", (event) => {
  let payload = {
    title: "iMoney",
    body: "Hai una nuova notifica.",
    url: "/notifications",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png"
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  console.info("[sw] push payload received", {
    title: payload.title || null,
    type: payload.type || null,
    notificationId: payload.notificationId || null,
    url: payload.url || null
  });

  event.waitUntil(
    self.registration.showNotification(payload.title || "iMoney", {
      body: payload.body || "Hai una nuova notifica.",
      data: {
        notificationId: payload.notificationId,
        type: payload.type,
        url: payload.url || "/notifications"
      },
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/favicon-32.png"
    }).then(() =>
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
        Promise.all(
          clients.map((client) =>
            client.postMessage({
              type: "imoney:notification-received"
            })
          )
        )
      )
    )
  );
});

function normalizeNotificationUrl(value) {
  let fallbackApplied = false;
  let normalizedPath = "/notifications";

  try {
    const url = new URL(value || "/notifications", self.location.origin);

    if (url.origin === self.location.origin && isKnownNotificationRoute(url.pathname)) {
      normalizedPath = url.pathname;
      if (url.pathname.startsWith("/budgets/")) {
        normalizedPath = `${url.pathname}${url.search}`;
      }
    } else {
      fallbackApplied = true;
    }
  } catch {
    fallbackApplied = true;
  }

  console.info("[sw] notification url normalized", {
    originalUrl: value || null,
    normalizedPath,
    fallbackApplied
  });

  return normalizedPath;
}

function isKnownNotificationRoute(pathname) {
  return (
    pathname === "/notifications" ||
    pathname === "/family" ||
    /^\/movements\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/transfers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/funds\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/budgets\/\d{4}\/\d{2}$/.test(pathname)
  );
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const originalUrl = event.notification.data?.url;
  const normalizedPath = normalizeNotificationUrl(originalUrl);
  const targetUrl = new URL(normalizedPath, self.location.origin).toString();

  console.info("[sw] notification click", {
    data: event.notification.data || null,
    originalUrl: originalUrl || null,
    normalizedPath,
    targetUrl
  });

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }

          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
