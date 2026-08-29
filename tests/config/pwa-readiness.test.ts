import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

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
    const serviceWorker = readFileSync(join(root, "public", "sw.js"), "utf8");

    expect(serviceWorker).toContain("fetch(request).catch");
    expect(serviceWorker).toContain("/offline.html");
    expect(serviceWorker).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(serviceWorker).not.toContain("service_role");
  });

  it("documents only public Supabase env vars in the example file", () => {
    const envExample = readFileSync(join(root, ".env.example"), "utf8");

    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(envExample).toContain("NEXT_PUBLIC_SITE_URL");
    expect(envExample).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });
});
