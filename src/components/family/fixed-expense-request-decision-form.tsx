"use client";

import { Check } from "lucide-react";
import { useFormState } from "react-dom";
import { FormMessage, PendingButton, SelectField } from "@/components/master-data/field-controls";
import { acceptFixedExpenseRequestAction } from "@/lib/fixed-expenses/actions";
import { accountOptionLabel } from "@/lib/accounts/labels";
import type { FormState } from "@/lib/auth/validation";
import type { Account, FixedExpenseRequest, Fund } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";

const initialState: FormState = { ok: false };

function categoryOptions(categoryTree: CategoryTreeItem[]) {
  return categoryTree.flatMap((macro) => macro.categories.map((category) => ({ value: category.id, label: `${macro.name} / ${category.name}` })));
}

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: accountOptionLabel(account) })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

export function FixedExpenseRequestDecisionForm({
  accounts,
  categoryTree,
  funds,
  request
}: Readonly<{
  accounts: Account[];
  categoryTree: CategoryTreeItem[];
  funds: Fund[];
  request: FixedExpenseRequest;
}>) {
  const [state, action] = useFormState(acceptFixedExpenseRequestAction, initialState);
  const categories = categoryOptions(categoryTree);
  const containers = containerOptions(accounts, funds);
  const needsLegacyCategory = !request.categoryId;

  if ((needsLegacyCategory && categories.length === 0) || containers.length === 0) {
    return <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm leading-6 text-zinc-600">Per accettare servono almeno una categoria e un conto o fondo personale.</p>;
  }

  return (
    <form action={action} className="space-y-3 rounded-md border border-border bg-white p-4 shadow-panel">
      <FormMessage state={state} />
      <input type="hidden" name="requestId" value={request.id} />
      {request.categoryId ? (
        <>
          <input type="hidden" name="categoryId" value="" />
          <p className="rounded-md border border-border bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
            Categoria: <span className="font-semibold">{request.categoryLabel ?? "Categoria proposta"}</span>
          </p>
        </>
      ) : (
        <SelectField label="Categoria personale" name="categoryId" defaultValue={categories[0]?.value} options={categories} errors={state.fieldErrors} />
      )}
      <SelectField label="Conto / Fondo personale" name="containerId" defaultValue={containers[0]?.value} options={containers} errors={state.fieldErrors} />
      <PendingButton>
        <Check aria-hidden className="h-4 w-4" />
        Accetta
      </PendingButton>
    </form>
  );
}
