import { describe, expect, it } from "vitest";
import {
  accountFormSchema,
  categoryFormSchema,
  fundFormSchema,
  macroCategoryFormSchema
} from "@/lib/master-data/validation";

describe("master data validation", () => {
  it("validates account data and normalizes decimal commas", () => {
    const parsed = accountFormSchema.parse({
      name: "Conto corrente",
      type: "bank",
      openingBalance: "1200,50",
      openingBalanceDate: "2026-08-28"
    });

    expect(parsed.openingBalance).toBe("1200.50");
  });

  it("rejects invalid fund target amounts", () => {
    expect(
      fundFormSchema.safeParse({
        name: "Vacanze",
        type: "holiday",
        openingBalance: "100.00",
        openingBalanceDate: "2026-08-28",
        targetAmount: "-10",
        targetDate: "2027-06-01"
      }).success
    ).toBe(false);
  });

  it("requires a household when sharing a fund", () => {
    const baseFund = {
      name: "Vacanze",
      type: "holiday",
      openingBalance: "100.00",
      openingBalanceDate: "2026-08-28",
      targetAmount: "",
      targetDate: ""
    };

    expect(fundFormSchema.safeParse({ ...baseFund, sharedWithFamily: false, householdId: "" }).success).toBe(true);
    expect(fundFormSchema.safeParse({ ...baseFund, sharedWithFamily: true, householdId: "" }).success).toBe(false);
    expect(
      fundFormSchema.safeParse({
        ...baseFund,
        sharedWithFamily: true,
        householdId: "10000000-0000-4000-8000-000000000001"
      }).success
    ).toBe(true);
  });

  it("validates macro-category ordering", () => {
    expect(macroCategoryFormSchema.safeParse({ name: "AUTO", sortOrder: 1 }).success).toBe(true);
    expect(macroCategoryFormSchema.safeParse({ name: "", sortOrder: -1 }).success).toBe(false);
  });

  it("requires a category to belong to a macro-category", () => {
    expect(
      categoryFormSchema.safeParse({
        macroCategoryId: "not-a-uuid",
        name: "Manutenzione",
        sortOrder: 0
      }).success
    ).toBe(false);
  });
});
