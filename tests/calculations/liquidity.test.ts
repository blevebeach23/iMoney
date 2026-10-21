import { describe, expect, it } from "vitest";
import { buildLiquidityForecastEvents, calculateLiquiditySummary } from "@/lib/calculations/liquidity";
import { currentMonthRange, todayInRome } from "@/lib/calculations/dates";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import type { Account, Movement, Transfer } from "@/types/domain";

describe("current availability", () => {
  it("separates bank, cash, card debt, funds and forecast and excludes other non-liquid accounts", () => {
    const accounts = [{ id: "bank", type: "bank" }, { id: "cash", type: "cash" }, { id: "other", type: "other" }] as Account[];
    const result = calculateLiquiditySummary(accounts, {
      bank: [{ id: "bank", name: "Bank", balance: "3750.00" }, { id: "other", name: "Other", balance: "900.00" }],
      cash: [{ id: "cash", name: "Cash", balance: "500.00" }],
      funds: [{ id: "fund", name: "Savings", balance: "10000.00" }],
      creditCardsDue: [{ accountId: "card", name: "Visa", spent: "630.00", settled: "0.00", due: "630.00" }, { accountId: "credit", name: "Credit", spent: "0.00", settled: "20.00", due: "-20.00" }],
      forecastMonthEnd: [{ id: "bank", name: "Bank", balance: "5000.00" }, { id: "cash", name: "Cash", balance: "500.00" }, { id: "other", name: "Other", balance: "900.00" }]
    });
    expect(result).toMatchObject({ liquidity: "4250.00", cardDebt: "630.00", netLiquidity: "3620.00", forecast: "5500.00" });
    expect(result.bank).toHaveLength(1);
  });

  it("uses the Rome accounting day around UTC midnight and daylight saving", () => {
    expect(todayInRome(new Date("2026-10-28T23:30:00Z"))).toBe("2026-10-29");
    expect(todayInRome(new Date("2026-07-28T22:30:00Z"))).toBe("2026-07-29");
    expect(currentMonthRange(new Date("2026-10-31T23:30:00Z"))).toEqual({ monthStart: "2026-11-01", monthEnd: "2026-11-30", today: "2026-11-01" });
  });
  it("moves due operations from forecast to actual liquidity exactly once", () => {
    const accounts = [{ id: "bank", name: "Bank", type: "bank", openingBalance: "3750.00" }, { id: "cash", name: "Cash", type: "cash", openingBalance: "500.00" }, { id: "card", name: "Visa", type: "credit_card", openingBalance: "0.00" }] as Account[];
    const movements = [
      { id: "purchase", accountId: "card", type: "expense", amount: "630.00", occurredOn: "2026-11-05", deletedAt: null },
      { id: "expense", accountId: "bank", type: "expense", amount: "120.00", occurredOn: "2026-11-20", deletedAt: null },
      { id: "salary", accountId: "bank", type: "income", amount: "2000.00", occurredOn: "2026-11-27", deletedAt: null }
    ] as Movement[];
    const transfers = [{ id: "settlement", fromAccountId: "bank", toAccountId: "card", amount: "630.00", occurredOn: "2026-11-15", deletedAt: null }] as Transfer[];
    const before = calculateLiquiditySummary(accounts, calculateFinancialBalances(accounts, [], movements, transfers, "2026-11-01", "2026-11-30"));
    expect(before).toMatchObject({ liquidity: "4250.00", forecast: "5500.00" });
    expect(buildLiquidityForecastEvents(accounts, movements, transfers, "2026-11-01", "2026-11-30").map((e) => e.effect)).toEqual(["-630.00", "-120.00", "2000.00"]);
    const after = calculateLiquiditySummary(accounts, calculateFinancialBalances(accounts, [], movements, transfers, "2026-11-15", "2026-11-30"));
    expect(after).toMatchObject({ liquidity: "3620.00", cardDebt: "0.00", forecast: "5500.00" });
    expect(buildLiquidityForecastEvents(accounts, movements, transfers, "2026-11-15", "2026-11-30").map((e) => e.effect)).toEqual(["-120.00", "2000.00"]);
    const internal = { ...transfers[0], id: "internal", toAccountId: "cash", occurredOn: "2026-11-16" };
    expect(buildLiquidityForecastEvents(accounts, [], [internal], "2026-11-01", "2026-11-30")).toEqual([]);
  });

});
