import type { LiquiditySummary } from "@/lib/calculations/liquidity";
import type { CreditCardDue } from "@/lib/calculations/balances";
import type { CreditCardForecast } from "@/lib/calculations/credit-card-settlements";
export function CurrentAvailability({ summary, cards, forecasts }: {
  summary: LiquiditySummary;
  cards: CreditCardDue[];
  forecasts: CreditCardForecast[];
}) {
  return (
    <section aria-labelledby="availability-title" className="mt-6 rounded-md border border-border bg-white p-4 shadow-panel">
      <h2 id="availability-title" className="text-lg font-semibold">Disponibilità attuale</h2>
      <p className="mt-2 text-3xl font-bold tabular-nums">EUR {summary.liquidity}</p>
      <p className="mt-1 text-sm text-zinc-600">Liquidità su conti correnti e contanti, aggiornata a oggi.</p>
      <dl className="mt-4 space-y-3 text-sm">
        {[...summary.bank.map((row) => ({ ...row, label: `Conto corrente ${row.name}` })), ...summary.cash.map((row) => ({ ...row, label: `Contanti ${row.name}` }))].map((row) => (
          <div key={row.id} className="flex justify-between gap-3"><dt className="min-w-0 break-words">{row.label}</dt><dd className="shrink-0 font-semibold tabular-nums">EUR {row.balance}</dd></div>
        ))}
      </dl>
      {cards.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="font-semibold">Carte di credito</h3>
          <dl className="mt-3 space-y-3 text-sm">
            {cards.map((card) => {
              const next = forecasts.find((forecast) => forecast.accountId === card.accountId);
              return <div key={card.accountId}>
                <div className="flex justify-between gap-3"><dt>{card.name} · debito residuo</dt><dd className="shrink-0 font-semibold tabular-nums">EUR {card.due}</dd></div>
                {next && <p className="mt-1 text-xs text-zinc-600">Prossimo addebito: {new Intl.DateTimeFormat("it-IT").format(new Date(`${next.paymentOn}T00:00:00`))} · EUR {next.amountDue}</p>}
              </div>;
            })}
            <div className="flex justify-between gap-3 border-t border-border pt-3"><dt>Disponibilità al netto della carta</dt><dd className="font-bold tabular-nums">EUR {summary.netLiquidity}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-zinc-600">Liquidità meno i debiti carta positivi. Eventuali crediti sulle carte non aumentano il denaro disponibile.</p>
        </div>
      )}
    </section>
  );
}
