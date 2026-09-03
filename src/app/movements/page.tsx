import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { MovementFiltersForm, MovementTimeline } from "@/components/movements/movement-list";
import { MovementListStateRestorer } from "@/components/movements/movement-list-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";
import { getMovements, type MovementFilters } from "@/services/movements/movement-service";
import { buildMovementTimeline, filterTimelineFutureItems, transfersCanBeShownWithMovementFilters } from "@/services/timeline/timeline-service";
import { getTransfers } from "@/services/transfers/transfer-service";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MovementsPage({ searchParams }: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const filters: MovementFilters = {
    period: firstParam(searchParams.period) || undefined,
    type: (firstParam(searchParams.type) as MovementFilters["type"]) || "all",
    macroCategoryId: firstParam(searchParams.macroCategoryId) || undefined,
    categoryId: firstParam(searchParams.categoryId) || undefined,
    containerId: firstParam(searchParams.containerId) || undefined,
    reimbursement: (firstParam(searchParams.reimbursement) as MovementFilters["reimbursement"]) || "all",
    shared: (firstParam(searchParams.shared) as MovementFilters["shared"]) || "all"
  };
  const showFuture = firstParam(searchParams.showFuture) === "1";

  const showTransfers = transfersCanBeShownWithMovementFilters(filters);
  const showMovements = filters.type !== "transfer";
  const movementFilters: MovementFilters = filters.type === "transfer" ? { ...filters, type: "all" } : filters;
  const [accounts, funds, categoryTree, households, movements, transfers] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getCategoryTree(supabase, user.id),
    getActiveHouseholdOptions(supabase, user.id),
    showMovements ? getMovements(supabase, user.id, movementFilters) : Promise.resolve([]),
    showTransfers ? getTransfers(supabase, user.id, { period: filters.period, containerId: filters.containerId, shared: filters.shared }) : Promise.resolve([])
  ]);
  const timeline = filterTimelineFutureItems(buildMovementTimeline(movements, transfers), showFuture);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const first = firstParam(value);
    if (first) {
      query.set(key, first);
    }
  }
  const returnTo = query.size > 0 ? `/movements?${query.toString()}` : "/movements";

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <MovementListStateRestorer />
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Movimenti</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Personali</h1>
        </div>
        <Link href="/add" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuovo
        </Link>
      </header>
      <div className="space-y-4">
        <MovementFiltersForm accounts={accounts} categoryTree={categoryTree} filters={filters} funds={funds} />
        <Link
          href={showFuture ? returnTo.replace(/[?&]showFuture=1/, "") : `${returnTo}${returnTo.includes("?") ? "&" : "?"}showFuture=1`}
          className="flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold"
        >
          {showFuture ? "Nascondi futuri" : "Mostra futuri"}
        </Link>
        <MovementTimeline accounts={accounts} categoryTree={categoryTree} funds={funds} households={households} items={timeline} returnTo={returnTo} />
      </div>
    </main>
  );
}
