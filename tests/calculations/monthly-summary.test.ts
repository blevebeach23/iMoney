import { describe, expect, it } from "vitest";
import { calculateBudgetUsage } from "@/lib/calculations/budget";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { Movement } from "@/types/domain";

function movement(partial: Pick<Movement, "type" | "amount"> & Partial<Movement>): Movement {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-1",
    fundId: null,
    categoryId: partial.categoryId ?? null,
    type: partial.type,
    amount: partial.amount,
    occurredOn: partial.occurredOn ?? "2026-08-15",
    description: partial.description ?? "Movement",
    isSharedWithHousehold: partial.isSharedWithHousehold ?? false,
    reimbursementForMovementId: partial.reimbursementForMovementId ?? null,
    importBatchId: partial.importBatchId ?? null,
    deletedAt: partial.deletedAt ?? null
  };
}

describe("calculateMonthlySummary", () => {
  it("subtracts reimbursements from gross expenses without counting them as income", () => {
    const summary = calculateMonthlySummary([
      movement({ type: "income", amount: "2200.00" }),
      movement({ type: "expense", amount: "500.00" }),
      movement({ type: "reimbursement", amount: "300.00" })
    ]);

    expect(summary).toEqual({
      income: "2200.00",
      grossExpenses: "500.00",
      reimbursements: "300.00",
      netExpenses: "200.00",
      economicBalance: "2000.00"
    });
  });

  it("ignores soft-deleted movements", () => {
    const summary = calculateMonthlySummary([
      movement({ type: "expense", amount: "50.00" }),
      movement({ type: "expense", amount: "70.00", deletedAt: "2026-08-20T10:00:00Z" })
    ]);

    expect(summary.grossExpenses).toBe("50.00");
  });
});

describe("calculateBudgetUsage", () => {
  it("uses month expenses minus reimbursements, including future known movements", () => {
    const usage = calculateBudgetUsage("1000.00", [
      movement({ type: "expense", amount: "100.00", occurredOn: "2026-08-02" }),
      movement({ type: "expense", amount: "250.00", occurredOn: "2026-08-30" }),
      movement({ type: "reimbursement", amount: "80.00", occurredOn: "2026-08-31" })
    ]);

    expect(usage.used).toBe("270.00");
    expect(usage.remaining).toBe("730.00");
    expect(usage.usedPercentage).toBe(27);
  });
});
