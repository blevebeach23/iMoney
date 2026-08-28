"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthField, FormMessage, SubmitButton } from "@/components/auth/form-controls";
import type { FormState } from "@/lib/auth/validation";
import { completeOnboardingAction } from "@/lib/onboarding/actions";
import { initialAccountOptions } from "@/lib/onboarding/initial-data";

const initialState: FormState = { ok: false };
const steps = ["Benvenuto", "Profilo", "Conti", "Saldi", "Fine"];

export function OnboardingForm({ fullName, username }: Readonly<{ fullName: string; username: string }>) {
  const [step, setStep] = useState(0);
  const [state, formAction] = useFormState(completeOnboardingAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Onboarding</p>
          <h1 className="mt-1 text-2xl font-bold tracking-normal text-foreground">{steps[step]}</h1>
        </div>
        <p className="text-sm font-semibold text-zinc-500">{step + 1}/5</p>
      </div>

      <form action={formAction} className="space-y-5">
        <FormMessage state={state} />

        <div className={step === 0 ? "space-y-4" : "hidden"}>
          <p className="text-base leading-7 text-zinc-700">
            Configura il profilo e i dati iniziali minimi. Potrai modificare tutto più avanti.
          </p>
        </div>

        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <AuthField label="Nome" name="fullName" defaultValue={fullName} errors={state.fieldErrors} />
          <AuthField label="Username" name="username" defaultValue={username} errors={state.fieldErrors} />
        </div>

        <div className={step === 2 ? "space-y-4" : "hidden"}>
          {initialAccountOptions.map((account) => (
            <label key={account.key} className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-white px-3">
              <input name={`account_${account.key}_enabled`} type="checkbox" defaultChecked={account.key !== "credit_card"} className="h-5 w-5" />
              <span className="flex-1 font-semibold">{account.label}</span>
              <input
                name={`account_${account.key}_name`}
                defaultValue={account.label}
                className="h-10 w-32 rounded-md border border-border px-2 text-sm"
                aria-label={`Nome ${account.label}`}
              />
            </label>
          ))}
          <label className="flex items-center gap-3 rounded-md border border-border bg-white px-3 py-4">
            <input name="createInitialCategories" type="checkbox" defaultChecked className="h-5 w-5" />
            <span className="text-sm font-semibold">Crea categorie iniziali personali</span>
          </label>
        </div>

        <div className={step === 3 ? "space-y-4" : "hidden"}>
          {initialAccountOptions.map((account) => (
            <div key={account.key} className="rounded-md border border-border bg-white p-3">
              <p className="font-semibold">{account.label}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label>
                  <span className="text-sm font-medium text-zinc-600">Saldo</span>
                  <input
                    name={`account_${account.key}_balance`}
                    defaultValue="0.00"
                    inputMode="decimal"
                    className="mt-1 h-11 w-full rounded-md border border-border px-2"
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-zinc-600">Data</span>
                  <input
                    name={`account_${account.key}_date`}
                    type="date"
                    defaultValue={today}
                    className="mt-1 h-11 w-full rounded-md border border-border px-2"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className={step === 4 ? "space-y-4" : "hidden"}>
          <p className="text-base leading-7 text-zinc-700">Completa l’onboarding e apri l’area privata.</p>
          <SubmitButton>Completa onboarding</SubmitButton>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
            Indietro
          </Button>
          {step < 4 && (
            <Button type="button" onClick={() => setStep((value) => Math.min(4, value + 1))}>
              Avanti
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}
