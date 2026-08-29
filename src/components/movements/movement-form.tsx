"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, PendingButton, SelectField, TextField } from "@/components/master-data/field-controls";
import { saveMovementAction } from "@/lib/movements/actions";
import type { FormState } from "@/lib/auth/validation";
import type { Account, Fund } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { MovementListItem } from "@/services/movements/movement-service";

interface HouseholdOption {
  id: string;
  name: string;
  shareByDefault: boolean;
}

const initialState: FormState = { ok: false };

function categoryOptions(categoryTree: CategoryTreeItem[]) {
  return categoryTree.flatMap((macro) =>
    macro.categories.map((category) => ({
      value: category.id,
      label: `${macro.name} / ${category.name}`
    }))
  );
}

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: `Conto / ${account.name}` })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

export function MovementForm({
  accounts,
  categoryTree,
  funds,
  households,
  movement
}: Readonly<{
  accounts: Account[];
  categoryTree: CategoryTreeItem[];
  funds: Fund[];
  households: HouseholdOption[];
  movement?: MovementListItem;
}>) {
  const [state, action] = useFormState(saveMovementAction, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const categories = categoryOptions(categoryTree);
  const containers = containerOptions(accounts, funds);
  const defaultHousehold = households[0];
  const containerValue = movement?.accountId ? `account:${movement.accountId}` : movement?.fundId ? `fund:${movement.fundId}` : containers[0]?.value;

  if (categories.length === 0 || containers.length === 0) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-white p-4">
        <p className="font-semibold">Servono dati di base</p>
        <p className="text-sm leading-6 text-zinc-600">Prima di creare un movimento devi avere almeno un conto o fondo e una categoria attiva.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/accounts" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
            Conti
          </Link>
          <Link href="/settings/categories" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
            Categorie
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {movement?.id && <input type="hidden" name="id" value={movement.id} />}
      <input type="hidden" name="householdId" value={movement?.householdId ?? defaultHousehold?.id ?? ""} />

      <TextField label="Data" name="occurredOn" type="date" defaultValue={movement?.occurredOn ?? today} errors={state.fieldErrors} />
      <TextField label="Descrizione" name="description" defaultValue={movement?.description ?? ""} errors={state.fieldErrors} />
      <SelectField label="Categoria" name="categoryId" defaultValue={movement?.categoryId ?? categories[0]?.value} options={categories} errors={state.fieldErrors} />
      <SelectField
        label="Tipo"
        name="type"
        defaultValue={movement?.type === "reimbursement" ? "income" : movement?.type ?? "expense"}
        options={[
          { value: "expense", label: "Spesa" },
          { value: "income", label: "Entrata" }
        ]}
        errors={state.fieldErrors}
      />
      <TextField label="Importo" name="amount" defaultValue={movement?.amount ?? ""} inputMode="decimal" errors={state.fieldErrors} />
      <SelectField label="Conto / Fondo" name="containerId" defaultValue={containerValue} options={containers} errors={state.fieldErrors} />

      <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
        <input name="isReimbursement" type="checkbox" defaultChecked={movement?.type === "reimbursement"} className="h-5 w-5" />
        <span className="text-sm font-semibold">Rimborso</span>
      </label>

      <TextField
        label="ID movimento spesa rimborsato"
        name="reimbursementForMovementId"
        defaultValue={movement?.reimbursementForMovementId ?? ""}
        placeholder="Opzionale"
        errors={state.fieldErrors}
      />

      {households.length > 0 && (
        <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
          <input
            name="sharedWithFamily"
            type="checkbox"
            defaultChecked={movement?.isSharedWithHousehold ?? Boolean(defaultHousehold?.shareByDefault)}
            className="h-5 w-5"
          />
          <span className="text-sm font-semibold">Condividi con famiglia</span>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-semibold text-foreground">Note</span>
        <textarea
          name="notes"
          defaultValue={movement?.notes ?? ""}
          className="mt-2 min-h-28 w-full rounded-md border border-border bg-white px-3 py-3 text-base outline-none ring-primary/20 transition focus:border-primary focus:ring-4"
        />
      </label>

      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva movimento
      </PendingButton>
    </form>
  );
}
