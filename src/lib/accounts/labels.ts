import type { Account } from "@/types/domain";

export function accountKindLabel(type: Account["type"]): string {
  if (type === "cash") {
    return "Contanti";
  }

  if (type === "credit_card") {
    return "Carta di credito";
  }

  return "Conto";
}

export function accountDisplayName(account: Pick<Account, "name" | "type">): string {
  if (account.type === "cash") {
    return "Contanti";
  }

  return `${accountKindLabel(account.type)} ${account.name}`;
}

export function accountOptionLabel(account: Pick<Account, "name" | "type">): string {
  return accountDisplayName(account);
}
