"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { currentMonthRange } from "@/lib/calculations/dates";
import { fixedExpenseFormSchema, parseFixedExpenseContainerId } from "@/lib/fixed-expenses/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createFixedExpense,
  deactivateFixedExpense,
  generateFixedExpenseMovements,
  updateFixedExpense
} from "@/services/fixed-expenses/fixed-expense-service";

async function requireUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

function boolFromForm(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function formDataToFixedExpenseObject(formData: FormData) {
  const containerId = String(formData.get("containerId") ?? "");
  const container = parseFixedExpenseContainerId(containerId);

  return {
    id: String(formData.get("id") ?? "") || undefined,
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    containerId,
    accountId: container.accountId,
    fundId: container.fundId,
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    dayOfMonth: String(formData.get("dayOfMonth") ?? "1"),
    activeMonths: formData.getAll("activeMonths").map(String),
    sharedWithFamily: boolFromForm(formData.get("sharedWithFamily")),
    householdId: String(formData.get("householdId") ?? "")
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveFixedExpenseAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = fixedExpenseFormSchema.safeParse(formDataToFixedExpenseObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    let fixedExpenseId = parsed.data.id;
    if (parsed.data.id) {
      await updateFixedExpense(supabase, user.id, { ...parsed.data, id: parsed.data.id });
    } else {
      fixedExpenseId = await createFixedExpense(supabase, user.id, parsed.data);
    }
    const range = currentMonthRange();
    await generateFixedExpenseMovements(supabase, user.id, String(fixedExpenseId), range.monthStart, monthStartAfter(range.monthStart, 11));
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/fixed-expenses");
  revalidatePath("/movements");
  revalidatePath("/");
  return { ok: true, message: "Spesa fissa salvata" };
}

function monthStartAfter(monthStart: string, offset: number): string {
  const date = new Date(`${monthStart}T00:00:00`);
  date.setMonth(date.getMonth() + offset);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function deactivateFixedExpenseAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await deactivateFixedExpense(supabase, user.id, id);
  revalidatePath("/fixed-expenses");
}

export async function generateFixedExpenseMovementsAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const fromMonthStart = String(formData.get("fromMonthStart") ?? "");
  const toMonthStart = String(formData.get("toMonthStart") ?? "");
  const { supabase, user } = await requireUser();
  await generateFixedExpenseMovements(supabase, user.id, id, fromMonthStart, toMonthStart);
  revalidatePath("/fixed-expenses");
  revalidatePath("/movements");
  revalidatePath("/");
  redirect("/movements");
}
