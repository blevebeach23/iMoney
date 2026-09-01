import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelMovementRequestAction, rejectMovementRequestAction } from "@/lib/movements/actions";
import type { Account, Fund, MovementRequest } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import { MovementRequestDecisionForm } from "./movement-request-decision-form";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T00:00:00`));
}

export function movementRequestStatusLabel(status: MovementRequest["status"]) {
  const labels: Record<MovementRequest["status"], string> = {
    ACCEPTED: "Accettato",
    CANCELLED: "Annullato",
    PENDING: "In attesa",
    REJECTED: "Rifiutato"
  };

  return labels[status];
}

function movementTypeLabel(type: MovementRequest["movementType"]) {
  if (type === "reimbursement") {
    return "Rimborso";
  }

  return type === "income" ? "Entrata" : "Spesa";
}

export function MovementRequestDetail({
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
  request: MovementRequest;
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
            <p className="text-sm font-semibold text-primary">Movimento per conto di</p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal">{request.description}</h1>
          </div>
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{movementRequestStatusLabel(request.status)}</span>
        </div>

        <p className={`mt-4 text-3xl font-bold ${request.movementType === "expense" ? "text-red-700" : "text-emerald-700"}`}>
          {request.movementType === "expense" ? "-" : "+"}
          {request.amount}
        </p>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-zinc-500">Autore</dt>
            <dd>{request.creatorName}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Destinatario</dt>
            <dd>{request.recipientName}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Data</dt>
            <dd>{formatDate(request.movementDate)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Tipo</dt>
            <dd>{movementTypeLabel(request.movementType)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Categoria proposta</dt>
            <dd>{request.categoryLabel ?? "Da scegliere in accettazione"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Condivisione</dt>
            <dd>{request.sharedWithFamily ? "Condiviso con famiglia dopo accettazione" : "Personale dopo accettazione"}</dd>
          </div>
          {request.notes && (
            <div>
              <dt className="font-semibold text-zinc-500">Note</dt>
              <dd className="whitespace-pre-wrap">{request.notes}</dd>
            </div>
          )}
        </dl>
      </article>

      {isRecipient && isPending && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Decisione</h2>
          <MovementRequestDecisionForm accounts={accounts} categoryTree={categoryTree} funds={funds} request={request} />
          <form action={rejectMovementRequestAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <Button type="submit" variant="secondary" className="w-full">
              <X aria-hidden className="h-4 w-4" />
              Rifiuta
            </Button>
          </form>
        </section>
      )}

      {isCreator && isPending && (
        <form action={cancelMovementRequestAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <Button type="submit" variant="secondary" className="w-full">
            Annulla richiesta
          </Button>
        </form>
      )}

      {request.acceptedMovementId && (
        <Link href={`/family/movements/${request.acceptedMovementId}`} className="flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
          Apri movimento creato
        </Link>
      )}
    </div>
  );
}
