import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

describe("PWA readiness", () => {
  it("has an installable manifest for iMoney", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.webmanifest"), "utf8")) as Record<string, unknown>;

    expect(manifest.name).toBe("iMoney");
    expect(manifest.short_name).toBe("iMoney");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toBe("#1f6f5b");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the service worker online-first with an offline fallback", () => {
    const serviceWorker = readFileSync(serviceWorkerPath, "utf8");

    expect(serviceWorker).toContain("fetchNavigation(request)");
    expect(serviceWorker).toContain("fetchAndCache(request)");
    expect(serviceWorker).toContain("/offline.html");
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
    const assetResponse = runFetchHandler(handler, createRequest("https://imoney.example/icon.svg"));

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
  });

  it("documents only public Supabase env vars in the example file", () => {
    const envExample = readFileSync(join(root, ".env.example"), "utf8");

    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(envExample).toContain("NEXT_PUBLIC_SITE_URL");
    expect(envExample).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });
});
