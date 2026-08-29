import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { MovementFiltersForm, MovementList } from "@/components/movements/movement-list";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getFunds } from "@/services/funds/fund-service";
import { getMovements, type MovementFilters } from "@/services/movements/movement-service";

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

  const [accounts, funds, categoryTree, movements] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getCategoryTree(supabase, user.id),
    getMovements(supabase, user.id, filters)
  ]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Movimenti</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Personali</h1>
        </div>
        <Link href="/movements/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuovo
        </Link>
      </header>
      <div className="space-y-4">
        <MovementFiltersForm accounts={accounts} categoryTree={categoryTree} filters={filters} funds={funds} />
        <MovementList movements={movements} />
      </div>
    </main>
  );
}
