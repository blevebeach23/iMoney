import Link from "next/link";
import { Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { duplicateMovementAction } from "@/lib/movements/actions";
import type { MovementListItem } from "@/services/movements/movement-service";
import { DeleteMovementForm } from "./delete-movement-form";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T00:00:00`));
}

export function MovementDetail({ movement, returnTo = "/movements" }: Readonly<{ movement: MovementListItem; returnTo?: string }>) {
  return (
    <div className="space-y-4">
      <article className="rounded-md border border-border bg-white p-4">
        <p className="text-sm font-semibold text-zinc-500">{formatDate(movement.occurredOn)}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-normal">{movement.description}</h1>
        <p className={`mt-3 text-3xl font-bold ${movement.type === "expense" ? "text-red-700" : "text-emerald-700"}`}>
          {movement.type === "expense" ? "-" : "+"}
          {movement.amount}
        </p>
        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-zinc-500">Tipo</dt>
            <dd>{movement.type === "reimbursement" ? "Rimborso" : movement.type === "income" ? "Entrata" : "Spesa"}</dd>
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
            <dd>{movement.accountName ?? movement.fundName}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Condivisione</dt>
            <dd>{movement.isSharedWithHousehold ? "Condiviso con famiglia" : "Personale"}</dd>
          </div>
          {movement.type === "reimbursement" && movement.reimbursementForMovementId && (
            <div>
              <dt className="font-semibold text-zinc-500">Movimento rimborsato</dt>
              <dd>
                <Link href={`/movements/${movement.reimbursementForMovementId}`} className="font-semibold text-primary">
                  Apri movimento originale
                </Link>
              </dd>
            </div>
          )}
          {movement.notes && (
            <div>
              <dt className="font-semibold text-zinc-500">Note</dt>
              <dd className="whitespace-pre-wrap">{movement.notes}</dd>
            </div>
          )}
          {movement.fixedExpenseId && (
            <div>
              <dt className="font-semibold text-zinc-500">Ricorrenza</dt>
              <dd>
                <Link href={`/fixed-expenses/${movement.fixedExpenseId}/edit`} className="font-semibold text-primary">
                  Apri ricorrenza madre
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </article>

      {movement.fixedExpenseId ? (
        <Link href={`/fixed-expenses/${movement.fixedExpenseId}/edit`} className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Pencil aria-hidden className="h-4 w-4" />
          Modifica ricorrenza
        </Link>
      ) : (
        <>
          <Link href={`/movements/${movement.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
            <Pencil aria-hidden className="h-4 w-4" />
            Modifica
          </Link>
          <form action={duplicateMovementAction}>
            <input type="hidden" name="id" value={movement.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button type="submit" variant="secondary" className="w-full">
              <Copy aria-hidden className="h-4 w-4" />
              Duplica
            </Button>
          </form>
          <DeleteMovementForm movementId={movement.id} returnTo={returnTo} />
        </>
      )}
    </div>
  );
}
