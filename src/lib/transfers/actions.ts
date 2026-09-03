"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeMovementsReturnTo } from "@/lib/navigation/return-to";
import { parseTransferContainerId, transferFormSchema } from "@/lib/transfers/validation";
import { rebuildBalanceCaches } from "@/services/balances/balance-service";
import { createTransfer, createTransferBatch, softDeleteTransfer, updateTransfer } from "@/services/transfers/transfer-service";

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

function formDataToTransferObject(formData: FormData) {
  const fromContainerId = String(formData.get("fromContainerId") ?? "");
  const toContainerId = String(formData.get("toContainerId") ?? "");
  const from = parseTransferContainerId(fromContainerId);
  const to = parseTransferContainerId(toContainerId);

  return {
    id: String(formData.get("id") ?? "") || undefined,
    occurredOn: String(formData.get("occurredOn") ?? ""),
    fromContainerId,
    toContainerId,
    fromAccountId: from.accountId,
    fromFundId: from.fundId,
    toAccountId: to.accountId,
    toFundId: to.fundId,
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    sharedWithFamily: formData.get("sharedWithFamily") === "on",
    householdId: String(formData.get("householdId") ?? "") || null
  };
}

function formDataToTransferObjects(formData: FormData) {
  const rowCount = Number(formData.get("rowCount") ?? 1);
  if (!Number.isFinite(rowCount) || rowCount <= 1) {
    return [formDataToTransferObject(formData)];
  }

  return Array.from({ length: rowCount }, (_, index) => {
    const row = new FormData();
    for (const field of ["occurredOn", "fromContainerId", "toContainerId", "amount", "description", "sharedWithFamily", "householdId"]) {
      const value = formData.get(`rows[${index}].${field}`);
      if (value !== null) {
        row.set(field, value);
      }
    }
    return formDataToTransferObject(row);
  });
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveTransferAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const returnTo = safeMovementsReturnTo(formData.get("returnTo"));
  const transferObjects = formDataToTransferObjects(formData);
  const parsed = parsedTransferPayload(formData, transferObjects);

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    let transferId: string | undefined;
    if (Array.isArray(parsed.data)) {
      transferId = (await createTransferBatch(supabase, user.id, parsed.data))[0];
    } else if (parsed.data.id) {
      await updateTransfer(supabase, user.id, { ...parsed.data, id: parsed.data.id });
      transferId = parsed.data.id;
    } else {
      transferId = await createTransfer(supabase, user.id, parsed.data);
    }
    await rebuildBalanceCaches(supabase, user.id);
    if (transferId) {
      revalidatePath(`/transfers/${transferId}`);
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/");
  revalidatePath("/movements");
  revalidatePath("/accounts");
  revalidatePath("/funds");
  redirect(returnTo);
}

export async function deleteTransferAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = safeMovementsReturnTo(formData.get("returnTo"));
  const { supabase, user } = await requireUser();
  await softDeleteTransfer(supabase, user.id, id);
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/");
  revalidatePath("/movements");
  revalidatePath("/accounts");
  revalidatePath("/funds");
  redirect(returnTo);
}

function parsedTransferPayload(formData: FormData, transferObjects: ReturnType<typeof formDataToTransferObjects>) {
  const hasExistingId = Boolean(String(formData.get("id") ?? ""));
  if (hasExistingId || transferObjects.length === 1) {
    return transferFormSchema.safeParse(transferObjects[0]);
  }

  return transferFormSchema.array().min(1).safeParse(transferObjects);
}
