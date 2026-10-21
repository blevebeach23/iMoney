import { describe, expect, it } from "vitest";
import { calculateBudgetUsage } from "@/lib/calculations/budget";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import {
  buildCreditCardForecasts,
  calculateCreditCardCycleAmount,
  calculateSettlementCycle,
  hasCreditCardSettlement
} from "@/lib/calculations/credit-card-settlements";
import { buildVirtualCreditCardSettlementTransfers } from "@/services/credit-cards/credit-card-service";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { Account, CreditCardSettings, Movement, Transfer } from "@/types/domain";

function account(partial: Partial<Account> = {}): Account {
  return {
    id: "bank-1",
    ownerUserId: "user-1",
    name: "Conto",
    type: "bank",
    openingBalance: partial.type === "credit_card" ? "0.00" : "1000.00",
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
    isSharedWithHousehold: false,
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
  it("calculates contiguous cutoff cycles with payment on day 5 of next month", () => {
    expect(calculateSettlementCycle("2026-10-01", 30, 5)).toEqual({
      cycleStartOn: "2026-08-31",
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
  it("advances from the paid 800 cycle to the next 170 cycle without counting purchases twice", () => {
    const accounts = [account({ openingBalance: "3750.00" }), account({ id: "card-1", type: "credit_card", openingBalance: "0.00" })];
    const movements = [movement({ amount: "800.00", occurredOn: "2026-10-10" }), movement({ amount: "100.00", occurredOn: "2026-10-16" }), movement({ amount: "70.00", occurredOn: "2026-10-20" })];
    const input = { accounts, settings: [settings({ statementClosingDay: 14, paymentDay: 15 })], movements, bankBalances: [{ id: "bank-1", balance: "3750.00" }] };
    const before = buildCreditCardForecasts({ ...input, movements: movements.slice(0, 1), transfers: [], today: "2026-10-14" });
    expect(before.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-10-15", "800.00"]]);
    const settlement = transfer({ amount: "800.00", occurredOn: "2026-10-15", creditCardAccountId: "card-1", creditCardCycleStartOn: "2026-09-15", creditCardCycleEndOn: "2026-10-14" });
    const after = buildCreditCardForecasts({ ...input, transfers: [settlement], today: "2026-10-21" });
    expect(after.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-11-15", "170.00"]]);
    const balances = calculateFinancialBalances(accounts, [], movements, [settlement], "2026-10-21", "2026-10-31");
    expect(balances.bank[0].balance).toBe("2950.00");
    expect(balances.creditCardsDue[0].due).toBe("170.00");
    expect(calculateMonthlySummary(movements).grossExpenses).toBe("970.00");
  });

  it("includes the closing day and spans the previous cutoff rather than calendar month start", () => {
    expect(calculateSettlementCycle("2026-10-14", 14, 15)).toEqual({ cycleStartOn: "2026-09-15", cycleEndOn: "2026-10-14", paymentOn: "2026-10-15" });
    const forecasts = buildCreditCardForecasts({
      accounts: [account(), account({ id: "card-1", type: "credit_card" })], settings: [settings({ statementClosingDay: 14, paymentDay: 15 })],
      movements: [movement({ occurredOn: "2026-09-15", amount: "0.10" }), movement({ occurredOn: "2026-10-14", amount: "0.20" }), movement({ occurredOn: "2026-10-15", amount: "10.00" })],
      transfers: [], bankBalances: [], today: "2026-10-14"
    });
    expect(forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-10-15", "0.30"], ["2026-11-15", "10.00"]]);
  });

  it("recognizes a legacy settled cycle by its closing date and never treats zero as a debt", () => {
    const forecasts = buildCreditCardForecasts({
      accounts: [account(), account({ id: "card-1", type: "credit_card" })], settings: [settings()], movements: [movement()],
      transfers: [transfer({ creditCardAccountId: "card-1", creditCardCycleStartOn: "2026-09-01", creditCardCycleEndOn: "2026-09-30" })],
      bankBalances: [{ id: "bank-1", balance: "0.00" }], today: "2026-10-05"
    });
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toMatchObject({ paymentOn: "2026-11-05", amountDue: "0.00", insufficientFunds: false });
  });

  it("forecasts only the unpaid remainder after opening debt, manual payments and carried refunds", () => {
    const forecasts = buildCreditCardForecasts({
      accounts: [account(), account({ id: "card-1", type: "credit_card", openingBalance: "300.00", openingBalanceDate: "2026-09-01" })],
      settings: [settings({ statementClosingDay: 14, paymentDay: 15 })],
      movements: [movement({ occurredOn: "2026-10-10", amount: "100.00" }), movement({ occurredOn: "2026-10-11", type: "reimbursement", amount: "30.00" }), movement({ occurredOn: "2026-10-16", type: "reimbursement", amount: "100.00" }), movement({ occurredOn: "2026-11-10", amount: "120.00" })],
      transfers: [transfer({ occurredOn: "2026-10-05", amount: "300.00" })], bankBalances: [], today: "2026-10-14"
    });
    expect(forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-10-15", "70.00"], ["2026-11-15", "20.00"]]);
  });

  it("keeps a soft-deleted settlement closed and forecasts only the next cycle", () => {
    const accounts = [account(), account({ id: "card-1", type: "credit_card" })];
    const movements = [movement({ amount: "800.00", occurredOn: "2026-10-10" }), movement({ amount: "100.00", occurredOn: "2026-10-16" }), movement({ amount: "70.00", occurredOn: "2026-10-20" })];
    const settlement = transfer({ amount: "800.00", occurredOn: "2026-10-15", creditCardAccountId: "card-1", creditCardCycleStartOn: "2026-09-01", creditCardCycleEndOn: "2026-10-14" });
    const input = { accounts, movements, settings: [settings({ statementClosingDay: 14, paymentDay: 15 })], bankBalances: [], today: "2026-10-21" };
    const before = buildCreditCardForecasts({ ...input, transfers: [settlement], settlementHistory: [settlement] });
    const cancelled = { ...settlement, deletedAt: "2026-10-21T09:00:00Z" };
    // Mimic ordinary queries: the deleted row is absent from financial transfers.
    const after = buildCreditCardForecasts({ ...input, transfers: [], settlementHistory: [cancelled] });
    expect(hasCreditCardSettlement([cancelled], "user-1", "card-1", "2026-10-14")).toBe(true);
    expect(before.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-11-15", "170.00"]]);
    expect(after.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-11-15", "170.00"]]);
    const virtual = buildVirtualCreditCardSettlementTransfers("user-1", after, [cancelled]);
    expect(virtual.map((t) => [t.occurredOn, t.amount])).toEqual([["2026-11-15", "170.00"]]);
    expect(buildVirtualCreditCardSettlementTransfers("user-1", [{ ...after[0], cycleEndOn: "2026-10-14", cycleStartOn: "2026-09-15", paymentOn: "2026-10-15", amountDue: "800.00" }], [cancelled])).toEqual([]);
    // Actual balances must still reverse the deleted payment, without applying history.
    const balances = calculateFinancialBalances(accounts, [], movements, virtual, input.today, "2026-11-30");
    expect(balances.bank[0].balance).toBe("1000.00");
    expect(balances.creditCardsDue[0].due).toBe("970.00");
    expect(balances.forecastMonthEnd[0].balance).toBe("830.00");
  });

  it("does not close or allocate a cycle using another owner's settlement history", () => {
    const foreign = transfer({ ownerUserId: "other-user", amount: "800.00", occurredOn: "2026-10-15", creditCardAccountId: "card-1", creditCardCycleEndOn: "2026-10-14", deletedAt: "2026-10-20T00:00:00Z" });
    expect(hasCreditCardSettlement([foreign], "user-1", "card-1", "2026-10-14")).toBe(false);
    const forecasts = buildCreditCardForecasts({ accounts: [account(), account({ id: "card-1", type: "credit_card" })], settings: [settings({ statementClosingDay: 14, paymentDay: 15 })], movements: [movement({ amount: "800.00", occurredOn: "2026-10-10" })], transfers: [], settlementHistory: [foreign], bankBalances: [], today: "2026-10-21" });
    expect(forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-10-15", "800.00"]]);
  });

  it("ignores cancelled ordinary transfers and does not subtract an active settlement twice", () => {
    const paid = transfer({ creditCardAccountId: "card-1", creditCardCycleEndOn: "2026-09-30" });
    const cancelledOrdinary = transfer({ amount: "900.00", creditCardAccountId: null, creditCardCycleEndOn: null, deletedAt: "2026-10-06T00:00:00Z" });
    const forecasts = buildCreditCardForecasts({ accounts: [account(), account({ id: "card-1", type: "credit_card" })], settings: [settings()], movements: [movement(), movement({ amount: "70.00", occurredOn: "2026-10-10" })], transfers: [paid], settlementHistory: [paid, cancelledOrdinary], bankBalances: [], today: "2026-10-21" });
    expect(forecasts.map((f) => [f.paymentOn, f.amountDue])).toEqual([["2026-11-05", "70.00"]]);
  });

});
