import type { SupabaseClient } from "@supabase/supabase-js";
import type { Movement } from "@/types/domain";

export async function getMonthlyMovements(
  supabase: SupabaseClient,
  userId: string,
  monthStart: string,
  monthEnd: string
): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .gte("occurred_on", monthStart)
    .lte("occurred_on", monthEnd)
    .order("occurred_on", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMovementRow);
}

function mapMovementRow(row: Record<string, unknown>): Movement {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    householdId: row.household_id ? String(row.household_id) : null,
    accountId: row.account_id ? String(row.account_id) : null,
    fundId: row.fund_id ? String(row.fund_id) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    type: row.type as Movement["type"],
    amount: String(row.amount),
    occurredOn: String(row.occurred_on),
    description: String(row.description ?? ""),
    isSharedWithHousehold: Boolean(row.shared_with_family),
    reimbursementForMovementId: row.reimbursement_for_movement_id ? String(row.reimbursement_for_movement_id) : null,
    importBatchId: row.import_batch_id ? String(row.import_batch_id) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}
