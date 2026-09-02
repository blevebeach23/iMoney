import { CalendarClock, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deactivateRecurringTransferAction, deleteRecurringTransferAction, generateRecurringTransfersAction } from "@/lib/recurring-transfers/actions";
import type { RecurringTransferListItem } from "@/services/recurring-transfers/recurring-transfer-service";

const frequencyLabels: Record<RecurringTransferListItem["frequency"], string> = {
  custom: "Personalizzata",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale"
};

export function RecurringTransferList({
  recurringTransfers,
  fromMonthStart,
  toMonthStart
}: Readonly<{ recurringTransfers: RecurringTransferListItem[]; fromMonthStart: string; toMonthStart: string }>) {
  if (recurringTransfers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-white p-5">
        <p className="font-semibold text-foreground">Nessun trasferimento ricorrente</p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Aggiungi giroconti e accantonamenti periodici per generare trasferimenti futuri.</p>
        <Link href="/recurring-transfers/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuovo trasferimento ricorrente
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recurringTransfers.map((item) => (
        <article key={item.id} className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-500">
                {item.fromName} verso {item.toName}
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-normal">{item.description || "Trasferimento ricorrente"}</h2>
              <p className="mt-1 text-sm text-zinc-600">
                {frequencyLabels[item.frequency]} · giorno {item.dayOfMonth}
              </p>
            </div>
            <p className="text-right text-lg font-bold tabular-nums text-primary">EUR {item.amount}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className={item.isActive ? "rounded-md bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-md bg-zinc-100 px-2 py-1 text-zinc-600"}>
              {item.isActive ? "Attivo" : "Disattivo"}
            </span>
            {item.isSharedWithHousehold && <span className="rounded-md bg-sky-50 px-2 py-1 text-sky-700">Famiglia</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <form action={generateRecurringTransfersAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="fromMonthStart" value={fromMonthStart} />
              <input type="hidden" name="toMonthStart" value={toMonthStart} />
              <Button type="submit" variant="secondary" className="w-full">
                <CalendarClock aria-hidden className="h-4 w-4" />
              </Button>
            </form>
            <Link href={`/recurring-transfers/${item.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
              <Pencil aria-hidden className="h-4 w-4" />
            </Link>
            <form action={deactivateRecurringTransferAction}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="secondary" className="w-full">
                <XCircle aria-hidden className="h-4 w-4" />
              </Button>
            </form>
            <form action={deleteRecurringTransferAction}>
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
