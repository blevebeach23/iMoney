import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getSharedHouseholdTransfers, getTransfers } from "@/services/transfers/transfer-service";

describe("transfer service", () => {
  it("matches container filter against transfer source and destination accounts", async () => {
    const query = queryMock();
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) } as unknown as SupabaseClient;

    await getTransfers(supabase, "user-1", { containerId: "account:account-1" });

    expect(query.or).toHaveBeenCalledWith("from_account_id.eq.account-1,to_account_id.eq.account-1");
  });

  it("matches container filter against transfer source and destination funds", async () => {
    const query = queryMock();
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) } as unknown as SupabaseClient;

    await getTransfers(supabase, "user-1", { containerId: "fund:fund-1" });

    expect(query.or).toHaveBeenCalledWith("from_fund_id.eq.fund-1,to_fund_id.eq.fund-1");
  });

  it("loads only shared household transfers for Family timeline", async () => {
    const query = queryMock();
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) } as unknown as SupabaseClient;

    await getSharedHouseholdTransfers(supabase, "household-1", "2026-09-01", "2026-09-30");

    expect(query.eq).toHaveBeenCalledWith("household_id", "household-1");
    expect(query.eq).toHaveBeenCalledWith("shared_with_family", true);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
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
    or: vi.fn(() => query),
    order: vi.fn(() => query)
  };

  return query;
}
