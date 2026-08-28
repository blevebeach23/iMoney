"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { forgotPasswordAction } from "@/lib/auth/actions";
import { AuthField, FormMessage, SubmitButton } from "./form-controls";
import type { FormState } from "@/lib/auth/validation";

const initialState: FormState = { ok: false };

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(forgotPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <AuthField label="Email" name="email" type="email" autoComplete="email" errors={state.fieldErrors} />
      <SubmitButton>Invia link</SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        <Link className="font-semibold text-primary" href="/login">
          Torna al login
        </Link>
      </p>
    </form>
  );
}
