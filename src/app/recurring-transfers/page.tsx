import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { RecurringTransferList } from "@/components/recurring-transfers/recurring-transfer-list";
import { currentMonthRange } from "@/lib/calculations/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRecurringTransfers } from "@/services/recurring-transfers/recurring-transfer-service";

export const dynamic = "force-dynamic";

export default async function RecurringTransfersPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const recurringTransfers = await getRecurringTransfers(supabase, user.id);
  const range = currentMonthRange();
  const toMonth = new Date(`${range.monthStart}T00:00:00`);
  toMonth.setMonth(toMonth.getMonth() + 11);
  const toMonthStart = `${toMonth.getFullYear()}-${String(toMonth.getMonth() + 1).padStart(2, "0")}-01`;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Trasferimenti ricorrenti</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Ricorrenze</h1>
        </div>
        <Link href="/recurring-transfers/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuovo
        </Link>
      </header>
      <RecurringTransferList recurringTransfers={recurringTransfers} fromMonthStart={range.monthStart} toMonthStart={toMonthStart} />
    </main>
  );
}
