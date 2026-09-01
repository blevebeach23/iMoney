import { CalendarDays, CreditCard, Landmark, Wallet, WalletCards, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { AnnualTrendPoint } from "@/lib/calculations/annual-trend";
import type { BudgetReport } from "@/lib/calculations/budget";
import type { MacroCategoryAggregate } from "@/lib/calculations/category-aggregates";
import type { FinancialBalances } from "@/lib/calculations/balances";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { MonthlySummary, Movement } from "@/types/domain";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { StatTile } from "./stat-tile";

const sampleMovements: Movement[] = [
  {
    id: "1",
    ownerUserId: "demo",
    householdId: null,
    accountId: "bank",
    fundId: null,
    categoryId: "salary",
    type: "income",
    amount: "2450.00",
    occurredOn: "2026-08-01",
    description: "Stipendio",
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
  },
  {
    id: "2",
    ownerUserId: "demo",
    householdId: "family",
    accountId: "credit-card",
    fundId: null,
    categoryId: "groceries",
    type: "expense",
    amount: "410.00",
    occurredOn: "2026-08-15",
    description: "Spesa e casa",
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
  },
  {
    id: "3",
    ownerUserId: "demo",
    householdId: "family",
    accountId: "bank",
    fundId: null,
    categoryId: "nursery",
    type: "expense",
    amount: "500.00",
    occurredOn: "2026-08-20",
    description: "Asilo",
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
  },
  {
    id: "4",
    ownerUserId: "demo",
    householdId: "family",
    accountId: "bank",
    fundId: null,
    categoryId: "nursery",
    type: "reimbursement",
    amount: "300.00",
    occurredOn: "2026-08-28",
    description: "Rimborso regione",
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: "3",
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
  }
];

interface DashboardPreviewProps {
  annualTrend?: AnnualTrendPoint[];
  balances?: FinancialBalances;
  budgetReport?: BudgetReport;
  macroCategoryAggregates?: MacroCategoryAggregate[];
  monthLabel?: string;
  selectedMonth?: string;
  summary?: MonthlySummary;
  upcomingMovements?: Movement[];
  userName?: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`));
}

function movementSign(type: Movement["type"]) {
  return type === "expense" ? "-" : "+";
}

export function DashboardPreview({
  annualTrend = [],
  balances,
  budgetReport,
  macroCategoryAggregates = [],
  monthLabel = "Agosto 2026",
  selectedMonth = "2026-08",
  summary,
  upcomingMovements = [],
  userName = "Utente"
}: DashboardPreviewProps) {
  const monthlySummary = summary ?? calculateMonthlySummary(sampleMovements);
  const cashRows = balances?.cash ?? [{ id: "cash", name: "Contanti", balance: "0.00" }];
  const bankRows = balances?.bank ?? [{ id: "bank", name: "Conto corrente", balance: "0.00" }];
  const fundRows = balances?.funds ?? [{ id: "fund", name: "Fondo vacanze", balance: "0.00" }];
  const creditCardRows = balances?.creditCardsDue ?? [];
  const forecastRows = balances?.forecastMonthEnd ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-5">
      <header className="pr-28">
        <div>
          <Link href={`/months/${selectedMonth}`} className="text-sm font-medium text-primary">
            {monthLabel}
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-foreground">Rendiconto {userName}</h1>
        </div>
      </header>

      <form className="mt-5 flex items-end gap-3">
        <label className="flex-1">
          <span className="text-sm font-semibold text-foreground">Mese</span>
          <input name="month" type="month" defaultValue={selectedMonth} className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3" />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <CalendarDays aria-hidden className="h-4 w-4" />
          Apri
        </button>
      </form>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatTile label="Entrate" value={`EUR ${monthlySummary.income}`} tone="good" />
        <StatTile label="Spese lorde" value={`EUR ${monthlySummary.grossExpenses}`} />
        <StatTile label="Rimborsi" value={`EUR ${monthlySummary.reimbursements}`} />
        <StatTile label="Spese nette" value={`EUR ${monthlySummary.netExpenses}`} />
        <StatTile label="Bilancio" value={`EUR ${monthlySummary.economicBalance}`} tone="good" />
      </section>

      <Link href={`/budgets/${selectedMonth.replace("-", "/")}`} className="mt-6 block rounded-md border border-border bg-white p-4 shadow-panel">
        {budgetReport?.general ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Budget del mese</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  EUR {budgetReport.general.usage.used} / EUR {budgetReport.general.usage.budgetAmount}
                </p>
              </div>
              <span className="text-sm font-semibold text-primary">{Math.round(budgetReport.general.usage.usedPercentage)}%</span>
            </div>
            <div className="mt-4">
              <BudgetProgress usage={budgetReport.general.usage} />
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Budget del mese</h2>
              <p className="mt-1 text-sm text-zinc-600">Budget totale non impostato</p>
            </div>
            <span className="text-sm font-semibold text-primary">Apri</span>
          </div>
        )}
      </Link>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Saldi finanziari</h2>
        {cashRows.map((item) => (
          <BalanceRow key={item.id} icon={Wallet} label={`Contanti / ${item.name}`} value={item.balance} />
        ))}
        {bankRows.map((item) => (
          <BalanceRow key={item.id} icon={Landmark} label={`Conto corrente / ${item.name}`} value={item.balance} />
        ))}
        {forecastRows.map((item) => (
          <BalanceRow key={item.id} icon={WalletCards} label={`${item.name} previsto fine mese`} value={item.balance} />
        ))}
        {creditCardRows.map((item) => (
          <BalanceRow key={item.accountId} icon={CreditCard} label={`${item.name} da addebitare`} value={item.due} />
        ))}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Fondi principali</h2>
        {fundRows.slice(0, 4).map((fund) => (
          <Link key={fund.id} href={`/funds/${fund.id}`} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
            <span className="font-medium">{fund.name}</span>
            <span className="font-semibold tabular-nums">EUR {fund.balance}</span>
          </Link>
        ))}
      </section>

      {macroCategoryAggregates.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Spese nette per macro-categoria</h2>
          {macroCategoryAggregates.slice(0, 5).map((macro) => (
            <Link
              key={macro.macroCategoryId}
              href={`/settings/categories/${macro.macroCategoryId}?month=${selectedMonth}`}
              className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel"
            >
              <span className="font-medium">{macro.macroCategoryName}</span>
              <span className="font-semibold tabular-nums">EUR {macro.netExpenses}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Prossimi movimenti</h2>
        {upcomingMovements.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun movimento futuro nel mese selezionato.</p>
        ) : (
          upcomingMovements.map((movement) => (
            <Link key={movement.id} href={`/movements/${movement.id}`} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
              <span>
                <span className="block text-sm font-semibold text-zinc-500">{formatDate(movement.occurredOn)}</span>
                <span className="block font-medium">{movement.description}</span>
              </span>
              <span className={`font-semibold tabular-nums ${movement.type === "expense" ? "text-red-700" : "text-emerald-700"}`}>
                {movementSign(movement.type)}EUR {movement.amount}
              </span>
            </Link>
          ))
        )}
      </section>

      {annualTrend.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Andamento annuale</h2>
          <div className="rounded-md border border-border bg-white p-4 shadow-panel">
            <div className="flex h-32 items-end gap-1">
              {annualTrend.map((point) => (
                <div key={point.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-5 rounded-t-sm ${Number(point.netFlow) >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                      style={{ height: `${Math.max(4, point.barValue)}%` }}
                      title={`EUR ${point.netFlow}`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-zinc-500">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function BalanceRow({
  icon: Icon,
  label,
  value
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string;
}>) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-border bg-white px-4 shadow-panel">
      <div className="flex items-center gap-3">
        <Icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
        <span className="font-medium">{label}</span>
      </div>
      <span className="font-semibold tabular-nums">EUR {value}</span>
    </div>
  );
}


