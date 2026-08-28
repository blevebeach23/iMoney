"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FieldErrors, FormState } from "@/lib/auth/validation";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  errors?: FieldErrors;
  label: string;
  name: string;
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  errors?: FieldErrors;
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}

export function TextField({ errors, label, name, className, ...props }: TextFieldProps) {
  const fieldError = errors?.[name]?.[0];

  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <input
        name={name}
        className={`mt-2 h-12 w-full rounded-md border border-border bg-white px-3 text-base outline-none ring-primary/20 transition focus:border-primary focus:ring-4 ${className ?? ""}`}
        aria-invalid={fieldError ? "true" : "false"}
        {...props}
      />
      {fieldError && <span className="mt-2 block text-sm font-medium text-red-700">{fieldError}</span>}
    </label>
  );
}

export function SelectField({ errors, label, name, options, className, ...props }: SelectFieldProps) {
  const fieldError = errors?.[name]?.[0];

  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <select
        name={name}
        className={`mt-2 h-12 w-full rounded-md border border-border bg-white px-3 text-base outline-none ring-primary/20 transition focus:border-primary focus:ring-4 ${className ?? ""}`}
        aria-invalid={fieldError ? "true" : "false"}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {fieldError && <span className="mt-2 block text-sm font-medium text-red-700">{fieldError}</span>}
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

export function PendingButton({ children, variant = "primary" }: Readonly<{ children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Salvataggio..." : children}
    </Button>
  );
}
