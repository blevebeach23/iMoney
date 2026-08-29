"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toFieldErrors, type FormState } from "@/lib/auth/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseTransferContainerId, transferFormSchema } from "@/lib/transfers/validation";
import { createTransfer } from "@/services/transfers/transfer-service";

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
    occurredOn: String(formData.get("occurredOn") ?? ""),
    fromContainerId,
    toContainerId,
    fromAccountId: from.accountId,
    fromFundId: from.fundId,
    toAccountId: to.accountId,
    toFundId: to.fundId,
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? "")
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Operazione non riuscita";
}

export async function saveTransferAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = transferFormSchema.safeParse(formDataToTransferObject(formData));

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const { supabase, user } = await requireUser();
    await createTransfer(supabase, user.id, parsed.data);
  } catch (error) {
    return { ok: false, message: messageFromError(error) };
  }

  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/funds");
  redirect("/");
}
