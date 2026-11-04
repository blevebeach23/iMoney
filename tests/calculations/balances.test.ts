import { describe, expect, it } from "vitest";
import {
  calculateAccountBalance,
  calculateCreditCardDue,
  calculateFinancialBalances,
  calculateFundBalance
} from "@/lib/calculations/balances";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { calculateBudgetUsage } from "@/lib/calculations/budget";
import { calculateLiquiditySummary } from "@/lib/calculations/liquidity";
import type { Account, Fund, Movement, Transfer } from "@/types/domain";

function account(partial: Partial<Account> = {}): Account {
  return {
    id: "bank-1",
    ownerUserId: "user-1",
    name: "Bank",
    type: "bank",
    openingBalance: "1000.00",
    openingBalanceDate: "2026-08-01",
    cachedBalance: "1000.00",
    cachedAt: null,
    deletedAt: null,
    ...partial
  };
}

function fund(partial: Partial<Fund> = {}): Fund {
  return {
    id: "fund-1",
    ownerUserId: "user-1",
    householdId: null,
    name: "Vacanze",
    type: "holiday",
    openingBalance: "200.00",
    openingBalanceDate: "2026-08-01",
    cachedBalance: "200.00",
    cachedAt: null,
    targetAmount: null,
    targetDate: null,
    isSharedWithHousehold: false,
    deletedAt: null,
    ...partial
  };
}

function movement(partial: Partial<Movement> = {}): Movement {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    accountId: "bank-1",
    fundId: null,
    categoryId: "category-1",
    type: "expense",
    amount: "100.00",
    occurredOn: "2026-08-10",
    description: "Movement",
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
    toAccountId: null,
    fromFundId: null,
    toFundId: "fund-1",
    amount: "50.00",
    occurredOn: "2026-08-12",
    description: "Transfer",
    isSharedWithHousehold: false,
    deletedAt: null,
    ...partial
  };
}

describe("financial balances", () => {
  it("reconciles cash, card debt, total availability and month end across shared and future operations", () => {
    const accounts = [account(), account({ id: "cash", type: "cash", openingBalance: "100.00" }), account({ id: "card", type: "credit_card", openingBalance: "0.00" })];
    const rows = [
      movement({ accountId: "cash", type: "income", amount: "20.00", occurredOn: "2026-11-02" }),
      movement({ accountId: "cash", amount: "12.50", occurredOn: "2026-11-02" }),
      movement({ accountId: "cash", type: "reimbursement", amount: "2.50", occurredOn: "2026-11-03" }),
      movement({ accountId: "cash", amount: "5.00", occurredOn: "2026-11-03", isSharedWithHousehold: true, householdId: "family" }),
      movement({ accountId: "card", amount: "120.00", occurredOn: "2026-11-02" }),
      movement({ accountId: "card", type: "reimbursement", amount: "20.00", occurredOn: "2026-11-03" }),
      movement({ amount: "30.00", occurredOn: "2026-11-04", fixedExpenseId: "recurring" }),
      movement({ type: "income", amount: "500.00", occurredOn: "2026-11-27" }),
      movement({ accountId: "cash", amount: "50.00", occurredOn: "2026-11-20" }),
      movement({ accountId: "cash", type: "reimbursement", amount: "10.00", occurredOn: "2026-11-25" }),
      movement({ accountId: "card", amount: "40.00", occurredOn: "2026-11-10" }),
      movement({ accountId: null, fundId: "fund-1", amount: "25.00", occurredOn: "2026-11-03" })
    ];
    const transfers = [
      transfer({ toAccountId: "cash", toFundId: null, occurredOn: "2026-11-02" }),
      transfer({ amount: "100.00", occurredOn: "2026-11-03" }),
      transfer({ toAccountId: "card", toFundId: null, amount: "100.00", occurredOn: "2026-11-15" })
    ];
    const balances = calculateFinancialBalances(accounts, [fund()], rows, transfers, "2026-11-04", "2026-11-30");
    expect(balances.cash[0].balance).toBe("155.00");
    expect(balances.bank[0].balance).toBe("820.00");
    expect(balances.funds[0].balance).toBe("275.00");
    expect(balances.creditCardsDue[0].due).toBe("100.00");
    expect(calculateLiquiditySummary(accounts, balances)).toMatchObject({ liquidity: "975.00", netLiquidity: "875.00", forecast: "1335.00" });
    expect(balances.forecastMonthEnd.map((row) => row.balance)).toEqual(["1220.00", "115.00"]);
    expect(calculateCreditCardDue(accounts[2], rows, transfers, "2026-11-30")).toBe("40.00");
    expect(calculateMonthlySummary(rows)).toMatchObject({ income: "520.00", grossExpenses: "282.50", reimbursements: "32.50", netExpenses: "250.00", economicBalance: "270.00" });
    expect(calculateBudgetUsage("500.00", rows).used).toBe("250.00");
  });

  it("excludes deleted movements and transfers in every public balance function", () => {
    const removed = { deletedAt: "2026-08-20T10:00:00Z" };
    const rows = [
      movement({ ...removed }),
      movement({ ...removed, accountId: "card-1" }),
      movement({ ...removed, accountId: null, fundId: "fund-1" })
    ];
    const transfers = [transfer({ ...removed }), transfer({ ...removed, toAccountId: "card-1", toFundId: null })];
    expect(calculateAccountBalance(account(), rows, transfers, "2026-08-29")).toBe("1000.00");
    expect(calculateFundBalance(fund(), rows, transfers, "2026-08-29")).toBe("200.00");
    expect(calculateCreditCardDue(account({ id: "card-1", type: "credit_card", openingBalance: "30.00" }), rows, transfers, "2026-08-29")).toBe("30.00");
  });

  it("applies opening balances only from their date, for cash, bank, funds and card debt", () => {
    const accounts = [account(), account({ id: "cash", type: "cash" }), account({ id: "card", type: "credit_card" })];
    const before = calculateFinancialBalances(accounts, [fund()], [], [], "2026-07-31", "2026-08-31");
    expect(before.cash[0].balance).toBe("0.00");
    expect(before.bank[0].balance).toBe("0.00");
    expect(before.funds[0].balance).toBe("0.00");
    expect(before.creditCardsDue[0].due).toBe("0.00");
    expect(before.forecastMonthEnd.map((row) => row.balance)).toEqual(["1000.00", "1000.00"]);
    const onDate = calculateFinancialBalances(accounts, [fund()], [], [], "2026-08-01", "2026-08-31");
    expect(onDate.cash[0].balance).toBe("1000.00");
    expect(onDate.bank[0].balance).toBe("1000.00");
    expect(onDate.funds[0].balance).toBe("200.00");
    expect(onDate.creditCardsDue[0].due).toBe("1000.00");
  });

  it("calculates cash balance from occurred movements", () => {
    const cash = account({ id: "cash-1", name: "Cash", type: "cash", openingBalance: "80.00" });

    expect(
      calculateAccountBalance(
        cash,
        [
          movement({ accountId: "cash-1", type: "expense", amount: "12.00" }),
          movement({ accountId: "cash-1", type: "income", amount: "20.00" })
        ],
        [],
        "2026-08-29"
      )
    ).toBe("88.00");
  });

  it("calculates bank balance and ignores future movements for current balance", () => {
    expect(
      calculateAccountBalance(
        account(),
        [
          movement({ type: "expense", amount: "100.00", occurredOn: "2026-08-10" }),
          movement({ type: "income", amount: "250.00", occurredOn: "2026-09-01" })
        ],
        [],
        "2026-08-29"
      )
    ).toBe("900.00");
  });

  it("calculates fund balance with movements and transfers", () => {
    expect(
      calculateFundBalance(
        fund(),
        [movement({ accountId: null, fundId: "fund-1", type: "expense", amount: "40.00" })],
        [transfer({ amount: "150.00" })],
        "2026-08-29"
      )
    ).toBe("310.00");
  });

  it("keeps credit card purchases out of bank balance until settlement transfer", () => {
    const bank = account();
    const creditCard = account({ id: "card-1", name: "Card", type: "credit_card", openingBalance: "0.00" });
    const cardPurchase = movement({ accountId: "card-1", type: "expense", amount: "120.00" });

    expect(calculateAccountBalance(bank, [cardPurchase], [], "2026-08-29")).toBe("1000.00");
    expect(calculateCreditCardDue(creditCard, [cardPurchase], [], "2026-08-29")).toBe("120.00");
    expect(
      calculateAccountBalance(
        bank,
        [cardPurchase],
        [transfer({ fromAccountId: "bank-1", toAccountId: "card-1", toFundId: null, amount: "120.00" })],
        "2026-08-29"
      )
    ).toBe("880.00");
    expect(
      calculateCreditCardDue(
        creditCard,
        [cardPurchase],
        [transfer({ fromAccountId: "bank-1", toAccountId: "card-1", toFundId: null, amount: "120.00" })],
        "2026-08-29"
      )
    ).toBe("0.00");
  });

  it("excludes transfers from economic totals but includes them in balances", () => {
    const summaryBeforeTransfer = calculateMonthlySummary([
      movement({ type: "income", amount: "1000.00" }),
      movement({ type: "expense", amount: "250.00" })
    ]);

    expect(calculateAccountBalance(account(), [], [transfer()], "2026-08-29")).toBe("950.00");
    expect(summaryBeforeTransfer).toMatchObject({
      income: "1000.00",
      grossExpenses: "250.00",
      reimbursements: "0.00",
      netExpenses: "250.00",
      economicBalance: "750.00"
    });
  });

  it("includes future movements in month-end forecast", () => {
    const balances = calculateFinancialBalances(
      [account()],
      [],
      [movement({ amount: "100.00", occurredOn: "2026-09-30" })],
      [],
      "2026-09-10",
      "2026-09-30"
    );

    expect(balances.bank[0]?.balance).toBe("1000.00");
    expect(balances.forecastMonthEnd[0]?.balance).toBe("900.00");
  });

  it("applies account to account transfers only to source and destination balances", () => {
    const source = account({ id: "bank-1", openingBalance: "1000.00" });
    const destination = account({ id: "bank-2", name: "Savings bank", openingBalance: "400.00" });
    const accountTransfer = transfer({
      fromAccountId: "bank-1",
      toAccountId: "bank-2",
      toFundId: null,
      amount: "125.00"
    });

    expect(calculateAccountBalance(source, [], [accountTransfer], "2026-08-29")).toBe("875.00");
    expect(calculateAccountBalance(destination, [], [accountTransfer], "2026-08-29")).toBe("525.00");
  });

  it("applies account to fund transfers to both containers", () => {
    const bank = account();
    const holidayFund = fund();
    const accountToFund = transfer({ amount: "150.00" });

    expect(calculateAccountBalance(bank, [], [accountToFund], "2026-08-29")).toBe("850.00");
    expect(calculateFundBalance(holidayFund, [], [accountToFund], "2026-08-29")).toBe("350.00");
  });

  it("applies fund to account transfers to both containers", () => {
    const bank = account();
    const holidayFund = fund();
    const fundToAccount = transfer({
      fromAccountId: null,
      fromFundId: "fund-1",
      toAccountId: "bank-1",
      toFundId: null,
      amount: "75.00"
    });

    expect(calculateFundBalance(holidayFund, [], [fundToAccount], "2026-08-29")).toBe("125.00");
    expect(calculateAccountBalance(bank, [], [fundToAccount], "2026-08-29")).toBe("1075.00");
  });

  it("includes dated transfers in month-end forecast", () => {
    const balances = calculateFinancialBalances(
      [account()],
      [fund()],
      [],
      [transfer({ amount: "300.00", occurredOn: "2026-09-25" })],
      "2026-09-10",
      "2026-09-30"
    );

    expect(balances.bank[0]?.balance).toBe("1000.00");
    expect(balances.funds[0]?.balance).toBe("200.00");
    expect(balances.forecastMonthEnd[0]?.balance).toBe("700.00");
  });
});
