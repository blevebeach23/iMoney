import { describe, expect, it } from "vitest";
import { parseTransferContainerId, transferFormSchema } from "@/lib/transfers/validation";

const accountA = crypto.randomUUID();
const accountB = crypto.randomUUID();
const fundA = crypto.randomUUID();

function validTransfer(overrides: Record<string, unknown> = {}) {
  return {
    occurredOn: "2026-08-29",
    fromContainerId: `account:${accountA}`,
    toContainerId: `account:${accountB}`,
    fromAccountId: accountA,
    fromFundId: null,
    toAccountId: accountB,
    toFundId: null,
    amount: "50.00",
    description: "",
    sharedWithFamily: false,
    householdId: null,
    ...overrides
  };
}

describe("transfer validation", () => {
  it("accepts account to account transfers", () => {
    expect(transferFormSchema.safeParse(validTransfer()).success).toBe(true);
  });

  it("accepts account to fund transfers", () => {
    expect(
      transferFormSchema.safeParse(
        validTransfer({
          toContainerId: `fund:${fundA}`,
          toAccountId: null,
          toFundId: fundA
        })
      ).success
    ).toBe(true);
  });

  it("accepts fund to account transfers", () => {
    expect(
      transferFormSchema.safeParse(
        validTransfer({
          fromContainerId: `fund:${fundA}`,
          fromAccountId: null,
          fromFundId: fundA
        })
      ).success
    ).toBe(true);
  });

  it("rejects the same source and destination", () => {
    const result = transferFormSchema.safeParse(
      validTransfer({
        toContainerId: `account:${accountA}`,
        toAccountId: accountA
      })
    );

    expect(result.success).toBe(false);
  });

  it("rejects non-positive amounts", () => {
    expect(transferFormSchema.safeParse(validTransfer({ amount: "0.00" })).success).toBe(false);
  });

  it("requires a household when sharing with family", () => {
    expect(transferFormSchema.safeParse(validTransfer({ sharedWithFamily: true, householdId: null })).success).toBe(false);
    expect(transferFormSchema.safeParse(validTransfer({ sharedWithFamily: true, householdId: crypto.randomUUID() })).success).toBe(true);
  });

  it("parses transfer containers", () => {
    expect(parseTransferContainerId(`account:${accountA}`)).toEqual({ accountId: accountA, fundId: null });
    expect(parseTransferContainerId(`fund:${fundA}`)).toEqual({ accountId: null, fundId: fundA });
  });
});
