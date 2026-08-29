"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTransferAction } from "@/lib/transfers/actions";

export function DeleteTransferForm({ transferId }: Readonly<{ transferId: string }>) {
  return (
    <form action={deleteTransferAction}>
      <input type="hidden" name="id" value={transferId} />
      <Button type="submit" variant="secondary" className="w-full text-red-700">
        <Trash2 aria-hidden className="h-4 w-4" />
        Elimina trasferimento
      </Button>
    </form>
  );
}
