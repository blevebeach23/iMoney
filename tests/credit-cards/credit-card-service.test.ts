import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  buildVirtualCreditCardSettlementTransfers,
  generateDueCreditCardSettlements,
  saveCreditCardSettings
} from "@/services/credit-cards/credit-card-service";
import type { Account, CreditCardSettings, Movement, Transfer } from "@/types/domain";

function account(partial: Partial<Account> = {}): Account {
  return {
    id: "bank-1",
    ownerUserId: "user-1",
    name: "Conto",
    type: "bank",
    openingBalance: "1000.00",
    openingBalanceDate: "2026-09-01",
    cachedBalance: "1000.00",
    cachedAt: null,
    deletedAt: null,
    ...partial
  };
}

function settings(partial: Partial<CreditCardSettings> = {}): CreditCardSettings {
  return {
    id: "settings-1",
    accountId: "card-1",
    settlementAccountId: "bank-1",
    statementClosingDay: 30,
    paymentDay: 5,
    automaticSettlement: true,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...partial
  };
}

function movement(partial: Partial<Movement> = {}): Movement {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    accountId: "card-1",
    fundId: null,
    categoryId: "category-1",
    type: "expense",
    amount: "100.00",
    occurredOn: "2026-09-10",
    description: "Spesa carta",
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    ...partial
  };
}

function transfer(partial: Partial<Transfer> = {}): Transfer {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    fromAccountId: "bank-1",
    toAccountId: "card-1",
    fromFundId: null,
    toFundId: null,
    amount: "100.00",
    occurredOn: "2026-10-05",
    description: "Addebito Carta Visa",
    isSharedWithHousehold: false,
    deletedAt: null,
    creditCardAccountId: "card-1",
    creditCardCycleStartOn: "2026-09-01",
    creditCardCycleEndOn: "2026-09-30",
    ...partial
  };
}

describe("credit card service", () => {
  it("saves settings only after checking card and bank ownership/type", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  is: () => Promise.resolve({
                    data: [
                      { id: "card-1", type: "credit_card", owner_user_id: "user-1" },
                      { id: "bank-1", type: "bank", owner_user_id: "user-1" }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        }
        return { upsert };
      })
    } as unknown as SupabaseClient;

    await saveCreditCardSettings(supabase, "user-1", {
      accountId: "card-1",
      settlementAccountId: "bank-1",
      statementClosingDay: 30,
      paymentDay: 5,
      automaticSettlement: true
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ account_id: "card-1", settlement_account_id: "bank-1" }), { onConflict: "account_id" });
  });

  it("rejects cross-user or wrong-type settlement references before upsert", async () => {
    const upsert = vi.fn();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "accounts") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  is: () => Promise.resolve({ data: [{ id: "card-1", type: "credit_card", owner_user_id: "user-1" }], error: null })
                })
              })
            })
          };
        }
        return { upsert };
      })
    } as unknown as SupabaseClient;

    await expect(saveCreditCardSettings(supabase, "user-1", {
      accountId: "card-1",
      settlementAccountId: "bank-other",
      statementClosingDay: 30,
      paymentDay: 5,
      automaticSettlement: true
    })).rejects.toThrow("Il conto di addebito deve essere un conto corrente");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("generates one due settlement transfer and is idempotent with existing cycle", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ insert }) } as unknown as SupabaseClient;
    const accounts = [account(), account({ id: "card-1", name: "Visa", type: "credit_card", openingBalance: "0.00" })];

    await expect(generateDueCreditCardSettlements(supabase, "user-1", {
      accounts,
      settings: [settings()],
      movements: [movement()],
      transfers: [],
      today: "2026-10-05"
    })).resolves.toBe(1);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      amount: "100.00",
      credit_card_account_id: "card-1",
      from_account_id: "bank-1",
      shared_with_family: false,
      to_account_id: "card-1"
    }));

    insert.mockClear();
    await expect(generateDueCreditCardSettlements(supabase, "user-1", {
      accounts,
      settings: [settings()],
      movements: [movement()],
      transfers: [transfer()],
      today: "2026-10-05"
    })).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it("supports two cards on the same bank account and cards on different accounts", async () => {
    const virtual = buildVirtualCreditCardSettlementTransfers("user-1", [
      {
        accountId: "card-1",
        accountName: "Visa",
        settlementAccountId: "bank-1",
        settlementAccountName: "Banca A",
        cycleStartOn: "2026-09-01",
        cycleEndOn: "2026-09-30",
        paymentOn: "2026-10-05",
        amountDue: "100.00",
        nextCycleAmount: "0.00",
        automaticSettlement: true,
        insufficientFunds: false,
        missingAmount: "0.00"
      },
      {
        accountId: "card-2",
        accountName: "Mastercard",
        settlementAccountId: "bank-1",
        settlementAccountName: "Banca A",
        cycleStartOn: "2026-09-01",
        cycleEndOn: "2026-09-30",
        paymentOn: "2026-10-05",
        amountDue: "50.00",
        nextCycleAmount: "0.00",
        automaticSettlement: true,
        insufficientFunds: false,
        missingAmount: "0.00"
      },
      {
        accountId: "card-3",
        accountName: "Amex",
        settlementAccountId: "bank-2",
        settlementAccountName: "Banca B",
        cycleStartOn: "2026-09-01",
        cycleEndOn: "2026-09-30",
        paymentOn: "2026-10-05",
        amountDue: "75.00",
        nextCycleAmount: "0.00",
        automaticSettlement: true,
        insufficientFunds: false,
        missingAmount: "0.00"
      }
    ]);

    expect(virtual.map((item) => [item.fromAccountId, item.toAccountId, item.amount])).toEqual([
      ["bank-1", "card-1", "100.00"],
      ["bank-1", "card-2", "50.00"],
      ["bank-2", "card-3", "75.00"]
    ]);
    expect(virtual.every((item) => item.isSharedWithHousehold === false && item.householdId === null)).toBe(true);
  });
});
