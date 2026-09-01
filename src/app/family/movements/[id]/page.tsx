import { notFound, redirect } from "next/navigation";
import { FamilyMovementDetail } from "@/components/family/family-movement-detail";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholds } from "@/services/households/household-service";
import { getSharedHouseholdMovementById } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

export default async function FamilyMovementDetailPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [movement, activeHouseholds] = await Promise.all([getSharedHouseholdMovementById(supabase, params.id), getActiveHouseholds(supabase, user.id)]);
  const canOpenInFamily = movement?.householdId ? activeHouseholds.some((household) => household.id === movement.householdId) : false;

  if (!movement || !movement.isSharedWithHousehold || !canOpenInFamily) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <FamilyMovementDetail movement={movement} />
    </main>
  );
}
