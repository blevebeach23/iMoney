"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import { FormMessage, PendingButton, SelectField, TextField } from "@/components/master-data/field-controls";
import type { FormState } from "@/lib/auth/validation";
import { saveFixedExpenseAction } from "@/lib/fixed-expenses/actions";
import type { ActiveHouseholdOption } from "@/services/households/household-service";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { FixedExpenseListItem } from "@/services/fixed-expenses/fixed-expense-service";
import type { FixedExpenseRequestRecipientOption } from "@/services/fixed-expenses/fixed-expense-request-service";
import type { Account, Fund } from "@/types/domain";

const initialState: FormState = { ok: false };
const months = [
  ["1", "Gen"],
  ["2", "Feb"],
  ["3", "Mar"],
  ["4", "Apr"],
  ["5", "Mag"],
  ["6", "Giu"],
  ["7", "Lug"],
  ["8", "Ago"],
  ["9", "Set"],
  ["10", "Ott"],
  ["11", "Nov"],
  ["12", "Dic"]
];

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

export function FixedExpenseForm({
  accounts,
  categoryTree,
  fixedExpense,
  funds,
  households,
  requestRecipients = []
}: Readonly<{
  accounts: Account[];
  categoryTree: CategoryTreeItem[];
  fixedExpense?: FixedExpenseListItem;
  funds: Fund[];
  households: ActiveHouseholdOption[];
  requestRecipients?: FixedExpenseRequestRecipientOption[];
}>) {
  const [state, action] = useFormState(saveFixedExpenseAction, initialState);
  const [requestedForUserId, setRequestedForUserId] = useState("self");
  const categories = categoryOptions(categoryTree);
  const containers = containerOptions(accounts, funds);
  const today = new Date().toISOString().slice(0, 10);
  const defaultHousehold = households[0];
  const containerValue = fixedExpense?.accountId ? `account:${fixedExpense.accountId}` : fixedExpense?.fundId ? `fund:${fixedExpense.fundId}` : containers[0]?.value;
  const activeMonths = new Set((fixedExpense?.activeMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map(String));
  const isRequestForOtherMember = !fixedExpense && requestedForUserId !== "self";
  const selectedRecipient = requestRecipients.find((member) => member.userId === requestedForUserId);
  const selectedHouseholdId = isRequestForOtherMember ? selectedRecipient?.householdId : fixedExpense?.householdId ?? defaultHousehold?.id;

  if (categories.length === 0 || (containers.length === 0 && requestRecipients.length === 0)) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-white p-4">
        <p className="font-semibold">Servono dati di base</p>
        <p className="text-sm leading-6 text-zinc-600">Crea almeno una categoria e, per le spese fisse personali, un conto o fondo.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/accounts" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold">
            Conti
          </Link>
          <Link href="/settings/categories" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold">
            Categorie
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {fixedExpense?.id && <input type="hidden" name="id" value={fixedExpense.id} />}
      <input type="hidden" name="householdId" value={selectedHouseholdId ?? ""} />
      {!fixedExpense && requestRecipients.length > 0 && (
        <SelectField
          label="Per conto di"
          name="requestedForUserId"
          value={requestedForUserId}
          onChange={(event) => setRequestedForUserId(event.target.value)}
          options={[
            { value: "self", label: "Me stesso" },
            ...requestRecipients.map((member) => ({ value: member.userId, label: member.fullName || member.username || "Membro" }))
          ]}
          errors={state.fieldErrors}
        />
      )}
      <TextField label="Descrizione" name="description" defaultValue={fixedExpense?.description ?? ""} errors={state.fieldErrors} />
      {!isRequestForOtherMember && <SelectField label="Categoria" name="categoryId" defaultValue={fixedExpense?.categoryId ?? categories[0]?.value} options={categories} errors={state.fieldErrors} />}
      <TextField label="Importo" name="amount" defaultValue={fixedExpense?.amount ?? ""} inputMode="decimal" errors={state.fieldErrors} />
      {isRequestForOtherMember ? (
        <p className="rounded-md border border-border bg-white p-3 text-sm leading-6 text-zinc-600">Il destinatario sceglierà categoria e conto o fondo quando accetta.</p>
      ) : (
        <SelectField label="Conto / Fondo" name="containerId" defaultValue={containerValue} options={containers} errors={state.fieldErrors} />
      )}
      <TextField label="Giorno del mese" name="dayOfMonth" type="number" min={1} max={31} defaultValue={fixedExpense?.dayOfMonth ?? 1} errors={state.fieldErrors} />
      <TextField label="Data inizio" name="startsOn" type="date" defaultValue={fixedExpense?.startsOn ?? today} errors={state.fieldErrors} />
      <TextField label="Data fine" name="endsOn" type="date" defaultValue={fixedExpense?.endsOn ?? ""} errors={state.fieldErrors} />

      <fieldset>
        <legend className="text-sm font-semibold text-foreground">Mesi attivi</legend>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {months.map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-2 text-sm font-semibold">
              <input name="activeMonths" type="checkbox" value={value} defaultChecked={activeMonths.has(value)} className="h-4 w-4" />
              {label}
            </label>
          ))}
        </div>
        {state.fieldErrors?.activeMonths?.[0] && <span className="mt-2 block text-sm font-medium text-red-700">{state.fieldErrors.activeMonths[0]}</span>}
      </fieldset>

      {households.length > 0 && !isRequestForOtherMember && (
        <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
          <input name="sharedWithFamily" type="checkbox" defaultChecked={fixedExpense?.isSharedWithHousehold ?? Boolean(defaultHousehold?.shareByDefault)} className="h-5 w-5" />
          <span className="text-sm font-semibold">Condividi con famiglia</span>
        </label>
      )}
      {isRequestForOtherMember && <input type="hidden" name="sharedWithFamily" value="true" />}
      <label className="block">
        <span className="text-sm font-semibold text-foreground">Note</span>
        <textarea name="notes" className="mt-2 min-h-24 w-full rounded-md border border-border bg-white px-3 py-3 text-base outline-none ring-primary/20 transition focus:border-primary focus:ring-4" />
      </label>

      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        {isRequestForOtherMember ? "Invia richiesta" : "Salva spesa fissa"}
      </PendingButton>
    </form>
  );
}
