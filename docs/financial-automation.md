# Ricorrenze, carte e disponibilita

## File principali

- `supabase/migrations/041_recurring_occurrence_lifecycle.sql`: registro privato delle occorrenze, trigger di idempotenza, conversione dei dati precedenti, invalidazione snapshot.
- `supabase/migrations/042_financial_automation.sql`: RPC `sync_financial_automation` transazionale per proprietario.
- `supabase/migrations/043_closed_credit_card_settlements.sql`: mantiene l'allocazione dei cicli chiusi dopo soft deletion, anche nel calcolo dei cicli successivi.
- `src/services/automation/financial-automation-service.ts`: unico ingresso applicativo alla RPC.
- `src/lib/calculations/credit-card-settlements.ts`: cutoff consecutivi, residuo da pagare e forecast per ciclo.
- `src/lib/calculations/liquidity.ts`: disponibilita e flussi di liquidita futuri, con Decimal.
- `src/app/page.tsx`, `src/components/dashboard/current-availability.tsx`, `dashboard-preview.tsx`: Home.
- `src/app/api/cron/financial-automation/route.ts`, `vercel.json`, `middleware.ts`: cron autenticato.

## Occorrenze

Le previsioni rimangono nelle tabelle movements/transfers per riutilizzare budget, famiglia, liste e calcoli esistenti. `recurring_occurrences` conserva tipo, regola, data programmata originale e identificativo della riga, anche dopo cambio data o eliminazione. Assenza dal registro significa mai generata; booked_on nullo significa previsione; booked_on valorizzato significa contabilizzata; cancelled_at registra l'annullamento indipendentemente dalla contabilizzazione.

Il giorno contabile e Europe/Rome. Quando la data e raggiunta, la RPC scollega fixed_expense_id/recurring_transfer_id dalla riga; l'identita originale resta nel registro. Le normali azioni di modifica, eliminazione e duplicazione dei movimenti diventano quindi utilizzabili senza creare percorsi paralleli. Una modifica della madre riguarda solo date strettamente successive a oggi. Le occorrenze contabilizzate, anche cancellate, non possono essere ricreate; le proiezioni future cancellate durante una modifica della madre possono essere sostituite prima della scadenza.

I trigger coprono anche i generatori preesistenti. I generatori espliciti consultano il registro e contano le righe effettivamente inserite. La RPC recupera i periodi mancanti dalla partenza della regola e mantiene un orizzonte mobile di 12 mesi. Le righe preesistenti, incluse eventuali duplicazioni storiche, sono conservate; il registro sceglie un riferimento canonico senza eliminare storia.

## Carte

Riutilizzati statement_closing_day e payment_day: nessun nuovo campo di configurazione. Il ciclo va dal giorno dopo la chiusura precedente alla chiusura inclusa, con adattamento ai mesi brevi. Se il giorno nominale di pagamento precede quello di chiusura, il pagamento e nel mese successivo; altrimenti e nello stesso mese, mantenendo la convenzione esistente.

Ogni addebito e un trasferimento conto corrente -> carta. Il residuo considera saldo iniziale dalla sua data, acquisti/rimborsi fino al cutoff e trasferimenti effettivi gia registrati. Per il recupero di cicli scaduti sono inclusi anche pagamenti tardivi fino a oggi, evitando di ripetere un pagamento manuale gia avvenuto; per i cicli futuri si includono i trasferimenti noti entro la data di pagamento. Crediti e pagamenti manuali riducono il residuo; nella previsione i pagamenti dei cicli precedenti sono allocati una sola volta. I cicli gia registrati sono riconosciuti dalla chiusura anche quando un vecchio addebito aveva inizio ciclo al primo del mese. Importi e righe storiche non vengono riscritti.

La RPC recupera tutti i cicli scaduti mancanti in ordine, serializzando per proprietario. Un trigger protegge anche gli inserimenti concorrenti esterni alla RPC e conserva l'identita di un addebito cancellato. Un addebito cancellato non viene rigenerato per lo stesso ciclo; il suo effetto finanziario viene annullato e il debito resta ricostruibile dalla storia. Il forecast legge separatamente i metadati dei soli settlement del proprietario (anche eliminati), attraverso getCreditCardSettlementHistoryForUser, con paginazione per ID. La stessa identita proprietario + carta + chiusura ciclo e usata da hasCreditCardSettlement, RPC e trigger DB. Le normali query dei trasferimenti restano filtrate su deleted_at IS NULL.

La migration 043 mantiene anche l'allocazione dell'importo del settlement annullato ai cicli gia chiusi: lo sottrae solo dal residuo da allocare ai futuri addebiti, senza reintrodurlo nei saldi reali. Il calcolo TypeScript applica la stessa sottrazione usando lo storico mirato. Un settlement attivo non viene sottratto una seconda volta attraverso lo storico. Esempio: settlement di 800 eliminato e nuovi acquisti per 170; saldo reale della carta = 970, ciclo precedente ancora chiuso, prossimo addebito = 170. Questa distinzione e intenzionale: eliminare il trasferimento annulla il pagamento contabile ma non riapre il ciclo e non ne ripropone l'importo automaticamente. Non viene creato un movimento di rettifica nascosto.

Le configurazioni con chiusura e pagamento nello stesso giorno usano granularita giornaliera: tutti gli acquisti di quella data appartengono al ciclo. L'app non ha orari intragiornalieri di cutoff.

## Home

Liquidita = conti bank + cash. Fondi, carte e conti other sono esclusi dal totale. Disponibilita netta = liquidita meno debiti carta positivi; crediti carta non sono denaro liquido. Il forecast include movimenti futuri sui conti liquidi e trasferimenti che entrano/escono dalla liquidita. Gli acquisti carta incidono economicamente alla data d'acquisto; il loro effetto sulla liquidita appare una sola volta nell'addebito. I trasferimenti interni tra conti liquidi hanno effetto totale zero.

Cache ricostruite una volta a fine sincronizzazione, da saldi iniziali e righe contabili attive. Le modifiche contabili invalidano gli snapshot successivi tramite invalidated_at. Attualmente i servizi ricostruiscono dalla storia; eventuali futuri lettori di snapshot devono richiedere invalidated_at IS NULL.

## Attivazione e verifica

1. Applicare in ordine 041, 042 e 043 al database di staging prima del deploy del codice. Nessuna migration e stata applicata al database remoto da questa modifica.
2. Verificare i saldi iniziali delle carte e la relativa data, oltre ai giorni di chiusura/addebito: sono dati finanziari usati per determinare il residuo. Gli addebiti storici manuali devono essere rappresentati una sola volta come trasferimenti.
3. Deploy con SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET configurati server-side. Il cron finanziario e giornaliero alle 00:05 UTC; la data contabile usa Europe/Rome. Le pagine contabili recuperano le scadenze anche se il cron non e ancora passato o ha fallito. Il cron promemoria preesistente e invariato.
4. Verificare da due sessioni reali contemporanee lo stesso addebito e la stessa generazione. I test PostgreSQL locali coprono doppia esecuzione e vincoli, ma PGlite serializza le richieste su una sola connessione.
5. Controllare su iPhone disponibilita, carta residua, prossimo addebito e saldo previsto, incluso un mese storico selezionato. Verificare anche un familiare senza accesso alle righe personali.

I test in tests/automation eseguono tutte le migration su PostgreSQL incorporato (PGlite), con auth locale simulata; non usano credenziali o dati remoti. Il progetto aveva gia un test categorie non allineato al servizio: tests/categories/category-service.test.ts usa un mock di conteggio mentre il servizio interroga gli identificativi. Questi file sono rimasti invariati.
