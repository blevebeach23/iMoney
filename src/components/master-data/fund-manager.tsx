"use client";

import { useFormState } from "react-dom";
import { Archive, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deactivateFundAction, saveFundAction } from "@/lib/master-data/actions";
import { fundTypeOptions } from "@/lib/master-data/validation";
import type { FormState } from "@/lib/auth/validation";
import type { Fund } from "@/types/domain";
import { FormMessage, PendingButton, SelectField, TextField } from "./field-controls";

const initialState: FormState = { ok: false };

function balanceFor(fund: Fund) {
  return fund.cachedBalance || fund.openingBalance;
}

function FundForm({ fund }: Readonly<{ fund?: Fund }>) {
  const [state, action] = useFormState(saveFundAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {fund?.id && <input type="hidden" name="id" value={fund.id} />}
      <TextField label="Nome" name="name" defaultValue={fund?.name ?? ""} errors={state.fieldErrors} />
      <SelectField label="Tipologia" name="type" defaultValue={fund?.type ?? "custom"} options={fundTypeOptions} errors={state.fieldErrors} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Saldo iniziale" name="openingBalance" defaultValue={fund?.openingBalance ?? "0.00"} inputMode="decimal" errors={state.fieldErrors} />
        <TextField
          label="Data saldo"
          name="openingBalanceDate"
          type="date"
          defaultValue={fund?.openingBalanceDate ?? new Date().toISOString().slice(0, 10)}
          errors={state.fieldErrors}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Target" name="targetAmount" defaultValue={fund?.targetAmount ?? ""} inputMode="decimal" errors={state.fieldErrors} />
        <TextField label="Data target" name="targetDate" type="date" defaultValue={fund?.targetDate ?? ""} errors={state.fieldErrors} />
      </div>
      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva
      </PendingButton>
    </form>
  );
}

export function FundManager({ funds }: Readonly<{ funds: Fund[] }>) {
  return (
    <div className="space-y-4">
      <details className="rounded-md border border-border bg-white p-4" open={funds.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <Plus aria-hidden className="h-4 w-4" />
          Nuovo fondo
        </summary>
        <div className="mt-4">
          <FundForm />
        </div>
      </details>

      {funds.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-white p-5">
          <p className="font-semibold text-foreground">Nessun fondo attivo</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Crea fondi personali quando vuoi tracciare contenitori come risparmi o obiettivi.</p>
        </div>
      ) : (
        funds.map((fund) => (
          <article key={fund.id} className="rounded-md border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-normal">{fund.name}</h2>
                <p className="mt-1 text-sm font-medium text-zinc-600">{fundTypeOptions.find((option) => option.value === fund.type)?.label}</p>
              </div>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Attivo</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-500">Saldo UI</dt>
                <dd className="font-semibold">{balanceFor(fund)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Target</dt>
                <dd className="font-semibold">{fund.targetAmount ?? "-"}</dd>
              </div>
            </dl>
            <details className="mt-4 rounded-md border border-border p-3">
              <summary className="cursor-pointer list-none font-semibold">Modifica</summary>
              <div className="mt-4">
                <FundForm fund={fund} />
              </div>
            </details>
            <form action={deactivateFundAction} className="mt-3">
              <input type="hidden" name="id" value={fund.id} />
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
