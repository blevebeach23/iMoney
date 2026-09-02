import Link from "next/link";
import { ArrowRightLeft, Copy, Plus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { duplicateMovementAction } from "@/lib/movements/actions";
import type { Account, Fund } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { MovementFilters, MovementListItem } from "@/services/movements/movement-service";
import type { TimelineItem } from "@/services/timeline/timeline-service";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T00:00:00`));
}

function isFuture(value: string) {
  return value > new Date().toISOString().slice(0, 10);
}

function typeLabel(type: MovementListItem["type"]) {
  if (type === "reimbursement") {
    return "Rimborso";
  }

  return type === "income" ? "Entrata" : "Spesa";
}

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: `Conto / ${account.name}` })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

export function MovementFiltersForm({
  accounts,
  categoryTree,
  filters,
  funds
}: Readonly<{
  accounts: Account[];
  categoryTree: CategoryTreeItem[];
  filters: MovementFilters;
  funds: Fund[];
}>) {
  return (
    <form className="space-y-3 rounded-md border border-border bg-white p-4">
      <input name="period" type="month" defaultValue={filters.period ?? ""} className="h-11 w-full rounded-md border border-border px-3" />
      <div className="grid grid-cols-2 gap-3">
        <select name="type" defaultValue={filters.type ?? "all"} className="h-11 rounded-md border border-border px-3">
          <option value="all">Tutti i tipi</option>
          <option value="expense">Spese</option>
          <option value="income">Entrate</option>
          <option value="reimbursement">Rimborsi</option>
          <option value="transfer">Trasferimenti</option>
        </select>
        <select name="shared" defaultValue={filters.shared ?? "all"} className="h-11 rounded-md border border-border px-3">
          <option value="all">Condivisione</option>
          <option value="yes">Condivisi</option>
          <option value="no">Non condivisi</option>
        </select>
      </div>
      <select name="macroCategoryId" defaultValue={filters.macroCategoryId ?? ""} className="h-11 w-full rounded-md border border-border px-3">
        <option value="">Tutte le macro-categorie</option>
        {categoryTree.map((macro) => (
          <option key={macro.id} value={macro.id}>
            {macro.name}
          </option>
        ))}
      </select>
      <select name="categoryId" defaultValue={filters.categoryId ?? ""} className="h-11 w-full rounded-md border border-border px-3">
        <option value="">Tutte le categorie</option>
        {categoryTree.flatMap((macro) =>
          macro.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {macro.name} / {category.name}
            </option>
          ))
        )}
      </select>
      <select name="containerId" defaultValue={filters.containerId ?? ""} className="h-11 w-full rounded-md border border-border px-3">
        <option value="">Tutti i conti/fondi</option>
        {containerOptions(accounts, funds).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select name="reimbursement" defaultValue={filters.reimbursement ?? "all"} className="h-11 w-full rounded-md border border-border px-3">
        <option value="all">Rimborsi e non rimborsi</option>
        <option value="yes">Solo rimborsi</option>
        <option value="no">Escludi rimborsi</option>
      </select>
      <Button type="submit" className="w-full">
        Applica filtri
      </Button>
    </form>
  );
}

export function MovementTimeline({ items }: Readonly<{ items: TimelineItem[] }>) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-white p-5">
        <p className="font-semibold text-foreground">Nessuna operazione</p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Crea il primo movimento o trasferimento usando il pulsante centrale.</p>
        <Link href="/add" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuova operazione
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (item.kind === "movement" ? <MovementTimelineCard key={`movement:${item.id}`} movement={item.movement} /> : <TransferTimelineCard key={`transfer:${item.id}`} item={item} />))}
    </div>
  );
}

function MovementTimelineCard({ movement }: Readonly<{ movement: MovementListItem }>) {
  return (
    <article className="rounded-md border border-border bg-white p-4">
      <Link href={`/movements/${movement.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-500">{formatDate(movement.occurredOn)}</p>
            <h2 className="mt-1 text-lg font-bold tracking-normal">{movement.description}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {movement.macroCategoryName && `${movement.macroCategoryName} / `}
              {movement.categoryName}
            </p>
          </div>
          <p className={`text-right text-lg font-bold ${movement.type === "expense" ? "text-red-700" : "text-emerald-700"}`}>
            {movement.type === "expense" ? "-" : "+"}
            {movement.amount}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-zinc-100 px-2 py-1">{typeLabel(movement.type)}</span>
          <span className="rounded-md bg-zinc-100 px-2 py-1">{movement.accountName ?? movement.fundName}</span>
          {movement.isSharedWithHousehold && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sky-700">
              <Share2 aria-hidden className="h-3 w-3" />
              Famiglia
            </span>
          )}
          {isFuture(movement.occurredOn) && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Programmato</span>}
        </div>
      </Link>
      <form action={duplicateMovementAction} className="mt-3">
        <input type="hidden" name="id" value={movement.id} />
        <Button type="submit" variant="secondary" className="w-full">
          <Copy aria-hidden className="h-4 w-4" />
          Duplica
        </Button>
      </form>
    </article>
  );
}

function TransferTimelineCard({ item }: Readonly<{ item: Extract<TimelineItem, { kind: "transfer" }> }>) {
  const transfer = item.transfer;

  return (
    <article className="rounded-md border border-border bg-white p-4">
      <Link href={`/transfers/${transfer.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-500">{formatDate(transfer.occurredOn)}</p>
            <h2 className="mt-1 text-lg font-bold tracking-normal">{transfer.description || "Trasferimento"}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {transfer.fromName} verso {transfer.toName}
            </p>
          </div>
          <p className="text-right text-lg font-bold tabular-nums text-primary">{transfer.amount}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sky-700">
            <ArrowRightLeft aria-hidden className="h-3 w-3" />
            Trasferimento
          </span>
          {transfer.isSharedWithHousehold && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sky-700">
              <Share2 aria-hidden className="h-3 w-3" />
              Famiglia
            </span>
          )}
          {isFuture(transfer.occurredOn) && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Programmato</span>}
        </div>
      </Link>
    </article>
  );
}
