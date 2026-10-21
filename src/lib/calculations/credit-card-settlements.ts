import type { Account, CreditCardSettings, Movement, Transfer } from "@/types/domain";
import { formatMoney, toDecimal } from "./money";

/** Persistent cycle identity is retained on the soft-deleted settlement row. */
export type CreditCardSettlementIdentity = Pick<Transfer, "ownerUserId" | "creditCardAccountId" | "creditCardCycleEndOn">;
export type CreditCardSettlementHistoryEntry = CreditCardSettlementIdentity & Pick<Transfer, "amount" | "occurredOn" | "deletedAt">;

export interface CreditCardSettlementCycle {
  cycleStartOn: string;
  cycleEndOn: string;
  paymentOn: string;
}

export interface CreditCardForecast {
  accountId: string;
  accountName: string;
  settlementAccountId: string;
  settlementAccountName: string;
  cycleStartOn: string;
  cycleEndOn: string;
  paymentOn: string;
  amountDue: string;
  nextCycleAmount: string;
  automaticSettlement: boolean;
  insufficientFunds: boolean;
  missingAmount: string;
}

export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month, 0).getDate());
}

export function dateWithClampedDay(year: number, month: number, day: number): string {
  const resolvedDay = clampDay(year, month, day);
  return `${year}-${String(month).padStart(2, "0")}-${String(resolvedDay).padStart(2, "0")}`;
}

export function calculateSettlementCycle(today: string, statementClosingDay: number, paymentDay: number): CreditCardSettlementCycle {
  const current = parseDate(today);
  const currentClosing = dateWithClampedDay(current.year, current.month, statementClosingDay);
  const cycleEnd = today < currentClosing ? previousMonthDate(current.year, current.month, statementClosingDay) : currentClosing;
  const cycleEndParts = parseDate(cycleEnd);
  const paymentBase = addMonths(cycleEndParts.year, cycleEndParts.month, paymentDay < statementClosingDay ? 1 : 0);

  return {
    cycleStartOn: nextDay(previousMonthDate(cycleEndParts.year, cycleEndParts.month, statementClosingDay)),
    cycleEndOn: cycleEnd,
    paymentOn: dateWithClampedDay(paymentBase.year, paymentBase.month, paymentDay)
  };
}

export function calculateCreditCardCycleAmount(accountId: string, movements: Movement[], cycleStartOn: string, cycleEndOn: string): string {
  const total = movements
    .filter((movement) => movement.deletedAt === null && movement.accountId === accountId && movement.occurredOn >= cycleStartOn && movement.occurredOn <= cycleEndOn)
    .reduce((sum, movement) => {
      if (movement.type === "expense") {
        return sum.plus(toDecimal(movement.amount));
      }
      return sum.minus(toDecimal(movement.amount));
    }, toDecimal(0));

  return formatMoney(total.isNegative() ? 0 : total);
}

/** Unpaid recorded purchases through this cutoff, after actual card transfers.
 * Carry credits/refunds forward; a manually recorded bank-to-card payment also
 * reduces the amount, even when it has no automatic settlement metadata.
 */
export function calculateUnpaidCardPurchases(accountId: string, movements: Movement[], transfers: Transfer[], cycleEndOn: string, paymentOn: string, openingBalance = "0.00", openingBalanceDate?: string, settlementHistory: readonly CreditCardSettlementHistoryEntry[] = []): string {
  const purchases = movements.filter((m) => m.accountId === accountId && m.deletedAt === null && m.occurredOn <= cycleEndOn)
    .reduce((sum, m) => m.type === "expense" ? sum.plus(m.amount) : sum.minus(m.amount), toDecimal(!openingBalanceDate || openingBalanceDate <= cycleEndOn ? openingBalance : 0));
  const outstanding = transfers.filter((t) => t.deletedAt === null && t.occurredOn <= paymentOn)
    .reduce((sum, t) => t.toAccountId === accountId ? sum.minus(t.amount) : t.fromAccountId === accountId ? sum.plus(t.amount) : sum, purchases);
  // Cancellation reverses cash balances, but must not roll a closed cycle's
  // settled amount into a subsequent debit. This adjustment is allocation only.
  const closedCancelledAmount = settlementHistory
    .filter((entry) => entry.creditCardAccountId === accountId && entry.deletedAt !== null
      && entry.creditCardCycleEndOn && entry.creditCardCycleEndOn <= cycleEndOn && entry.occurredOn <= paymentOn)
    .reduce((sum, entry) => sum.plus(entry.amount), toDecimal(0));
  return formatMoney(outstanding.minus(closedCancelledAmount));
}

export function hasCreditCardSettlement(history: readonly CreditCardSettlementIdentity[], ownerUserId: string, accountId: string, cycleEndOn: string): boolean {
  // Same identity as guard_settlement_identity and sync_financial_automation.
  // Do not filter deleted_at or use the start date (legacy cycles used month start).
  return history.some((entry) => entry.ownerUserId === ownerUserId
    && entry.creditCardAccountId === accountId && entry.creditCardCycleEndOn === cycleEndOn);
}

export function buildCreditCardForecasts(input: {
  accounts: Account[];
  settings: CreditCardSettings[];
  movements: Movement[];
  transfers: Transfer[];
  settlementHistory?: readonly CreditCardSettlementHistoryEntry[];
  bankBalances: Array<{ id: string; balance: string }>;
  today: string;
}): CreditCardForecast[] {
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const bankBalanceById = new Map(input.bankBalances.map((balance) => [balance.id, balance.balance]));

  return input.settings.flatMap((setting) => {
    const card = accountsById.get(setting.accountId);
    const settlementAccount = accountsById.get(setting.settlementAccountId);
    if (!card || card.type !== "credit_card" || !settlementAccount || settlementAccount.type !== "bank") {
      return [];
    }

    const settlementHistory = (input.settlementHistory ?? input.transfers)
      .filter((entry) => entry.ownerUserId === card.ownerUserId);

    // Include overdue, closed and open cycles with known purchases. A payment
    // already recorded (even subsequently cancelled) closes its cycle identity.
    const dates = input.movements.filter((m) => m.accountId === card.id && m.deletedAt === null).map((m) => m.occurredOn).sort();
    const firstDate = toDecimal(card.openingBalance).isZero() || !card.openingBalanceDate
      ? dates[0] ?? input.today : [card.openingBalanceDate, dates[0] ?? input.today].sort()[0];
    const first = parseDate(firstDate);
    const last = parseDate([input.today, ...dates].sort().at(-1)!);
    const horizon = addMonths(last.year, last.month, 1);
    const candidates: CreditCardSettlementCycle[] = [];
    for (let month = { year: first.year, month: first.month }; `${month.year}-${String(month.month).padStart(2, "0")}` <= `${horizon.year}-${String(horizon.month).padStart(2, "0")}`; month = addMonths(month.year, month.month, 1)) {
      const end = dateWithClampedDay(month.year, month.month, setting.statementClosingDay);
      const payment = addMonths(month.year, month.month, setting.paymentDay < setting.statementClosingDay ? 1 : 0);
      const candidate = {
        cycleStartOn: nextDay(previousMonthDate(month.year, month.month, setting.statementClosingDay)),
        cycleEndOn: end,
        paymentOn: dateWithClampedDay(payment.year, payment.month, setting.paymentDay)
      };
      if (!hasCreditCardSettlement(settlementHistory, card.ownerUserId, card.id, end)) candidates.push(candidate);
    }
    let projectedPayments = toDecimal(0);
    const unpaid = candidates.flatMap((cycle) => {
      const outstanding = toDecimal(calculateUnpaidCardPurchases(card.id, input.movements, input.transfers, cycle.cycleEndOn, cycle.paymentOn > input.today ? cycle.paymentOn : input.today, card.openingBalance, card.openingBalanceDate, settlementHistory)).minus(projectedPayments);
      if (!outstanding.gt(0)) return [];
      projectedPayments = projectedPayments.plus(outstanding);
      return [{ ...cycle, amountDue: formatMoney(outstanding) }];
    });
    if (unpaid.length === 0) {
      const next = candidates.find((cycle) => cycle.paymentOn > input.today);
      if (next) unpaid.push({ ...next, amountDue: "0.00" });
    }
    return unpaid.map((cycle) => {
      const amountDue = cycle.amountDue;
      const end = parseDate(cycle.cycleEndOn);
      const next = addMonths(end.year, end.month, 1);
      const nextCycleAmount = calculateCreditCardCycleAmount(card.id, input.movements, nextDay(cycle.cycleEndOn), dateWithClampedDay(next.year, next.month, setting.statementClosingDay));
      const bankBalance = toDecimal(bankBalanceById.get(setting.settlementAccountId) ?? settlementAccount.openingBalance);
      const due = toDecimal(amountDue);
      const missing = due.minus(bankBalance);

      return {
        accountId: card.id,
        accountName: card.name,
        settlementAccountId: settlementAccount.id,
        settlementAccountName: settlementAccount.name,
        cycleStartOn: cycle.cycleStartOn,
        cycleEndOn: cycle.cycleEndOn,
        paymentOn: cycle.paymentOn,
        amountDue,
        nextCycleAmount,
        automaticSettlement: setting.automaticSettlement,
        insufficientFunds: missing.gt(0),
        missingAmount: formatMoney(missing.gt(0) ? missing : 0)
      };
    });
  });
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function previousMonthDate(year: number, month: number, day: number): string {
  const previous = addMonths(year, month, -1);
  return dateWithClampedDay(previous.year, previous.month, day);
}

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
