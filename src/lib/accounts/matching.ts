import { accountDisplayName, accountKindLabel } from "@/lib/accounts/labels";
import { normalizeText } from "@/lib/imports/normalization";
import type { Account } from "@/types/domain";

const aliasesByType: Record<Account["type"], string[]> = {
  bank: ["cc", "conto corrente", "conto", "bank", "banca"],
  cash: ["cash", "contanti", "cassa"],
  credit_card: ["cdc", "carta", "carta credito", "carta di credito", "credit card", "card"],
  other: ["conto", "account"]
};

export interface AccountMatch {
  accountId: string | null;
  ambiguous: boolean;
}

export function matchAccountCsvValue(value: string, accounts: Account[], savedMappings: Record<string, string> = {}): AccountMatch {
  const normalized = normalizeAccountValue(value);
  if (!normalized) {
    return { accountId: null, ambiguous: false };
  }

  const saved = savedMappings[normalized];
  if (saved && accounts.some((account) => account.id === saved)) {
    return { accountId: saved, ambiguous: false };
  }

  const matches = accounts.filter((account) => accountSearchKeys(account).includes(normalized));
  const uniqueIds = [...new Set(matches.map((account) => account.id))];

  if (uniqueIds.length === 1) {
    return { accountId: uniqueIds[0] ?? null, ambiguous: false };
  }

  return { accountId: null, ambiguous: uniqueIds.length > 1 };
}

export function normalizeAccountValue(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

export function accountSearchKeys(account: Account): string[] {
  const base = new Set<string>([
    normalizeAccountValue(account.name),
    normalizeAccountValue(accountDisplayName(account)),
    normalizeAccountValue(`${accountKindLabel(account.type)} ${account.name}`)
  ]);

  for (const alias of aliasesByType[account.type]) {
    base.add(normalizeAccountValue(alias));
    if (account.type !== "cash") {
      base.add(normalizeAccountValue(`${alias} ${account.name}`));
    }
  }

  return [...base].filter(Boolean);
}
