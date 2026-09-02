import { notFound, redirect } from "next/navigation";
import { MovementDetail } from "@/components/movements/movement-detail";
import { safeMovementsReturnTo } from "@/lib/navigation/return-to";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMovementById } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

export default async function MovementDetailPage({ params, searchParams }: Readonly<{ params: { id: string }; searchParams?: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const movement = await getMovementById(supabase, user.id, params.id);

  if (!movement) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <MovementDetail movement={movement} returnTo={safeMovementsReturnTo(searchParams?.returnTo)} />
    </main>
  );
}
