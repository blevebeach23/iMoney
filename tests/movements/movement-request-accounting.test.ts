import { describe, expect, it } from "vitest";
import { calculateAccountBalance } from "@/lib/calculations/balances";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { Account, Budget, MovementRequest } from "@/types/domain";

const pendingRequest: MovementRequest = {
  acceptedMovementId: null,
  amount: "500.00",
  categoryId: "category-1",
  categoryLabel: "Casa / Spesa",
  createdAt: "2026-09-01T10:00:00Z",
  createdByUserId: "user-1",
  creatorName: "Vito",
  description: "Richiesta pending",
  householdId: "household-1",
  id: "request-1",
  movementDate: "2026-09-15",
  movementType: "expense",
  notes: "",
  recipientName: "Anna",
  recipientUserId: "user-2",
  reimbursementForMovementId: null,
  respondedAt: null,
  sharedWithFamily: true,
  status: "PENDING"
};

describe("pending movement request accounting", () => {
  it("does not affect balances before it becomes a movement", () => {
    const account: Account = {
      cachedAt: null,
      cachedBalance: "1000.00",
      deletedAt: null,
      id: "account-1",
      name: "Banca",
      openingBalance: "1000.00",
      ownerUserId: "user-2",
      type: "bank"
    };

    expect(pendingRequest.status).toBe("PENDING");
    expect(calculateAccountBalance(account, [], [], "2026-09-30")).toBe("1000.00");
  });

  it("does not affect monthly summary or budget before it becomes a movement", () => {
    const budget: Budget = {
      amount: "1000.00",
      categoryId: null,
      deletedAt: null,
      householdId: "household-1",
      id: "budget-1",
      macroCategoryId: null,
      month: "2026-09-01",
      ownerType: "HOUSEHOLD",
      ownerUserId: null
    };

    expect(pendingRequest.amount).toBe("500.00");
    expect(calculateMonthlySummary([]).grossExpenses).toBe("0.00");
    expect(calculateBudgetReport([budget], [], new Map()).general?.usage.used).toBe("0.00");
  });
});
