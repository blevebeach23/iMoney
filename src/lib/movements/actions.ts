"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { movementFormSchema, parseContainerId } from "@/lib/movements/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createMovement, duplicateMovement, getMovementById, softDeleteMovement, updateMovement } from "@/services/movements/movement-service";
import { notifySharedMovement } from "@/services/notifications/notification-service";

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

function formDataToMovementObject(formData: FormData) {
  const containerId = String(formData.get("containerId") ?? "");
  const container = parseContainerId(containerId);

  return {
    id: String(formData.get("id") ?? "") || undefined,
    occurredOn: String(formData.get("occurredOn") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    type: String(formData.get("type") ?? "expense"),
    amount: String(formData.get("amount") ?? ""),
    containerId,
    accountId: container.accountId,
    fundId: container.fundId,
    isReimbursement: boolFromForm(formData.get("isReimbursement")),
    reimbursementForMovementId: String(formData.get("reimbursementForMovementId") ?? ""),
    sharedWithFamily: boolFromForm(formData.get("sharedWithFamily")),
    householdId: String(formData.get("householdId") ?? ""),
    notes: String(formData.get("notes") ?? "")
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveMovementAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = movementFormSchema.safeParse(formDataToMovementObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      const movement = await updateMovement(supabase, user.id, { ...parsed.data, id: parsed.data.id });
      await notifySharedMovement(supabase, movement, "updated");
    } else {
      const movement = await createMovement(supabase, user.id, parsed.data);
      await notifySharedMovement(supabase, movement, "created");
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/movements");
  redirect("/movements");
}

export async function deleteMovementAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  const movement = await getMovementById(supabase, user.id, id);
  await softDeleteMovement(supabase, user.id, id);
  if (movement) {
    await notifySharedMovement(supabase, movement, "deleted");
  }
  revalidatePath("/movements");
  redirect("/movements");
}

export async function duplicateMovementAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await duplicateMovement(supabase, user.id, id);
  revalidatePath("/movements");
  redirect("/movements");
}
