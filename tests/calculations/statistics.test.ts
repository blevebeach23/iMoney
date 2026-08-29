import { describe, expect, it } from "vitest";
import {
  buildStatisticsReport,
  calculateArchiveYears,
  calculateMonthlyStatistics,
  calculateYearComparison,
  filterMovementsForStatistics
} from "@/lib/calculations/statistics";
import type { Budget, Movement } from "@/types/domain";
import type { MovementCategoryInfo } from "@/lib/calculations/category-aggregates";

function movement(partial: Pick<Movement, "amount" | "occurredOn" | "type"> & Partial<Movement>): Movement {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ownerUserId: partial.ownerUserId ?? "user-1",
    householdId: partial.householdId ?? null,
    accountId: "account-1",
    fundId: null,
    categoryId: partial.categoryId ?? "category-food",
    type: partial.type,
    amount: partial.amount,
    occurredOn: partial.occurredOn,
    description: partial.description ?? "Movement",
    notes: "",
    isSharedWithHousehold: partial.isSharedWithHousehold ?? false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: partial.deletedAt ?? null,
    createdBy: null,
    updatedBy: null
  };
}

function budget(partial: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    ownerType: "USER",
    ownerUserId: "user-1",
    householdId: null,
    month: "2026-08-01",
    macroCategoryId: null,
    categoryId: null,
    amount: "300.00",
    deletedAt: null,
    ...partial
  };
}

const categoryInfo = new Map<string, MovementCategoryInfo>([
  [
    "category-food",
    {
      categoryId: "category-food",
      categoryName: "Spesa",
      macroCategoryId: "macro-home",
      macroCategoryName: "Casa"
    }
  ],
  [
    "category-car",
    {
      categoryId: "category-car",
      categoryName: "Auto",
      macroCategoryId: "macro-mobility",
      macroCategoryName: "Mobilita"
    }
  ]
]);

const movements: Movement[] = [
  movement({ type: "income", amount: "1000.00", occurredOn: "2026-08-01", categoryId: "category-food" }),
  movement({ type: "expense", amount: "200.00", occurredOn: "2026-08-10", categoryId: "category-food" }),
  movement({ type: "reimbursement", amount: "50.00", occurredOn: "2026-08-12", categoryId: "category-food" }),
  movement({ type: "expense", amount: "80.00", occurredOn: "2026-09-10", categoryId: "category-car" }),
  movement({ type: "expense", amount: "120.00", occurredOn: "2025-08-10", categoryId: "category-car" })
];

describe("statistics calculations", () => {
  it("calculates monthly trend with reimbursements deducted from net expenses", () => {
    const trend = calculateMonthlyStatistics(movements, 2026);

    expect(trend[7]).toMatchObject({
      income: 1000,
      grossExpenses: 200,
      reimbursements: 50,
      netExpenses: 150,
      economicBalance: 850
    });
    expect(trend[8]?.netExpenses).toBe(80);
  });

  it("calculates macro-category and category statistics", () => {
    const report = buildStatisticsReport({
      scope: "personal",
      periodKind: "year",
      movements,
      budgets: [budget()],
      categoryInfoById: categoryInfo,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      selectedMonth: "2026-08",
      selectedYear: 2026
    });

    expect(report.macroCategories.find((item) => item.macroCategoryId === "macro-home")?.netExpenses).toBe("150.00");
    expect(report.categories.find((item) => item.categoryId === "category-car")?.netExpenses).toBe("80.00");
  });

  it("keeps reimbursements visible as reimbursements", () => {
    const report = buildStatisticsReport({
      scope: "personal",
      periodKind: "month",
      movements,
      budgets: [budget()],
      categoryInfoById: categoryInfo,
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      selectedMonth: "2026-08",
      selectedYear: 2026
    });

    expect(report.reimbursements).toHaveLength(1);
    expect(report.summary.income).toBe("1000.00");
    expect(report.summary.netExpenses).toBe("150.00");
  });

  it("compares years from movement history", () => {
    const comparison = calculateYearComparison(movements);

    expect(comparison.map((point) => point.year)).toEqual([2026, 2025]);
    expect(comparison[0]?.netExpenses).toBe("230.00");
    expect(comparison[1]?.netExpenses).toBe("120.00");
  });

  it("filters personal and family statistics separately", () => {
    const shared = movement({
      type: "expense",
      amount: "40.00",
      occurredOn: "2026-08-20",
      householdId: "household-1",
      isSharedWithHousehold: true
    });
    const privateFamilyMemberMovement = movement({
      type: "expense",
      amount: "99.00",
      occurredOn: "2026-08-21",
      householdId: "household-1",
      isSharedWithHousehold: false
    });

    expect(filterMovementsForStatistics({ personalMovements: movements, familyMovements: [shared], scope: "personal" })).toBe(movements);
    expect(
      filterMovementsForStatistics({
        personalMovements: movements,
        familyMovements: [shared, privateFamilyMemberMovement],
        householdId: "household-1",
        scope: "family"
      })
    ).toEqual([shared]);
  });

  it("derives archive years from active movements", () => {
    const years = calculateArchiveYears([...movements, movement({ type: "expense", amount: "10.00", occurredOn: "2024-01-01", deletedAt: "2026-01-02" })]);

    expect(years).toEqual([2026, 2025]);
  });
});
