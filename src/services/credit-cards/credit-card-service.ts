import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCreditCardForecasts,
  hasCreditCardSettlement,
  type CreditCardSettlementHistoryEntry,
  type CreditCardSettlementIdentity,
  type CreditCardForecast
} from "@/lib/calculations/credit-card-settlements";
import { synchronizeFinancialAutomation } from "@/services/automation/financial-automation-service";
import { toDecimal } from "@/lib/calculations/money";
import type { Account, CreditCardSettings, Movement, Transfer } from "@/types/domain";

type Row = Record<string, unknown>;

export interface CreditCardSettingsInput {
  accountId: string;
  settlementAccountId: string;
  statementClosingDay: number;
  paymentDay: number;
  automaticSettlement: boolean;
}

export async function getCreditCardSettingsForUser(supabase: SupabaseClient, userId: string): Promise<CreditCardSettings[]> {
  void userId;
  const { data, error } = await supabase
    .from("credit_card_settings")
    .select("*");

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapCreditCardSettingsRow);
}

/** Settlement metadata only; ordinary transfer queries still exclude deleted rows.
 * No date cutoff: cycle identity survives deletion and selecting a historical month.
 */
export async function getCreditCardSettlementHistoryForUser(supabase: SupabaseClient, userId: string): Promise<CreditCardSettlementHistoryEntry[]> {
  const history: CreditCardSettlementHistoryEntry[] = [];
  const pageSize = 500;
  let after: string | undefined;
  while (true) {
    let query = supabase.from("transfers")
      .select("id, owner_user_id, credit_card_account_id, credit_card_cycle_end_on, amount, occurred_on, deleted_at")
      .eq("owner_user_id", userId)
      .not("credit_card_account_id", "is", null)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw error;
    history.push(...(data ?? []).map((row: Row) => ({
      ownerUserId: String(row.owner_user_id),
      creditCardAccountId: String(row.credit_card_account_id),
      creditCardCycleEndOn: String(row.credit_card_cycle_end_on),
      amount: String(row.amount),
      occurredOn: String(row.occurred_on),
      deletedAt: row.deleted_at ? String(row.deleted_at) : null
    })));
    if (!data || data.length < pageSize) return history;
    after = String(data[data.length - 1].id);
  }
}

export async function saveCreditCardSettings(supabase: SupabaseClient, userId: string, input: CreditCardSettingsInput): Promise<void> {
  await assertCreditCardSettingsAccess(supabase, userId, input);

  const { error } = await supabase.from("credit_card_settings").upsert(
    {
      account_id: input.accountId,
      settlement_account_id: input.settlementAccountId,
      statement_closing_day: input.statementClosingDay,
      payment_day: input.paymentDay,
      automatic_settlement: input.automaticSettlement
    },
    { onConflict: "account_id" }
  );

  if (error) {
    throw error;
  }
}

export async function deleteCreditCardSettings(supabase: SupabaseClient, userId: string, accountId: string): Promise<void> {
  const ownedCreditCardAccountIds = await getOwnedCreditCardAccountIds(supabase, userId);
  if (!ownedCreditCardAccountIds.includes(accountId)) {
    return;
  }

  const { error } = await supabase
    .from("credit_card_settings")
    .delete()
    .eq("account_id", accountId)
    .in("account_id", ownedCreditCardAccountIds);

  if (error) {
    throw error;
  }
}

export function getCreditCardForecasts(input: {
  accounts: Account[];
  settings: CreditCardSettings[];
  movements: Movement[];
  transfers: Transfer[];
  settlementHistory: readonly CreditCardSettlementHistoryEntry[];
  today: string;
  bankBalances: Array<{ id: string; balance: string }>;
}): CreditCardForecast[] {
  return buildCreditCardForecasts(input);
}

export function buildVirtualCreditCardSettlementTransfers(userId: string, forecasts: CreditCardForecast[], settlementHistory: readonly CreditCardSettlementIdentity[] = []): Transfer[] {
  return forecasts
    .filter(
      (forecast) =>
        forecast.automaticSettlement &&
        toDecimal(forecast.amountDue).gt(0) &&
        !hasCreditCardSettlement(settlementHistory, userId, forecast.accountId, forecast.cycleEndOn)
    )
    .map((forecast) => ({
      id: `credit-card-settlement:${forecast.accountId}:${forecast.cycleStartOn}:${forecast.cycleEndOn}`,
      ownerUserId: userId,
      householdId: null,
      fromAccountId: forecast.settlementAccountId,
      toAccountId: forecast.accountId,
      fromFundId: null,
      toFundId: null,
      amount: forecast.amountDue,
      occurredOn: forecast.paymentOn,
      description: `Addebito Carta ${forecast.accountName}`,
      isSharedWithHousehold: false,
      createdAt: null,
      deletedAt: null,
      creditCardAccountId: forecast.accountId,
      creditCardCycleStartOn: forecast.cycleStartOn,
      creditCardCycleEndOn: forecast.cycleEndOn
    }));
}

export async function generateDueCreditCardSettlements(supabase: SupabaseClient, userId: string, input: {
  accounts: Account[];
  settings: CreditCardSettings[];
  movements: Movement[];
  transfers: Transfer[];
  today: string;
}): Promise<number> {
  void input; // The database reads a consistent, complete history rather than page-filtered arrays.
  return synchronizeFinancialAutomation(supabase, userId);
}

async function assertCreditCardSettingsAccess(supabase: SupabaseClient, userId: string, input: CreditCardSettingsInput): Promise<void> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, type, owner_user_id")
    .in("id", [input.accountId, input.settlementAccountId])
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const accountsById = new Map((data ?? []).map((row: Row) => [String(row.id), row]));
  if (accountsById.get(input.accountId)?.type !== "credit_card") {
    throw new Error("La carta di credito non è valida");
  }

  if (accountsById.get(input.settlementAccountId)?.type !== "bank") {
    throw new Error("Il conto di addebito deve essere un conto corrente");
  }
}

async function getOwnedCreditCardAccountIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("type", "credit_card")
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: Row) => String(row.id));
}

function mapCreditCardSettingsRow(row: Row): CreditCardSettings {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    settlementAccountId: String(row.settlement_account_id),
    statementClosingDay: Number(row.statement_closing_day),
    paymentDay: Number(row.payment_day),
    automaticSettlement: Boolean(row.automatic_settlement),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}
