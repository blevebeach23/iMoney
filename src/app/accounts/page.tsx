import { redirect } from "next/navigation";
import { AccountManager } from "@/components/master-data/account-manager";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const accounts = await getAccounts(supabase, user.id);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Anagrafiche</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Conti</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Gestisci i contenitori finanziari personali usati dai movimenti.</p>
      </header>
      <AccountManager accounts={accounts} />
    </main>
  );
}
