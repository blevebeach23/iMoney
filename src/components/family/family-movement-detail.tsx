import Link from "next/link";
import { Share2 } from "lucide-react";
import type { MovementListItem } from "@/services/movements/movement-service";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T00:00:00`));
}

function movementSign(type: MovementListItem["type"]) {
  return type === "expense" ? "-" : "+";
}

function typeLabel(type: MovementListItem["type"]) {
  if (type === "reimbursement") {
    return "Rimborso";
  }

  return type === "income" ? "Entrata" : "Spesa";
}

export function FamilyMovementDetail({ movement }: Readonly<{ movement: MovementListItem }>) {
  return (
    <div className="space-y-4">
      <Link href={`/family?householdId=${movement.householdId}`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-foreground">
        Torna alla famiglia
      </Link>

      <article className="rounded-md border border-border bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-500">{formatDate(movement.occurredOn)}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal">{movement.description}</h1>
            <p className="mt-2 text-sm text-zinc-600">Inserito da {movement.authorName ?? movement.ownerUserId}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
            <Share2 aria-hidden className="h-3 w-3" />
            Condiviso
          </span>
        </div>

        <p className={`mt-4 text-3xl font-bold ${movement.type === "expense" ? "text-red-700" : "text-emerald-700"}`}>
          {movementSign(movement.type)}
          {movement.amount}
        </p>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-zinc-500">Tipo</dt>
            <dd>{typeLabel(movement.type)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Categoria</dt>
            <dd>
              {movement.macroCategoryName && `${movement.macroCategoryName} / `}
              {movement.categoryName}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Conto / Fondo</dt>
            <dd>{movement.accountName ?? movement.fundName ?? "Non visibile"}</dd>
          </div>
          {movement.notes && (
            <div>
              <dt className="font-semibold text-zinc-500">Note</dt>
              <dd className="whitespace-pre-wrap">{movement.notes}</dd>
            </div>
          )}
        </dl>
      </article>
    </div>
  );
}
