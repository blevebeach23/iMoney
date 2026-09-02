import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringTransferFormInput } from "@/lib/recurring-transfers/validation";
import type { RecurringTransfer } from "@/types/domain";

type Row = Record<string, unknown>;

export interface RecurringTransferListItem extends RecurringTransfer {
  fromName: string;
  toName: string;
}

interface RecurringTransferOccurrence {
  occurredOn: string;
}

export async function getRecurringTransfers(supabase: SupabaseClient, userId: string): Promise<RecurringTransferListItem[]> {
  const { data, error } = await supabase
    .from("recurring_transfers")
    .select("*, from_account:accounts!recurring_transfers_from_account_id_fkey(name), to_account:accounts!recurring_transfers_to_account_id_fkey(name), from_fund:funds!recurring_transfers_from_fund_id_fkey(name), to_fund:funds!recurring_transfers_to_fund_id_fkey(name)")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("description", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRecurringTransferListRow);
}

export async function getRecurringTransferById(supabase: SupabaseClient, userId: string, recurringTransferId: string): Promise<RecurringTransferListItem | null> {
  const { data, error } = await supabase
    .from("recurring_transfers")
    .select("*, from_account:accounts!recurring_transfers_from_account_id_fkey(name), to_account:accounts!recurring_transfers_to_account_id_fkey(name), from_fund:funds!recurring_transfers_from_fund_id_fkey(name), to_fund:funds!recurring_transfers_to_fund_id_fkey(name)")
    .eq("id", recurringTransferId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRecurringTransferListRow(data) : null;
}

export async function createRecurringTransfer(supabase: SupabaseClient, userId: string, input: RecurringTransferFormInput): Promise<string> {
  const { data, error } = await supabase.from("recurring_transfers").insert(toRecurringTransferPayload(userId, input)).select("id").single();

  if (error) {
    throw error;
  }

  return String(data.id);
}

export async function updateRecurringTransfer(supabase: SupabaseClient, userId: string, input: RecurringTransferFormInput & { id: string }) {
  const { error } = await supabase
    .from("recurring_transfers")
    .update(toRecurringTransferPayload(userId, input))
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateRecurringTransfer(supabase: SupabaseClient, userId: string, recurringTransferId: string) {
  const { error } = await supabase
    .from("recurring_transfers")
    .update({ is_active: false })
    .eq("id", recurringTransferId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deleteRecurringTransfer(supabase: SupabaseClient, userId: string, recurringTransferId: string) {
  const { error } = await supabase
    .from("recurring_transfers")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", recurringTransferId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function generateRecurringTransfers(
  supabase: SupabaseClient,
  userId: string,
  recurringTransferId: string,
  fromMonthStart: string,
  toMonthStart: string
): Promise<number> {
  const rule = await getRecurringTransferById(supabase, userId, recurringTransferId);

  if (!rule || !rule.isActive) {
    return 0;
  }

  const occurrences = buildRecurringTransferOccurrences(rule, fromMonthStart, toMonthStart);
  if (occurrences.length === 0) {
    return 0;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("transfers")
    .select("recurring_transfer_id, occurred_on")
    .eq("recurring_transfer_id", recurringTransferId)
    .is("deleted_at", null);

  if (existingError) {
    throw existingError;
  }

  const existing = new Set((existingRows ?? []).map((row: Row) => `${row.recurring_transfer_id}:${row.occurred_on}`));
  const pending = occurrences.filter((occurrence) => !existing.has(`${recurringTransferId}:${occurrence.occurredOn}`));

  if (pending.length === 0) {
    return 0;
  }

  const { error: insertError } = await supabase.from("transfers").insert(
    pending.map((occurrence) => ({
      owner_user_id: userId,
      household_id: rule.isSharedWithHousehold ? rule.householdId : null,
      shared_with_family: rule.isSharedWithHousehold,
      from_account_id: rule.fromAccountId,
      to_account_id: rule.toAccountId,
      from_fund_id: rule.fromFundId,
      to_fund_id: rule.toFundId,
      amount: rule.amount,
      occurred_on: occurrence.occurredOn,
      description: rule.description,
      recurring_transfer_id: rule.id
    }))
  );

  if (insertError) {
    if (String(insertError.code) === "23505") {
      return 0;
    }
    throw insertError;
  }

  return pending.length;
}

export function buildRecurringTransferOccurrences(
  rule: Pick<RecurringTransfer, "dayOfMonth" | "endsOn" | "frequency" | "startsOn">,
  fromMonthStart: string,
  toMonthStart: string
): RecurringTransferOccurrence[] {
  const from = new Date(`${fromMonthStart}T00:00:00`);
  const to = new Date(`${toMonthStart}T00:00:00`);
  const start = new Date(`${rule.startsOn}T00:00:00`);
  const occurrences: RecurringTransferOccurrence[] = [];

  for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= to; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const monthsSinceStart = (cursor.getFullYear() - start.getFullYear()) * 12 + cursor.getMonth() - start.getMonth();
    if (monthsSinceStart < 0 || !frequencyMatches(rule.frequency, monthsSinceStart)) {
      continue;
    }

    const occurredOn = occurrenceDateForMonth(cursor.getFullYear(), cursor.getMonth() + 1, rule.dayOfMonth);
    if (occurredOn >= rule.startsOn && (!rule.endsOn || occurredOn <= rule.endsOn)) {
      occurrences.push({ occurredOn });
    }
  }

  return occurrences;
}

export function toRecurringTransferPayload(userId: string, input: RecurringTransferFormInput) {
  return {
    owner_user_id: userId,
    household_id: input.sharedWithFamily ? input.householdId : null,
    shared_with_family: input.sharedWithFamily,
    from_account_id: input.fromAccountId,
    to_account_id: input.toAccountId,
    from_fund_id: input.fromFundId,
    to_fund_id: input.toFundId,
    amount: input.amount,
    description: input.description,
    frequency: input.frequency,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    day_of_month: input.dayOfMonth,
    is_active: input.isActive
  };
}

function frequencyMatches(frequency: RecurringTransfer["frequency"], monthsSinceStart: number) {
  if (frequency === "yearly") {
    return monthsSinceStart % 12 === 0;
  }

  if (frequency === "quarterly") {
    return monthsSinceStart % 3 === 0;
  }

  return true;
}

function occurrenceDateForMonth(year: number, month: number, dayOfMonth: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dayOfMonth, lastDay);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mapRecurringTransferListRow(row: Row): RecurringTransferListItem {
  const fromAccount = asRecord(row.from_account);
  const toAccount = asRecord(row.to_account);
  const fromFund = asRecord(row.from_fund);
  const toFund = asRecord(row.to_fund);

  return {
    ...mapRecurringTransferRow(row),
    fromName: String(fromAccount?.name ?? fromFund?.name ?? "Origine"),
    toName: String(toAccount?.name ?? toFund?.name ?? "Destinazione")
  };
}

function mapRecurringTransferRow(row: Row): RecurringTransfer {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    householdId: row.household_id ? String(row.household_id) : null,
    fromAccountId: row.from_account_id ? String(row.from_account_id) : null,
    toAccountId: row.to_account_id ? String(row.to_account_id) : null,
    fromFundId: row.from_fund_id ? String(row.from_fund_id) : null,
    toFundId: row.to_fund_id ? String(row.to_fund_id) : null,
    amount: String(row.amount),
    description: String(row.description ?? ""),
    frequency: row.frequency as RecurringTransfer["frequency"],
    startsOn: String(row.starts_on),
    endsOn: row.ends_on ? String(row.ends_on) : null,
    dayOfMonth: Number(row.day_of_month ?? 1),
    isActive: Boolean(row.is_active),
    isSharedWithHousehold: Boolean(row.shared_with_family),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}

function asRecord(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }

  return null;
}
