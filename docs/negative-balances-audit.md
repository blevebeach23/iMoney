# Liquidità e saldi negativi — 9 novembre 2026

## Esito

Il difetto ipotizzato (esclusione dei saldi bancari negativi) non si riproduce nel codice corrente. `calculateLiquiditySummary` somma con Decimal tutti i saldi bank/cash, conservandone il segno. Anche il forecast usa la somma algebrica. Non ci sono `Math.max(balance, 0)`, filtri sui saldi positivi o azzeramenti dei conti in rosso in questi percorsi.

La formula precedente è già quella richiesta e rimane invariata:

```text
Liquidità netta = Σ saldi banca e contanti, inclusi i negativi
Debito carte = Σ debiti carta positivi
Disponibilità netta = liquidità netta − debito carte
```

Il filtro positivo del debito carta è intenzionale: un credito sulla carta non è denaro liquido e non compensa automaticamente il debito di un'altra carta.

La discrepanza segnalata nei conteggi non è stata riprodotta. Il difetto riscontrato nella presentazione è l'etichetta «Disponibilità attuale», che mostrava la liquidità prima del debito carta, mentre il valore dopo il debito era indicato più sotto. Le etichette sono state rese esplicite: «Liquidità netta attuale», «Disponibilità netta» e «Liquidità netta prevista». Questa correzione elimina l'ambiguità terminologica; non dimostra quale valore fosse visualizzato sul dispositivo al momento della segnalazione.

## Percorsi verificati

- Home: legge tutta la storia del proprietario fino alla maggiore tra oggi e fine mese, applicando cutoff distinti per saldo attuale e forecast. I filtri dei riepiloghi economici non escludono i movimenti condivisi dai saldi personali.
- Saldi: entrate/rimborsi e uscite mantengono i segni contabili; un trasferimento interno sottrae dalla sorgente e aggiunge alla destinazione. Le righe eliminate sono escluse, le future incidono al raggiungimento della loro data.
- Forecast: usa gli stessi saldi, inclusi quelli negativi. Gli eventi dei trasferimenti interni banca/contanti non sono aggiunti come uscite al totale. Gli addebiti carta previsti entrano come trasferimenti una sola volta.
- Cache: il totale Home viene ricostruito dallo storico, non da cached_balance. I servizi di scrittura dei trasferimenti ricostruiscono le cache e invalidano Home, conti, fondi e movimenti.
- Snapshot: non sono usati per calcolare i saldi nella Home corrente.
- Letture remote autorizzate, limitate al profilo già identificato nella chat: le cache coincidono con i saldi ricostruiti; per il trasferimento segnalato risultano una riga attiva e una precedente eliminata. Il confronto a parità degli altri movimenti conferma liquidità invariata. Nessun dato remoto è stato modificato.

## Test

`tests/calculations/liquidity-negative-balances.test.ts` aggiunge 14 casi:

- A: contanti 1.000 e banca −300 = liquidità 700.
- B/C: trasferimenti 300 e 500 verso il conto negativo; saldo totale invariato anche attraversando lo zero.
- D/E: trasferimenti tra banche positive e da banca negativa verso contanti.
- Altri casi: banca positiva verso contanti, due banche negative, banca negativa verso positiva, sorgente che diventa negativa, centesimi esatti.
- F: debito carta sottratto una volta, crediti carta separati e disponibilità netta invariata dal pagamento della carta anche se la banca diventa negativa.
- G: forecast con banca negativa, trasferimento futuro, spesa futura e liquidità totale prevista negativa.
- H: addebito/accredito applicati una volta per estremità; trasferimento eliminato escluso.
- Ricostruzione numerica del caso segnalato, con valori cachedBalance deliberatamente incoerenti per confermare che il calcolo non li usa.

`tests/ui/current-availability.test.ts` verifica il rendering con conto negativo, debito carta, liquidità e disponibilità netta separati.

Suite completa: 376 test superati su 67 file, comprese le regressioni PostgreSQL, ricorrenze e settlement. Typecheck, lint e build locale verificati durante la lavorazione.

## File e limiti

Modifiche applicative limitate a un commento esplicativo in `src/lib/calculations/liquidity.ts` e alle etichette in `src/components/dashboard/current-availability.tsx` e `src/components/dashboard/dashboard-preview.tsx`.

Nessuna formula modificata, nessun errore nei saldi riscontrato nei dati letti, nessuna migration necessaria. Nessuna modifica a categorie, ricorrenze, settlement o migration 044–046. Nessun commit, push o deploy eseguito.

## Rilascio successivo autorizzato

Dopo la verifica locale, il 9 novembre 2026 l'utente ha autorizzato il rilascio congiunto delle etichette e del ciclo carta mensile. La migration 048 e stata applicata al remoto, preservando lo storico degli addebiti. Le limitazioni di pubblicazione descritte sopra si riferiscono alla fase di analisi iniziale.
