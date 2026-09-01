import { describe, expect, it } from "vitest";
import { movementFormSchema, movementRequestDecisionSchema, movementRequestFormSchema, parseContainerId } from "@/lib/movements/validation";

const categoryId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const householdId = "33333333-3333-4333-8333-333333333333";

function validMovement(overrides: Record<string, unknown> = {}) {
  return {
    occurredOn: "2026-09-15",
    description: "Spesa",
    categoryId,
    type: "expense",
    amount: "12,50",
    containerId: `account:${accountId}`,
    accountId,
    fundId: null,
    isReimbursement: false,
    reimbursementForMovementId: "",
    sharedWithFamily: false,
    householdId: "",
    notes: "",
    ...overrides
  };
}

describe("movement validation", () => {
  it("accepts positive amounts and normalizes decimal commas", () => {
    const parsed = movementFormSchema.parse(validMovement());
    expect(parsed.amount).toBe("12.50");
  });

  it("rejects non-positive amounts", () => {
    expect(movementFormSchema.safeParse(validMovement({ amount: "0" })).success).toBe(false);
    expect(movementFormSchema.safeParse(validMovement({ amount: "-1.00" })).success).toBe(false);
  });

  it("requires exactly one account or fund", () => {
    expect(movementFormSchema.safeParse(validMovement({ accountId: null, fundId: null })).success).toBe(false);
    expect(movementFormSchema.safeParse(validMovement({ fundId: accountId })).success).toBe(false);
  });

  it("requires reimbursements to be income", () => {
    expect(movementFormSchema.safeParse(validMovement({ isReimbursement: true, type: "expense" })).success).toBe(false);
    expect(movementFormSchema.safeParse(validMovement({ isReimbursement: true, type: "income" })).success).toBe(true);
  });

  it("accepts future dates without hiding them", () => {
    expect(movementFormSchema.safeParse(validMovement({ occurredOn: "2027-01-20" })).success).toBe(true);
  });

  it("requires a household id when sharing", () => {
    expect(movementFormSchema.safeParse(validMovement({ sharedWithFamily: true, householdId: "" })).success).toBe(false);
    expect(movementFormSchema.safeParse(validMovement({ sharedWithFamily: true, householdId })).success).toBe(true);
  });

  it("parses the unified account/fund selector", () => {
    expect(parseContainerId(`account:${accountId}`)).toEqual({ accountId, fundId: null });
    expect(parseContainerId(`fund:${accountId}`)).toEqual({ accountId: null, fundId: accountId });
  });

  it("validates movement requests without exposing recipient containers", () => {
    const parsed = movementRequestFormSchema.parse({
      occurredOn: "2026-09-15",
      description: "Spesa per Anna",
      categoryId,
      categoryLabel: "Casa / Spesa",
      type: "expense",
      amount: "45,00",
      isReimbursement: false,
      reimbursementForMovementId: "",
      sharedWithFamily: true,
      householdId,
      recipientUserId: "44444444-4444-4444-8444-444444444444",
      notes: "Da confermare"
    });

    expect(parsed.amount).toBe("45.00");
    expect(parsed).not.toHaveProperty("accountId");
    expect(parsed).not.toHaveProperty("fundId");
  });

  it("requires recipient container and category when accepting a movement request", () => {
    expect(
      movementRequestDecisionSchema.safeParse({
        requestId: "55555555-5555-4555-8555-555555555555",
        categoryId,
        containerId: `account:${accountId}`,
        accountId,
        fundId: null,
        reimbursementForMovementId: ""
      }).success
    ).toBe(true);
    expect(
      movementRequestDecisionSchema.safeParse({
        requestId: "55555555-5555-4555-8555-555555555555",
        categoryId,
        containerId: "",
        accountId: null,
        fundId: null,
        reimbursementForMovementId: ""
      }).success
    ).toBe(false);
  });
});
