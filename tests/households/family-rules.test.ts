import { describe, expect, it } from "vitest";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import type { MovementCategoryInfo } from "@/lib/calculations/category-aggregates";
import { filterFamilySharedFunds, filterFamilySharedMovements, isActiveHouseholdMember } from "@/lib/households/family-rules";
import { canCurrentUserManageMember, shouldShowPromoteToAdmin, sortHouseholdMembersForDisplay } from "@/lib/households/member-ui";
import { householdInviteStatusLabel, householdMemberStatusLabel } from "@/lib/households/status-labels";
import { householdFormSchema, householdInviteResponseSchema, householdInviteSchema, householdPreferenceSchema } from "@/lib/households/validation";
import type { Budget, Fund, HouseholdMember, Movement } from "@/types/domain";
import type { HouseholdMemberListItem } from "@/services/households/household-service";

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

function displayMember(partial: Partial<HouseholdMemberListItem> = {}): HouseholdMemberListItem {
  const base = member(partial);

  return {
    ...base,
    fullName: partial.fullName ?? `Utente ${base.userId}`,
    username: partial.username ?? "",
    email: partial.email
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

function fund(partial: Partial<Fund> = {}): Fund {
  return {
    id: "fund-1",
    ownerUserId: "user-1",
    householdId: "household-1",
    name: "Vacanze",
    type: "holiday",
    openingBalance: "100.00",
    openingBalanceDate: "2026-08-01",
    cachedBalance: "150.00",
    cachedAt: null,
    targetAmount: null,
    targetDate: null,
    isSharedWithHousehold: true,
    deletedAt: null,
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

  it("translates household enum statuses for presentation", () => {
    expect(householdInviteStatusLabel("PENDING")).toBe("In attesa");
    expect(householdInviteStatusLabel("ACCEPTED")).toBe("Accettato");
    expect(householdInviteStatusLabel("REJECTED")).toBe("Rifiutato");
    expect(householdInviteStatusLabel("CANCELLED")).toBe("Cancellato");
    expect(householdMemberStatusLabel("ACTIVE")).toBe("Attivo");
    expect(householdMemberStatusLabel("INVITED")).toBe("Invitato");
    expect(householdMemberStatusLabel("REMOVED")).toBe("Rimosso");
  });

  it("orders the current user first, then other admins, then members", () => {
    const members = [
      displayMember({ userId: "member-2", role: "member", fullName: "Zeta" }),
      displayMember({ userId: "admin-2", role: "admin", fullName: "Admin" }),
      displayMember({ userId: "current-user", role: "member", fullName: "Io" }),
      displayMember({ userId: "member-1", role: "member", fullName: "Anna" })
    ];

    expect(sortHouseholdMembersForDisplay(members, "current-user").map((item) => item.userId)).toEqual(["current-user", "admin-2", "member-1", "member-2"]);
  });

  it("does not expose admin controls for the current user", () => {
    const current = displayMember({ userId: "current-user", role: "owner" });

    expect(canCurrentUserManageMember("owner", "current-user", current)).toBe(false);
    expect(shouldShowPromoteToAdmin("owner", "current-user", current)).toBe(false);
  });

  it("allows admins to manage other non-admin members only", () => {
    const normalMember = displayMember({ userId: "member-1", role: "member" });
    const adminMember = displayMember({ userId: "admin-1", role: "admin" });

    expect(canCurrentUserManageMember("owner", "current-user", normalMember)).toBe(true);
    expect(shouldShowPromoteToAdmin("owner", "current-user", normalMember)).toBe(true);
    expect(canCurrentUserManageMember("owner", "current-user", adminMember)).toBe(true);
    expect(shouldShowPromoteToAdmin("owner", "current-user", adminMember)).toBe(false);
  });

  it("hides member management controls from normal members", () => {
    expect(canCurrentUserManageMember("member", "current-user", displayMember({ userId: "member-1" }))).toBe(false);
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

  it("hides private funds from family", () => {
    expect(filterFamilySharedFunds([fund({ isSharedWithHousehold: false, householdId: null })], "household-1")).toHaveLength(0);
  });

  it("shows shared funds in family", () => {
    expect(filterFamilySharedFunds([fund()], "household-1").map((item) => item.id)).toEqual(["fund-1"]);
  });

  it("excludes shared funds from external households", () => {
    expect(filterFamilySharedFunds([fund({ householdId: "household-2" })], "household-1")).toHaveLength(0);
  });

  it("keeps private movements on a shared fund out of family", () => {
    const sharedFundId = "fund-1";
    const privateFundMovement = movement({
      id: "private-fund-movement",
      accountId: null,
      fundId: sharedFundId,
      householdId: null,
      isSharedWithHousehold: false
    });

    expect(filterFamilySharedMovements([privateFundMovement], "household-1")).toHaveLength(0);
  });

  it("shows shared movements on a shared fund in family", () => {
    const sharedFundMovement = movement({
      id: "shared-fund-movement",
      accountId: null,
      fundId: "fund-1",
      householdId: "household-1",
      isSharedWithHousehold: true
    });

    expect(filterFamilySharedMovements([sharedFundMovement], "household-1").map((item) => item.id)).toEqual(["shared-fund-movement"]);
  });
});
