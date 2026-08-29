import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { formatMonthLabel, monthRangeFromYearMonth } from "@/lib/calculations/dates";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMovementCategoryInfo, getMonthlyMovements } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

export default async function MonthDetailPage({ params }: Readonly<{ params: { month: string } }>) {
  if (!/^\d{4}-\d{2}$/.test(params.month)) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const range = monthRangeFromYearMonth(params.month);
  const [movements, categoryInfo] = await Promise.all([
    getMonthlyMovements(supabase, user.id, range.monthStart, range.monthEnd),
    getMovementCategoryInfo(supabase, user.id)
  ]);
  const summary = calculateMonthlySummary(movements);
  const aggregates = calculateCategoryAggregates(movements, categoryInfo);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Mese</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">{formatMonthLabel(range.monthStart)}</h1>
      </header>
      <section className="grid grid-cols-2 gap-3">
        <SummaryTile label="Entrate" value={summary.income} />
        <SummaryTile label="Spese nette" value={summary.netExpenses} />
        <SummaryTile label="Rimborsi" value={summary.reimbursements} />
        <SummaryTile label="Bilancio" value={summary.economicBalance} />
      </section>
      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Macro-categorie</h2>
        {aggregates.macroCategories.map((macro) => (
          <Link key={macro.macroCategoryId} href={`/settings/categories/${macro.macroCategoryId}?month=${params.month}`} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
            <span className="font-medium">{macro.macroCategoryName}</span>
            <span className="font-semibold tabular-nums">EUR {macro.netExpenses}</span>
          </Link>
        ))}
      </section>
      <Link href={`/movements?period=${params.month}`} className="mt-6 flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
        Apri movimenti del mese
      </Link>
    </main>
  );
}

function SummaryTile({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-panel">
      <p className="text-sm font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">EUR {value}</p>
    </div>
  );
}
