import { describe, expect, it } from "vitest";
import {
  calculateAccountBalance,
  calculateCreditCardDue,
  calculateFinancialBalances,
  calculateFundBalance
} from "@/lib/calculations/balances";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
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
