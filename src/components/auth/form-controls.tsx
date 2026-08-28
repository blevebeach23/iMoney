"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FieldErrors, FormState } from "@/lib/auth/validation";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  errors?: FieldErrors;
}

export function AuthField({ label, name, errors, className, ...props }: FieldProps) {
  const fieldError = errors?.[name]?.[0];

  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <input
        name={name}
        className={`mt-2 h-12 w-full rounded-md border border-border bg-white px-3 text-base outline-none ring-primary/20 transition focus:border-primary focus:ring-4 ${className ?? ""}`}
        aria-invalid={fieldError ? "true" : "false"}
        aria-describedby={fieldError ? `${name}-error` : undefined}
        {...props}
      />
      {fieldError && (
        <span id={`${name}-error`} className="mt-2 block text-sm font-medium text-red-700">
          {fieldError}
        </span>
      )}
    </label>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`rounded-md px-3 py-2 text-sm font-medium ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {state.message}
    </p>
  );
}

export function SubmitButton({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
      {pending ? "Attendere..." : children}
    </Button>
  );
}
