import { describe, expect, it } from "vitest";
import { calculateBudgetReport, calculateBudgetUsage } from "@/lib/calculations/budget";
import type { MovementCategoryInfo } from "@/lib/calculations/category-aggregates";
import type { Budget, Movement, Transfer } from "@/types/domain";

function movement(partial: Pick<Movement, "type" | "amount"> & Partial<Movement>): Movement {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-1",
    fundId: null,
    categoryId: partial.categoryId ?? "category-home",
    type: partial.type,
    amount: partial.amount,
    occurredOn: partial.occurredOn ?? "2026-08-15",
    description: partial.description ?? "Movement",
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
  };
}

function budget(partial: Partial<Budget> = {}): Budget {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ownerType: "USER",
    ownerUserId: "user-1",
    householdId: null,
    month: "2026-08-01",
    macroCategoryId: null,
    categoryId: null,
    amount: "1000.00",
    deletedAt: null,
    ...partial
  };
}

const categories = new Map<string, MovementCategoryInfo>([
  [
    "category-home",
    {
      categoryId: "category-home",
      categoryName: "Casa",
      macroCategoryId: "macro-living",
      macroCategoryName: "Vita"
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

describe("budget usage", () => {
  it("includes occurred expenses", () => {
    const usage = calculateBudgetUsage("500.00", [movement({ type: "expense", amount: "120.00", occurredOn: "2026-08-03" })]);

    expect(usage.used).toBe("120.00");
    expect(usage.remaining).toBe("380.00");
    expect(usage.usedPercentage).toBe(24);
  });

  it("includes future expenses in the same month", () => {
    const usage = calculateBudgetUsage("500.00", [movement({ type: "expense", amount: "200.00", occurredOn: "2026-08-30" })]);

    expect(usage.used).toBe("200.00");
  });

  it("subtracts reimbursements from used budget", () => {
    const usage = calculateBudgetUsage("500.00", [
      movement({ type: "expense", amount: "200.00" }),
      movement({ type: "reimbursement", amount: "75.00" })
    ]);

    expect(usage.used).toBe("125.00");
    expect(usage.remaining).toBe("375.00");
  });

  it("keeps transfers outside budget usage", () => {
    const transfers: Transfer[] = [
      {
        id: crypto.randomUUID(),
        ownerUserId: "user-1",
        householdId: null,
        fromAccountId: "account-1",
        toAccountId: "account-2",
        fromFundId: null,
        toFundId: null,
        amount: "900.00",
        occurredOn: "2026-08-15",
        description: "Transfer",
        isSharedWithHousehold: true,
        deletedAt: null
      }
    ];
    const usage = calculateBudgetUsage("500.00", [movement({ type: "expense", amount: "80.00" })]);

    expect(transfers).toHaveLength(1);
    expect(usage.used).toBe("80.00");
  });

  it("calculates macro-category budgets", () => {
    const report = calculateBudgetReport(
      [budget({ macroCategoryId: "macro-living", amount: "300.00" })],
      [
        movement({ categoryId: "category-home", type: "expense", amount: "180.00" }),
        movement({ categoryId: "category-car", type: "expense", amount: "100.00" })
      ],
      categories
    );

    expect(report.macroCategories[0]?.usage.used).toBe("180.00");
    expect(report.macroCategories[0]?.usage.remaining).toBe("120.00");
  });

  it("calculates category budgets", () => {
    const report = calculateBudgetReport(
      [budget({ categoryId: "category-home", amount: "150.00" })],
      [
        movement({ categoryId: "category-home", type: "expense", amount: "120.00" }),
        movement({ categoryId: "category-home", type: "reimbursement", amount: "20.00" })
      ],
      categories
    );

    expect(report.categories[0]?.usage.used).toBe("100.00");
    expect(report.categories[0]?.usage.usedPercentage).toBeCloseTo(66.666, 2);
  });

  it("reports exceeded budgets", () => {
    const usage = calculateBudgetUsage("100.00", [movement({ type: "expense", amount: "125.00" })]);

    expect(usage.used).toBe("125.00");
    expect(usage.remaining).toBe("-25.00");
    expect(usage.usedPercentage).toBe(125);
  });
});
