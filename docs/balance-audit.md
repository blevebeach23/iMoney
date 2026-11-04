# Verifica saldi — 4 novembre 2026

Controllo del codice e test locali; nessuna riconciliazione con dati personali remoti e nessun deploy del codice eseguito. Il 4 novembre 2026, su richiesta dell'utente, sono state applicate al database Supabase collegato le migrazioni pendenti 044, 045, 046 e 047.

## Problemi corretti

- Le query di storico completo, mensile e annuale usate dalla Home non erano paginate: il limite di risposta di Supabase poteva troncare movimenti e trasferimenti. Ora leggono pagine di 500 righe con ordinamento deterministico; un errore interrompe il calcolo invece di restituire un saldo parziale.
- Le funzioni pubbliche per i saldi ora escludono autonomamente movimenti e trasferimenti eliminati.
- Il saldo iniziale vale dalla propria data, anche nei saldi dei fondi e nel debito carta. La migration `047_dated_opening_balance_caches.sql` allinea la cache PostgreSQL. Non vengono eliminate o ignorate operazioni storiche anteriori alla data iniziale.
- La ricostruzione della cache TypeScript usa il giorno contabile Europe/Rome invece del giorno UTC.
- Salvataggio e disattivazione di conti/fondi invalidano anche la Home.
- La Home si aggiorna al ritorno in primo piano, al ripristino della connessione e ogni 60 secondi quando visibile e online. Questo e un aggiornamento periodico, non una sottoscrizione istantanea fra dispositivi.

## Regole verificate

- Contanti e banca: saldo iniziale applicabile + entrate + rimborsi - spese + trasferimenti in entrata - trasferimenti in uscita, fino alla data richiesta.
- Debito carta: saldo iniziale applicabile + acquisti - rimborsi - pagamenti; gli acquisti non riducono subito la banca. L'addebito e un trasferimento, senza una seconda spesa.
- Disponibilita: somma di banca e contanti; disponibilita netta: meno i debiti carta positivi. Fondi, conti `other` e crediti carta non aumentano questo totale.
- Fine mese: storia fino all'ultimo giorno selezionato, incluse operazioni future e addebiti automatici carta previsti entro tale data. Il debito carta ancora da pagare nel mese successivo non viene sottratto anticipatamente dal saldo bancario previsto.
- Budget: spese del mese meno rimborsi, incluse le operazioni future, senza trasferimenti.
- I saldi personali includono i movimenti del proprietario anche se condivisi, indipendentemente dai filtri dei riepiloghi economici.

## Verifica riproducibile

`tests/calculations/balance-history.test.ts` verifica letture di 1.201 operazioni, importi decimali esatti, filtri di proprieta e soft deletion e fallimento di una pagina successiva.

`tests/calculations/balances.test.ts` include una riconciliazione con contanti, banca, fondi, carta, rimborsi, movimento condiviso, ricorrenza, prelievo e operazioni future: disponibilita attuale 975,00, netta 875,00, fine mese 1.335,00 e debito carta residuo di fine mese 40,00. Sono dati sintetici di test.

`tests/automation/financial-automation.test.ts` applica tutte le migrazioni a PostgreSQL incorporato e verifica le date dei saldi iniziali nelle cache, oltre ai cicli carta gia coperti.

`tests/ui/balance-refresh.test.ts` verifica aggiornamenti, sospensione in background/offline e rimozione di timer e listener.

## Passaggio successivo

Le migrazioni fino alla 047 sono state applicate al database collegato. Pubblicare il codice, poi riconciliare i saldi con una sessione autenticata reale, verificando saldi iniziali, movimenti importati e pagamenti carta manuali. La verifica locale non prova che i dati inseriti corrispondano al denaro realmente disponibile.
