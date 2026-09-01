import { Bell, Check, X } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { respondToHouseholdInviteAction } from "@/lib/households/actions";
import { loadPendingInviteNotifications } from "@/lib/households/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getNotifications, getUnreadNotificationCount } from "@/services/notifications/notification-service";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams
}: Readonly<{
  searchParams?: { invite?: string };
}>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ invites, errorMessage }, notifications, unreadCount] = await Promise.all([
    loadPendingInviteNotifications(supabase),
    getNotifications(supabase, user.id),
    getUnreadNotificationCount(supabase, user.id)
  ]);
  const actionMessage = searchParams?.invite === "errore" ? "Invito non più disponibile o già gestito." : null;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <NotificationCenter initialNotifications={notifications} initialUnreadCount={unreadCount} />

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Inviti famiglia</h2>
        {(errorMessage || actionMessage) && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{actionMessage ?? errorMessage}</p>
        )}
        {invites.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun invito in attesa.</p>
        ) : (
          invites.map((invite) => (
            <article key={invite.id} className="rounded-md border border-border bg-white p-4 shadow-panel">
              <div className="flex items-start gap-3">
                <Bell aria-hidden className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">{invite.householdName ?? "Famiglia"}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">Invito da {invite.invitedByName}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <form action={respondToHouseholdInviteAction}>
                  <input type="hidden" name="token" value={invite.token} />
                  <input type="hidden" name="accept" value="true" />
                  <Button type="submit" className="w-full">
                    <Check aria-hidden className="h-4 w-4" />
                    Accetta
                  </Button>
                </form>
                <form action={respondToHouseholdInviteAction}>
                  <input type="hidden" name="token" value={invite.token} />
                  <input type="hidden" name="accept" value="false" />
                  <Button type="submit" variant="secondary" className="w-full">
                    <X aria-hidden className="h-4 w-4" />
                    Rifiuta
                  </Button>
                </form>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
