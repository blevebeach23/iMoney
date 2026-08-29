import { describe, expect, it } from "vitest";
import { calculateCategoryAggregates, type MovementCategoryInfo } from "@/lib/calculations/category-aggregates";
import type { Movement } from "@/types/domain";

function movement(partial: Partial<Movement>): Movement {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-1",
    fundId: null,
    categoryId: "category-food",
    type: "expense",
    amount: "10.00",
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

const categories = new Map<string, MovementCategoryInfo>([
  [
    "category-food",
    {
      categoryId: "category-food",
      categoryName: "Supermercato",
      macroCategoryId: "macro-home",
      macroCategoryName: "CASA"
    }
  ],
  [
    "category-car",
    {
      categoryId: "category-car",
      categoryName: "Carburante",
      macroCategoryId: "macro-car",
      macroCategoryName: "AUTO"
    }
  ]
]);

describe("category aggregates", () => {
  it("subtracts reimbursements from the same category and macro-category", () => {
    const result = calculateCategoryAggregates(
      [
        movement({ categoryId: "category-food", type: "expense", amount: "100.00" }),
        movement({ categoryId: "category-food", type: "reimbursement", amount: "30.00" }),
        movement({ categoryId: "category-car", type: "expense", amount: "50.00" })
      ],
      categories
    );

    expect(result.categories.find((item) => item.categoryId === "category-food")).toMatchObject({
      grossExpenses: "100.00",
      reimbursements: "30.00",
      netExpenses: "70.00"
    });
    expect(result.macroCategories.find((item) => item.macroCategoryId === "macro-home")).toMatchObject({
      grossExpenses: "100.00",
      reimbursements: "30.00",
      netExpenses: "70.00"
    });
  });

  it("does not include deleted movements in aggregates", () => {
    const result = calculateCategoryAggregates(
      [
        movement({ type: "expense", amount: "100.00", deletedAt: "2026-08-20T10:00:00Z" }),
        movement({ type: "expense", amount: "20.00" })
      ],
      categories
    );

    expect(result.categories[0]?.grossExpenses).toBe("20.00");
  });
});
