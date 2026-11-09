import { describe, expect, it } from "vitest";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { buildLiquidityForecastEvents, calculateLiquiditySummary } from "@/lib/calculations/liquidity";
import type { Account, Movement, Transfer } from "@/types/domain";

const today = "2026-11-09";
const monthEnd = "2026-11-30";

function account(id: string, type: Account["type"], openingBalance: string): Account {
  return { id, name: id, type, openingBalance, ownerUserId: "owner", openingBalanceDate: "2026-01-01", cachedBalance: "999999.00", cachedAt: null, deletedAt: null };
}

function transfer(fromAccountId: string, toAccountId: string, amount: string, overrides: Partial<Transfer> = {}): Transfer {
  return { id: "transfer", ownerUserId: "owner", householdId: null, fromAccountId, toAccountId, fromFundId: null, toFundId: null,
    amount, occurredOn: today, description: "Internal transfer", isSharedWithHousehold: false, deletedAt: null, ...overrides };
}

function movement(accountId: string, amount: string, overrides: Partial<Movement> = {}): Movement {
  return { id: "purchase", ownerUserId: "owner", householdId: null, accountId, fundId: null, categoryId: "category", type: "expense",
    amount, occurredOn: today, description: "Expense", notes: "", isSharedWithHousehold: false, reimbursementForMovementId: null,
    importBatchId: null, deletedAt: null, createdBy: null, updatedBy: null, ...overrides };
}

function summarize(accounts: Account[], transfers: Transfer[] = [], movements: Movement[] = []) {
  const balances = calculateFinancialBalances(accounts, [], movements, transfers, today, monthEnd);
  return { balances, summary: calculateLiquiditySummary(accounts, balances) };
}

describe("signed liquidity and internal transfers", () => {
  it("A: includes the negative bank balance rather than counting only positive cash", () => {
    const { summary } = summarize([account("cash", "cash", "1000.00"), account("bank", "bank", "-300.00")]);
    expect(summary).toMatchObject({ liquidity: "700.00", netLiquidity: "700.00", forecast: "700.00" });
    expect(summary.bank[0].balance).toBe("-300.00");
  });

  it.each([
    { label: "B: cash to overdraft, reaches zero", sourceType: "cash", destinationType: "bank", source: "1000.00", destination: "-300.00", amount: "300.00", finalSource: "700.00", finalDestination: "0.00", total: "700.00" },
    { label: "C: cash to overdraft, crosses zero", sourceType: "cash", destinationType: "bank", source: "1000.00", destination: "-300.00", amount: "500.00", finalSource: "500.00", finalDestination: "200.00", total: "700.00" },
    { label: "D: two positive banks", sourceType: "bank", destinationType: "bank", source: "2000.00", destination: "300.00", amount: "200.00", finalSource: "1800.00", finalDestination: "500.00", total: "2300.00" },
    { label: "E: negative bank to cash", sourceType: "bank", destinationType: "cash", source: "-300.00", destination: "1000.00", amount: "100.00", finalSource: "-400.00", finalDestination: "1100.00", total: "700.00" },
    { label: "positive bank to cash", sourceType: "bank", destinationType: "cash", source: "900.00", destination: "100.00", amount: "300.00", finalSource: "600.00", finalDestination: "400.00", total: "1000.00" },
    { label: "two negative banks", sourceType: "bank", destinationType: "bank", source: "-100.00", destination: "-300.00", amount: "200.00", finalSource: "-300.00", finalDestination: "-100.00", total: "-400.00" },
    { label: "negative bank to positive bank", sourceType: "bank", destinationType: "bank", source: "-100.00", destination: "300.00", amount: "50.00", finalSource: "-150.00", finalDestination: "350.00", total: "200.00" },
    { label: "positive source becomes negative", sourceType: "cash", destinationType: "bank", source: "100.00", destination: "100.00", amount: "300.00", finalSource: "-200.00", finalDestination: "400.00", total: "200.00" },
    { label: "exact cents across zero", sourceType: "cash", destinationType: "bank", source: "1000.10", destination: "-300.20", amount: "500.35", finalSource: "499.75", finalDestination: "200.15", total: "699.90" }
  ] as const)("$label", ({ sourceType, destinationType, source, destination, amount, finalSource, finalDestination, total }) => {
    const accounts = [account("source", sourceType, source), account("destination", destinationType, destination)];
    const before = summarize(accounts);
    const after = summarize(accounts, [transfer("source", "destination", amount)]);
    const rows = [...after.balances.bank, ...after.balances.cash];
    expect(rows.find((row) => row.id === "source")?.balance).toBe(finalSource);
    expect(rows.find((row) => row.id === "destination")?.balance).toBe(finalDestination);
    expect(before.summary.liquidity).toBe(total);
    expect(after.summary).toMatchObject({ liquidity: total, netLiquidity: total, forecast: total });
    expect(buildLiquidityForecastEvents(accounts, [], [transfer("source", "destination", amount, { occurredOn: "2026-11-20" })], today, monthEnd)).toEqual([]);
  });

  it("F: subtracts card debt once and keeps net availability unchanged after settlement", () => {
    const accounts = [account("cash", "cash", "1000.00"), account("bank", "bank", "-300.00"), account("card", "credit_card", "200.00"), account("credit", "credit_card", "-50.00")];
    const before = summarize(accounts);
    expect(before.summary).toMatchObject({ liquidity: "700.00", cardDebt: "200.00", netLiquidity: "500.00" });
    const internal = transfer("cash", "bank", "300.00");
    expect(summarize(accounts, [internal]).summary).toMatchObject({ liquidity: "700.00", cardDebt: "200.00", netLiquidity: "500.00" });
    const settled = summarize(accounts, [internal, transfer("bank", "card", "200.00", { id: "settlement" })]);
    expect(settled.summary).toMatchObject({ liquidity: "500.00", cardDebt: "0.00", netLiquidity: "500.00" });
    expect(settled.summary.bank[0].balance).toBe("-200.00");
  });

  it("G: includes forecast overdrafts and future expenses while internal transfers cancel out", () => {
    const accounts = [account("cash", "cash", "1000.00"), account("bank", "bank", "-300.00")];
    const transfers = [transfer("cash", "bank", "100.00", { occurredOn: "2026-11-20" })];
    const movements = [movement("bank", "50.00", { occurredOn: "2026-11-21" })];
    const { balances, summary } = summarize(accounts, transfers, movements);
    expect(summary).toMatchObject({ liquidity: "700.00", forecast: "650.00" });
    expect(summary.bank[0].balance).toBe("-300.00");
    expect(balances.forecastMonthEnd.find((row) => row.id === "bank")?.balance).toBe("-250.00");
    expect(buildLiquidityForecastEvents(accounts, movements, transfers, today, monthEnd).map((event) => event.effect)).toEqual(["-50.00"]);
    expect(summarize(accounts, transfers, [movement("bank", "800.00", { occurredOn: "2026-11-21" })]).summary.forecast).toBe("-100.00");
  });

  it("H: counts each active transfer once per endpoint and ignores deleted replacements", () => {
    const accounts = [account("cash", "cash", "1000.00"), account("bank", "bank", "-300.00")];
    const active = transfer("cash", "bank", "300.00");
    const deleted = transfer("cash", "bank", "300.00", { id: "deleted", deletedAt: "2026-11-09T10:00:00Z" });
    const { summary } = summarize(accounts, [active, deleted]);
    expect(summary.cash[0].balance).toBe("700.00");
    expect(summary.bank[0].balance).toBe("0.00");
    expect(summary.liquidity).toBe("700.00");
  });

  it("reproduces the reported 800 transfer without using cached balances", () => {
    const accounts = [account("cash", "cash", "2556.00"), account("bank", "bank", "-703.50"), account("card", "credit_card", "46.00")];
    const before = summarize(accounts);
    const after = summarize(accounts, [transfer("cash", "bank", "800.00")]);
    expect(before.summary).toMatchObject({ liquidity: "1852.50", netLiquidity: "1806.50" });
    expect(after.summary).toMatchObject({ liquidity: "1852.50", netLiquidity: "1806.50" });
    expect(after.summary.cash[0].balance).toBe("1756.00");
    expect(after.summary.bank[0].balance).toBe("96.50");
  });
});
