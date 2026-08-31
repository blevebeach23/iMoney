import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createFund, getSharedHouseholdFunds, updateFund } from "@/services/funds/fund-service";

const fundInput = {
  name: "Vacanze",
  type: "holiday" as const,
  openingBalance: "100.00",
  openingBalanceDate: "2026-08-01",
  targetAmount: "500.00",
  targetDate: "2026-12-31",
  sharedWithFamily: true,
  householdId: "10000000-0000-0000-0000-000000000001"
};

function writableSupabase() {
  const is = vi.fn().mockResolvedValue({ error: null });
  const eqOwner = vi.fn().mockReturnValue({ is });
  const eqId = vi.fn().mockReturnValue({ eq: eqOwner });
  const update = vi.fn().mockReturnValue({ eq: eqId });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert, update });

  return {
    supabase: { from } as unknown as SupabaseClient,
    insert,
    update
  };
}

function readableSupabase() {
  const order = vi.fn().mockResolvedValue({
    data: [
      {
        id: "50000000-0000-0000-0000-000000000001",
        owner_user_id: "00000000-0000-0000-0000-0000000000a1",
        household_id: "10000000-0000-0000-0000-000000000001",
        name: "Vacanze",
        type: "holiday",
        opening_balance: "100.00",
        opening_balance_date: "2026-08-01",
        cached_balance: "250.00",
        cached_at: null,
        target_amount: "500.00",
        target_date: "2026-12-31",
        shared_with_family: true,
        deleted_at: null
      }
    ],
    error: null
  });
  const is = vi.fn().mockReturnValue({ order });
  const eqShared = vi.fn().mockReturnValue({ is });
  const eqHousehold = vi.fn().mockReturnValue({ eq: eqShared });
  const select = vi.fn().mockReturnValue({ eq: eqHousehold });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as SupabaseClient,
    eqHousehold,
    eqShared
  };
}

describe("fund service", () => {
  it("stores household sharing fields when creating a shared fund", async () => {
    const { supabase, insert } = writableSupabase();

    await createFund(supabase, "00000000-0000-0000-0000-0000000000a1", fundInput);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_user_id: "00000000-0000-0000-0000-0000000000a1",
        household_id: "10000000-0000-0000-0000-000000000001",
        shared_with_family: true
      })
    );
  });

  it("clears household sharing fields when updating a private fund", async () => {
    const { supabase, update } = writableSupabase();

    await updateFund(supabase, "00000000-0000-0000-0000-0000000000a1", {
      ...fundInput,
      id: "50000000-0000-0000-0000-000000000001",
      sharedWithFamily: false,
      householdId: null
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: null,
        shared_with_family: false
      })
    );
  });

  it("reads only shared funds for the active household", async () => {
    const { supabase, eqHousehold, eqShared } = readableSupabase();

    await expect(getSharedHouseholdFunds(supabase, "10000000-0000-0000-0000-000000000001")).resolves.toEqual([
      {
        id: "50000000-0000-0000-0000-000000000001",
        name: "Vacanze",
        balance: "250.00",
        targetAmount: "500.00",
        targetDate: "2026-12-31",
        progressPercentage: 50
      }
    ]);
    expect(eqHousehold).toHaveBeenCalledWith("household_id", "10000000-0000-0000-0000-000000000001");
    expect(eqShared).toHaveBeenCalledWith("shared_with_family", true);
  });
});
