import type { SupabaseClient } from "@supabase/supabase-js";

/** Database transaction: catch up occurrences, settle due card cycles, rebuild caches. */
export async function synchronizeFinancialAutomation(supabase: SupabaseClient, ownerUserId: string): Promise<number> {
  const { data, error } = await supabase.rpc("sync_financial_automation", { p_owner: ownerUserId });
  if (error) throw error;
  return Number(data ?? 0);
}
