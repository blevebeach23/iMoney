import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { calculateFundBalance } from "@/lib/calculations/balances";
import type { fundFormSchema } from "@/lib/master-data/validation";
import type { Fund, Movement, Transfer } from "@/types/domain";

type FundInput = z.infer<typeof fundFormSchema>;

export async function getFunds(supabase: SupabaseClient, userId: string): Promise<Fund[]> {
  const { data, error } = await supabase
    .from("funds")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFundRow);
}

export async function createFund(supabase: SupabaseClient, userId: string, input: FundInput) {
  const { error } = await supabase.from("funds").insert({
    owner_user_id: userId,
    name: input.name,
    type: input.type,
    opening_balance: input.openingBalance,
    opening_balance_date: input.openingBalanceDate,
    cached_balance: input.openingBalance,
    cached_at: new Date().toISOString(),
    target_amount: input.targetAmount,
    target_date: input.targetDate
  });

  if (error) {
    throw error;
  }
}

export async function updateFund(supabase: SupabaseClient, userId: string, input: Required<FundInput>) {
  const { error } = await supabase
    .from("funds")
    .update({
      name: input.name,
      type: input.type,
      opening_balance: input.openingBalance,
      opening_balance_date: input.openingBalanceDate,
      target_amount: input.targetAmount,
      target_date: input.targetDate
    })
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateFund(supabase: SupabaseClient, userId: string, fundId: string) {
  const { error } = await supabase
    .from("funds")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", fundId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export function getRebuiltFundBalance(fund: Fund, movements: Movement[], transfers: Transfer[], cutoffDate: string): string {
  return calculateFundBalance(fund, movements, transfers, cutoffDate);
}

function mapFundRow(row: Record<string, unknown>): Fund {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    type: row.type as Fund["type"],
    openingBalance: String(row.opening_balance),
    openingBalanceDate: String(row.opening_balance_date),
    cachedBalance: String(row.cached_balance),
    cachedAt: row.cached_at ? String(row.cached_at) : null,
    targetAmount: row.target_amount ? String(row.target_amount) : null,
    targetDate: row.target_date ? String(row.target_date) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}
