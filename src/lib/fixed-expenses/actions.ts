"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { currentMonthRange } from "@/lib/calculations/dates";
import { fixedExpenseFormSchema, fixedExpenseRequestDecisionSchema, fixedExpenseRequestFormSchema, parseFixedExpenseContainerId } from "@/lib/fixed-expenses/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rebuildBalanceCaches } from "@/services/balances/balance-service";
import {
  createFixedExpense,
  deactivateFixedExpense,
  generateFixedExpenseMovements,
  softDeleteFutureFixedExpenseMovements,
  syncFixedExpenseFutureMovements,
  updateFixedExpense
} from "@/services/fixed-expenses/fixed-expense-service";
import {
  acceptFixedExpenseRequest,
  cancelFixedExpenseRequest,
  createFixedExpenseRequest,
  getFixedExpenseRequestById,
  rejectFixedExpenseRequest
} from "@/services/fixed-expenses/fixed-expense-request-service";

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

function formDataToFixedExpenseRequestObject(formData: FormData) {
  return {
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    dayOfMonth: String(formData.get("dayOfMonth") ?? "1"),
    activeMonths: formData.getAll("activeMonths").map(String),
    sharedWithFamily: true,
    householdId: String(formData.get("householdId") ?? ""),
    recipientUserId: String(formData.get("requestedForUserId") ?? ""),
    notes: String(formData.get("notes") ?? "")
  };
}

function formDataToFixedExpenseRequestDecisionObject(formData: FormData) {
  const containerId = String(formData.get("containerId") ?? "");
  const container = parseFixedExpenseContainerId(containerId);

  return {
    requestId: String(formData.get("requestId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    containerId,
    accountId: container.accountId,
    fundId: container.fundId
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveFixedExpenseAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const requestedForUserId = String(formData.get("requestedForUserId") ?? "self");
  const isRequest = requestedForUserId !== "self";

  if (isRequest) {
    const parsedRequest = fixedExpenseRequestFormSchema.safeParse(formDataToFixedExpenseRequestObject(formData));

    if (!parsedRequest.success) {
      return { ok: false, fieldErrors: toFieldErrors(parsedRequest.error) };
    }

    let requestId: string;

    try {
      const { supabase, user } = await requireUser();

      if (parsedRequest.data.recipientUserId === user.id) {
        return { ok: false, fieldErrors: { requestedForUserId: ["Per te stesso usa la spesa ricorrente normale"] } };
      }

      requestId = await createFixedExpenseRequest(supabase, user.id, parsedRequest.data);
    } catch (error) {
      return { ok: false, message: messageFromError(error) };
    }

    revalidatePath("/family");
    redirect(`/family/fixed-expense-requests/${requestId}`);
  }

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
    await syncFixedExpenseFutureMovements(supabase, user.id, String(fixedExpenseId), range.monthStart, monthStartAfter(range.monthStart, 11));
    await rebuildBalanceCaches(supabase, user.id);
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/fixed-expenses");
  revalidatePath("/movements");
  revalidatePath("/");
  return { ok: true, message: "Spesa ricorrente salvata" };
}

export async function acceptFixedExpenseRequestAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = fixedExpenseRequestDecisionSchema.safeParse(formDataToFixedExpenseRequestDecisionObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  let acceptedFixedExpenseId: string;

  try {
    const { supabase, user } = await requireUser();
    const request = await getFixedExpenseRequestById(supabase, parsed.data.requestId);

    if (!request) {
      return { ok: false, message: "Richiesta non trovata" };
    }

    acceptedFixedExpenseId = await acceptFixedExpenseRequest(supabase, user.id, request, parsed.data);
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/family");
  revalidatePath("/fixed-expenses");
  revalidatePath("/movements");
  revalidatePath("/");
  redirect(`/fixed-expenses/${acceptedFixedExpenseId}/edit`);
}

export async function rejectFixedExpenseRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const { supabase, user } = await requireUser();
  const request = await getFixedExpenseRequestById(supabase, requestId);

  if (!request) {
    redirect("/family");
  }

  await rejectFixedExpenseRequest(supabase, user.id, request);
  revalidatePath("/family");
  redirect(`/family/fixed-expense-requests/${request.id}`);
}

export async function cancelFixedExpenseRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const { supabase, user } = await requireUser();
  const request = await getFixedExpenseRequestById(supabase, requestId);

  if (!request) {
    redirect("/family");
  }

  await cancelFixedExpenseRequest(supabase, user.id, request);
  revalidatePath("/family");
  redirect(`/family/fixed-expense-requests/${request.id}`);
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
  await softDeleteFutureFixedExpenseMovements(supabase, user.id, id);
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/fixed-expenses");
}

export async function generateFixedExpenseMovementsAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const fromMonthStart = String(formData.get("fromMonthStart") ?? "");
  const toMonthStart = String(formData.get("toMonthStart") ?? "");
  const { supabase, user } = await requireUser();
  await generateFixedExpenseMovements(supabase, user.id, id, fromMonthStart, toMonthStart);
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/fixed-expenses");
  revalidatePath("/movements");
  revalidatePath("/");
  redirect("/movements");
}
