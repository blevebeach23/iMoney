import { redirect } from "next/navigation";
import { MovementForm } from "@/components/movements/movement-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions, getHouseholdMembers } from "@/services/households/household-service";

export const dynamic = "force-dynamic";

export default async function NewMovementPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accounts, funds, categoryTree, households] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getCategoryTree(supabase, user.id),
    getActiveHouseholdOptions(supabase, user.id)
  ]);
  const requestRecipients = households[0]
    ? (await getHouseholdMembers(supabase, households[0].id)).filter((member) => member.status === "ACTIVE" && member.userId !== user.id)
    : [];

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Movimenti</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Nuovo movimento</h1>
      </header>
      <MovementForm accounts={accounts} categoryTree={categoryTree} funds={funds} households={households} requestRecipients={requestRecipients} />
    </main>
  );
}
