import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createMovement, createMovementBatch, getMonthlyMovements, getMovements, getMovementsBetween, getSharedHouseholdMovementById, getSharedHouseholdMovements } from "@/services/movements/movement-service";

describe("movement service", () => {
  it("creates a single movement preserving container, reimbursement and sharing fields", async () => {
    const single = vi.fn().mockResolvedValue({ data: movementRow({ account_id: "account-1", fund_id: null }), error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;

    await createMovement(supabase, "user-1", {
      occurredOn: "2026-09-03",
      description: "Rimborso spesa",
      categoryId: "category-1",
      type: "income",
      amount: "25.50",
      containerId: "account:account-1",
      accountId: "account-1",
      fundId: null,
      isReimbursement: true,
      reimbursementForMovementId: "movement-original",
      sharedWithFamily: true,
      householdId: "household-1",
      notes: "nota"
    });

    expect(insert).toHaveBeenCalledWith({
      owner_user_id: "user-1",
      household_id: "household-1",
      account_id: "account-1",
      fund_id: null,
      category_id: "category-1",
      type: "reimbursement",
      amount: "25.50",
      occurred_on: "2026-09-03",
      description: "Rimborso spesa",
      shared_with_family: true,
      reimbursement_for_movement_id: "movement-original",
      notes: "nota",
      created_by: "user-1",
      updated_by: "user-1"
    });
  });

  it("creates multiple movements in one batch preserving account and fund containers", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [movementRow({ id: "movement-1", account_id: "account-1", fund_id: null }), movementRow({ id: "movement-2", account_id: null, fund_id: "fund-1" })],
      error: null
    });
    const insert = vi.fn(() => ({ select }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;

    await createMovementBatch(supabase, "user-1", [
      {
        occurredOn: "2026-09-03",
        description: "Spesa conto",
        categoryId: "category-1",
        type: "expense",
        amount: "10",
        containerId: "account:account-1",
        accountId: "account-1",
        fundId: null,
        isReimbursement: false,
        reimbursementForMovementId: "",
        sharedWithFamily: false,
        householdId: "",
        notes: ""
      },
      {
        occurredOn: "2026-09-04",
        description: "Spesa fondo",
        categoryId: "category-2",
        type: "expense",
        amount: "20",
        containerId: "fund:fund-1",
        accountId: null,
        fundId: "fund-1",
        isReimbursement: false,
        reimbursementForMovementId: "",
        sharedWithFamily: true,
        householdId: "household-1",
        notes: "condivisa"
      }
    ]);

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ account_id: "account-1", fund_id: null, category_id: "category-1", shared_with_family: false, household_id: null }),
      expect.objectContaining({ account_id: null, fund_id: "fund-1", category_id: "category-2", shared_with_family: true, household_id: "household-1" })
    ]);
  });

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

function movementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "movement-1",
    owner_user_id: "user-1",
    household_id: null,
    account_id: "account-1",
    fund_id: null,
    category_id: "category-1",
    type: "expense",
    amount: "10",
    occurred_on: "2026-09-03",
    description: "Movimento",
    notes: "",
    shared_with_family: false,
    reimbursement_for_movement_id: null,
    import_batch_id: null,
    fixed_expense_id: null,
    deleted_at: null,
    created_by: "user-1",
    created_at: "2026-09-03T10:00:00.000Z",
    updated_by: "user-1",
    accounts: { name: "Principale" },
    funds: null,
    categories: { name: "Categoria", macro_categories: { id: "macro-1", name: "Macro" } },
    profiles: null,
    ...overrides
  };
}
