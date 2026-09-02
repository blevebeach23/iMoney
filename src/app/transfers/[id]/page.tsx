import { notFound, redirect } from "next/navigation";
import { TransferDetail } from "@/components/transfers/transfer-detail";
import { safeMovementsReturnTo } from "@/lib/navigation/return-to";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTransferById } from "@/services/transfers/transfer-service";

export const dynamic = "force-dynamic";

export default async function TransferDetailPage({ params, searchParams }: Readonly<{ params: { id: string }; searchParams?: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const transfer = await getTransferById(supabase, user.id, params.id);

  if (!transfer) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <TransferDetail transfer={transfer} returnTo={safeMovementsReturnTo(searchParams?.returnTo)} />
    </main>
  );
}
