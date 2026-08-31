import type { SupabaseClient } from "@supabase/supabase-js";
import { getPendingInvitesForCurrentUser, type HouseholdInviteListItem } from "@/services/households/household-service";

export interface PendingInviteNotifications {
  errorMessage: string | null;
  invites: HouseholdInviteListItem[];
}

export async function loadPendingInviteNotifications(supabase: SupabaseClient): Promise<PendingInviteNotifications> {
  try {
    const invites = await getPendingInvitesForCurrentUser(supabase);
    return { invites, errorMessage: null };
  } catch (error) {
    logNotificationError(error);
    return {
      invites: [],
      errorMessage: "Non è stato possibile caricare gli inviti. Riprova tra poco."
    };
  }
}

function logNotificationError(error: unknown) {
  if (error && typeof error === "object") {
    const details = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown; status?: unknown };
    console.error("[notifications] Pending household invites failed", {
      code: details.code,
      message: details.message,
      details: details.details,
      hint: details.hint,
      status: details.status
    });
    return;
  }

  console.error("[notifications] Pending household invites failed", { message: String(error) });
}
