"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { movementFormSchema, movementRequestDecisionSchema, movementRequestFormSchema, parseContainerId } from "@/lib/movements/validation";
import { safeMovementsReturnTo } from "@/lib/navigation/return-to";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rebuildBalanceCaches } from "@/services/balances/balance-service";
import { createMovement, createMovementBatch, duplicateMovement, getMovementById, softDeleteMovement, softDeleteMovementBatch, updateMovement } from "@/services/movements/movement-service";
import { softDeleteTransferBatch } from "@/services/transfers/transfer-service";
import {
  acceptMovementRequest,
  cancelMovementRequest,
  createMovementRequest,
  getMovementRequestById,
  rejectMovementRequest
} from "@/services/movements/movement-request-service";
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

function formDataToMovementObjects(formData: FormData) {
  const hasRows = formData.has("rowCount");
  const rowCount = Number(formData.get("rowCount") ?? 1);
  if (!hasRows || !Number.isFinite(rowCount) || rowCount < 1) {
    return [formDataToMovementObject(formData)];
  }

  return Array.from({ length: rowCount }, (_, index) => {
    const row = new FormData();
    for (const field of ["occurredOn", "description", "categoryId", "type", "amount", "containerId", "isReimbursement", "reimbursementForMovementId", "sharedWithFamily", "householdId", "notes"]) {
      const value = formData.get(`rows[${index}].${field}`);
      if (value !== null) {
        row.set(field, value);
      }
    }
    return formDataToMovementObject(row);
  });
}

function categoryLabelFromForm(formData: FormData) {
  const selectedCategoryId = String(formData.get("categoryId") ?? "");
  const rawOptions = String(formData.get("categoryOptions") ?? "");

  if (!selectedCategoryId || !rawOptions) {
    return null;
  }

  try {
    const options = JSON.parse(rawOptions) as unknown;

    if (!Array.isArray(options)) {
      return null;
    }

    const match = options.find((option) => {
      return Boolean(option && typeof option === "object" && "value" in option && option.value === selectedCategoryId);
    });

    return match && typeof match === "object" && "label" in match && typeof match.label === "string" ? match.label : null;
  } catch {
    return null;
  }
}

function formDataToMovementRequestObject(formData: FormData) {
  return {
    occurredOn: String(formData.get("occurredOn") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    categoryLabel: categoryLabelFromForm(formData),
    type: String(formData.get("type") ?? "expense"),
    amount: String(formData.get("amount") ?? ""),
    isReimbursement: boolFromForm(formData.get("isReimbursement")),
    reimbursementForMovementId: "",
    sharedWithFamily: true,
    householdId: String(formData.get("householdId") ?? ""),
    recipientUserId: String(formData.get("requestedForUserId") ?? ""),
    notes: String(formData.get("notes") ?? "")
  };
}

function formDataToMovementRequestDecisionObject(formData: FormData) {
  const containerId = String(formData.get("containerId") ?? "");
  const container = parseContainerId(containerId);

  return {
    requestId: String(formData.get("requestId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    containerId,
    accountId: container.accountId,
    fundId: container.fundId,
    reimbursementForMovementId: String(formData.get("reimbursementForMovementId") ?? "")
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveMovementAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const returnTo = safeMovementsReturnTo(formData.get("returnTo"));
  const requestedForUserId = String(formData.get("requestedForUserId") ?? "self");
  const isRequest = requestedForUserId !== "self";

  if (isRequest) {
    const parsedRequest = movementRequestFormSchema.safeParse(formDataToMovementRequestObject(formData));

    if (!parsedRequest.success) {
      return { ok: false, fieldErrors: toFieldErrors(parsedRequest.error) };
    }

    let requestId: string;

    try {
      const { supabase, user } = await requireUser();

      if (parsedRequest.data.recipientUserId === user.id) {
        return { ok: false, fieldErrors: { requestedForUserId: ["Per te stesso usa il movimento normale"] } };
      }

      requestId = await createMovementRequest(supabase, user.id, parsedRequest.data);
    } catch (error) {
      return { ok: false, message: messageFromError(error) };
    }

    revalidatePath("/family");
    redirect(`/family/movement-requests/${requestId}`);
  }

  const movementObjects = formDataToMovementObjects(formData);
  const parsed = parsedMovementPayload(formData, movementObjects);

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: toFieldErrors(parsed.error),
      message: "Controlla i dati del movimento"
    };
  }

  try {
    const { supabase, user } = await requireUser();
    if ("id" in parsed.data && parsed.data.id) {
      const movement = await updateMovement(supabase, user.id, { ...parsed.data, id: parsed.data.id });
      await notifySharedMovement(supabase, movement, "updated", user.id);
      await rebuildBalanceCaches(supabase, user.id);
    } else {
      const movements = Array.isArray(parsed.data) ? await createMovementBatch(supabase, user.id, parsed.data) : [await createMovement(supabase, user.id, parsed.data)];
      await Promise.all(movements.map((movement) => notifySharedMovement(supabase, movement, "created", user.id)));
      await rebuildBalanceCaches(supabase, user.id);
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/movements");
  redirect(returnTo);
}

export async function acceptMovementRequestAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = movementRequestDecisionSchema.safeParse(formDataToMovementRequestDecisionObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  let acceptedMovementId: string;

  try {
    const { supabase, user } = await requireUser();
    const request = await getMovementRequestById(supabase, parsed.data.requestId);

    if (!request) {
      return { ok: false, message: "Richiesta non trovata" };
    }

    acceptedMovementId = await acceptMovementRequest(supabase, user.id, request, parsed.data);
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/family");
  revalidatePath("/movements");
  redirect(`/family/movements/${acceptedMovementId}`);
}

export async function rejectMovementRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const { supabase, user } = await requireUser();
  const request = await getMovementRequestById(supabase, requestId);

  if (!request) {
    redirect("/family");
  }

  await rejectMovementRequest(supabase, user.id, request);
  revalidatePath("/family");
  redirect(`/family/movement-requests/${request.id}`);
}

export async function cancelMovementRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const { supabase, user } = await requireUser();
  const request = await getMovementRequestById(supabase, requestId);

  if (!request) {
    redirect("/family");
  }

  await cancelMovementRequest(supabase, user.id, request);
  revalidatePath("/family");
  redirect(`/family/movement-requests/${request.id}`);
}

export async function deleteMovementAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = safeMovementsReturnTo(formData.get("returnTo"));
  const { supabase, user } = await requireUser();
  const movement = await getMovementById(supabase, user.id, id);
  await softDeleteMovement(supabase, user.id, id);
  await rebuildBalanceCaches(supabase, user.id);
  if (movement) {
    await notifySharedMovement(supabase, movement, "deleted", user.id);
  }
  revalidatePath("/movements");
  redirect(returnTo);
}

export async function duplicateMovementAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = safeMovementsReturnTo(formData.get("returnTo"));
  const { supabase, user } = await requireUser();
  await duplicateMovement(supabase, user.id, id);
  await rebuildBalanceCaches(supabase, user.id);
  revalidatePath("/movements");
  redirect(returnTo);
}

export async function bulkUpdateTimelineAction(formData: FormData) {
  const returnTo = safeMovementsReturnTo(formData.get("returnTo"));
  const movementIds = parseIdList(String(formData.get("movementIds") ?? ""));
  const transferIds = parseIdList(String(formData.get("transferIds") ?? ""));
  const action = String(formData.get("bulkAction") ?? "");

  if (movementIds.length === 0 && transferIds.length === 0) {
    redirect(returnTo);
  }

  const { supabase, user } = await requireUser();
  const movementUpdate: Record<string, string | boolean | null> = {};
  const transferUpdate: Record<string, string | boolean | null> = {};

  await assertNoRecurringTimelineOccurrences(supabase, user.id, movementIds, transferIds);

  if (action === "date") {
    const occurredOn = String(formData.get("occurredOn") ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      movementUpdate.occurred_on = occurredOn;
      transferUpdate.occurred_on = occurredOn;
    }
  }

  if (action === "category" && movementIds.length > 0 && transferIds.length === 0) {
    const categoryId = String(formData.get("categoryId") ?? "");
    if (categoryId) {
      movementUpdate.category_id = categoryId;
    }
  }

  if (action === "container" && movementIds.length > 0 && transferIds.length === 0) {
    const container = parseContainerId(String(formData.get("containerId") ?? ""));
    movementUpdate.account_id = container.accountId;
    movementUpdate.fund_id = container.fundId;
  }

  if (action === "share") {
    const householdId = String(formData.get("householdId") ?? "");
    if (householdId) {
      movementUpdate.shared_with_family = true;
      movementUpdate.household_id = householdId;
      transferUpdate.shared_with_family = true;
      transferUpdate.household_id = householdId;
    }
  }

  if (action === "unshare") {
    movementUpdate.shared_with_family = false;
    movementUpdate.household_id = null;
    transferUpdate.shared_with_family = false;
    transferUpdate.household_id = null;
  }

  if (action === "delete") {
    await softDeleteMovementBatch(supabase, user.id, movementIds);
    await softDeleteTransferBatch(supabase, user.id, transferIds);
    await rebuildBalanceCaches(supabase, user.id);
    revalidatePath("/movements");
    revalidatePath("/family");
    revalidatePath("/");
    redirect(returnTo);
  }

  if (Object.keys(movementUpdate).length > 0 && movementIds.length > 0) {
    const { error } = await supabase.from("movements").update({ ...movementUpdate, updated_by: user.id }).in("id", movementIds).eq("owner_user_id", user.id).is("deleted_at", null);
    if (error) {
      throw error;
    }
  }

  if (Object.keys(transferUpdate).length > 0 && transferIds.length > 0) {
    const { error } = await supabase.from("transfers").update(transferUpdate).in("id", transferIds).eq("owner_user_id", user.id).is("deleted_at", null);
    if (error) {
      throw error;
    }
  }

  if (Object.keys(movementUpdate).length > 0 || Object.keys(transferUpdate).length > 0) {
    await rebuildBalanceCaches(supabase, user.id);
  }

  revalidatePath("/movements");
  revalidatePath("/family");
  revalidatePath("/");
  redirect(returnTo);
}

function parsedMovementPayload(formData: FormData, movementObjects: ReturnType<typeof formDataToMovementObjects>) {
  const hasExistingId = Boolean(String(formData.get("id") ?? ""));
  if (hasExistingId || !formData.has("rowCount")) {
    return movementFormSchema.safeParse(movementObjects[0]);
  }

  return movementFormSchema.array().min(1).safeParse(movementObjects);
}

function parseIdList(value: string): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => uuid.test(item));
}

async function assertNoRecurringTimelineOccurrences(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, movementIds: string[], transferIds: string[]) {
  if (movementIds.length > 0) {
    const { data, error } = await supabase
      .from("movements")
      .select("id")
      .in("id", movementIds)
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .not("fixed_expense_id", "is", null);

    if (error) {
      throw error;
    }

    if ((data ?? []).length > 0) {
      throw new Error("La selezione contiene occorrenze ricorrenti: apri la ricorrenza madre");
    }
  }

  if (transferIds.length > 0) {
    const { data, error } = await supabase
      .from("transfers")
      .select("id")
      .in("id", transferIds)
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .not("recurring_transfer_id", "is", null);

    if (error) {
      throw error;
    }

    if ((data ?? []).length > 0) {
      throw new Error("La selezione contiene occorrenze ricorrenti: apri la ricorrenza madre");
    }
  }
}
