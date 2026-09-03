import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAccountBalance, calculateCreditCardDue, calculateFundBalance } from "@/lib/calculations/balances";
import { getAccounts } from "@/services/accounts/account-service";
import { getFunds } from "@/services/funds/fund-service";
import { getMovementsUntil } from "@/services/movements/movement-service";
import { getTransfersUntil } from "@/services/transfers/transfer-service";
import type { Account, Fund } from "@/types/domain";

export async function rebuildBalanceCaches(supabase: SupabaseClient, userId: string, today = new Date().toISOString().slice(0, 10)): Promise<void> {
  const [accounts, funds, movements, transfers] = await Promise.all([
    getAccounts(supabase, userId),
    getFunds(supabase, userId),
    getMovementsUntil(supabase, userId, today),
    getTransfersUntil(supabase, userId, today)
  ]);
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...accounts.map((account) => updateAccountCache(supabase, userId, account, calculateAccountCache(account, movements, transfers, today), cachedAt)),
    ...funds.map((fund) => updateFundCache(supabase, userId, fund, calculateFundBalance(fund, movements, transfers, today), cachedAt))
  ]);
}

function calculateAccountCache(account: Account, movements: Parameters<typeof calculateAccountBalance>[1], transfers: Parameters<typeof calculateAccountBalance>[2], today: string): string {
  if (account.type === "credit_card") {
    return calculateCreditCardDue(account, movements, transfers, today);
  }

  return calculateAccountBalance(account, movements, transfers, today);
}

async function updateAccountCache(supabase: SupabaseClient, userId: string, account: Account, balance: string, cachedAt: string) {
  const { error } = await supabase
    .from("accounts")
    .update({ cached_balance: balance, cached_at: cachedAt })
    .eq("id", account.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

async function updateFundCache(supabase: SupabaseClient, userId: string, fund: Fund, balance: string, cachedAt: string) {
  const { error } = await supabase
    .from("funds")
    .update({ cached_balance: balance, cached_at: cachedAt })
    .eq("id", fund.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}
