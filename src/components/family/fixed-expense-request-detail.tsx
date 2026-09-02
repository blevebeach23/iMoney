import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelFixedExpenseRequestAction, rejectFixedExpenseRequestAction } from "@/lib/fixed-expenses/actions";
import type { Account, FixedExpenseRequest, Fund } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import { FixedExpenseRequestDecisionForm } from "./fixed-expense-request-decision-form";

const monthLabels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T00:00:00`));
}

export function fixedExpenseRequestStatusLabel(status: FixedExpenseRequest["status"]) {
  const labels: Record<FixedExpenseRequest["status"], string> = {
    ACCEPTED: "Accettata",
    CANCELLED: "Annullata",
    PENDING: "In attesa",
    REJECTED: "Rifiutata"
  };
  return labels[status];
}

function activeMonthsLabel(activeMonths: number[]) {
  return activeMonths
    .slice()
    .sort((a, b) => a - b)
    .map((month) => monthLabels[month - 1])
    .filter(Boolean)
    .join(", ");
}

export function FixedExpenseRequestDetail({
  accounts,
  categoryTree,
  currentUserId,
  funds,
  request
}: Readonly<{
  accounts: Account[];
  categoryTree: CategoryTreeItem[];
  currentUserId: string;
  funds: Fund[];
  request: FixedExpenseRequest;
}>) {
  const isRecipient = request.recipientUserId === currentUserId;
  const isCreator = request.createdByUserId === currentUserId;
  const isPending = request.status === "PENDING";

  return (
    <div className="space-y-4">
      <Link href={`/family?householdId=${request.householdId}`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-foreground">
        Torna alla famiglia
      </Link>
      <article className="rounded-md border border-border bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Spesa ricorrente per conto di</p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal">{request.description}</h1>
          </div>
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{fixedExpenseRequestStatusLabel(request.status)}</span>
        </div>
        <p className="mt-4 text-3xl font-bold text-red-700">-{request.amount}</p>
        <dl className="mt-5 space-y-3 text-sm">
          <div><dt className="font-semibold text-zinc-500">Autore</dt><dd>{request.creatorName}</dd></div>
          <div><dt className="font-semibold text-zinc-500">Destinatario</dt><dd>{request.recipientName}</dd></div>
          <div><dt className="font-semibold text-zinc-500">Inizio</dt><dd>{formatDate(request.startsOn)}</dd></div>
          {request.endsOn && <div><dt className="font-semibold text-zinc-500">Fine</dt><dd>{formatDate(request.endsOn)}</dd></div>}
          <div><dt className="font-semibold text-zinc-500">Giorno del mese</dt><dd>{request.dayOfMonth}</dd></div>
          <div><dt className="font-semibold text-zinc-500">Mesi attivi</dt><dd>{activeMonthsLabel(request.activeMonths)}</dd></div>
          <div><dt className="font-semibold text-zinc-500">Categoria</dt><dd>{request.categoryLabel ?? "Da scegliere in accettazione"}</dd></div>
          <div><dt className="font-semibold text-zinc-500">Conto/fondo</dt><dd>Da scegliere in accettazione</dd></div>
          <div><dt className="font-semibold text-zinc-500">Condivisione</dt><dd>Condivisa con famiglia dopo accettazione</dd></div>
          {request.notes && <div><dt className="font-semibold text-zinc-500">Note</dt><dd className="whitespace-pre-wrap">{request.notes}</dd></div>}
        </dl>
      </article>
      {isRecipient && isPending && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Decisione</h2>
          <FixedExpenseRequestDecisionForm accounts={accounts} categoryTree={categoryTree} funds={funds} request={request} />
          <form action={rejectFixedExpenseRequestAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <Button type="submit" variant="secondary" className="w-full">
              <X aria-hidden className="h-4 w-4" />
              Rifiuta
            </Button>
          </form>
        </section>
      )}
      {isCreator && isPending && (
        <form action={cancelFixedExpenseRequestAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <Button type="submit" variant="secondary" className="w-full">Annulla richiesta</Button>
        </form>
      )}
      {isRecipient && request.acceptedFixedExpenseId && (
        <Link href={`/fixed-expenses/${request.acceptedFixedExpenseId}/edit`} className="flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
          Apri spesa ricorrente creata
        </Link>
      )}
    </div>
  );
}
