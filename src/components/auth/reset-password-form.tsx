"use client";

import { useFormState } from "react-dom";
import { resetPasswordAction } from "@/lib/auth/actions";
import { AuthField, FormMessage, SubmitButton } from "./form-controls";
import type { FormState } from "@/lib/auth/validation";

const initialState: FormState = { ok: false };

export function ResetPasswordForm() {
  const [state, formAction] = useFormState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <AuthField label="Nuova password" name="password" type="password" autoComplete="new-password" errors={state.fieldErrors} />
      <AuthField
        label="Conferma password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors}
      />
      <SubmitButton>Aggiorna password</SubmitButton>
    </form>
  );
}
