import { notFound, redirect } from "next/navigation";
import { TransferDetail } from "@/components/transfers/transfer-detail";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSharedHouseholdTransferById } from "@/services/transfers/transfer-service";

export const dynamic = "force-dynamic";

export default async function FamilyTransferDetailPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const transfer = await getSharedHouseholdTransferById(supabase, params.id);

  if (!transfer || !transfer.isSharedWithHousehold) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <TransferDetail readOnly transfer={transfer} />
    </main>
  );
}
