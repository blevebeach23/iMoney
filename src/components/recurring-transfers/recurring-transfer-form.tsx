"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { FormMessage, PendingButton, SelectField, TextField } from "@/components/master-data/field-controls";
import type { FormState } from "@/lib/auth/validation";
import { saveRecurringTransferAction } from "@/lib/recurring-transfers/actions";
import type { ActiveHouseholdOption } from "@/services/households/household-service";
import type { RecurringTransferListItem } from "@/services/recurring-transfers/recurring-transfer-service";
import type { Account, Fund } from "@/types/domain";

const initialState: FormState = { ok: false };

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: `Conto / ${account.name}` })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

export function RecurringTransferForm({
  accounts,
  funds,
  households,
  recurringTransfer
}: Readonly<{ accounts: Account[]; funds: Fund[]; households: ActiveHouseholdOption[]; recurringTransfer?: RecurringTransferListItem }>) {
  const [state, action] = useFormState(saveRecurringTransferAction, initialState);
  const containers = containerOptions(accounts, funds);
  const today = new Date().toISOString().slice(0, 10);
  const fromValue = recurringTransfer?.fromAccountId ? `account:${recurringTransfer.fromAccountId}` : recurringTransfer?.fromFundId ? `fund:${recurringTransfer.fromFundId}` : containers[0]?.value;
  const toValue = recurringTransfer?.toAccountId ? `account:${recurringTransfer.toAccountId}` : recurringTransfer?.toFundId ? `fund:${recurringTransfer.toFundId}` : containers[1]?.value;
  const household = recurringTransfer?.householdId ? households.find((item) => item.id === recurringTransfer.householdId) : households[0];

  if (containers.length < 2) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-white p-4">
        <p className="font-semibold">Servono almeno due contenitori</p>
        <p className="text-sm leading-6 text-zinc-600">Crea almeno due conti o fondi prima di registrare un trasferimento ricorrente.</p>
        <Link href="/accounts" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
          Conti
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {recurringTransfer?.id && <input type="hidden" name="id" value={recurringTransfer.id} />}
      <SelectField label="Origine" name="fromContainerId" defaultValue={fromValue} options={containers} errors={state.fieldErrors} />
      <SelectField label="Destinazione" name="toContainerId" defaultValue={toValue} options={containers} errors={state.fieldErrors} />
      <TextField label="Importo" name="amount" defaultValue={recurringTransfer?.amount ?? ""} inputMode="decimal" errors={state.fieldErrors} />
      <TextField label="Descrizione" name="description" defaultValue={recurringTransfer?.description ?? ""} placeholder="Opzionale" errors={state.fieldErrors} />
      <SelectField
        label="Periodicita"
        name="frequency"
        defaultValue={recurringTransfer?.frequency ?? "monthly"}
        options={[
          { value: "monthly", label: "Mensile" },
          { value: "quarterly", label: "Trimestrale" },
          { value: "yearly", label: "Annuale" }
        ]}
        errors={state.fieldErrors}
      />
      <TextField label="Giorno del mese" name="dayOfMonth" type="number" min={1} max={31} defaultValue={recurringTransfer?.dayOfMonth ?? 1} errors={state.fieldErrors} />
      <TextField label="Data inizio" name="startsOn" type="date" defaultValue={recurringTransfer?.startsOn ?? today} errors={state.fieldErrors} />
      <TextField label="Data fine" name="endsOn" type="date" defaultValue={recurringTransfer?.endsOn ?? ""} errors={state.fieldErrors} />
      <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
        <input name="isActive" type="checkbox" defaultChecked={recurringTransfer?.isActive ?? true} className="h-5 w-5" />
        <span className="text-sm font-semibold">Attivo</span>
      </label>
      {household && (
        <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
          <input type="hidden" name="householdId" value={household.id} />
          <input name="sharedWithFamily" type="checkbox" defaultChecked={recurringTransfer?.isSharedWithHousehold ?? Boolean(household.shareByDefault)} className="h-5 w-5" />
          <span className="text-sm font-semibold">Condividi con famiglia</span>
        </label>
      )}
      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva trasferimento ricorrente
      </PendingButton>
    </form>
  );
}
