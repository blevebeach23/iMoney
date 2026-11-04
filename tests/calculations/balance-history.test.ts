import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getMonthlyMovements, getMovementsBetween, getMovementsUntil } from "@/services/movements/movement-service";
import { getTransfersUntil } from "@/services/transfers/transfer-service";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { calculateLiquiditySummary } from "@/lib/calculations/liquidity";
import type { Account } from "@/types/domain";

function client(rows: Record<string, unknown>[], failurePage?: number) {
  const query = {
    eq: vi.fn(() => query), is: vi.fn(() => query), lte: vi.fn(() => query),
    gte: vi.fn(() => query), order: vi.fn(() => query),
    range: vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1), error: from === failurePage ? new Error("Read failed") : null
    }))
  };
  return { query, supabase: { from: vi.fn(() => ({ select: vi.fn(() => query) })) } as unknown as SupabaseClient };
}

describe("complete accounting history", () => {
  const movementRows = Array.from({ length: 1201 }, (_, id) => ({
    id: String(id), owner_user_id: "owner", account_id: "cash", type: "expense", amount: "0.10",
    occurred_on: "2026-11-02", deleted_at: null
  }));

  it.each(["until", "month", "between"])("loads every page for %s totals and preserves the accounting scope", async (kind) => {
    const { query, supabase } = client(movementRows);
    const rows = kind === "until" ? await getMovementsUntil(supabase, "owner", "2026-11-30")
      : kind === "month" ? await getMonthlyMovements(supabase, "owner", "2026-11-01", "2026-11-30")
        : await getMovementsBetween(supabase, "owner", "2026-11-01", "2026-11-30");
    expect(rows).toHaveLength(1201);
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(query.eq).toHaveBeenCalledWith("owner_user_id", "owner");
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.lte).toHaveBeenCalledWith("occurred_on", "2026-11-30");
    expect(query.order).toHaveBeenCalledWith("id", { ascending: false });
    const accounts = [{ id: "cash", name: "Cash", type: "cash", openingBalance: "500.00" }] as Account[];
    expect(calculateFinancialBalances(accounts, [], rows, [], "2026-11-04", "2026-11-30").cash[0].balance).toBe("379.90");
  });

  it("includes old withdrawals in both cash and bank without changing total liquidity", async () => {
    const { query, supabase } = client(Array.from({ length: 1201 }, (_, id) => ({
      id: String(id), owner_user_id: "owner", from_account_id: "bank", to_account_id: "cash",
      amount: "0.10", occurred_on: "2026-11-02", deleted_at: null
    })));
    const transfers = await getTransfersUntil(supabase, "owner", "2026-11-30");
    expect(transfers).toHaveLength(1201);
    expect(query.eq).toHaveBeenCalledWith("owner_user_id", "owner");
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.order).toHaveBeenCalledWith("id", { ascending: false });
    const accounts = [
      { id: "cash", name: "Cash", type: "cash", openingBalance: "0.00" },
      { id: "bank", name: "Bank", type: "bank", openingBalance: "500.00" }
    ] as Account[];
    const result = calculateLiquiditySummary(accounts, calculateFinancialBalances(accounts, [], [], transfers, "2026-11-04", "2026-11-30"));
    expect(result.cash[0].balance).toBe("120.10");
    expect(result.bank[0].balance).toBe("379.90");
    expect(result.liquidity).toBe("500.00");
  });

  it("rejects incomplete history when a later page fails", async () => {
    const { supabase } = client(movementRows, 500);
    await expect(getMovementsUntil(supabase, "owner", "2026-11-30")).rejects.toThrow("Read failed");
  });
});
