import { describe, expect, it } from "vitest";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import type { MovementCategoryInfo } from "@/lib/calculations/category-aggregates";
import { filterFamilySharedMovements, isActiveHouseholdMember } from "@/lib/households/family-rules";
import { householdFormSchema, householdInviteResponseSchema, householdInviteSchema, householdPreferenceSchema } from "@/lib/households/validation";
import type { Budget, HouseholdMember, Movement } from "@/types/domain";

function member(partial: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    householdId: "household-1",
    userId: "user-1",
    role: "member",
    status: "ACTIVE",
    invitedBy: null,
    joinedAt: "2026-08-29T10:00:00Z",
    removedAt: null,
    ...partial
  };
}

function movement(partial: Partial<Movement> = {}): Movement {
  return {
    id: crypto.randomUUID(),
    ownerUserId: "user-1",
    householdId: "household-1",
    accountId: "account-1",
    fundId: null,
    categoryId: "category-home",
    type: "expense",
    amount: "100.00",
    occurredOn: "2026-08-15",
    description: "Shared expense",
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    ...partial
  };
}

function budget(partial: Partial<Budget> = {}): Budget {
  return {
    id: crypto.randomUUID(),
    ownerType: "HOUSEHOLD",
    ownerUserId: null,
    householdId: "household-1",
    month: "2026-08-01",
    macroCategoryId: null,
    categoryId: null,
    amount: "300.00",
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
      macroCategoryId: "macro-home",
      macroCategoryName: "Casa"
    }
  ]
]);

describe("family rules", () => {
  it("validates household creation input", () => {
    expect(householdFormSchema.safeParse({ name: "Famiglia Bleve" }).success).toBe(true);
    expect(householdFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("validates invite and server-side response inputs", () => {
    expect(householdInviteSchema.safeParse({ householdId: crypto.randomUUID(), email: "anna@example.com" }).success).toBe(true);
    expect(householdInviteResponseSchema.safeParse({ token: "a".repeat(32), accept: true }).success).toBe(true);
  });

  it("detects active membership only", () => {
    expect(isActiveHouseholdMember([member()], "household-1")).toBe(true);
    expect(isActiveHouseholdMember([member({ status: "REMOVED" })], "household-1")).toBe(false);
  });

  it("validates default sharing preference input", () => {
    expect(householdPreferenceSchema.safeParse({ householdId: crypto.randomUUID(), shareNewMovementsByDefault: true }).success).toBe(true);
  });

  it("includes shared movements in family and excludes private movements", () => {
    const result = filterFamilySharedMovements(
      [
        movement({ id: "shared" }),
        movement({ id: "private", isSharedWithHousehold: false }),
        movement({ id: "external", householdId: "household-2" })
      ],
      "household-1"
    );

    expect(result.map((item) => item.id)).toEqual(["shared"]);
  });

  it("calculates household budget from shared family movements", () => {
    const report = calculateBudgetReport(
      [budget()],
      [
        movement({ type: "expense", amount: "180.00" }),
        movement({ type: "reimbursement", amount: "40.00" })
      ],
      categories
    );

    expect(report.general?.usage.used).toBe("140.00");
    expect(report.general?.usage.remaining).toBe("160.00");
  });

  it("excludes external household movements", () => {
    expect(filterFamilySharedMovements([movement({ householdId: "household-2" })], "household-1")).toHaveLength(0);
  });
});
