export type MoneyAmount = string;

export type MovementType = "income" | "expense" | "reimbursement";

export type AccountType = "cash" | "bank" | "credit_card";

export type FundType = "savings" | "holiday" | "emergency" | "deposit" | "custom";

export interface MacroCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Category {
  id: string;
  macroCategoryId: string;
  name: string;
  sortOrder: number;
}

export interface Account {
  id: string;
  ownerUserId: string;
  name: string;
  type: AccountType;
  openingBalance: MoneyAmount;
  cachedBalance: MoneyAmount;
  cachedAt: string | null;
}

export interface Fund {
  id: string;
  ownerUserId: string;
  name: string;
  type: FundType;
  openingBalance: MoneyAmount;
  cachedBalance: MoneyAmount;
  cachedAt: string | null;
}

export interface Movement {
  id: string;
  ownerUserId: string;
  householdId: string | null;
  accountId: string | null;
  fundId: string | null;
  categoryId: string | null;
  type: MovementType;
  amount: MoneyAmount;
  occurredOn: string;
  description: string;
  isSharedWithHousehold: boolean;
  reimbursementForMovementId: string | null;
  importBatchId: string | null;
  deletedAt: string | null;
}

export interface Transfer {
  id: string;
  ownerUserId: string;
  householdId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromFundId: string | null;
  toFundId: string | null;
  amount: MoneyAmount;
  occurredOn: string;
  description: string;
  deletedAt: string | null;
}

export interface MonthlySummary {
  income: MoneyAmount;
  grossExpenses: MoneyAmount;
  reimbursements: MoneyAmount;
  netExpenses: MoneyAmount;
  economicBalance: MoneyAmount;
}
