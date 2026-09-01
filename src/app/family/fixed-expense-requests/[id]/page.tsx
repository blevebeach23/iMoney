import { notFound, redirect } from "next/navigation";
import { FixedExpenseRequestDetail } from "@/components/family/fixed-expense-request-detail";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getFixedExpenseRequestById } from "@/services/fixed-expenses/fixed-expense-request-service";
import { getFunds } from "@/services/funds/fund-service";

export const dynamic = "force-dynamic";

export default async function FixedExpenseRequestDetailPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const request = await getFixedExpenseRequestById(supabase, params.id);

  if (!request) {
    notFound();
  }

  const [accounts, funds, categoryTree] =
    request.recipientUserId === user.id && request.status === "PENDING"
      ? await Promise.all([getAccounts(supabase, user.id), getFunds(supabase, user.id), getCategoryTree(supabase, user.id)])
      : [[], [], []];

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <FixedExpenseRequestDetail accounts={accounts} categoryTree={categoryTree} currentUserId={user.id} funds={funds} request={request} />
    </main>
  );
}
