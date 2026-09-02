"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTransferAction } from "@/lib/transfers/actions";

export function DeleteTransferForm({ returnTo = "/movements", transferId }: Readonly<{ returnTo?: string; transferId: string }>) {
  return (
    <form action={deleteTransferAction}>
      <input type="hidden" name="id" value={transferId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" variant="secondary" className="w-full text-red-700">
        <Trash2 aria-hidden className="h-4 w-4" />
        Elimina trasferimento
      </Button>
    </form>
  );
}
