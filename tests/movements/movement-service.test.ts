import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getMonthlyMovements, getMovements, getMovementsBetween, getSharedHouseholdMovementById, getSharedHouseholdMovements } from "@/services/movements/movement-service";

describe("movement service", () => {
  it("loads a shared household movement by id without applying an owner filter", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const query = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle
    };
    const select = vi.fn(() => query);
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as unknown as SupabaseClient;

    await getSharedHouseholdMovementById(supabase, "10000000-0000-4000-8000-000000000001");

    expect(from).toHaveBeenCalledWith("movements");
    expect(query.eq).toHaveBeenCalledWith("id", "10000000-0000-4000-8000-000000000001");
    expect(query.eq).toHaveBeenCalledWith("shared_with_family", true);
    expect(query.eq).not.toHaveBeenCalledWith("owner_user_id", expect.any(String));
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("orders personal movement lists by movement date desc and created_at desc", async () => {
    const query = queryMock();
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) } as unknown as SupabaseClient;

    await getMovements(supabase, "user-1");

    expect(query.order).toHaveBeenNthCalledWith(1, "occurred_on", { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: false });
  });

  it("orders personal date range lists by movement date desc and created_at desc", async () => {
    const query = queryMock();
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) } as unknown as SupabaseClient;

    await getMonthlyMovements(supabase, "user-1", "2026-09-01", "2026-09-30");
    await getMovementsBetween(supabase, "user-1", "2026-01-01", "2026-12-31");

    expect(query.order).toHaveBeenCalledWith("occurred_on", { ascending: false });
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("orders family movement lists by movement date desc and created_at desc", async () => {
    const query = queryMock();
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) } as unknown as SupabaseClient;

    await getSharedHouseholdMovements(supabase, "household-1", "2026-09-01", "2026-09-30");

    expect(query.order).toHaveBeenNthCalledWith(1, "occurred_on", { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: false });
  });
});

function queryMock() {
  const query = {
    data: [],
    error: null,
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    is: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query)
  };

  return query;
}
