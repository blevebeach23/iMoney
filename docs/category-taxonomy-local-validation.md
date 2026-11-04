# Tassonomie personali e Family — verifica locale

Data: 22 ottobre 2026. Nessun commit, push o deploy. Nessuna migration applicata al remoto.

## Architettura e comportamento

- Riutilizzate `macro_categories` e `categories`: ownership esclusiva già presente sulle macro (`owner_user_id` XOR `household_id`), ereditata dalle categorie. Nessuna nuova tabella persistente o colonna duplicata sui movimenti.
- Personale: solo categorie dell'utente. Family: solo categorie dello specifico household. Nessun mapping dinamico o duplicazione dei movimenti.
- Default: 14 macro e 50 categorie esattamente come richiesto. Onboarding personale e nuovi household inizializzano tassonomie indipendenti. Gli utenti esistenti possono aggiungere i default mancanti senza perdere le categorie originali.
- Home, timeline e statistiche personali partono dai soli movimenti non condivisi. Il pulsante include soltanto i condivisi del proprietario; le righe degli altri membri rimangono in Family.
- I saldi e il forecast finanziario continuano a usare l'intera storia contabile del proprietario. Il budget personale usa sempre i soli movimenti non condivisi. Il budget Family usa tutti i movimenti condivisi dello specifico household.
- Cambio Personale/Family: selezione categoria azzerata, nuova scelta esplicita. Anche modifica multipla, ricorrenze, richieste e CSV rispettano il contesto.
- Family: mantenuti i permessi preesistenti. Owner/admin gestiscono le categorie; membri attivi leggono e utilizzano la tassonomia condivisa.

## Migration locali

- **044_category_taxonomies.sql**: catalogo default SQL, seed interno non esposto alle API, RPC personale autenticata, trigger seed household, popolamento degli household esistenti e migrazione una tantum dei riferimenti. Convergenza esclusivamente su household + macro + categoria confrontati con `lower(trim(...))`. Conservazione delle categorie personali originali e delle categorie custom. Collisioni tra budget attivi interrompono la transazione, senza fondere importi.
- **045_category_scope_integrity.sql**: RLS categorie, helper di accesso coerente con il contesto, ownership immutabile, cinque trigger di integrità su movimenti/ricorrenze/richieste/budget. RPC `get_category_deletion_info` con controlli `EXISTS` completi, inclusi riferimenti storici e richieste, e protezioni SQL dalla cancellazione di categorie referenziate.
- **046_category_scope_history_compatibility.sql**: consente alle ricorrenze esistenti di continuare a usare categorie archiviate dello stesso contesto, preservando la sincronizzazione finanziaria; helper interno non invocabile direttamente dalle API.
- Riferimenti aggiornati su `movements`, `fixed_expenses`, `movement_requests`, `fixed_expense_requests`, `budgets`; i trigger utente sono sospesi nella sola transazione 044 per preservare timestamp, lifecycle e cache. Un errore annulla integralmente la transazione.
- Migration 001–043 invariate. Nessuna nuova dipendenza.

## Dati e preservazione dello storico

Il database locale prima delle migration conteneva **1 categoria personale e 0 household**:

| Esito della migrazione dei dati locali preesistenti | Numero |
| --- | ---: |
| Categorie personali originali conservate | 1 |
| Categorie personali da ricollegare | 0 |
| Categorie Family create dallo storico | 0 |
| Movimenti storici ricollegati | 0 |
| Custom Family migrate dallo storico | 0 |

Snapshot prima/dopo: campi contabili preservati; categorie personali preservate. Backup locale precedente alla modifica in `tmp/category-refactor/before.dump` (ignorato da Git). Nessun reset.

Test PostgreSQL separati con storico popolato: tre movimenti condivisi ricollegati; due categorie personali omonime convergono su una categoria Family default; `CASA / Casa Tiggiano` viene conservata come custom Family. Rimangono inalterati tutti i campi diversi dai riferimenti di categoria, anche per ricorrenze, richieste e budget. Nessuna ambiguità riscontrata nei dati locali/test; non è stato analizzato lo storico contabile di produzione in questa fase.

Successivamente sono stati aggiunti esclusivamente per il browser tre utenti sintetici, due household, tre tassonomie personali da 50 categorie e due Family da 50 categorie, più due categorie custom di prova. Questi dati di sviluppo non rappresentano migrazioni dei dati originari.

## Verifiche

- Suite completa: **351/351 test, 63/63 file**; 22 nuovi test dedicati tra DB/RLS, selettori e import CSV, copertura dei casi A–O.
- Test storico category-service verde: il mock obsoleto non rappresentava la query aggregata dei riferimenti ai budget. Le aspettative non sono state indebolite; ora il servizio usa una RPC con controlli completi e il mock rappresenta quel contratto. Verificato anche il blocco reale nel database.
- Typecheck, lint e build: superati. I worker Next/esbuild richiedono esecuzione fuori dal sandbox Windows; nessuna modifica di dipendenze o configurazioni per aggirare il vincolo.
- PostgreSQL locale: migration **046**, `recurring_occurrences`, `financial_today()`, `sync_financial_automation(uuid)` presenti; cinque trigger di scope; zero movimenti con categoria di contesto errato.
- PostgREST locale: HTTP 200 per nuova RPC di protezione categorie e per `sync_financial_automation(p_owner)` con utente sintetico; sincronizzazione senza nuove contabilizzazioni.
- Storico remoto letto con `supabase migration list --linked`: **043**, migration 044–046 assenti come previsto. Nessuna applicazione o modifica dello schema/dati applicativi remoti.
- Browser sulla build locale: login, Home privata/estesa, azzeramento categoria in entrambe le direzioni, creazione e modifica movimento, creazione macro/categoria Family e categoria personale, riuso della categoria Family da B e invisibilità della categoria personale A, statistiche personali/Family e budget Family. Nessun errore nella console browser durante questi flussi.
- Esempi sintetici osservati: Home A 5 personale, 15 con propri condivisi; Family 33 aggregati in un'unica categoria dopo la modifica di prova; B personale 0 e 22 includendo i propri condivisi, contro 35 totali Family dopo il movimento custom di B. Budget Family Supermercato 33/100.
- Ricorrenze, soft deletion senza rigenerazione e settlement/forecast già chiusi: suite di regressione verde; nessuna modifica agli algoritmi finanziari o alle migration 041–043.

## Limiti e passaggio successivo

- Prima della produzione occorre un controllo in sola lettura delle collisioni di budget nello storico reale, backup e autorizzazione esplicita. Le migration sono transazionali e interrompono la migrazione in caso di convergenze ambigue.
- Il nuovo codice richiede le RPC e i vincoli 044–046: al futuro rilascio applicare le migration prima di pubblicare il codice.
- Il server locale segnala che `SUPABASE_SERVICE_ROLE_KEY` non è configurata per le notifiche push. I flussi categoria e contabili verificati funzionano; le notifiche push locali non sono state validate.
- Non sono necessari nuovi secret o configurazioni Vercel per questa rifattorizzazione.

## Inventario completo dei file

Le righe seguenti distinguono file modificati (`M`) e nuovi (`?`). I file temporanei e i dati sintetici in `tmp/` sono ignorati da Git.

```text
M src/app/archive/[year]/page.tsx
M src/app/budgets/budget-month-content.tsx
M src/app/family/fixed-expense-requests/[id]/page.tsx
M src/app/family/movement-requests/[id]/page.tsx
M src/app/family/page.tsx
M src/app/family/settings/page.tsx
M src/app/fixed-expenses/[id]/edit/page.tsx
M src/app/fixed-expenses/new/page.tsx
M src/app/import/page.tsx
M src/app/months/[month]/page.tsx
M src/app/movements/[id]/edit/page.tsx
M src/app/movements/new/page.tsx
M src/app/movements/page.tsx
M src/app/page.tsx
M src/app/settings/categories/[id]/page.tsx
M src/app/settings/categories/page.tsx
M src/app/statistics/page.tsx
M src/components/dashboard/dashboard-preview.tsx
M src/components/family/family-settings.tsx
M src/components/fixed-expenses/fixed-expense-form.tsx
M src/components/import/import-workflow.tsx
M src/components/master-data/category-manager.tsx
M src/components/movements/movement-form.tsx
M src/components/movements/movement-list.tsx
M src/components/statistics/statistics-dashboard.tsx
M src/lib/imports/mapping.ts
M src/lib/imports/validation.ts
M src/lib/master-data/actions.ts
M src/lib/master-data/validation.ts
M src/lib/movements/actions.ts
M src/lib/onboarding/actions.ts
M src/lib/onboarding/initial-data.ts
M src/services/categories/category-service.ts
M src/services/imports/import-service.ts
M src/services/movements/movement-service.ts
M tests/automation/financial-automation.test.ts
M tests/categories/category-service.test.ts
M tests/imports/import-service.test.ts
? docs/category-taxonomy-local-validation.md
? src/lib/categories/default-taxonomy.ts
? src/lib/categories/scope.ts
? src/lib/movements/view-scope.ts
? supabase/migrations/044_category_taxonomies.sql
? supabase/migrations/045_category_scope_integrity.sql
? supabase/migrations/046_category_scope_history_compatibility.sql
? tests/categories/category-scope.test.ts
? tests/categories/category-scopes-db.test.ts
? tests/imports/category-scopes.test.ts
```
