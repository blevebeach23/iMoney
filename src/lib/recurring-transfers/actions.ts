"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { currentMonthRange } from "@/lib/calculations/dates";
import { parseRecurringTransferContainerId, recurringTransferFormSchema } from "@/lib/recurring-transfers/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rebuildBalanceCaches } from "@/services/balances/balance-service";
import {
  createRecurringTransfer,
  deactivateRecurringTransfer,
  deleteRecurringTransfer,
  generateRecurringTransfers,
  syncRecurringTransferFutureTransfers,
  updateRecurringTransfer
} from "@/services/recurring-transfers/recurring-transfer-service";

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

function formDataToRecurringTransferObject(formData: FormData) {
  const fromContainerId = String(formData.get("fromContainerId") ?? "");
  const toContainerId = String(formData.get("toContainerId") ?? "");
  const from = parseRecurringTransferContainerId(fromContainerId);
  const to = parseRecurringTransferContainerId(toContainerId);

  return {
    id: String(formData.get("id") ?? "") || undefined,
    fromContainerId,
    toContainerId,
    fromAccountId: from.accountId,
    fromFundId: from.fundId,
    toAccountId: to.accountId,
    toFundId: to.fundId,
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    frequency: String(formData.get("frequency") ?? "monthly"),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    dayOfMonth: String(formData.get("dayOfMonth") ?? "1"),
    isActive: boolFromForm(formData.get("isActive")),
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

export async function saveRecurringTransferAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = recurringTransferFormSchema.safeParse(formDataToRecurringTransferObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    let recurringTransferId = parsed.data.id;
    if (parsed.data.id) {
      await updateRecurringTransfer(supabase, user.id, { ...parsed.data, id: parsed.data.id });
    } else {
      recurringTransferId = await createRecurringTransfer(supabase, user.id, parsed.data);
    }

    const range = currentMonthRange();
    await syncRecurringTransferFutureTransfers(supabase, user.id, String(recurringTransferId), range.monthStart, monthStartAfter(range.monthStart, 11));
    await rebuildBalanceCaches(supabase, user.id);
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/recurring-transfers");
  revalidatePath("/movements");
  revalidatePath("/");
  return { ok: true, message: "Trasferimento ricorrente salvato" };
}

export async function deactivateRecurringTransferAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await deactivateRecurringTransfer(supabase, user.id, id);
  const range = currentMonthRange();
  await syncRecurringTransferFutureTransfers(supabase, user.id, id, range.monthStart, monthStartAfter(range.monthStart, 11));
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/recurring-transfers");
}

export async function deleteRecurringTransferAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await deleteRecurringTransfer(supabase, user.id, id);
  const range = currentMonthRange();
  await syncRecurringTransferFutureTransfers(supabase, user.id, id, range.monthStart, monthStartAfter(range.monthStart, 11));
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/recurring-transfers");
}

export async function generateRecurringTransfersAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const fromMonthStart = String(formData.get("fromMonthStart") ?? "");
  const toMonthStart = String(formData.get("toMonthStart") ?? "");
  const { supabase, user } = await requireUser();
  await generateRecurringTransfers(supabase, user.id, id, fromMonthStart, toMonthStart);
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/recurring-transfers");
  revalidatePath("/movements");
  revalidatePath("/");
  redirect("/movements?type=transfer");
}

function monthStartAfter(monthStart: string, offset: number): string {
  const date = new Date(`${monthStart}T00:00:00`);
  date.setMonth(date.getMonth() + offset);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}
