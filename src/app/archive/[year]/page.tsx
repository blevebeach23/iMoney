import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { calculateMonthlyStatistics, calculateYearTotalNetExpenses } from "@/lib/calculations/statistics";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMovementCategoryInfo, getMovementsBetween } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

export default async function ArchiveYearPage({ params }: Readonly<{ params: { year: string } }>) {
  if (!/^\d{4}$/.test(params.year)) {
    notFound();
  }

  const year = Number(params.year);
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [movements, categoryInfo] = await Promise.all([
    getMovementsBetween(supabase, user.id, `${year}-01-01`, `${year}-12-31`),
    getMovementCategoryInfo(supabase, user.id)
  ]);
  const summary = calculateMonthlySummary(movements);
  const monthly = calculateMonthlyStatistics(movements, year);
  const aggregates = calculateCategoryAggregates(movements, categoryInfo);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Archivio</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">{year}</h1>
      </header>
      <section className="grid grid-cols-2 gap-3">
        <ArchiveTile label="Entrate" value={summary.income} />
        <ArchiveTile label="Spese nette" value={summary.netExpenses} />
        <ArchiveTile label="Rimborsi" value={summary.reimbursements} />
        <ArchiveTile label="Bilancio" value={summary.economicBalance} />
      </section>
      <section className="mt-6 rounded-md border border-border bg-white p-4 shadow-panel">
        <h2 className="text-lg font-semibold text-foreground">Riepilogo</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Spese nette annuali EUR {calculateYearTotalNetExpenses(movements, year)}. I movimenti futuri sono conteggiati nel mese della loro data.
        </p>
      </section>
      <section className="mt-6 grid grid-cols-3 gap-2">
        {monthly.map((point) => (
          <Link key={point.month} href={`/months/${point.month}`} className="rounded-md border border-border bg-white p-3 text-center shadow-panel">
            <span className="block text-sm font-bold capitalize">{point.label}</span>
            <span className="mt-1 block text-xs font-semibold text-zinc-500">EUR {point.netExpenses.toFixed(2)}</span>
          </Link>
        ))}
      </section>
      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Macro-categorie</h2>
        {aggregates.macroCategories.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessuna spesa in questo anno.</p>
        ) : (
          aggregates.macroCategories.map((macro) => (
            <Link key={macro.macroCategoryId} href={`/movements?macroCategoryId=${macro.macroCategoryId}`} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
              <span className="font-medium">{macro.macroCategoryName}</span>
              <span className="font-semibold tabular-nums">EUR {macro.netExpenses}</span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}

function ArchiveTile({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-panel">
      <p className="text-sm font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">EUR {value}</p>
    </div>
  );
}
