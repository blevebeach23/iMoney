import { redirect } from "next/navigation";
import { FundManager } from "@/components/master-data/fund-manager";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFunds } from "@/services/funds/fund-service";

export const dynamic = "force-dynamic";

export default async function FundsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const funds = await getFunds(supabase, user.id);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Anagrafiche</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Fondi</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Gestisci fondi personali e obiettivi senza trattarli come categorie di spesa.</p>
      </header>
      <FundManager funds={funds} />
    </main>
  );
}
