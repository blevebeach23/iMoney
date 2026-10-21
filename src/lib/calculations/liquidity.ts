import type { Account, Movement, Transfer } from "@/types/domain";
import type { FinancialBalances } from "./balances";
import { formatMoney, toDecimal } from "./money";

export function calculateLiquiditySummary(accounts: Account[], balances: FinancialBalances) {
  const liquidIds = new Set(accounts.filter((a) => a.type === "bank" || a.type === "cash").map((a) => a.id));
  const bank = balances.bank.filter((row) => liquidIds.has(row.id));
  const cash = balances.cash.filter((row) => liquidIds.has(row.id));
  const liquidity = [...bank, ...cash].reduce((sum, row) => sum.plus(row.balance), toDecimal(0));
  const cardDebt = balances.creditCardsDue.reduce((sum, row) => sum.plus(toDecimal(row.due).gt(0) ? row.due : 0), toDecimal(0));
  const forecast = balances.forecastMonthEnd.filter((row) => liquidIds.has(row.id)).reduce((sum, row) => sum.plus(row.balance), toDecimal(0));
  return { bank, cash, liquidity: formatMoney(liquidity), cardDebt: formatMoney(cardDebt), netLiquidity: formatMoney(liquidity.minus(cardDebt)), forecast: formatMoney(forecast) };
}

export type LiquiditySummary = ReturnType<typeof calculateLiquiditySummary>;

/** Cash effects only: card purchases and internal liquid-account transfers have
 * no immediate effect on total liquidity; card settlement is counted once. */
export function buildLiquidityForecastEvents(accounts: Account[], movements: Movement[], transfers: Transfer[], today: string, until: string) {
  const liquidIds = new Set(accounts.filter((a) => a.type === "bank" || a.type === "cash").map((a) => a.id));
  const inRange = (date: string) => date > today && date <= until;
  return [
    ...movements.filter((m) => m.deletedAt === null && m.accountId && liquidIds.has(m.accountId) && inRange(m.occurredOn)).map((m) => ({
      id: m.id, date: m.occurredOn, description: m.description,
      effect: formatMoney(m.type === "expense" ? toDecimal(m.amount).negated() : m.amount)
    })),
    ...transfers.filter((t) => t.deletedAt === null && inRange(t.occurredOn)).flatMap((t) => {
      const incoming = Boolean(t.toAccountId && liquidIds.has(t.toAccountId));
      const outgoing = Boolean(t.fromAccountId && liquidIds.has(t.fromAccountId));
      if (incoming === outgoing) return [];
      return [{ id: t.id, date: t.occurredOn, description: t.description || "Trasferimento", effect: formatMoney(outgoing ? toDecimal(t.amount).negated() : t.amount) }];
    })
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export type LiquidityForecastEvent = ReturnType<typeof buildLiquidityForecastEvents>[number];
