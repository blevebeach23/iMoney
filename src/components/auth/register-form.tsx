"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormState } from "react-dom";
import { registerAction } from "@/lib/auth/actions";
import { AuthField, FormMessage, SubmitButton } from "./form-controls";
import type { FormState } from "@/lib/auth/validation";

const initialState: FormState = { ok: false };

export function RegisterForm() {
  const [state, formAction] = useFormState(registerAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      {!state.ok && state.message?.includes("Recupera password") && (
        <Link className="block rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary" href="/forgot-password">
          Recupera password
        </Link>
      )}
      <AuthField label="Nome" name="fullName" autoComplete="name" errors={state.fieldErrors} />
      <AuthField label="Username" name="username" autoComplete="username" errors={state.fieldErrors} />
      <AuthField label="Email" name="email" type="email" autoComplete="email" errors={state.fieldErrors} />
      <AuthField label="Password" name="password" type="password" autoComplete="new-password" errors={state.fieldErrors} />
      <AuthField
        label="Conferma password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors}
      />
      <SubmitButton>Crea account</SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        Hai già un account?{" "}
        <Link className="font-semibold text-primary" href="/login">
          Accedi
        </Link>
      </p>
    </form>
  );
}
