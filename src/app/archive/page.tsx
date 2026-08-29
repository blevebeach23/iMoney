import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, CalendarDays } from "lucide-react";
import { calculateArchiveYears, calculateYearComparison } from "@/lib/calculations/statistics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMovementsBetween } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const movements = await getMovementsBetween(supabase, user.id, "2000-01-01", "2100-12-31");
  const years = calculateArchiveYears(movements);
  const comparison = new Map(calculateYearComparison(movements).map((year) => [year.year, year]));

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Archivio</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Anni</h1>
      </header>
      <section className="space-y-3">
        {years.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun movimento archiviato.</p>
        ) : (
          years.map((year) => {
            const summary = comparison.get(year);
            return (
              <Link key={year} href={`/archive/${year}`} className="block rounded-md border border-border bg-white p-4 shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Archive aria-hidden className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-xl font-bold tracking-normal">{year}</h2>
                      <p className="mt-1 text-sm text-zinc-600">Bilancio EUR {summary?.economicBalance ?? "0.00"}</p>
                    </div>
                  </div>
                  <CalendarDays aria-hidden className="h-5 w-5 text-zinc-400" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <span className="rounded-md bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">Entrate EUR {summary?.income ?? "0.00"}</span>
                  <span className="rounded-md bg-red-50 px-3 py-2 font-semibold text-red-700">Spese EUR {summary?.netExpenses ?? "0.00"}</span>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
