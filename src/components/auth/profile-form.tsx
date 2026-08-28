"use client";

import { useFormState } from "react-dom";
import { updateProfileAction } from "@/lib/auth/actions";
import { AuthField, FormMessage, SubmitButton } from "./form-controls";
import type { FormState } from "@/lib/auth/validation";

const initialState: FormState = { ok: false };

export function ProfileForm({
  fullName,
  username,
  phone,
  email
}: Readonly<{ fullName: string; username: string; phone: string | null; email: string }>) {
  const [state, formAction] = useFormState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <AuthField label="Nome" name="fullName" defaultValue={fullName} autoComplete="name" errors={state.fieldErrors} />
      <AuthField label="Username" name="username" defaultValue={username} autoComplete="username" errors={state.fieldErrors} />
      <AuthField label="Telefono" name="phone" defaultValue={phone ?? ""} autoComplete="tel" errors={state.fieldErrors} />
      <label className="block">
        <span className="text-sm font-semibold text-foreground">Email</span>
        <input
          value={email}
          readOnly
          className="mt-2 h-12 w-full rounded-md border border-border bg-zinc-100 px-3 text-base text-zinc-600"
        />
      </label>
      <SubmitButton>Salva profilo</SubmitButton>
    </form>
  );
}
