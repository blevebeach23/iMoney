import { describe, expect, it } from "vitest";
import { calculateBudgetUsage } from "@/lib/calculations/budget";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import {
  buildCreditCardForecasts,
  calculateCreditCardCycleAmount,
  calculateSettlementCycle
} from "@/lib/calculations/credit-card-settlements";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
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
    description: "Addebito Carta",
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

describe("credit card settlement calculations", () => {
  it("calculates cycle 01-30 with payment on day 5 of next month", () => {
    expect(calculateSettlementCycle("2026-10-01", 30, 5)).toEqual({
      cycleStartOn: "2026-09-01",
      cycleEndOn: "2026-09-30",
      paymentOn: "2026-10-05"
    });
  });

  it("clamps statement and payment days for shorter months", () => {
    expect(calculateSettlementCycle("2026-03-01", 31, 31)).toEqual({
      cycleStartOn: "2026-02-01",
      cycleEndOn: "2026-02-28",
      paymentOn: "2026-02-28"
    });
    expect(calculateSettlementCycle("2028-03-01", 31, 31).cycleEndOn).toBe("2028-02-29");
  });

  it("excludes purchases after closing from the closed cycle", () => {
    expect(
      calculateCreditCardCycleAmount("card-1", [
        movement({ amount: "120.00", occurredOn: "2026-09-30" }),
        movement({ amount: "50.00", occurredOn: "2026-10-01" })
      ], "2026-09-01", "2026-09-30")
    ).toBe("120.00");
  });

  it("reduces amount due with reimbursements", () => {
    expect(
      calculateCreditCardCycleAmount("card-1", [
        movement({ type: "expense", amount: "120.00" }),
        movement({ type: "reimbursement", amount: "20.00" })
      ], "2026-09-01", "2026-09-30")
    ).toBe("100.00");
  });

  it("supports multiple cards and settlement accounts in forecast", () => {
    const forecasts = buildCreditCardForecasts({
      accounts: [
        account({ id: "bank-1", name: "Banca A", openingBalance: "500.00" }),
        account({ id: "bank-2", name: "Banca B", openingBalance: "1000.00" }),
        account({ id: "card-1", name: "Visa", type: "credit_card" }),
        account({ id: "card-2", name: "Mastercard", type: "credit_card" })
      ],
      settings: [
        settings({ accountId: "card-1", settlementAccountId: "bank-1" }),
        settings({ id: "settings-2", accountId: "card-2", settlementAccountId: "bank-2" })
      ],
      movements: [
        movement({ accountId: "card-1", amount: "100.00" }),
        movement({ accountId: "card-2", amount: "200.00" })
      ],
      transfers: [],
      bankBalances: [
        { id: "bank-1", balance: "500.00" },
        { id: "bank-2", balance: "1000.00" }
      ],
      today: "2026-10-01"
    });

    expect(forecasts.map((forecast) => [forecast.accountName, forecast.settlementAccountName, forecast.amountDue])).toEqual([
      ["Visa", "Banca A", "100.00"],
      ["Mastercard", "Banca B", "200.00"]
    ]);
  });

  it("warns when settlement account has insufficient balance", () => {
    const [forecast] = buildCreditCardForecasts({
      accounts: [account({ openingBalance: "50.00" }), account({ id: "card-1", name: "Visa", type: "credit_card" })],
      settings: [settings()],
      movements: [movement({ amount: "120.00" })],
      transfers: [],
      bankBalances: [{ id: "bank-1", balance: "50.00" }],
      today: "2026-10-01"
    });

    expect(forecast).toMatchObject({ insufficientFunds: true, missingAmount: "70.00" });
  });

  it("keeps settlement as transfer outside budget and economic statistics", () => {
    const cardPurchase = movement({ amount: "120.00" });
    const settlement = transfer({ amount: "120.00" });
    const balances = calculateFinancialBalances(
      [account(), account({ id: "card-1", name: "Visa", type: "credit_card", openingBalance: "0.00" })],
      [],
      [cardPurchase],
      [settlement],
      "2026-10-05",
      "2026-10-31"
    );

    expect(calculateMonthlySummary([cardPurchase]).grossExpenses).toBe("120.00");
    expect(calculateBudgetUsage("500.00", [cardPurchase]).used).toBe("120.00");
    expect(balances.bank[0]?.balance).toBe("880.00");
    expect(balances.creditCardsDue[0]?.due).toBe("0.00");
  });
});
