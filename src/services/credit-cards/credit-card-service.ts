import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCreditCardForecasts,
  calculateCreditCardCycleAmount,
  calculateSettlementCycle,
  hasSettlementTransfer,
  type CreditCardForecast
} from "@/lib/calculations/credit-card-settlements";
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
  today: string;
  bankBalances: Array<{ id: string; balance: string }>;
}): CreditCardForecast[] {
  return buildCreditCardForecasts(input);
}

export function buildVirtualCreditCardSettlementTransfers(userId: string, forecasts: CreditCardForecast[], existingTransfers: Transfer[] = []): Transfer[] {
  return forecasts
    .filter(
      (forecast) =>
        forecast.automaticSettlement &&
        Number(forecast.amountDue) > 0 &&
        !hasSettlementTransfer(existingTransfers, forecast.accountId, forecast.cycleStartOn, forecast.cycleEndOn)
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
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  let created = 0;

  for (const setting of input.settings.filter((item) => item.automaticSettlement)) {
    const card = accountsById.get(setting.accountId);
    const settlementAccount = accountsById.get(setting.settlementAccountId);
    if (!card || card.type !== "credit_card" || !settlementAccount || settlementAccount.type !== "bank") {
      continue;
    }

    const cycle = calculateSettlementCycle(input.today, setting.statementClosingDay, setting.paymentDay);
    if (cycle.paymentOn > input.today || hasSettlementTransfer(input.transfers, card.id, cycle.cycleStartOn, cycle.cycleEndOn)) {
      continue;
    }

    const amount = calculateCreditCardCycleAmount(card.id, input.movements, cycle.cycleStartOn, cycle.cycleEndOn);
    if (Number(amount) <= 0) {
      continue;
    }

    const { error } = await supabase.from("transfers").insert({
      owner_user_id: userId,
      household_id: null,
      from_account_id: setting.settlementAccountId,
      to_account_id: setting.accountId,
      from_fund_id: null,
      to_fund_id: null,
      amount,
      occurred_on: cycle.paymentOn,
      description: `Addebito Carta ${card.name}`,
      credit_card_account_id: card.id,
      credit_card_cycle_start_on: cycle.cycleStartOn,
      credit_card_cycle_end_on: cycle.cycleEndOn
    });

    if (error) {
      if (String(error.code) === "23505") {
        continue;
      }
      throw error;
    }

    created += 1;
  }

  return created;
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
