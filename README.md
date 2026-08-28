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

## Fase 1 inclusa

- Scaffold Next.js App Router con TypeScript e Tailwind.
- Manifest PWA installabile.
- Tipi dominio per movimenti, trasferimenti, conti, fondi, categorie e riepiloghi.
- Calcoli puri per riepilogo mensile e budget.
- Test sulle regole critiche: rimborsi, soft delete, budget mensile.
- Service layer iniziale per movimenti e conti.
- Migrazione Supabase iniziale con tabelle principali, vincoli contabili e RLS base.
- Dashboard mobile-first con navigazione concettuale: Home, Family, Add, Statistics, More.
