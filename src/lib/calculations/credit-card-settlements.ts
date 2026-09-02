import type { Account, CreditCardSettings, Movement, Transfer } from "@/types/domain";
import { formatMoney, toDecimal } from "./money";

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
  const cycleEnd = today <= currentClosing ? previousMonthDate(current.year, current.month, statementClosingDay) : currentClosing;
  const cycleEndParts = parseDate(cycleEnd);
  const paymentBase = addMonths(cycleEndParts.year, cycleEndParts.month, paymentDay < statementClosingDay ? 1 : 0);

  return {
    cycleStartOn: `${cycleEndParts.year}-${String(cycleEndParts.month).padStart(2, "0")}-01`,
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

export function hasSettlementTransfer(transfers: Transfer[], accountId: string, cycleStartOn: string, cycleEndOn: string): boolean {
  return transfers.some(
    (transfer) =>
      transfer.deletedAt === null &&
      transfer.creditCardAccountId === accountId &&
      transfer.creditCardCycleStartOn === cycleStartOn &&
      transfer.creditCardCycleEndOn === cycleEndOn
  );
}

export function buildCreditCardForecasts(input: {
  accounts: Account[];
  settings: CreditCardSettings[];
  movements: Movement[];
  transfers: Transfer[];
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

    const cycle = calculateSettlementCycle(input.today, setting.statementClosingDay, setting.paymentDay);
    const amountDue = calculateCreditCardCycleAmount(setting.accountId, input.movements, cycle.cycleStartOn, cycle.cycleEndOn);
    const cycleEnd = parseDate(cycle.cycleEndOn);
    const nextCycleStart = nextDay(cycle.cycleEndOn);
    const nextCycleEnd = dateWithClampedDay(addMonths(cycleEnd.year, cycleEnd.month, 1).year, addMonths(cycleEnd.year, cycleEnd.month, 1).month, setting.statementClosingDay);
    const nextCycleAmount = calculateCreditCardCycleAmount(setting.accountId, input.movements, nextCycleStart, nextCycleEnd);
    const bankBalance = toDecimal(bankBalanceById.get(setting.settlementAccountId) ?? settlementAccount.openingBalance);
    const due = toDecimal(amountDue);
    const missing = due.minus(bankBalance);

    return [{
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
      insufficientFunds: missing.isPositive(),
      missingAmount: formatMoney(missing.isPositive() ? missing : 0)
    }];
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
