import { notFound, redirect } from "next/navigation";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { currentMonthRange } from "@/lib/calculations/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getFunds } from "@/services/funds/fund-service";
import { getMovementsUntil } from "@/services/movements/movement-service";
import { getTransfersUntil } from "@/services/transfers/transfer-service";

export const dynamic = "force-dynamic";

export default async function FundDetailPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const range = currentMonthRange();
  const [accounts, funds, movements, transfers] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getMovementsUntil(supabase, user.id, range.monthEnd),
    getTransfersUntil(supabase, user.id, range.monthEnd)
  ]);
  const fund = funds.find((item) => item.id === params.id);

  if (!fund) {
    notFound();
  }

  const balances = calculateFinancialBalances(accounts, funds, movements, transfers, range.today, range.monthEnd);
  const balance = balances.funds.find((item) => item.id === fund.id)?.balance ?? fund.cachedBalance;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Fondo</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">{fund.name}</h1>
      </header>
      <article className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
        <div>
          <p className="text-sm font-semibold text-zinc-500">Saldo ricostruito</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">EUR {balance}</p>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-zinc-500">Tipo</dt>
            <dd>{fund.type}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-500">Saldo iniziale</dt>
            <dd>EUR {fund.openingBalance}</dd>
          </div>
          {fund.targetAmount && (
            <div>
              <dt className="font-semibold text-zinc-500">Obiettivo</dt>
              <dd>EUR {fund.targetAmount}</dd>
            </div>
          )}
        </dl>
      </article>
    </main>
  );
}
