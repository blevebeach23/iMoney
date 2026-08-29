"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import {
  householdFormSchema,
  householdInviteResponseSchema,
  householdInviteSchema,
  householdMemberRemoveSchema,
  householdMemberRoleSchema,
  householdPreferenceSchema
} from "@/lib/households/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createHousehold,
  createHouseholdInvite,
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
    const token = await createHouseholdInvite(supabase, parsed.data.householdId, user.id, parsed.data.email);
    revalidatePath("/family/settings");
    return { ok: true, message: `/family/invites/${token}` };
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
  const { supabase } = await requireUser();
  await respondToHouseholdInvite(supabase, parsed.token, parsed.accept);
  revalidatePath("/family");
  revalidatePath("/family/settings");
  redirect("/family");
}
