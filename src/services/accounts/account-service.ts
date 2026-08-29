import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAccountBalance, calculateCreditCardDue } from "@/lib/calculations/balances";
import type { Account } from "@/types/domain";
import type { Movement, Transfer } from "@/types/domain";
import type { z } from "zod";
import type { accountFormSchema } from "@/lib/master-data/validation";

type AccountInput = z.infer<typeof accountFormSchema>;

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

  return (data ?? []).map(mapAccountRow);
}

export async function createAccount(supabase: SupabaseClient, userId: string, input: AccountInput) {
  const { error } = await supabase.from("accounts").insert({
    owner_user_id: userId,
    name: input.name,
    type: input.type,
    opening_balance: input.openingBalance,
    opening_balance_date: input.openingBalanceDate,
    cached_balance: input.openingBalance,
    cached_at: new Date().toISOString()
  });

  if (error) {
    throw error;
  }
}

export async function updateAccount(supabase: SupabaseClient, userId: string, input: Required<AccountInput>) {
  const { error } = await supabase
    .from("accounts")
    .update({
      name: input.name,
      type: input.type,
      opening_balance: input.openingBalance,
      opening_balance_date: input.openingBalanceDate
    })
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  const { error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export function getRebuiltAccountBalance(account: Account, movements: Movement[], transfers: Transfer[], cutoffDate: string): string {
  if (account.type === "credit_card") {
    return calculateCreditCardDue(account, movements, transfers, cutoffDate);
  }

  return calculateAccountBalance(account, movements, transfers, cutoffDate);
}

function mapAccountRow(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    type: row.type as Account["type"],
    openingBalance: String(row.opening_balance),
    openingBalanceDate: row.opening_balance_date ? String(row.opening_balance_date) : undefined,
    cachedBalance: String(row.cached_balance),
    cachedAt: row.cached_at ? String(row.cached_at) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}
