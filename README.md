# iMoney

Fondazione fase 1 per una PWA Next.js/TypeScript dedicata al rendiconto personale e familiare.

## Setup

1. Copiare `.env.example` in `.env.local`.
2. Valorizzare `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Eseguire `pnpm install`.
4. Eseguire `pnpm dev`.

## Validazione

- `pnpm test`: test delle regole di calcolo finanziario.
- `pnpm typecheck`: controllo TypeScript strict.
- `pnpm lint`: lint Next.js.
- `pnpm build`: build di produzione Next.js.

## Supabase locale

Prerequisito: Docker Desktop avviato.

- `pnpm supabase start`: avvia lo stack Supabase locale.
- `pnpm supabase db reset`: ricrea il database locale e applica tutte le migration.
- `pnpm supabase db query --file supabase/tests/rls_foundation.sql`: esegue il test RLS se la CLI supporta file multi-statement.

Se `supabase db query` non supporta file SQL multi-statement nella versione installata, eseguire il test tramite `psql` nel container locale:

```powershell
docker cp supabase\tests\rls_foundation.sql supabase_db_iMoney:/tmp/rls_foundation.sql
docker exec supabase_db_iMoney psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/rls_foundation.sql
```

## Fase 1 inclusa

- Scaffold Next.js App Router con TypeScript e Tailwind.
- Manifest PWA installabile.
- Tipi dominio per movimenti, trasferimenti, conti, fondi, categorie e riepiloghi.
- Calcoli puri per riepilogo mensile e budget.
- Test sulle regole critiche: rimborsi, soft delete, budget mensile.
- Service layer iniziale per movimenti e conti.
- Migration Supabase separate con tabelle principali, vincoli contabili e RLS.
- Dashboard mobile-first con navigazione concettuale: Home, Family, Add, Statistics, More.
