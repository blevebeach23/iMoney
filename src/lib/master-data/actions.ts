"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  accountFormSchema,
  categoryFormSchema,
  fundFormSchema,
  macroCategoryFormSchema
} from "@/lib/master-data/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createAccount,
  deactivateAccount,
  updateAccount
} from "@/services/accounts/account-service";
import {
  createCategory,
  createMacroCategory,
  deactivateCategory,
  deactivateMacroCategory,
  updateCategory,
  updateMacroCategory
} from "@/services/categories/category-service";
import { createFund, deactivateFund, updateFund } from "@/services/funds/fund-service";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";

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

function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveAccountAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = accountFormSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      await updateAccount(supabase, user.id, { ...parsed.data, id: parsed.data.id });
    } else {
      await createAccount(supabase, user.id, parsed.data);
    }
    revalidatePath("/accounts");
    return { ok: true, message: "Conto salvato" };
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }
}

export async function deactivateAccountAction(formData: FormData) {
  const accountId = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await deactivateAccount(supabase, user.id, accountId);
  revalidatePath("/accounts");
}

export async function saveFundAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = fundFormSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      await updateFund(supabase, user.id, { ...parsed.data, id: parsed.data.id });
    } else {
      await createFund(supabase, user.id, parsed.data);
    }
    revalidatePath("/funds");
    return { ok: true, message: "Fondo salvato" };
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }
}

export async function deactivateFundAction(formData: FormData) {
  const fundId = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await deactivateFund(supabase, user.id, fundId);
  revalidatePath("/funds");
}

export async function saveMacroCategoryAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = macroCategoryFormSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    if (parsed.data.id) {
      await updateMacroCategory(supabase, user.id, { ...parsed.data, id: parsed.data.id });
    } else {
      await createMacroCategory(supabase, user.id, parsed.data);
    }
    revalidatePath("/settings/categories");
    return { ok: true, message: "Macro-categoria salvata" };
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }
}

export async function deactivateMacroCategoryAction(formData: FormData) {
  const macroCategoryId = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  await deactivateMacroCategory(supabase, user.id, macroCategoryId);
  revalidatePath("/settings/categories");
}

export async function saveCategoryAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = categoryFormSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase } = await requireUser();
    if (parsed.data.id) {
      await updateCategory(supabase, { ...parsed.data, id: parsed.data.id });
    } else {
      await createCategory(supabase, parsed.data);
    }
    revalidatePath("/settings/categories");
    return { ok: true, message: "Categoria salvata" };
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }
}

export async function deactivateCategoryAction(formData: FormData) {
  const categoryId = String(formData.get("id") ?? "");
  const { supabase } = await requireUser();
  await deactivateCategory(supabase, categoryId);
  revalidatePath("/settings/categories");
}
