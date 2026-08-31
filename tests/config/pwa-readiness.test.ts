import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const serviceWorkerPath = join(root, "public", "sw.js");

type FetchHandler = (event: FetchEventStub) => void;

type FetchEventStub = {
  request: Request;
  respondWith: (response: Promise<Response> | Response) => void;
};

function createHeaders(headers?: HeadersInit) {
  return new Headers(headers);
}

function createRequest(url: string, init?: RequestInit & { mode?: RequestMode }) {
  return {
    url,
    method: init?.method || "GET",
    mode: init?.mode || "same-origin",
    headers: createHeaders(init?.headers)
  } as Request;
}

function loadServiceWorkerFetchHandler(fetchImpl: typeof fetch, cacheMatch: (request: Request | string) => Promise<Response | undefined>) {
  const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
  const handlers: Partial<Record<string, FetchHandler>> = {};
  const serviceWorkerScope = {
    location: { origin: "https://imoney.example" },
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() },
    addEventListener: (type: string, handler: FetchHandler) => {
      handlers[type] = handler;
    }
  };
  const cachesMock = {
    open: () =>
      Promise.resolve({
        addAll: () => Promise.resolve(),
        put: () => Promise.resolve()
      }),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    match: cacheMatch
  };

  Function("self", "caches", "fetch", "Response", serviceWorker)(serviceWorkerScope, cachesMock, fetchImpl, Response);

  const handler = handlers.fetch;

  if (!handler) {
    throw new Error("Service worker fetch handler was not registered");
  }

  return handler;
}

function runFetchHandler(handler: FetchHandler, request: Request) {
  let responsePromise: Promise<Response> | Response | undefined;

  handler({
    request,
    respondWith: (response) => {
      responsePromise = response;
    }
  });

  return responsePromise;
}

function pngDimensions(path: string) {
  const file = readFileSync(path);

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20)
  };
}

describe("PWA readiness", () => {
  it("has an installable manifest for iMoney", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.webmanifest"), "utf8")) as Record<string, unknown>;
    const icons = manifest.icons as Array<Record<string, unknown>>;

    expect(manifest.name).toBe("iMoney");
    expect(manifest.short_name).toBe("iMoney");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toBe("#1f6f5b");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }),
        expect.objectContaining({ src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" })
      ])
    );
    expect(JSON.stringify(icons)).not.toContain(".svg");
  });

  it("uses real PNG icon assets with expected dimensions", () => {
    expect(pngDimensions(join(root, "public", "icons", "icon-192.png"))).toEqual({ width: 192, height: 192 });
    expect(pngDimensions(join(root, "public", "icons", "icon-512.png"))).toEqual({ width: 512, height: 512 });
    expect(pngDimensions(join(root, "public", "icons", "apple-touch-icon.png"))).toEqual({ width: 180, height: 180 });
    expect(pngDimensions(join(root, "public", "icons", "favicon-32.png"))).toEqual({ width: 32, height: 32 });
    expect(existsSync(join(root, "public", "favicon.ico"))).toBe(true);
  });

  it("keeps the service worker online-first with an offline fallback", () => {
    const serviceWorker = readFileSync(serviceWorkerPath, "utf8");

    expect(serviceWorker).toContain("fetchNavigation(request)");
    expect(serviceWorker).toContain("fetchAndCache(request)");
    expect(serviceWorker).toContain("/offline.html");
    expect(serviceWorker).toContain("/icons/icon-192.png");
    expect(serviceWorker).toContain("/icons/icon-512.png");
    expect(serviceWorker).toContain("/icons/apple-touch-icon.png");
    expect(serviceWorker).not.toContain("icon.svg");
    expect(serviceWorker).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(serviceWorker).not.toContain("service_role");
  });

  it("does not respond to non-GET requests", () => {
    const handler = loadServiceWorkerFetchHandler(
      () => Promise.resolve(new Response("ok")),
      () => Promise.resolve(undefined)
    );

    expect(runFetchHandler(handler, createRequest("https://imoney.example/family/settings", { method: "POST" }))).toBeUndefined();
    expect(runFetchHandler(handler, createRequest("https://imoney.example/family/settings", { method: "PUT" }))).toBeUndefined();
    expect(runFetchHandler(handler, createRequest("https://imoney.example/family/settings", { method: "PATCH" }))).toBeUndefined();
    expect(runFetchHandler(handler, createRequest("https://imoney.example/family/settings", { method: "DELETE" }))).toBeUndefined();
  });

  it("does not intercept Supabase, API, auth, or server action requests", () => {
    const handler = loadServiceWorkerFetchHandler(
      () => Promise.resolve(new Response("ok")),
      () => Promise.resolve(undefined)
    );

    expect(runFetchHandler(handler, createRequest("https://project.supabase.co/rest/v1/households"))).toBeUndefined();
    expect(runFetchHandler(handler, createRequest("https://imoney.example/api/households"))).toBeUndefined();
    expect(runFetchHandler(handler, createRequest("https://imoney.example/auth/callback"))).toBeUndefined();
    expect(
      runFetchHandler(
        handler,
        createRequest("https://imoney.example/family/settings", {
          headers: { "next-action": "createHousehold" }
        })
      )
    ).toBeUndefined();
  });

  it("returns a Response for offline GET navigations only", async () => {
    const handler = loadServiceWorkerFetchHandler(
      () => Promise.reject(new Error("offline")),
      (request) => Promise.resolve(request === "/offline.html" ? new Response("offline page") : undefined)
    );

    const navigationResponse = runFetchHandler(
      handler,
      createRequest("https://imoney.example/family/settings", {
        mode: "navigate"
      })
    );
    const assetResponse = runFetchHandler(handler, createRequest("https://imoney.example/icons/icon-192.png"));

    await expect(navigationResponse).resolves.toBeInstanceOf(Response);
    await expect(assetResponse).resolves.toBeInstanceOf(Response);
    await expect(navigationResponse).resolves.toHaveProperty("status", 200);
    await expect(assetResponse).resolves.toHaveProperty("status", 503);
  });

  it("emits both Chromium and Apple PWA capability metadata", () => {
    const layout = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");

    expect(layout).toContain("\"mobile-web-app-capable\": \"yes\"");
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain("capable: true");
    expect(layout).toContain("/icons/apple-touch-icon.png");
    expect(layout).toContain("/favicon.ico");
    expect(layout).not.toContain("icon.svg");
  });

  it("documents only public Supabase env vars in the example file", () => {
    const envExample = readFileSync(join(root, ".env.example"), "utf8");

    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(envExample).toContain("NEXT_PUBLIC_SITE_URL");
    expect(envExample).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });
});
