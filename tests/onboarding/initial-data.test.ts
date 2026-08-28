import { describe, expect, it } from "vitest";
import { initialAccountOptions, initialCategoryGroups, onboardingSchema } from "@/lib/onboarding/initial-data";

describe("onboarding utilities", () => {
  it("offers the expected optional starter accounts", () => {
    expect(initialAccountOptions.map((account) => account.type)).toEqual(["cash", "bank", "credit_card"]);
  });

  it("keeps starter categories as user-editable seed data", () => {
    expect(initialCategoryGroups.length).toBeGreaterThan(0);
    expect(initialCategoryGroups.some((group) => group.macro === "ALTRO")).toBe(true);
  });

  it("validates enabled account opening balances and dates", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Vito",
      username: "vito_bleve",
      createInitialCategories: true,
      accounts: [
        {
          enabled: true,
          name: "Conto corrente",
          type: "bank",
          openingBalance: "100.50",
          openingBalanceDate: "2026-08-28"
        }
      ]
    });

    expect(result.success).toBe(true);
  });
});
