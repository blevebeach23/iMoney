# iMoney

PWA Next.js/TypeScript per rendiconto personale e familiare, con Supabase Auth e PostgreSQL/RLS.

## Setup

1. Eseguire `pnpm install`.
2. Avviare Supabase locale con `pnpm supabase start`.
3. Copiare `.env.example` in `.env.local`.
4. Valorizzare `NEXT_PUBLIC_SUPABASE_ANON_KEY` con la chiave anon locale mostrata da `pnpm supabase start` o `pnpm supabase status`.
5. Verificare che `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` e `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
6. Eseguire `pnpm dev`.

## Validazione

- `pnpm test`: test delle regole di calcolo finanziario.
- `pnpm typecheck`: controllo TypeScript strict.
- `pnpm lint`: lint Next.js.
- `pnpm build`: build di produzione Next.js.

## Supabase locale

Prerequisito: Docker Desktop avviato.

- `pnpm supabase start`: avvia lo stack Supabase locale.
- `pnpm supabase db reset`: ricrea il database locale e applica tutte le migration.
- `pnpm supabase status`: mostra URL, Studio URL e chiavi locali.
- `pnpm supabase db query --file supabase/tests/rls_foundation.sql`: esegue il test RLS se la CLI supporta file multi-statement.

Se `supabase db query` non supporta file SQL multi-statement nella versione installata, eseguire il test tramite `psql` nel container locale:

```powershell
docker cp supabase\tests\rls_foundation.sql supabase_db_iMoney:/tmp/rls_foundation.sql
docker exec supabase_db_iMoney psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rls_foundation.sql
```

## Auth e onboarding

Route implementate nella fase 2:

- `/register`: registrazione email/password con validazione Zod e creazione profilo tramite trigger Supabase.
- `/login`: login Supabase e redirect all'area privata.
- `/forgot-password`: richiesta reset password.
- `/auth/reset-password`: impostazione nuova password dopo link Supabase.
- `/auth/confirm`: callback per conferma email/sessione.
- `/onboarding`: configurazione iniziale profilo, conti opzionali e categorie personali iniziali.
- `/settings/profile`: modifica nome, username e telefono.

Le route applicative private usano sessione Supabase server-side e middleware di refresh sessione. L'email resta gestita da Supabase Auth e viene visualizzata dal profilo utente senza duplicarla nelle tabelle applicative.

## Anagrafiche finanziarie

Route implementate nella fase 3:

- `/accounts`: elenco, creazione, modifica e disattivazione dei conti personali.
- `/funds`: elenco, creazione, modifica e disattivazione dei fondi personali con target opzionale.
- `/settings/categories`: gestione gerarchica di macro-categorie personali e categorie figlie.
- `/settings`: accesso alle anagrafiche e al profilo dalla voce More.

Le anagrafiche usano soft delete dove serve mantenere compatibilita con dati storici. I saldi visualizzati sono `cached_balance` quando presente, altrimenti il saldo iniziale; la ricostruzione completa da movimenti resta fuori dalla fase 3.

## Fondazione inclusa

- Scaffold Next.js App Router con TypeScript e Tailwind.
- Manifest PWA installabile.
- Tipi dominio per movimenti, trasferimenti, conti, fondi, categorie e riepiloghi.
- Calcoli puri per riepilogo mensile e budget.
- Test sulle regole critiche: rimborsi, soft delete, budget mensile.
- Service layer iniziale per movimenti e conti.
- Migration Supabase separate con tabelle principali, vincoli contabili e RLS.
- Dashboard mobile-first con navigazione concettuale: Home, Family, Add, Statistics, More.
- Supabase Auth reale con client browser, client server e middleware.
- Onboarding iniziale con stato `profiles.onboarding_completed`.
- Gestione anagrafiche finanziarie personali per conti, fondi e categorie.
