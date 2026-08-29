import { describe, expect, it } from "vitest";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { calculateBudgetUsage } from "@/lib/calculations/budget";
import { buildFixedExpenseOccurrences, excludeExistingOccurrences, isOccurrenceInDateRange, monthIsActive, occurrenceDateForMonth } from "@/lib/fixed-expenses/schedule";
import { toFixedExpensePayload } from "@/services/fixed-expenses/fixed-expense-service";
import type { Account, FixedExpense, Movement } from "@/types/domain";

function fixedExpense(partial: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: "fixed-1",
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-1",
    fundId: null,
    categoryId: "category-1",
    amount: "120.00",
    description: "Affitto",
    frequency: "monthly",
    startsOn: "2026-01-01",
    endsOn: null,
    dayOfMonth: 31,
    activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
    accountId: "account-1",
    fundId: null,
    categoryId: "category-1",
    type: "expense",
    amount: "120.00",
    occurredOn: "2026-08-31",
    description: "Affitto",
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    fixedExpenseId: "fixed-1",
    deletedAt: null,
    createdBy: "user-1",
    updatedBy: "user-1",
    ...partial
  };
}

function account(): Account {
  return {
    id: "account-1",
    ownerUserId: "user-1",
    name: "Bank",
    type: "bank",
    openingBalance: "1000.00",
    openingBalanceDate: "2026-08-01",
    cachedBalance: "1000.00",
    cachedAt: null,
    deletedAt: null
  };
}

describe("fixed expense scheduling", () => {
  it("uses active months", () => {
    expect(monthIsActive(fixedExpense({ activeMonths: [1, 7] }), 7)).toBe(true);
    expect(monthIsActive(fixedExpense({ activeMonths: [1, 7] }), 8)).toBe(false);
  });

  it("keeps occurrences within date range", () => {
    const rule = fixedExpense({ startsOn: "2026-03-10", endsOn: "2026-05-20" });

    expect(isOccurrenceInDateRange(rule, "2026-03-31")).toBe(true);
    expect(isOccurrenceInDateRange(rule, "2026-05-31")).toBe(false);
  });

  it("clamps occurrence day to the end of the month", () => {
    expect(occurrenceDateForMonth(2026, 2, 31)).toBe("2026-02-28");
  });

  it("builds occurrences only for active months and valid intervals", () => {
    const occurrences = buildFixedExpenseOccurrences(
      fixedExpense({ activeMonths: [1, 3], startsOn: "2026-01-01", endsOn: "2026-03-31", dayOfMonth: 15 }),
      "2026-01-01",
      "2026-04-01"
    );

    expect(occurrences.map((item) => item.occurredOn)).toEqual(["2026-01-15", "2026-03-15"]);
  });

  it("excludes duplicate generated movements", () => {
    const occurrences = buildFixedExpenseOccurrences(fixedExpense({ dayOfMonth: 10 }), "2026-08-01", "2026-09-01");
    const pending = excludeExistingOccurrences(occurrences, [{ fixedExpenseId: "fixed-1", occurredOn: "2026-08-10" }]);

    expect(pending.map((item) => item.occurredOn)).toEqual(["2026-09-10"]);
  });

  it("builds a normal generated movement payload with inherited sharing", () => {
    const payload = toFixedExpensePayload("user-1", {
      description: "Affitto",
      categoryId: crypto.randomUUID(),
      amount: "120.00",
      containerId: "account:account-1",
      accountId: "account-1",
      fundId: null,
      startsOn: "2026-08-01",
      endsOn: null,
      dayOfMonth: 5,
      activeMonths: [8],
      sharedWithFamily: true,
      householdId: "household-1"
    });

    expect(payload).toMatchObject({
      owner_user_id: "user-1",
      household_id: "household-1",
      account_id: "account-1",
      amount: "120.00",
      shared_with_family: true
    });
  });

  it("keeps generated movement independent from the rule after movement edits or soft delete", () => {
    const edited = movement({ amount: "99.00", description: "Affitto corretto" });
    const deleted = movement({ deletedAt: "2026-08-20T10:00:00Z" });

    expect(edited.fixedExpenseId).toBe("fixed-1");
    expect(edited.amount).toBe("99.00");
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("makes future fixed expenses affect budget and forecast but not current balance", () => {
    const future = movement({ occurredOn: "2026-08-31", amount: "200.00" });
    const budget = calculateBudgetUsage("500.00", [future]);
    const balances = calculateFinancialBalances([account()], [], [future], [], "2026-08-10", "2026-08-31");

    expect(budget.used).toBe("200.00");
    expect(balances.bank[0]?.balance).toBe("1000.00");
    expect(balances.forecastMonthEnd[0]?.balance).toBe("800.00");
  });
});
