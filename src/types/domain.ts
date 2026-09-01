export type MoneyAmount = string;

export type MovementType = "income" | "expense" | "reimbursement";
export type MovementRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

export type AccountType = "cash" | "bank" | "credit_card" | "other";

export type FundType = "savings" | "holiday" | "emergency" | "deposit" | "custom";
export type HouseholdRole = "owner" | "admin" | "member";
export type HouseholdMemberStatus = "INVITED" | "ACTIVE" | "REMOVED";
export type HouseholdInviteStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export type FixedExpenseFrequency = "monthly" | "quarterly" | "yearly" | "custom";

export interface MacroCategory {
  id: string;
  ownerUserId: string | null;
  householdId: string | null;
  name: string;
  sortOrder: number;
  deletedAt: string | null;
}

export interface Category {
  id: string;
  macroCategoryId: string;
  name: string;
  sortOrder: number;
  deletedAt: string | null;
}

export interface Account {
  id: string;
  ownerUserId: string;
  name: string;
  type: AccountType;
  openingBalance: MoneyAmount;
  openingBalanceDate?: string;
  cachedBalance: MoneyAmount;
  cachedAt: string | null;
  deletedAt: string | null;
}

export interface Fund {
  id: string;
  ownerUserId: string;
  householdId: string | null;
  name: string;
  type: FundType;
  openingBalance: MoneyAmount;
  openingBalanceDate: string;
  cachedBalance: MoneyAmount;
  cachedAt: string | null;
  targetAmount: MoneyAmount | null;
  targetDate: string | null;
  isSharedWithHousehold: boolean;
  deletedAt: string | null;
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
  notes: string;
  isSharedWithHousehold: boolean;
  reimbursementForMovementId: string | null;
  importBatchId: string | null;
  fixedExpenseId?: string | null;
  deletedAt: string | null;
  createdBy: string | null;
  createdAt?: string | null;
  updatedBy: string | null;
}

export interface MovementRequest {
  id: string;
  householdId: string;
  createdByUserId: string;
  creatorName: string;
  recipientUserId: string;
  recipientName: string;
  description: string;
  movementType: MovementType;
  amount: MoneyAmount;
  categoryId: string | null;
  categoryLabel: string | null;
  movementDate: string;
  notes: string;
  sharedWithFamily: boolean;
  reimbursementForMovementId: string | null;
  status: MovementRequestStatus;
  acceptedMovementId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface FixedExpense {
  id: string;
  ownerUserId: string;
  householdId: string | null;
  accountId: string | null;
  fundId: string | null;
  categoryId: string;
  amount: MoneyAmount;
  description: string;
  frequency: FixedExpenseFrequency;
  startsOn: string;
  endsOn: string | null;
  dayOfMonth: number;
  activeMonths: number[];
  isSharedWithHousehold: boolean;
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
  createdAt?: string | null;
  deletedAt: string | null;
}

export type BudgetOwnerType = "USER" | "HOUSEHOLD";

export interface Budget {
  id: string;
  ownerType: BudgetOwnerType;
  ownerUserId: string | null;
  householdId: string | null;
  month: string;
  macroCategoryId: string | null;
  categoryId: string | null;
  amount: MoneyAmount;
  deletedAt: string | null;
}

export interface ImportBatch {
  id: string;
  ownerUserId: string;
  sourceFilename: string;
  importedRows: number;
  createdAt: string;
}

export interface Household {
  id: string;
  name: string;
  createdBy: string;
}

export interface HouseholdMember {
  householdId: string;
  userId: string;
  role: HouseholdRole;
  status: HouseholdMemberStatus;
  invitedBy: string | null;
  joinedAt: string | null;
  removedAt: string | null;
}

export interface HouseholdInvite {
  id: string;
  householdId: string;
  invitedBy: string;
  email: string;
  phone: string | null;
  token: string;
  status: HouseholdInviteStatus;
  expiresAt: string;
  acceptedBy: string | null;
}

export interface MonthlySummary {
  income: MoneyAmount;
  grossExpenses: MoneyAmount;
  reimbursements: MoneyAmount;
  netExpenses: MoneyAmount;
  economicBalance: MoneyAmount;
}
