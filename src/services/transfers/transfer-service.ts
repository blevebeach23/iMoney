import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transfer } from "@/types/domain";

type TransferRow = Record<string, unknown>;

export async function getTransfersUntil(supabase: SupabaseClient, userId: string, cutoffDate: string): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .lte("occurred_on", cutoffDate)
    .order("occurred_on", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTransferRow);
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
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}
