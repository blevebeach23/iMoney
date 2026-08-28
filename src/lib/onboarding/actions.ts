"use server";

import { redirect } from "next/navigation";
import { initialAccountOptions, initialCategoryGroups, onboardingSchema } from "@/lib/onboarding/initial-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/auth/validation";
import { toFieldErrors } from "@/lib/auth/validation";

function boolFromForm(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function moneyFromForm(value: FormDataEntryValue | null): string {
  return String(value ?? "0").replace(",", ".");
}

export async function completeOnboardingAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const accounts = initialAccountOptions.map((account) => ({
    enabled: boolFromForm(formData.get(`account_${account.key}_enabled`)),
    name: String(formData.get(`account_${account.key}_name`) ?? account.label),
    type: account.type,
    openingBalance: moneyFromForm(formData.get(`account_${account.key}_balance`)),
    openingBalanceDate: String(formData.get(`account_${account.key}_date`) ?? new Date().toISOString().slice(0, 10))
  }));

  const parsed = onboardingSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    createInitialCategories: boolFromForm(formData.get("createInitialCategories")),
    accounts
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const usernameAvailable = await supabase.rpc("is_username_available", {
    candidate_username: parsed.data.username
  });

  if (usernameAvailable.error) {
    return { ok: false, message: usernameAvailable.error.message };
  }

  if (!usernameAvailable.data) {
    return { ok: false, fieldErrors: { username: ["Username già in uso"] } };
  }

  const profileUpdate = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      username: parsed.data.username
    })
    .eq("id", user.id);

  if (profileUpdate.error) {
    return { ok: false, message: profileUpdate.error.message };
  }

  const selectedAccounts = parsed.data.accounts.filter((account) => account.enabled);
  if (selectedAccounts.length > 0) {
    const { error } = await supabase.from("accounts").insert(
      selectedAccounts.map((account) => ({
        owner_user_id: user.id,
        name: account.name,
        type: account.type,
        opening_balance: account.openingBalance,
        cached_balance: account.openingBalance,
        cached_at: new Date().toISOString(),
        opening_balance_date: account.openingBalanceDate
      }))
    );

    if (error) {
      return { ok: false, message: error.message };
    }
  }

  if (parsed.data.createInitialCategories) {
    for (const [index, group] of initialCategoryGroups.entries()) {
      const macro = await supabase
        .from("macro_categories")
        .insert({
          owner_user_id: user.id,
          name: group.macro,
          sort_order: index
        })
        .select("id")
        .single();

      if (macro.error) {
        return { ok: false, message: macro.error.message };
      }

      const { error } = await supabase.from("categories").insert(
        group.categories.map((category, categoryIndex) => ({
          macro_category_id: macro.data.id,
          name: category,
          sort_order: categoryIndex
        }))
      );

      if (error) {
        return { ok: false, message: error.message };
      }
    }
  }

  const completion = await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (completion.error) {
    return { ok: false, message: completion.error.message };
  }

  redirect("/");
}
