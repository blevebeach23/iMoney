"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteMovementAction } from "@/lib/movements/actions";

export function DeleteMovementForm({ movementId }: Readonly<{ movementId: string }>) {
  return (
    <form action={deleteMovementAction}>
      <input type="hidden" name="id" value={movementId} />
      <Button
        type="submit"
        variant="secondary"
        className="w-full text-red-700"
        onClick={(event) => {
          if (!window.confirm("Eliminare questo movimento?")) {
            event.preventDefault();
          }
        }}
      >
        <Trash2 aria-hidden className="h-4 w-4" />
        Elimina movimento
      </Button>
    </form>
  );
}
