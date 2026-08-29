"use client";

import { ArrowRightLeft, Save } from "lucide-react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { FormMessage, PendingButton, SelectField, TextField } from "@/components/master-data/field-controls";
import type { FormState } from "@/lib/auth/validation";
import { saveTransferAction } from "@/lib/transfers/actions";
import type { Account, Fund } from "@/types/domain";

const initialState: FormState = { ok: false };

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: `Conto / ${account.name}` })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

export function TransferForm({ accounts, funds }: Readonly<{ accounts: Account[]; funds: Fund[] }>) {
  const [state, action] = useFormState(saveTransferAction, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const containers = containerOptions(accounts, funds);

  if (containers.length < 2) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <ArrowRightLeft aria-hidden className="h-5 w-5 text-primary" />
          <p className="font-semibold">Servono almeno due contenitori</p>
        </div>
        <p className="text-sm leading-6 text-zinc-600">Crea almeno due conti o fondi prima di registrare un trasferimento.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/accounts" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
            Conti
          </Link>
          <Link href="/funds" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
            Fondi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <TextField label="Data" name="occurredOn" type="date" defaultValue={today} errors={state.fieldErrors} />
      <SelectField label="Origine" name="fromContainerId" defaultValue={containers[0]?.value} options={containers} errors={state.fieldErrors} />
      <SelectField label="Destinazione" name="toContainerId" defaultValue={containers[1]?.value} options={containers} errors={state.fieldErrors} />
      <TextField label="Importo" name="amount" inputMode="decimal" errors={state.fieldErrors} />
      <TextField label="Descrizione" name="description" placeholder="Opzionale" errors={state.fieldErrors} />
      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva trasferimento
      </PendingButton>
    </form>
  );
}
