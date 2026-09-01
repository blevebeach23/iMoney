"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { movementFormSchema, movementRequestDecisionSchema, movementRequestFormSchema, parseContainerId } from "@/lib/movements/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createMovement, duplicateMovement, getMovementById, softDeleteMovement, updateMovement } from "@/services/movements/movement-service";
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

  const parsed = movementFormSchema.safeParse(formDataToMovementObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      const movement = await updateMovement(supabase, user.id, { ...parsed.data, id: parsed.data.id });
      await notifySharedMovement(supabase, movement, "updated", user.id);
    } else {
      const movement = await createMovement(supabase, user.id, parsed.data);
      await notifySharedMovement(supabase, movement, "created", user.id);
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/movements");
  redirect("/movements");
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
  const { supabase, user } = await requireUser();
  const movement = await getMovementById(supabase, user.id, id);
  await softDeleteMovement(supabase, user.id, id);
  if (movement) {
    await notifySharedMovement(supabase, movement, "deleted", user.id);
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
