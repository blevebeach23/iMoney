"use client";

import { DeleteConfirmationForm } from "@/components/ui/delete-confirmation-form";
import { deleteMovementAction } from "@/lib/movements/actions";

export function DeleteMovementForm({ movementId, returnTo = "/movements" }: Readonly<{ movementId: string; returnTo?: string }>) {
  return (
    <DeleteConfirmationForm action={deleteMovementAction} triggerLabel="Elimina movimento"
      title="Eliminare questo movimento?"
      description="Il movimento verrà eliminato definitivamente dalla timeline e dai calcoli dei saldi.">
      <input type="hidden" name="id" value={movementId} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </DeleteConfirmationForm>
  );
}
