"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { confirmMovementImport, undoImportBatch, type ConfirmImportInput } from "@/services/imports/import-service";
import { confirmImportSchema } from "./validation";

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

export async function confirmImportAction(formData: FormData) {
  const payload = confirmImportSchema.parse(JSON.parse(String(formData.get("payload") ?? "{}"))) as ConfirmImportInput;
  const { supabase, user } = await requireUser();
  await confirmMovementImport(supabase, user.id, payload);
  revalidatePath("/");
  revalidatePath("/import");
  revalidatePath("/movements");
  redirect("/import?done=1");
}

export async function undoImportBatchAction(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "");
  const { supabase, user } = await requireUser();
  await undoImportBatch(supabase, user.id, batchId);
  revalidatePath("/");
  revalidatePath("/import");
  revalidatePath("/movements");
}
