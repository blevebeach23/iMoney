"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondToHouseholdInviteAction } from "@/lib/households/actions";

export function InviteResponse({ token }: Readonly<{ token: string }>) {
  return (
    <div className="space-y-3">
      <form action={respondToHouseholdInviteAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="accept" value="true" />
        <Button type="submit" className="w-full">
          <Check aria-hidden className="h-4 w-4" />
          Accetta invito
        </Button>
      </form>
      <form action={respondToHouseholdInviteAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="accept" value="false" />
        <Button type="submit" variant="secondary" className="w-full">
          <X aria-hidden className="h-4 w-4" />
          Rifiuta invito
        </Button>
      </form>
    </div>
  );
}
