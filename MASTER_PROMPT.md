# APP RENDICONTO — STACK TECNOLOGICO E ARCHITETTURA V2.0

## 1. STACK CONSIGLIATO

### Frontend
**Next.js + TypeScript**

Motivi:

- ottimo supporto per applicazioni web responsive;
- facile realizzazione di una PWA;
- struttura ordinata per pagine e componenti;
- ottima integrazione con Supabase;
- adatto allo sviluppo assistito con Codex;
- possibilità di utilizzare la stessa applicazione da iPhone, PC e tablet.

### UI
**Tailwind CSS**

Per costruire rapidamente:

- dashboard;
- card;
- menu;
- moduli;
- barre budget;
- visualizzazione mobile.

Aggiungerei una libreria componenti come:

**shadcn/ui**

per:

- dialog;
- select;
- calendar;
- checkbox;
- form;
- sheet;
- menu;
- toast;
- alert.

---

# 2. DATABASE

Utilizzerei:

**PostgreSQL tramite Supabase**

Non SQLite.

SQLite sarebbe perfetto per un'app totalmente locale, ma con:

- due utenti;
- bilancio familiare;
- dati condivisi;
- notifiche;
- login;
- sincronizzazione;

serve un database centrale.

Supabase utilizza PostgreSQL e integra direttamente autenticazione e controllo degli accessi.

---

# 3. ARCHITETTURA GENERALE

iPhone Vito
        ↓
      PWA
        ↓
     Next.js
        ↓
Supabase Auth
        ↓
PostgreSQL
        ↑
     Next.js
        ↑
      PWA
        ↑
iPhone Anna

Il database è quindi unico e sincronizzato.

---

# 4. SINCRONIZZAZIONE

Esempio:

Vito inserisce:

Supermercato
€120
Condiviso famiglia

Il dato viene salvato nel database.

Anna apre l'app.

La Dashboard familiare mostra:

Supermercato €120

Non è necessario trasferire manualmente file o sincronizzare dispositivi.

---

# 5. AUTENTICAZIONE

Utilizzare:

**Supabase Auth**

Prima versione:

Email + Password.

La password NON viene gestita direttamente dalla nostra applicazione.

Supabase gestisce:

- registrazione;
- login;
- password;
- sessione;
- verifica email;
- recupero password.

Supabase supporta anche autenticazione via telefono, OTP, social login e altri metodi.

---

# 6. LOGIN V1

Registrazione:

Nome

Username

Email

Password

Conferma password

---

Login:

Email / Username

Password

---

Successivamente possiamo aggiungere:

- Face ID
- Touch ID
- Sign in with Apple
- login tramite telefono.

---

# 7. USERNAME

Supabase autentica principalmente tramite email/telefono.

Lo username viene quindi memorizzato nella nostra tabella:

PROFILES

Campi:

id

username

nome

telefono

created_at

L'id corrisponde all'utente Supabase Auth.

---

# 8. SICUREZZA DATABASE

Qui utilizzerei una delle funzioni più importanti di PostgreSQL/Supabase:

**Row Level Security — RLS**

Ogni richiesta al database verifica automaticamente se l'utente ha diritto a vedere quella riga. Supabase raccomanda RLS sulle tabelle esposte e permette di collegare direttamente le policy all'utente autenticato.

---

# 9. ESEMPIO SICUREZZA PERSONALE

Movimento:

owner_user_id = Vito

Anna prova a leggerlo.

Se:

condiviso_famiglia = false

database:

ACCESSO NEGATO

La protezione non dipende quindi solo dall'interfaccia.

È il database stesso a impedire l'accesso.

---

# 10. MOVIMENTO CONDIVISO

Se:

owner_user_id = Vito

nucleo_id = Famiglia

condiviso_famiglia = true

Anna appartiene allo stesso nucleo.

La policy RLS permette:

SELECT

secondo i permessi definiti.

---

# 11. STRUTTURA DATABASE

Schema principale:

AUTH.USERS
gestito da Supabase

↓

PROFILES

↓

HOUSEHOLDS

↓

HOUSEHOLD_MEMBERS

↓

MOVEMENTS

↓

CATEGORIES
MACRO_CATEGORIES
ACCOUNTS
FUNDS
TRANSFERS
FIXED_EXPENSES
BUDGETS
IMPORT_BATCHES
BALANCE_SNAPSHOTS
AUDIT_LOG

---

# 12. STRUTTURA PROGETTO

Possibile struttura:

src/

    app/

        login/

        register/

        dashboard/

        family/

        months/

        movements/

        statistics/

        funds/

        accounts/

        budgets/

        settings/

        import/

    components/

        dashboard/

        movements/

        budget/

        categories/

        funds/

        family/

        ui/

    lib/

        supabase/

        calculations/

        auth/

        permissions/

        csv/

    services/

        movements/

        accounts/

        budgets/

        family/

        imports/

    types/

    hooks/

---

# 13. LOGICA DI CALCOLO

Separerei completamente la logica matematica dalla UI.

Cartella:

lib/calculations/

Esempio:

calculateMonthlySummary()

calculateAnnualSummary()

calculateCategoryNetExpense()

calculateAccountBalance()

calculateForecastBalance()

calculateCreditCardBalance()

calculateBudgetUsage()

calculateFundBalance()

La Dashboard utilizza queste funzioni.

Non contiene direttamente formule.

---

# 14. SERVICE LAYER

Allo stesso modo eviterei di interrogare Supabase direttamente da ogni componente.

Esempio:

services/movements.ts

funzioni:

getMovements()

createMovement()

updateMovement()

deleteMovement()

getMonthlyMovements()

getCategoryMovements()

Questo rende il progetto molto più semplice da mantenere.

---

# 15. GESTIONE SALDI

Utilizzerei la strategia già definita:

MOVIMENTI
=
fonte ufficiale

CURRENT BALANCE CACHE
=
visualizzazione veloce

SNAPSHOT
=
controllo e ricostruzione.

---

# 16. CACHE

Tabella ACCOUNTS:

cached_balance

cached_at

Questo permette alla Dashboard di leggere immediatamente:

Conto corrente

€2.850

senza calcolare tutti i movimenti.

---

# 17. SNAPSHOT

Tabella:

BALANCE_SNAPSHOTS

account_id

date

balance

Snapshot mensile.

Esempio:

31/07/2026
€3.420

Per calcolare agosto:

snapshot 31/07

+

movimenti agosto.

---

# 18. IMPORT CSV

Modulo:

/import

Flusso:

Seleziona CSV

↓

Analizza colonne

↓

Mapping

↓

Anteprima

↓

Riconoscimento duplicati

↓

Importa

↓

Ricalcolo saldi

---

# 19. IMPORT MASSIVO

Durante l'import:

NON aggiornare il saldo per ogni riga.

Utilizzare una transazione:

IMPORTA 500 MOVIMENTI

↓

COMMIT

↓

RICALCOLA CONTI INTERESSATI

↓

AGGIORNA CACHE

↓

AGGIORNA SNAPSHOT

Questo riduce drasticamente le operazioni.

---

# 20. PWA

L'app nasce come:

**Progressive Web App**

quindi è una normale applicazione web ma installabile su iPhone.

Configurazione:

manifest.webmanifest

service worker

icone

splash screen

display standalone

theme

---

# 21. INSTALLAZIONE SU IPHONE

Procedura:

Safari

↓

aprire l'indirizzo dell'app

↓

Condividi

↓

Aggiungi alla schermata Home

↓

Apri come app web

Apple supporta esplicitamente l'aggiunta di un sito alla Home e l'apertura come web app.

---

# 22. ESPERIENZA IPHONE

Una volta installata:

icona Rendiconto

↓

tap

↓

app a tutto schermo

senza dover aprire manualmente Safari.

L'interfaccia deve essere progettata mobile-first.

---

# 23. DOMINIO

Potremmo inizialmente utilizzare:

rendiconto.vercel.app

oppure un sottodominio personale:

rendiconto.tuodominio.it

---

# 24. HOSTING FRONTEND

Consigliato:

**Vercel**

perché è molto ben integrato con Next.js.

Workflow:

Codice GitHub

↓

Vercel

↓

Deploy automatico

↓

PWA aggiornata.

---

# 25. AGGIORNAMENTI

Altro enorme vantaggio della PWA:

modifichiamo il codice

↓

push GitHub

↓

Vercel aggiorna

↓

su iPhone compare automaticamente la nuova versione.

Non devi reinstallare nulla.

---

# 26. SVILUPPO LOCALE

Sul PC:

Visual Studio Code

+

Codex

+

Node.js

+

Git

+

Supabase CLI

---

# 27. VERSIONAMENTO

Utilizzerei subito Git.

Repository:

rendiconto-app

Branch principale:

main

Branch sviluppo:

develop

Possibili feature branch:

feature/dashboard

feature/movements

feature/family

feature/csv-import

---

# 28. AMBIENTI

Prevederei almeno:

LOCAL

STAGING

PRODUCTION

Inizialmente possono bastare:

LOCAL

PRODUCTION

ma la struttura deve permettere facilmente lo staging.

---

# 29. DATABASE MIGRATIONS

La struttura del database non deve essere modificata manualmente senza traccia.

Utilizzare:

Supabase migrations

Esempio:

001_profiles.sql

002_categories.sql

003_movements.sql

004_accounts.sql

005_family.sql

006_budget.sql

Questo permette di ricostruire completamente il database.

---

# 30. NOTIFICHE

Prima versione:

notifiche interne all'app.

Tabella:

NOTIFICATIONS

Successivamente:

Push notification

Email

SMS.

Per gli inviti familiari partirei con:

EMAIL.

Il login telefonico e gli SMS richiedono l'integrazione con un provider SMS; Supabase supporta diversi provider esterni.

Per V1 quindi:

invito famiglia via email.

Numero telefono:

lo possiamo comunque memorizzare.

---

# 31. EMAIL INVITO FAMIGLIA

Flusso:

Vito inserisce email Anna

↓

creazione FAMILY_INVITE

↓

invio email

↓

Anna apre link

↓

login / registrazione

↓

ACCETTA INVITO

↓

HOUSEHOLD_MEMBERS

↓

Dashboard famiglia disponibile.

---

# 32. SICUREZZA

Non dobbiamo mai mettere nel frontend:

- password database;
- service role key;
- chiavi private;
- segreti email.

La service role di Supabase bypassa RLS e deve rimanere esclusivamente server-side.

---

# 33. BACKUP

Supabase gestisce backup del database; le opzioni disponibili dipendono dal piano.

Aggiungerei comunque nell'app:

IMPOSTAZIONI

↓

ESPORTA DATI

↓

CSV

e successivamente:

JSON / Excel.

Questo dà all'utente una copia indipendente dei propri dati.

---

# 34. OFFLINE

Per la prima versione:

richiederei connessione Internet.

La PWA può memorizzare staticamente l'interfaccia, ma eviterei inizialmente la sincronizzazione offline dei movimenti.

Offline completo introduce problemi di:

- conflitti;
- sincronizzazione;
- modifiche contemporanee;
- bilancio familiare.

Può essere aggiunto successivamente.

---

# 35. FUTURA APP NATIVA

Se l'app funziona bene, possiamo utilizzare:

**Capacitor**

per impacchettare l'app web come applicazione iOS.

Architettura:

Next.js / Web App

↓

Capacitor

↓

progetto Xcode

↓

App iOS

↓

TestFlight / App Store.

Non bisognerà quindi rifare tutta la logica.

---

# 36. FACE ID FUTURO

Nella PWA possiamo mantenere la sessione autenticata.

Nella versione Capacitor potremo poi integrare:

Face ID

come sistema di sblocco locale dell'app.

---

# 37. STACK DEFINITIVO

### Linguaggio
TypeScript

### Frontend
Next.js

### UI
Tailwind CSS + shadcn/ui

### Database
PostgreSQL

### Backend / BaaS
Supabase

### Authentication
Supabase Auth

### Sicurezza
Postgres Row Level Security

### Hosting
Vercel

### Repository
GitHub

### PWA
Next.js Web App Manifest + service worker

### CSV
Parser TypeScript

### Grafici
Recharts

### Futura app iOS
Capacitor

---

# 38. ARCHITETTURA COMPLETA

IPHONE
│
│ PWA
▼
NEXT.JS
│
├── Dashboard
├── Movimenti
├── Famiglia
├── Budget
├── Fondi
├── Statistiche
└── CSV
│
▼
SUPABASE AUTH
│
▼
POSTGRESQL
│
├── Users
├── Movements
├── Categories
├── Accounts
├── Funds
├── Budgets
├── Families
└── Snapshots
│
▼
ROW LEVEL SECURITY

---

# 39. FILOSOFIA DEL PROGETTO

La prima versione deve privilegiare:

1. correttezza dei dati;
2. semplicità d'uso;
3. sicurezza;
4. velocità;
5. facilità di modifica.

Non dobbiamo cercare subito di realizzare:

- App Store;
- modalità offline completa;
- SMS;
- automazioni complesse;
- AI;
- collegamento automatico alla banca.

La struttura però deve permettere queste evoluzioni senza dover rifare l'app.