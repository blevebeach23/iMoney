import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/services/automation/financial-automation-service", () => ({ synchronizeFinancialAutomation: mocks.sync }));
import { GET } from "@/app/api/cron/financial-automation/route";

describe("financial cron", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "test-secret"); });

  it("rejects missing or invalid authorization before accessing the database", async () => {
    expect((await GET(new Request("https://example.test/api/cron/financial-automation"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://example.test/api/cron/financial-automation", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("processes paginated owners with the same database transaction used on access", async () => {
    const batches = [[{ id: "a" }, { id: "b" }], [{ id: "c" }], []];
    const query = { order: () => query, limit: () => query, gt: vi.fn(() => query), then: (resolve: (value: unknown) => unknown) => resolve({ data: batches.shift(), error: null }) };
    const supabase = { from: () => ({ select: () => query }) };
    mocks.admin.mockReturnValue(supabase);
    mocks.sync.mockResolvedValue(1);
    const response = await GET(new Request("https://example.test/api/cron/financial-automation", { headers: { authorization: "Bearer test-secret" } }));
    expect(await response.json()).toEqual({ ok: true, owners: 3, created: 3 });
    expect(mocks.sync.mock.calls.map((call) => call[1])).toEqual(["a", "b", "c"]);
    expect(query.gt).toHaveBeenCalledWith("id", "b");
    expect(query.gt).toHaveBeenCalledWith("id", "c");
  });

  it("can reach its own authorization check without a browser session", () => {
    expect(readFileSync("middleware.ts", "utf8")).toContain("?!api/cron/financial-automation|");
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string }> };
    expect(config.crons.some((cron) => cron.path === "/api/cron/financial-automation")).toBe(true);
  });
});
