import { ArrowRightLeft, Share2 } from "lucide-react";
import Link from "next/link";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import type { AnnualTrendPoint } from "@/lib/calculations/annual-trend";
import type { BudgetReport } from "@/lib/calculations/budget";
import type { MacroCategoryAggregate } from "@/lib/calculations/category-aggregates";
import type { FixedExpenseRequest, MonthlySummary, MovementRequest } from "@/types/domain";
import type { SharedHouseholdFund } from "@/services/funds/fund-service";
import type { MovementListItem } from "@/services/movements/movement-service";
import type { TimelineItem } from "@/services/timeline/timeline-service";
import { familyTitle } from "@/lib/households/display-name";
import { fixedExpenseRequestStatusLabel } from "./fixed-expense-request-detail";
import { movementRequestStatusLabel } from "./movement-request-detail";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`));
}

function movementSign(type: MovementListItem["type"]) {
  return type === "expense" ? "-" : "+";
}

export function FamilyDashboard({
  annualTrend,
  budgetReport,
  currentUserId,
  householdId,
  householdName,
  macroCategoryAggregates,
  monthLabel,
  fixedExpenseRequests,
  movementRequests,
  selectedMonth,
  sharedFunds,
  summary,
  timeline
}: Readonly<{
  annualTrend: AnnualTrendPoint[];
  budgetReport: BudgetReport;
  currentUserId: string;
  householdId: string;
  householdName: string;
  macroCategoryAggregates: MacroCategoryAggregate[];
  monthLabel: string;
  fixedExpenseRequests: FixedExpenseRequest[];
  movementRequests: MovementRequest[];
  selectedMonth: string;
  sharedFunds: SharedHouseholdFund[];
  summary: MonthlySummary;
  timeline: TimelineItem[];
}>) {
  const pendingForMe = movementRequests.filter((request) => request.status === "PENDING" && request.recipientUserId === currentUserId);
  const sentByMe = movementRequests.filter((request) => request.createdByUserId === currentUserId);
  const pendingFixedExpensesForMe = fixedExpenseRequests.filter((request) => request.status === "PENDING" && request.recipientUserId === currentUserId);
  const sentFixedExpensesByMe = fixedExpenseRequests.filter((request) => request.createdByUserId === currentUserId);
  const title = familyTitle(householdName);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-5">
      <header className="pr-28">
        <div>
          <p className="text-sm font-semibold text-primary">{monthLabel}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-foreground">{title}</h1>
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
        <h2 className="text-lg font-semibold text-foreground">Movimenti in attesa</h2>
        <MovementRequestGroup emptyText="Nessuna richiesta da approvare." requests={pendingForMe} title="Da approvare" />
        <MovementRequestGroup emptyText="Nessuna richiesta inviata." requests={sentByMe} title="Inviati da me" />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Spese ricorrenti in attesa</h2>
        <FixedExpenseRequestGroup emptyText="Nessuna spesa ricorrente da approvare." requests={pendingFixedExpensesForMe} title="Da approvare" />
        <FixedExpenseRequestGroup emptyText="Nessuna spesa ricorrente inviata." requests={sentFixedExpensesByMe} title="Inviate da me" />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Timeline famiglia</h2>
        {timeline.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessuna operazione condivisa.</p>
        ) : (
          timeline.map((item) => (item.kind === "movement" ? <FamilyMovementTimelineCard key={`movement:${item.id}`} movement={item.movement} /> : <FamilyTransferTimelineCard key={`transfer:${item.id}`} transfer={item.transfer} />))
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

function FamilyMovementTimelineCard({ movement }: Readonly<{ movement: MovementListItem }>) {
  return (
    <Link href={`/family/movements/${movement.id}`} className="block rounded-md border border-border bg-white p-4 shadow-panel">
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
  );
}

function FamilyTransferTimelineCard({ transfer }: Readonly<{ transfer: Extract<TimelineItem, { kind: "transfer" }>["transfer"] }>) {
  return (
    <Link href={`/family/transfers/${transfer.id}`} className="block rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-500">{formatDate(transfer.occurredOn)}</p>
          <h3 className="mt-1 font-bold tracking-normal">{transfer.description || "Trasferimento"}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {transfer.fromName} verso {transfer.toName}
          </p>
        </div>
        <p className="font-bold tabular-nums text-primary">EUR {transfer.amount}</p>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
        <ArrowRightLeft aria-hidden className="h-3 w-3" />
        Trasferimento condiviso
      </span>
    </Link>
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

function MovementRequestGroup({ emptyText, requests, title }: Readonly<{ emptyText: string; requests: MovementRequest[]; title: string }>) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-600">{title}</h3>
      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">{emptyText}</p>
      ) : (
        requests.slice(0, 5).map((request) => <MovementRequestCard key={request.id} request={request} />)
      )}
    </div>
  );
}

function MovementRequestCard({ request }: Readonly<{ request: MovementRequest }>) {
  return (
    <Link href={`/family/movement-requests/${request.id}`} className="block rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-500">{formatDate(request.movementDate)}</p>
          <h4 className="mt-1 font-bold tracking-normal">{request.description}</h4>
          <p className="mt-1 text-sm text-zinc-600">
            {request.creatorName} per {request.recipientName}
          </p>
        </div>
        <div className="text-right">
          <p className={`font-bold tabular-nums ${request.movementType === "expense" ? "text-red-700" : "text-emerald-700"}`}>
            {request.movementType === "expense" ? "-" : "+"}EUR {request.amount}
          </p>
          <span className="mt-2 inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{movementRequestStatusLabel(request.status)}</span>
        </div>
      </div>
    </Link>
  );
}

function FixedExpenseRequestGroup({ emptyText, requests, title }: Readonly<{ emptyText: string; requests: FixedExpenseRequest[]; title: string }>) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-600">{title}</h3>
      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">{emptyText}</p>
      ) : (
        requests.slice(0, 5).map((request) => <FixedExpenseRequestCard key={request.id} request={request} />)
      )}
    </div>
  );
}

function FixedExpenseRequestCard({ request }: Readonly<{ request: FixedExpenseRequest }>) {
  return (
    <Link href={`/family/fixed-expense-requests/${request.id}`} className="block rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-500">{formatDate(request.startsOn)}</p>
          <h4 className="mt-1 font-bold tracking-normal">{request.description}</h4>
          <p className="mt-1 text-sm text-zinc-600">
            {request.creatorName} per {request.recipientName}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums text-red-700">-EUR {request.amount}</p>
          <span className="mt-2 inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{fixedExpenseRequestStatusLabel(request.status)}</span>
        </div>
      </div>
    </Link>
  );
}
