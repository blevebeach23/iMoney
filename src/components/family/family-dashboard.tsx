import { Share2 } from "lucide-react";
import Link from "next/link";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import type { AnnualTrendPoint } from "@/lib/calculations/annual-trend";
import type { BudgetReport } from "@/lib/calculations/budget";
import type { MacroCategoryAggregate } from "@/lib/calculations/category-aggregates";
import type { MonthlySummary } from "@/types/domain";
import type { SharedHouseholdFund } from "@/services/funds/fund-service";
import type { MovementListItem } from "@/services/movements/movement-service";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`));
}

function movementSign(type: MovementListItem["type"]) {
  return type === "expense" ? "-" : "+";
}

export function FamilyDashboard({
  annualTrend,
  budgetReport,
  householdId,
  householdName,
  macroCategoryAggregates,
  monthLabel,
  selectedMonth,
  sharedFunds,
  summary,
  timeline
}: Readonly<{
  annualTrend: AnnualTrendPoint[];
  budgetReport: BudgetReport;
  householdId: string;
  householdName: string;
  macroCategoryAggregates: MacroCategoryAggregate[];
  monthLabel: string;
  selectedMonth: string;
  sharedFunds: SharedHouseholdFund[];
  summary: MonthlySummary;
  timeline: MovementListItem[];
}>) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-5">
      <header className="pr-28">
        <div>
          <p className="text-sm font-semibold text-primary">{monthLabel}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-foreground">{householdName}</h1>
        </div>
      </header>

      <form className="mt-5 flex items-end gap-3">
        <input type="hidden" name="householdId" value={householdId} />
        <label className="flex-1">
          <span className="text-sm font-semibold text-foreground">Mese</span>
          <input name="month" type="month" defaultValue={selectedMonth} className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3" />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
          Apri
        </button>
      </form>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <FamilyStat label="Entrate condivise" value={summary.income} />
        <FamilyStat label="Spese lorde" value={summary.grossExpenses} />
        <FamilyStat label="Rimborsi" value={summary.reimbursements} />
        <FamilyStat label="Spese nette" value={summary.netExpenses} />
        <FamilyStat label="Bilancio familiare" value={summary.economicBalance} />
      </section>

      <Link href={`/family/settings?householdId=${householdId}`} className="mt-6 block rounded-md border border-border bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Budget familiare</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {budgetReport.general ? `EUR ${budgetReport.general.usage.used} / EUR ${budgetReport.general.usage.budgetAmount}` : "Budget non impostato"}
            </p>
          </div>
          <span className="text-sm font-semibold text-primary">{budgetReport.general ? `${Math.round(budgetReport.general.usage.usedPercentage)}%` : "Imposta"}</span>
        </div>
        {budgetReport.general && (
          <div className="mt-4">
            <BudgetProgress usage={budgetReport.general.usage} />
          </div>
        )}
      </Link>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Fondi condivisi</h2>
        {sharedFunds.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun fondo condiviso.</p>
        ) : (
          sharedFunds.map((fund) => <SharedFundCard key={fund.id} fund={fund} />)
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Macro-categorie condivise</h2>
        {macroCategoryAggregates.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessuna spesa condivisa nel mese.</p>
        ) : (
          macroCategoryAggregates.slice(0, 5).map((macro) => (
            <div key={macro.macroCategoryId} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
              <span className="font-medium">{macro.macroCategoryName}</span>
              <span className="font-semibold tabular-nums">EUR {macro.netExpenses}</span>
            </div>
          ))
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Timeline famiglia</h2>
        {timeline.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun movimento condiviso.</p>
        ) : (
          timeline.map((movement) => (
            <Link key={movement.id} href={`/family/movements/${movement.id}`} className="block rounded-md border border-border bg-white p-4 shadow-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-500">{formatDate(movement.occurredOn)}</p>
                  <h3 className="mt-1 font-bold tracking-normal">{movement.description}</h3>
                  <p className="mt-1 text-sm text-zinc-600">{movement.authorName ?? movement.ownerUserId}</p>
                </div>
                <p className={`font-bold tabular-nums ${movement.type === "expense" ? "text-red-700" : "text-emerald-700"}`}>
                  {movementSign(movement.type)}EUR {movement.amount}
                </p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                <Share2 aria-hidden className="h-3 w-3" />
                Condiviso
              </span>
            </Link>
          ))
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Andamento annuale</h2>
        <div className="rounded-md border border-border bg-white p-4 shadow-panel">
          <div className="flex h-32 items-end gap-1">
            {annualTrend.map((point) => (
              <div key={point.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end justify-center">
                  <div className={`w-full max-w-5 rounded-t-sm ${Number(point.netFlow) >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ height: `${Math.max(4, point.barValue)}%` }} />
                </div>
                <span className="text-[10px] font-semibold uppercase text-zinc-500">{point.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function FamilyStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-panel">
      <p className="text-sm font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">EUR {value}</p>
    </div>
  );
}

function SharedFundCard({ fund }: Readonly<{ fund: SharedHouseholdFund }>) {
  const progress = fund.progressPercentage ?? 0;

  return (
    <article className="rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold tracking-normal text-foreground">{fund.name}</h3>
          <p className="mt-1 text-sm text-zinc-600">{fund.targetAmount ? `Target EUR ${fund.targetAmount}` : "Target non impostato"}</p>
        </div>
        <p className="font-bold tabular-nums text-foreground">EUR {fund.balance}</p>
      </div>
      {fund.targetAmount && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-sm bg-zinc-100">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-zinc-500">
            <span>{Math.round(progress)}%</span>
            {fund.targetDate && <span>{fund.targetDate}</span>}
          </div>
        </div>
      )}
    </article>
  );
}
