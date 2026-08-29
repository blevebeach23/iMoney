import { describe, expect, it, vi } from "vitest";
import { buildDuplicateInput } from "@/services/movements/movement-service";
import type { Movement } from "@/types/domain";

function movement(partial: Partial<Movement> = {}): Movement {
  return {
    id: "movement-1",
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-1",
    fundId: null,
    categoryId: "category-1",
    type: "expense",
    amount: "50.00",
    occurredOn: "2026-08-10",
    description: "Originale",
    notes: "Nota",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: "user-1",
    updatedBy: "user-1",
    ...partial
  };
}

describe("buildDuplicateInput", () => {
  it("duplicates movement data with today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00Z"));

    expect(buildDuplicateInput(movement())).toMatchObject({
      occurredOn: "2026-08-29",
      description: "Originale",
      amount: "50.00",
      containerId: "account:account-1",
      isReimbursement: false
    });

    vi.useRealTimers();
  });

  it("keeps reimbursement semantics when duplicating", () => {
    const duplicate = buildDuplicateInput(
      movement({
        type: "reimbursement",
        reimbursementForMovementId: "expense-1"
      })
    );

    expect(duplicate.type).toBe("income");
    expect(duplicate.isReimbursement).toBe(true);
    expect(duplicate.reimbursementForMovementId).toBe("expense-1");
  });
});
