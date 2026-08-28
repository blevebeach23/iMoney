import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account } from "@/types/domain";

export async function getAccounts(supabase: SupabaseClient, userId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    type: row.type as Account["type"],
    openingBalance: String(row.opening_balance),
    cachedBalance: String(row.cached_balance),
    cachedAt: row.cached_at ? String(row.cached_at) : null
  }));
}
