import { ArrowRightLeft, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import type { TransferListItem } from "@/services/transfers/transfer-service";
import { DeleteTransferForm } from "./delete-transfer-form";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${value}T00:00:00`));
}

export function TransferDetail({ readOnly = false, returnTo = "/movements", transfer }: Readonly<{ readOnly?: boolean; returnTo?: string; transfer: TransferListItem }>) {
  return (
    <div className="space-y-4">
      <article className="rounded-md border border-border bg-white p-4">
        <p className="text-sm font-semibold text-zinc-500">{formatDate(transfer.occurredOn)}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-normal">{transfer.description || "Trasferimento"}</h1>
        <p className="mt-3 text-3xl font-bold tabular-nums text-primary">EUR {transfer.amount}</p>
        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-zinc-500">Tipo</dt>
            <dd className="inline-flex items-center gap-2">
              <ArrowRightLeft aria-hidden className="h-4 w-4" />
              Trasferimento
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Origine</dt>
            <dd>{transfer.fromName}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Destinazione</dt>
            <dd>{transfer.toName}</dd>
          </div>
          {transfer.isSharedWithHousehold && (
            <div>
              <dt className="font-semibold text-zinc-500">Condivisione</dt>
              <dd className="inline-flex items-center gap-2">
                <Share2 aria-hidden className="h-4 w-4" />
                Famiglia
              </dd>
            </div>
          )}
        </dl>
      </article>
      {!readOnly && (
        <>
          <Link href={`/transfers/${transfer.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
            <Pencil aria-hidden className="h-4 w-4" />
            Modifica
          </Link>
          <DeleteTransferForm transferId={transfer.id} returnTo={returnTo} />
        </>
      )}
    </div>
  );
}
