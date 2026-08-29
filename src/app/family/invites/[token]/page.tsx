import { redirect } from "next/navigation";
import { InviteResponse } from "@/components/family/invite-response";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HouseholdInvitePage({ params }: Readonly<{ params: { token: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Invito famiglia</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Rispondi all&apos;invito</h1>
      </header>
      <InviteResponse token={params.token} />
    </main>
  );
}
