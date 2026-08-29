import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deactivateFixedExpenseAction, generateFixedExpenseMovementsAction } from "@/lib/fixed-expenses/actions";
import type { FixedExpenseListItem } from "@/services/fixed-expenses/fixed-expense-service";

const monthLabels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function FixedExpenseList({
  fixedExpenses,
  fromMonthStart,
  toMonthStart
}: Readonly<{ fixedExpenses: FixedExpenseListItem[]; fromMonthStart: string; toMonthStart: string }>) {
  if (fixedExpenses.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-white p-5">
        <p className="font-semibold text-foreground">Nessuna spesa fissa</p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Aggiungi affitti, abbonamenti e ricorrenze per generare movimenti futuri.</p>
        <Link href="/fixed-expenses/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuova spesa fissa
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fixedExpenses.map((item) => (
        <article key={item.id} className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-500">{item.macroCategoryName && `${item.macroCategoryName} / `}{item.categoryName}</p>
              <h2 className="mt-1 text-lg font-bold tracking-normal">{item.description}</h2>
              <p className="mt-1 text-sm text-zinc-600">{item.accountName ?? item.fundName} · giorno {item.dayOfMonth}</p>
            </div>
            <p className="text-right text-lg font-bold tabular-nums text-red-700">EUR {item.amount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.activeMonths.map((month) => (
              <span key={month} className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                {monthLabels[month - 1]}
              </span>
            ))}
            {item.isSharedWithHousehold && <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Famiglia</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <form action={generateFixedExpenseMovementsAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="fromMonthStart" value={fromMonthStart} />
              <input type="hidden" name="toMonthStart" value={toMonthStart} />
              <Button type="submit" variant="secondary" className="w-full">
                <CalendarClock aria-hidden className="h-4 w-4" />
              </Button>
            </form>
            <Link href={`/fixed-expenses/${item.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
              <Pencil aria-hidden className="h-4 w-4" />
            </Link>
            <form action={deactivateFixedExpenseAction}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="ghost" className="w-full text-red-700">
                <Trash2 aria-hidden className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
