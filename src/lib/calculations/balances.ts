import type { Account, Fund, Movement, Transfer } from "@/types/domain";
import { formatMoney, toDecimal } from "./money";

export interface BalanceSnapshot {
  id: string;
  name: string;
  balance: string;
}

export interface CreditCardDue {
  accountId: string;
  name: string;
  due: string;
}

export interface FinancialBalances {
  cash: BalanceSnapshot[];
  bank: BalanceSnapshot[];
  funds: BalanceSnapshot[];
  creditCardsDue: CreditCardDue[];
  forecastMonthEnd: BalanceSnapshot[];
}

export function calculateFinancialBalances(
  accounts: Account[],
  funds: Fund[],
  movements: Movement[],
  transfers: Transfer[],
  today: string,
  monthEnd: string
): FinancialBalances {
  const activeMovements = movements.filter((movement) => movement.deletedAt === null);
  const activeTransfers = transfers.filter((transfer) => transfer.deletedAt === null);

  return {
    cash: accounts
      .filter((account) => account.type === "cash")
      .map((account) => accountBalance(account, activeMovements, activeTransfers, today)),
    bank: accounts
      .filter((account) => account.type === "bank" || account.type === "other")
      .map((account) => accountBalance(account, activeMovements, activeTransfers, today)),
    funds: funds.map((fund) => fundBalance(fund, activeMovements, activeTransfers, today)),
    creditCardsDue: accounts
      .filter((account) => account.type === "credit_card")
      .map((account) => creditCardDue(account, activeMovements, activeTransfers, today)),
    forecastMonthEnd: accounts
      .filter((account) => account.type !== "credit_card")
      .map((account) => accountBalance(account, activeMovements, activeTransfers, monthEnd))
  };
}

export function calculateAccountBalance(account: Account, movements: Movement[], transfers: Transfer[], cutoffDate: string): string {
  return accountBalance(account, movements, transfers, cutoffDate).balance;
}

export function calculateFundBalance(fund: Fund, movements: Movement[], transfers: Transfer[], cutoffDate: string): string {
  return fundBalance(fund, movements, transfers, cutoffDate).balance;
}

export function calculateCreditCardDue(account: Account, movements: Movement[], transfers: Transfer[], cutoffDate: string): string {
  return creditCardDue(account, movements, transfers, cutoffDate).due;
}

function accountBalance(account: Account, movements: Movement[], transfers: Transfer[], cutoffDate: string): BalanceSnapshot {
  const balance = movements
    .filter((movement) => movement.accountId === account.id && movement.occurredOn <= cutoffDate)
    .reduce((total, movement) => total.plus(accountMovementEffect(account, movement)), toDecimal(account.openingBalance));

  const withTransfers = transfers
    .filter((transfer) => transfer.occurredOn <= cutoffDate)
    .reduce((total, transfer) => total.plus(accountTransferEffect(account.id, transfer)), balance);

  return {
    id: account.id,
    name: account.name,
    balance: formatMoney(withTransfers)
  };
}

function fundBalance(fund: Fund, movements: Movement[], transfers: Transfer[], cutoffDate: string): BalanceSnapshot {
  const balance = movements
    .filter((movement) => movement.fundId === fund.id && movement.occurredOn <= cutoffDate)
    .reduce((total, movement) => total.plus(financialMovementEffect(movement)), toDecimal(fund.openingBalance));

  const withTransfers = transfers
    .filter((transfer) => transfer.occurredOn <= cutoffDate)
    .reduce((total, transfer) => total.plus(fundTransferEffect(fund.id, transfer)), balance);

  return {
    id: fund.id,
    name: fund.name,
    balance: formatMoney(withTransfers)
  };
}

function creditCardDue(account: Account, movements: Movement[], transfers: Transfer[], cutoffDate: string): CreditCardDue {
  const due = movements
    .filter((movement) => movement.accountId === account.id && movement.occurredOn <= cutoffDate)
    .reduce((total, movement) => total.plus(creditCardMovementEffect(movement)), toDecimal(account.openingBalance));

  const withSettlements = transfers
    .filter((transfer) => transfer.occurredOn <= cutoffDate)
    .reduce((total, transfer) => total.plus(creditCardTransferEffect(account.id, transfer)), due);

  return {
    accountId: account.id,
    name: account.name,
    due: formatMoney(withSettlements)
  };
}

function accountMovementEffect(account: Account, movement: Movement) {
  if (account.type === "credit_card") {
    return creditCardMovementEffect(movement);
  }

  return financialMovementEffect(movement);
}

function financialMovementEffect(movement: Movement) {
  if (movement.type === "expense") {
    return toDecimal(movement.amount).negated();
  }

  return toDecimal(movement.amount);
}

function creditCardMovementEffect(movement: Movement) {
  if (movement.type === "expense") {
    return toDecimal(movement.amount);
  }

  return toDecimal(movement.amount).negated();
}

function accountTransferEffect(accountId: string, transfer: Transfer) {
  if (transfer.fromAccountId === accountId) {
    return toDecimal(transfer.amount).negated();
  }

  if (transfer.toAccountId === accountId) {
    return toDecimal(transfer.amount);
  }

  return toDecimal(0);
}

function fundTransferEffect(fundId: string, transfer: Transfer) {
  if (transfer.fromFundId === fundId) {
    return toDecimal(transfer.amount).negated();
  }

  if (transfer.toFundId === fundId) {
    return toDecimal(transfer.amount);
  }

  return toDecimal(0);
}

function creditCardTransferEffect(accountId: string, transfer: Transfer) {
  if (transfer.toAccountId === accountId) {
    return toDecimal(transfer.amount).negated();
  }

  if (transfer.fromAccountId === accountId) {
    return toDecimal(transfer.amount);
  }

  return toDecimal(0);
}
