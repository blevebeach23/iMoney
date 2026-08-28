"use client";

import { useFormState } from "react-dom";
import { Archive, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deactivateAccountAction, saveAccountAction } from "@/lib/master-data/actions";
import { accountTypeOptions } from "@/lib/master-data/validation";
import type { FormState } from "@/lib/auth/validation";
import type { Account } from "@/types/domain";
import { FormMessage, PendingButton, SelectField, TextField } from "./field-controls";

const initialState: FormState = { ok: false };

function balanceFor(account: Account) {
  return account.cachedBalance || account.openingBalance;
}

function AccountForm({ account }: Readonly<{ account?: Account }>) {
  const [state, action] = useFormState(saveAccountAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {account?.id && <input type="hidden" name="id" value={account.id} />}
      <TextField label="Nome" name="name" defaultValue={account?.name ?? ""} errors={state.fieldErrors} />
      <SelectField label="Tipologia" name="type" defaultValue={account?.type ?? "bank"} options={accountTypeOptions} errors={state.fieldErrors} />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Saldo iniziale"
          name="openingBalance"
          defaultValue={account?.openingBalance ?? "0.00"}
          inputMode="decimal"
          errors={state.fieldErrors}
        />
        <TextField
          label="Data saldo"
          name="openingBalanceDate"
          type="date"
          defaultValue={account?.openingBalanceDate ?? new Date().toISOString().slice(0, 10)}
          errors={state.fieldErrors}
        />
      </div>
      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva
      </PendingButton>
    </form>
  );
}

export function AccountManager({ accounts }: Readonly<{ accounts: Account[] }>) {
  return (
    <div className="space-y-4">
      <details className="rounded-md border border-border bg-white p-4" open={accounts.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <Plus aria-hidden className="h-4 w-4" />
          Nuovo conto
        </summary>
        <div className="mt-4">
          <AccountForm />
        </div>
      </details>

      {accounts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-white p-5">
          <p className="font-semibold text-foreground">Nessun conto attivo</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Crea almeno un conto per poterlo usare nei movimenti della prossima fase.</p>
        </div>
      ) : (
        accounts.map((account) => (
          <article key={account.id} className="rounded-md border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-normal">{account.name}</h2>
                <p className="mt-1 text-sm font-medium text-zinc-600">{accountTypeOptions.find((option) => option.value === account.type)?.label}</p>
              </div>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Attivo</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-500">Saldo UI</dt>
                <dd className="font-semibold">{balanceFor(account)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Data iniziale</dt>
                <dd className="font-semibold">{account.openingBalanceDate}</dd>
              </div>
            </dl>
            <details className="mt-4 rounded-md border border-border p-3">
              <summary className="cursor-pointer list-none font-semibold">Modifica</summary>
              <div className="mt-4">
                <AccountForm account={account} />
              </div>
            </details>
            <form action={deactivateAccountAction} className="mt-3">
              <input type="hidden" name="id" value={account.id} />
              <Button type="submit" variant="secondary" className="w-full text-red-700">
                <Archive aria-hidden className="h-4 w-4" />
                Disattiva
              </Button>
            </form>
          </article>
        ))
      )}
    </div>
  );
}
