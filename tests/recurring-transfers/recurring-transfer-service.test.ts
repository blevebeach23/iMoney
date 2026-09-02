import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildRecurringTransferOccurrences, generateRecurringTransfers, toRecurringTransferPayload } from "@/services/recurring-transfers/recurring-transfer-service";

const userId = "10000000-0000-4000-8000-000000000001";
const householdId = "10000000-0000-4000-8000-000000000002";
const accountA = "10000000-0000-4000-8000-000000000003";
const accountB = "10000000-0000-4000-8000-000000000004";
const recurringTransferId = "10000000-0000-4000-8000-000000000005";

function recurringTransferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: recurringTransferId,
    owner_user_id: userId,
    household_id: null,
    from_account_id: accountA,
    to_account_id: accountB,
    from_fund_id: null,
    to_fund_id: null,
    amount: "50.00",
    description: "Risparmio",
    frequency: "monthly",
    starts_on: "2026-09-01",
    ends_on: null,
    day_of_month: 10,
    is_active: true,
    shared_with_family: false,
    deleted_at: null,
    from_account: { name: "Banca" },
    to_account: { name: "Risparmio" },
    ...overrides
  };
}

describe("recurring transfer service", () => {
  it("builds future transfer occurrences from recurrence settings", () => {
    expect(
      buildRecurringTransferOccurrences(
        {
          dayOfMonth: 31,
          endsOn: null,
          frequency: "monthly",
          startsOn: "2026-01-01"
        },
        "2026-02-01",
        "2026-03-01"
      ).map((item) => item.occurredOn)
    ).toEqual(["2026-02-28", "2026-03-31"]);
  });

  it("keeps Family flag on the recurring rule payload", () => {
    expect(
      toRecurringTransferPayload(userId, {
        fromContainerId: `account:${accountA}`,
        toContainerId: `account:${accountB}`,
        fromAccountId: accountA,
        fromFundId: null,
        toAccountId: accountB,
        toFundId: null,
        amount: "50.00",
        description: "Risparmio",
        frequency: "monthly",
        startsOn: "2026-09-01",
        endsOn: null,
        dayOfMonth: 10,
        isActive: true,
        sharedWithFamily: true,
        householdId
      })
    ).toMatchObject({ household_id: householdId, shared_with_family: true });
  });

  it("generates normal transfers idempotently", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = recurringTransferSupabase({ existing: [], insert, rule: recurringTransferRow() });

    await expect(generateRecurringTransfers(supabase, userId, recurringTransferId, "2026-09-01", "2026-10-01")).resolves.toBe(2);

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ recurring_transfer_id: recurringTransferId, occurred_on: "2026-09-10" }),
      expect.objectContaining({ recurring_transfer_id: recurringTransferId, occurred_on: "2026-10-10" })
    ]);
  });

  it("does not generate duplicate or inactive recurring transfers", async () => {
    const insert = vi.fn();
    const withExisting = recurringTransferSupabase({
      existing: [{ recurring_transfer_id: recurringTransferId, occurred_on: "2026-09-10" }],
      insert,
      rule: recurringTransferRow()
    });

    await expect(generateRecurringTransfers(withExisting, userId, recurringTransferId, "2026-09-01", "2026-09-01")).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();

    const inactive = recurringTransferSupabase({ existing: [], insert, rule: recurringTransferRow({ is_active: false }) });
    await expect(generateRecurringTransfers(inactive, userId, recurringTransferId, "2026-09-01", "2026-09-01")).resolves.toBe(0);
  });
});

function recurringTransferSupabase(input: { existing: Array<Record<string, string>>; insert: ReturnType<typeof vi.fn>; rule: Record<string, unknown> }): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "recurring_transfers") {
        const query = queryMock({ data: input.rule, single: true });
        return { select: vi.fn(() => query) };
      }

      if (table === "transfers") {
        return {
          insert: input.insert,
          select: vi.fn(() => queryMock({ data: input.existing }))
        };
      }

      return {};
    })
  } as unknown as SupabaseClient;
}

function queryMock(input: { data: unknown; single?: boolean }) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data: input.data, error: null })),
    order: vi.fn(() => query),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: input.data, error: null })
  };

  return query;
}
