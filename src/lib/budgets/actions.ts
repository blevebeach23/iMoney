"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { budgetFormSchema } from "@/lib/budgets/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  copyMissingPersonalBudgets,
  createBudget,
  createHouseholdBudget,
  deactivateBudget,
  deactivateHouseholdBudget,
  updateBudget,
  updateHouseholdBudget
} from "@/services/budgets/budget-service";
import { notifyHouseholdBudget } from "@/services/notifications/notification-service";

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

function formDataToBudgetObject(formData: FormData) {
  return {
    id: String(formData.get("id") ?? "") || undefined,
    month: String(formData.get("month") ?? ""),
    scopeKind: String(formData.get("scopeKind") ?? "general"),
    macroCategoryId: String(formData.get("macroCategoryId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    amount: String(formData.get("amount") ?? "")
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveBudgetAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = budgetFormSchema.safeParse(formDataToBudgetObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      await updateBudget(supabase, user.id, { ...parsed.data, id: parsed.data.id });
    } else {
      await createBudget(supabase, user.id, parsed.data);
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidateBudgetPaths(parsed.data.month);
  return { ok: true, message: "Budget salvato" };
}

export async function saveBudgetFormAction(formData: FormData) {
  const result = await saveBudgetAction({ ok: false }, formData);
  if (!result.ok) {
    throw new Error(result.message ?? "Budget non valido");
  }
}

export async function saveHouseholdBudgetAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const householdId = String(formData.get("householdId") ?? "");
  const parsed = budgetFormSchema.safeParse(formDataToBudgetObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      const budget = await updateHouseholdBudget(supabase, householdId, { ...parsed.data, id: parsed.data.id });
      await notifyHouseholdBudget(supabase, householdId, budget, "updated", user.id);
    } else {
      const budget = await createHouseholdBudget(supabase, householdId, parsed.data);
      await notifyHouseholdBudget(supabase, householdId, budget, "created", user.id);
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidateHouseholdBudgetPaths(householdId, parsed.data.month);
  return { ok: true, message: "Budget famiglia salvato" };
}

export async function saveHouseholdBudgetFormAction(formData: FormData) {
  const result = await saveHouseholdBudgetAction({ ok: false }, formData);
  if (!result.ok) {
    throw new Error(result.message ?? "Budget famiglia non valido");
  }
}

export async function deactivateBudgetAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const { supabase, user } = await requireUser();
  await deactivateBudget(supabase, user.id, id);
  revalidateBudgetPaths(month);
}

export async function deactivateHouseholdBudgetAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const householdId = String(formData.get("householdId") ?? "");
  const { supabase } = await requireUser();
  await deactivateHouseholdBudget(supabase, householdId, id);
  revalidateHouseholdBudgetPaths(householdId, month);
}

export async function copyPreviousMonthBudgetsAction(formData: FormData) {
  const targetMonth = String(formData.get("targetMonth") ?? "");
  const previousMonth = String(formData.get("previousMonth") ?? "");
  const { supabase, user } = await requireUser();
  await copyMissingPersonalBudgets(supabase, user.id, previousMonth, targetMonth);
  revalidateBudgetPaths(targetMonth);
}

function revalidateBudgetPaths(monthStart: string) {
  revalidatePath("/");
  revalidatePath("/budgets");
  if (/^\d{4}-\d{2}-01$/.test(monthStart)) {
    const [year, month] = monthStart.split("-");
    revalidatePath(`/budgets/${year}/${month}`);
  }
}

function revalidateHouseholdBudgetPaths(householdId: string, monthStart: string) {
  revalidatePath("/family");
  revalidatePath("/family/settings");
  if (/^\d{4}-\d{2}-01$/.test(monthStart)) {
    revalidatePath(`/family?householdId=${householdId}`);
  }
}
