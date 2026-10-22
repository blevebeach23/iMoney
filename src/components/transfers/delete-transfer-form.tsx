"use client";

import { DeleteConfirmationForm } from "@/components/ui/delete-confirmation-form";
import { deleteTransferAction } from "@/lib/transfers/actions";

export function DeleteTransferForm({ returnTo = "/movements", transferId }: Readonly<{ returnTo?: string; transferId: string }>) {
  return (
    <DeleteConfirmationForm action={deleteTransferAction} triggerLabel="Elimina trasferimento"
      title="Eliminare questo trasferimento?"
      description="Il trasferimento verrà eliminato definitivamente dalla timeline e dai calcoli dei saldi.">
      <input type="hidden" name="id" value={transferId} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </DeleteConfirmationForm>
  );
}
