import { describe, expect, it } from "vitest";
import { calculateTimelineEconomicSummary, buildMovementTimeline, transfersCanBeShownWithMovementFilters } from "@/services/timeline/timeline-service";
import type { MovementListItem } from "@/services/movements/movement-service";
import type { TransferListItem } from "@/services/transfers/transfer-service";

function movement(partial: Partial<MovementListItem> = {}): MovementListItem {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-1",
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
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedBy: null,
    accountName: "Bank",
    categoryName: "Groceries",
    fundName: null,
    macroCategoryName: "Home",
    ...partial
  };
}

function transfer(partial: Partial<TransferListItem> = {}): TransferListItem {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: null,
    fromAccountId: "account-1",
    toAccountId: "account-2",
    fromFundId: null,
    toFundId: null,
    amount: "75.00",
    occurredOn: "2026-08-15",
    description: "Transfer",
    createdAt: "2026-08-15T10:00:00.000Z",
    deletedAt: null,
    fromName: "Bank",
    toName: "Cash",
    ...partial
  };
}

describe("movement timeline", () => {
  it("orders movements and transfers together by date descending", () => {
    const first = movement({ id: "movement-new", occurredOn: "2026-08-20" });
    const second = transfer({ id: "transfer-mid", occurredOn: "2026-08-15" });
    const third = movement({ id: "movement-old", occurredOn: "2026-08-01" });

    expect(buildMovementTimeline([third, first], [second]).map((item) => item.id)).toEqual(["movement-new", "transfer-mid", "movement-old"]);
  });

  it("uses created_at descending as tie-break for same-day movement timeline items", () => {
    const older = movement({ id: "movement-older", occurredOn: "2026-08-20", createdAt: "2026-08-20T08:00:00.000Z" });
    const newer = movement({ id: "movement-newer", occurredOn: "2026-08-20", createdAt: "2026-08-20T09:00:00.000Z" });

    expect(buildMovementTimeline([older, newer], []).map((item) => item.id)).toEqual(["movement-newer", "movement-older"]);
  });

  it("keeps movement and transfer items discriminated", () => {
    const timeline = buildMovementTimeline([movement({ id: "movement-1" })], [transfer({ id: "transfer-1" })]);

    expect(timeline.find((item) => item.id === "movement-1")).toMatchObject({ kind: "movement" });
    expect(timeline.find((item) => item.id === "transfer-1")).toMatchObject({ kind: "transfer" });
  });

  it("excludes transfers from economic aggregates", () => {
    const summary = calculateTimelineEconomicSummary([
      ...buildMovementTimeline(
        [
          movement({ type: "income", amount: "1000.00" }),
          movement({ type: "expense", amount: "300.00" }),
          movement({ type: "reimbursement", amount: "50.00" })
        ],
        [transfer({ amount: "900.00" })]
      )
    ]);

    expect(summary).toEqual({
      income: "1000.00",
      grossExpenses: "300.00",
      reimbursements: "50.00",
      netExpenses: "250.00",
      economicBalance: "750.00"
    });
  });

  it("shows transfers only with compatible movement filters", () => {
    expect(transfersCanBeShownWithMovementFilters({ type: "all", reimbursement: "all", shared: "all" })).toBe(true);
    expect(transfersCanBeShownWithMovementFilters({ type: "expense", reimbursement: "all", shared: "all" })).toBe(false);
    expect(transfersCanBeShownWithMovementFilters({ type: "all", categoryId: crypto.randomUUID(), reimbursement: "all", shared: "all" })).toBe(false);
  });
});
