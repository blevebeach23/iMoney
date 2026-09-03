import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransferFormInput } from "@/lib/transfers/validation";
import type { Transfer } from "@/types/domain";

type TransferRow = Record<string, unknown>;

export interface TransferListItem extends Transfer {
  fromName: string;
  toName: string;
}

export interface TransferFilters {
  period?: string;
  containerId?: string;
  shared?: "all" | "yes" | "no";
}

export interface ImportedTransferInput {
  occurredOn: string;
  description: string;
  amount: string;
  fromAccountId: string | null;
  fromFundId: string | null;
  toAccountId: string | null;
  toFundId: string | null;
  sharedWithFamily: boolean;
  householdId: string | null;
}

export async function getTransfersUntil(supabase: SupabaseClient, userId: string, cutoffDate: string): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .lte("occurred_on", cutoffDate)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTransferRow);
}

export async function getTransfers(supabase: SupabaseClient, userId: string, filters: TransferFilters = {}): Promise<TransferListItem[]> {
  let query = supabase
    .from("transfers")
    .select("*, from_account:accounts!transfers_from_account_id_fkey(name), to_account:accounts!transfers_to_account_id_fkey(name), from_fund:funds!transfers_from_fund_id_fkey(name), to_fund:funds!transfers_to_fund_id_fkey(name)")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.period) {
    const [year, month] = filters.period.split("-");
    if (year && month) {
      query = query.gte("occurred_on", `${year}-${month}-01`).lte("occurred_on", new Date(Number(year), Number(month), 0).toISOString().slice(0, 10));
    }
  }

  if (filters.containerId?.startsWith("account:")) {
    const accountId = filters.containerId.slice("account:".length);
    query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
  }

  if (filters.containerId?.startsWith("fund:")) {
    const fundId = filters.containerId.slice("fund:".length);
    query = query.or(`from_fund_id.eq.${fundId},to_fund_id.eq.${fundId}`);
  }

  if (filters.shared === "yes") {
    query = query.eq("shared_with_family", true);
  } else if (filters.shared === "no") {
    query = query.eq("shared_with_family", false);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTransferListRow);
}

export async function getTransferById(supabase: SupabaseClient, userId: string, transferId: string): Promise<TransferListItem | null> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*, from_account:accounts!transfers_from_account_id_fkey(name), to_account:accounts!transfers_to_account_id_fkey(name), from_fund:funds!transfers_from_fund_id_fkey(name), to_fund:funds!transfers_to_fund_id_fkey(name)")
    .eq("id", transferId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapTransferListRow(data) : null;
}

export async function getSharedHouseholdTransfers(
  supabase: SupabaseClient,
  householdId: string,
  monthStart?: string,
  monthEnd?: string
): Promise<TransferListItem[]> {
  let query = supabase
    .from("transfers")
    .select("*, from_account:accounts!transfers_from_account_id_fkey(name), to_account:accounts!transfers_to_account_id_fkey(name), from_fund:funds!transfers_from_fund_id_fkey(name), to_fund:funds!transfers_to_fund_id_fkey(name)")
    .eq("household_id", householdId)
    .eq("shared_with_family", true)
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (monthStart && monthEnd) {
    query = query.gte("occurred_on", monthStart).lte("occurred_on", monthEnd);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTransferListRow);
}

export async function getSharedHouseholdTransferById(supabase: SupabaseClient, transferId: string): Promise<TransferListItem | null> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*, from_account:accounts!transfers_from_account_id_fkey(name), to_account:accounts!transfers_to_account_id_fkey(name), from_fund:funds!transfers_from_fund_id_fkey(name), to_fund:funds!transfers_to_fund_id_fkey(name)")
    .eq("id", transferId)
    .eq("shared_with_family", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapTransferListRow(data) : null;
}

export async function createTransfer(supabase: SupabaseClient, userId: string, input: TransferFormInput) {
  const { data, error } = await supabase.from("transfers").insert(toTransferPayload(userId, input)).select("id").single();

  if (error) {
    throw error;
  }

  return String(data.id);
}

export async function createTransferBatch(supabase: SupabaseClient, userId: string, inputs: TransferFormInput[]) {
  if (inputs.length === 0) {
    return [];
  }

  const { data, error } = await supabase.from("transfers").insert(inputs.map((input) => toTransferPayload(userId, input))).select("id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: TransferRow) => String(row.id));
}

export async function createImportedTransferBatch(supabase: SupabaseClient, userId: string, batchId: string, inputs: ImportedTransferInput[]) {
  if (inputs.length === 0) {
    return [];
  }

  const { data, error } = await supabase.from("transfers").insert(buildImportedTransferPayloads(userId, batchId, inputs)).select("id");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: TransferRow) => String(row.id));
}

export async function updateTransfer(supabase: SupabaseClient, userId: string, input: TransferFormInput & { id: string }) {
  const existing = await getTransferById(supabase, userId, input.id);
  if (existing?.recurringTransferId) {
    throw new Error("Le occorrenze ricorrenti si modificano dalla ricorrenza madre");
  }

  const { error } = await supabase
    .from("transfers")
    .update(toTransferPayload(userId, input))
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function softDeleteTransfer(supabase: SupabaseClient, userId: string, transferId: string) {
  const existing = await getTransferById(supabase, userId, transferId);
  if (existing?.recurringTransferId) {
    throw new Error("Le occorrenze ricorrenti si eliminano dalla ricorrenza madre");
  }

  const { error } = await supabase
    .from("transfers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function softDeleteTransferBatch(supabase: SupabaseClient, userId: string, transferIds: string[]) {
  if (transferIds.length === 0) {
    return;
  }

  const { data: recurringRows, error: recurringError } = await supabase
    .from("transfers")
    .select("id")
    .in("id", transferIds)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .not("recurring_transfer_id", "is", null);

  if (recurringError) {
    throw recurringError;
  }

  if ((recurringRows ?? []).length > 0) {
    throw new Error("La selezione contiene occorrenze ricorrenti: apri la ricorrenza madre");
  }

  const { error } = await supabase
    .from("transfers")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", transferIds)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

function toTransferPayload(userId: string, input: TransferFormInput) {
  return {
    owner_user_id: userId,
    household_id: input.sharedWithFamily ? input.householdId : null,
    shared_with_family: input.sharedWithFamily,
    from_account_id: input.fromAccountId,
    to_account_id: input.toAccountId,
    from_fund_id: input.fromFundId,
    to_fund_id: input.toFundId,
    amount: input.amount,
    occurred_on: input.occurredOn,
    description: input.description
  };
}

export function buildImportedTransferPayloads(userId: string, batchId: string, rows: ImportedTransferInput[]) {
  return rows.map((row) => ({
    owner_user_id: userId,
    household_id: row.sharedWithFamily ? row.householdId : null,
    shared_with_family: row.sharedWithFamily,
    from_account_id: row.fromAccountId,
    to_account_id: row.toAccountId,
    from_fund_id: row.fromFundId,
    to_fund_id: row.toFundId,
    amount: row.amount,
    occurred_on: row.occurredOn,
    description: row.description,
    import_batch_id: batchId
  }));
}

function mapTransferListRow(row: TransferRow): TransferListItem {
  const fromAccount = asRecord(row.from_account);
  const toAccount = asRecord(row.to_account);
  const fromFund = asRecord(row.from_fund);
  const toFund = asRecord(row.to_fund);

  return {
    ...mapTransferRow(row),
    fromName: String(fromAccount?.name ?? fromFund?.name ?? "Origine"),
    toName: String(toAccount?.name ?? toFund?.name ?? "Destinazione")
  };
}

function mapTransferRow(row: TransferRow): Transfer {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    householdId: row.household_id ? String(row.household_id) : null,
    fromAccountId: row.from_account_id ? String(row.from_account_id) : null,
    toAccountId: row.to_account_id ? String(row.to_account_id) : null,
    fromFundId: row.from_fund_id ? String(row.from_fund_id) : null,
    toFundId: row.to_fund_id ? String(row.to_fund_id) : null,
    amount: String(row.amount),
    occurredOn: String(row.occurred_on),
    description: String(row.description ?? ""),
    isSharedWithHousehold: Boolean(row.shared_with_family),
    createdAt: row.created_at ? String(row.created_at) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    creditCardAccountId: row.credit_card_account_id ? String(row.credit_card_account_id) : null,
    creditCardCycleStartOn: row.credit_card_cycle_start_on ? String(row.credit_card_cycle_start_on) : null,
    creditCardCycleEndOn: row.credit_card_cycle_end_on ? String(row.credit_card_cycle_end_on) : null,
    importBatchId: row.import_batch_id ? String(row.import_batch_id) : null,
    recurringTransferId: row.recurring_transfer_id ? String(row.recurring_transfer_id) : null
  };
}

function asRecord(value: unknown): TransferRow | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as TransferRow;
  }

  return null;
}
