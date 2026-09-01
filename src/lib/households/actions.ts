"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import {
  householdFormSchema,
  householdInviteResponseSchema,
  householdInviteCancelSchema,
  householdLeaveSchema,
  householdInviteSchema,
  householdMemberRemoveSchema,
  householdMemberRoleSchema,
  householdPreferenceSchema
} from "@/lib/households/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notifyFamilyEvent } from "@/services/notifications/notification-service";
import {
  cancelHouseholdInvite,
  createHousehold,
  createHouseholdInvite,
  HouseholdInviteError,
  leaveHousehold,
  removeHouseholdMember,
  respondToHouseholdInvite,
  updateHouseholdMemberRole,
  updateHouseholdName,
  updateHouseholdPreference
} from "@/services/households/household-service";

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

function messageFromError(error: unknown) {
  if (error instanceof HouseholdInviteError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveHouseholdAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = householdFormSchema.safeParse({
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? "")
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      await updateHouseholdName(supabase, parsed.data.id, parsed.data.name);
    } else {
      await createHousehold(supabase, user.id, parsed.data.name);
    }
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/family");
  revalidatePath("/family/settings");
  return { ok: true, message: "Famiglia salvata" };
}

export async function inviteHouseholdMemberAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = householdInviteSchema.safeParse({
    householdId: String(formData.get("householdId") ?? ""),
    email: String(formData.get("email") ?? "")
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    const invite = await createHouseholdInvite(supabase, parsed.data.householdId, user.id, parsed.data.email, createSupabaseAdminClient);
    revalidatePath("/family/settings");
    revalidatePath("/notifications");

    if (invite.isRegistered) {
      return { ok: true, message: "Invito creato. L'utente registrato lo vedrà nelle notifiche interne." };
    }

    return { ok: true, message: "Invito creato. L'utente riceverà una email per registrarsi e accettare la famiglia." };
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }
}

export async function updateHouseholdMemberRoleAction(formData: FormData) {
  const parsed = householdMemberRoleSchema.parse({
    householdId: String(formData.get("householdId") ?? ""),
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? "member")
  });
  const { supabase } = await requireUser();
  await updateHouseholdMemberRole(supabase, parsed.householdId, parsed.userId, parsed.role);
  revalidatePath("/family/settings");
}

export async function removeHouseholdMemberAction(formData: FormData) {
  const parsed = householdMemberRemoveSchema.parse({
    householdId: String(formData.get("householdId") ?? ""),
    userId: String(formData.get("userId") ?? "")
  });
  const { supabase } = await requireUser();
  await removeHouseholdMember(supabase, parsed.householdId, parsed.userId);
  revalidatePath("/family/settings");
}

export async function leaveHouseholdAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = householdLeaveSchema.safeParse({
    householdId: String(formData.get("householdId") ?? "")
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase } = await requireUser();
    await leaveHousehold(supabase, parsed.data.householdId);
    revalidatePath("/family");
    revalidatePath("/family/settings");
    return { ok: true, message: "Condivisione interrotta." };
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }
}

export async function cancelHouseholdInviteAction(formData: FormData) {
  const parsed = householdInviteCancelSchema.parse({
    inviteId: String(formData.get("inviteId") ?? "")
  });
  const { supabase } = await requireUser();
  await cancelHouseholdInvite(supabase, parsed.inviteId);
  revalidatePath("/family/settings");
  revalidatePath("/notifications");
}

export async function updateHouseholdPreferenceAction(formData: FormData) {
  const parsed = householdPreferenceSchema.parse({
    householdId: String(formData.get("householdId") ?? ""),
    shareNewMovementsByDefault: boolFromForm(formData.get("shareNewMovementsByDefault"))
  });
  const { supabase, user } = await requireUser();
  await updateHouseholdPreference(supabase, parsed.householdId, user.id, parsed.shareNewMovementsByDefault);
  revalidatePath("/family/settings");
}

export async function respondToHouseholdInviteAction(formData: FormData) {
  const parsed = householdInviteResponseSchema.parse({
    token: String(formData.get("token") ?? ""),
    accept: boolFromForm(formData.get("accept"))
  });

  let destination = parsed.accept ? "/family" : "/notifications";

  try {
    const { supabase } = await requireUser();
    const householdId = await respondToHouseholdInvite(supabase, parsed.token, parsed.accept);
    await notifyFamilyEvent(
      supabase,
      householdId,
      parsed.accept ? "family_member_joined" : "family_invite_rejected",
      parsed.accept ? "Nuovo membro in famiglia" : "Invito famiglia rifiutato",
      parsed.accept ? "Un nuovo membro ha accettato l'invito famiglia." : "Un invito famiglia è stato rifiutato.",
      `invite:${parsed.token}:${parsed.accept ? "accepted" : "rejected"}`
    );
    revalidatePath("/family");
    revalidatePath("/family/settings");
    revalidatePath("/notifications");
  } catch (error) {
    console.error("[households] Household invite response failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    destination = "/notifications?invite=errore";
  }

  redirect(destination);
}
