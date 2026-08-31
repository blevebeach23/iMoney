"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormState } from "react-dom";
import { loginAction } from "@/lib/auth/actions";
import { AuthField, FormMessage, SubmitButton } from "./form-controls";
import type { FormState } from "@/lib/auth/validation";

const initialState: FormState = { ok: false };

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const registerHref = next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <AuthField label="Email" name="email" type="email" autoComplete="email" errors={state.fieldErrors} />
      <AuthField label="Password" name="password" type="password" autoComplete="current-password" errors={state.fieldErrors} />
      <SubmitButton>Accedi</SubmitButton>
      <div className="flex items-center justify-between text-sm">
        <Link className="font-semibold text-primary" href="/forgot-password">
          Password dimenticata
        </Link>
        <Link className="font-semibold text-primary" href={registerHref}>
          Registrati
        </Link>
      </div>
    </form>
  );
}
