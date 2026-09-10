# SoloLedger — Arkitekturöversikt

Den här filen beskriver SoloLedgers nuvarande huvudarkitektur. SoloLedger är byggt för svensk **enskild firma utan anställda**.

## Översikt

```text
Browser / React
    |
    +-- Supabase Auth
    +-- Supabase SELECT via RLS
    +-- PostgreSQL RPC för känsliga bokföringsskrivningar
    +-- Supabase Storage för bilagor
    |
Next.js API routes
    |
    +-- Stripe Checkout
    +-- Stripe Customer Portal
    +-- Stripe Webhooks
    |
Supabase
    +-- PostgreSQL + RLS
    +-- Storage + Storage RLS
    +-- Edge Function: delete-user
```

## `src/app/`

**`page.tsx`** — Huvudsidan. Orkestrerar tabs, formulär, modaler, filuppladdning och UI-state samt konsumerar auth- och bokföringshooks.

**`layout.tsx`** — Next.js root layout.

**`globals.css`** — Global CSS.

### `src/app/api/`

| Route | Ansvar |
|---|---|
| `checkout/route.ts` | Verifierar Supabase-användare server-side och skapar Stripe Checkout |
| `portal/route.ts` | Verifierar Supabase-användare server-side och öppnar Stripe Customer Portal |
| `webhook/route.ts` | Tar emot Stripe-events och synkroniserar prenumerationsstatus |

Webhooken hanterar relevanta Checkout-, invoice- och subscription-events, inklusive `customer.subscription.updated`.

## `src/components/`

| Fil | Ansvar |
|---|---|
| `AdminPanel.tsx` | Adminvy: användarlista, dry-run och permanent användarradering |
| `FAQ.tsx` | Produkt- och bokföringsinformation |
| `FavoriteChips.tsx` | Sparade bokföringsfavoriter |
| `Kontoplan.tsx` | Användarens kontoplan och skydd mot borttagning av använda kategorier |
| `Layout.tsx` | Navigation, logout och Admin-tab för admin |
| `Momsrapport.tsx` | Visar momsrapport |
| `NEBilaga.tsx` | NE-underlag/förenklat årsbokslut |
| `OverviewCards.tsx` | Dashboardens sammanfattningskort |
| `Paywall.tsx` | Information/uppgradering för free/trial/paid |
| `ProfileSettings.tsx` | Profil, lösenord och SIE-importhistorik/undo |
| `SubscribeButton.tsx` | Startar prenumerationsflöde |
| `SubscriptionGuard.tsx` | UI-behörighet för prenumerationsfunktioner |
| `TransactionForm.tsx` | Skapa/redigera transaktioner; låser bokföringsdatum när relevant |
| `TransactionTable.tsx` | Historik, journalrader, KORRVER och SIE-undo-presentation |

## `src/hooks/`

| Fil | Ansvar |
|---|---|
| `useAuth.ts` | Auth-livscykel, profil, login/logout, recovery och lösenordsbyte |
| `useAccountingData.ts` | Transaktioner, journaler, saldon, kontoplan, NE-data, refresh och årslåsning |

`useAccountingData` håller årsspecifik data synkroniserad och använder separat logik för årsresultat respektive kumulativa balanskonton.

## `src/lib/`

| Fil | Ansvar |
|---|---|
| `accountingService.ts` | Bokförings-RPC:er, saldon, moms, NE-data, korrigering och periodisering |
| `calculations.ts` | Dashboard-/sammanställningsberäkningar |
| `setupDefaultAccounts.ts` | Standardkonton för nya användare |
| `sieImport.ts` | SIE-import och validering |
| `sieExport.ts` | SIE-export |
| `subscriptionLimits.ts` | Free/trial/paid-regler och 15-verifikationsgränsen |
| `supabaseClient.ts` | Browser-klient för Supabase |

## Bokföringsarkitektur

Centrala bokföringsskrivningar sker genom PostgreSQL-funktioner i stället för direkta klientskrivningar.

### Normal bokning

`book_transaction_atomic`

Skapar transaction, verifikationsnummer och journalrader i samma PostgreSQL-transaktion. Servern validerar bland annat användare och stödda momssatser.

### Redigering

`update_transaction_safe`

Bokförda transaktioners ekonomiska kärnfält och bokföringsdatum kan inte ändras fritt efter bokföring. Tillåtna metadataändringar hanteras server-side.

### Korrigering

`create_correction_transaction_atomic`

Skapar separat korrigeringsverifikation med spegelvända journalrader. Samma originalverifikation kan endast korrigeras en gång; databasen har en unik spärr på användare + korrigerat verifikationsnummer.

### Periodisering

`book_periodized_transaction_atomic`

Skapar periodiseringens original- och vändningsverifikation atomiskt.

### SIE-import

`import_sie_batch`

Importerar SIE atomiskt och hanterar bland annat verifikationer, ingående balans, resultatbrygga och duplicate-opening-skydd.

### SIE-undo

Säker undo av en orörd genomförd import skapar korrigeringsverifikationer i stället för att hårdradera importerad bokföringshistorik. Importbatchen markeras som ångrad.

## Resultat och balans

SoloLedger skiljer på resultat- och balanskonton:

- Resultatkonton (3xxx–8xxx) beräknas per räkenskapsår.
- Balanskonton (1xxx–2xxx) beräknas kumulativt fram till valt års slut.

NE/B10 använder kumulativa balansvärden och kumulativt eget kapital enligt appens verifierade modell.

## Moms

Stödda momssatser för appens normala bokföringsflöden är:

- 25 %
- 12 %
- 6 %
- 0 %

Server-side validering finns i bokförings-RPC:erna.

Momsrapporten bygger på journalrader. Interna momsombokningar med 265x identifieras så att de inte räknas som nya affärshändelser.

## NE

NE-vyn visar R1–R17 samt relevanta balansrader B1–B10 och B13–B16 för förenklat årsbokslut.

R7 finns kvar som deklarationsrad men är normalt 0 för SoloLedgers målgrupp utan anställda och döljs tillsammans med andra tomma deklarationsrutor i normalvyn.

R14–R16 saknar i nuläget automatisk specialmappning och visas som 0 tills särskilt stöd implementeras.

NE-vyn är ett underlag och inte en elektronisk deklarationsinlämning till Skatteverket.

## Supabase

### Centrala tabeller

| Tabell | Innehåll |
|---|---|
| `profiles` | Profil, företag, roll och Stripe/prenumerationsdata |
| `transactions` | Bokförda transaktioner och korrigeringsmetadata |
| `journal_entries` | Debet-/kreditrader |
| `accounts` | Kontoplan per användare |
| `favorites` | Sparade bokföringsfavoriter |
| `closed_years` | Låsta räkenskapsår |
| `import_batches` | SIE-importhistorik, status och undo-metadata |
| `ver_nr_sequences` | Atomisk verifikationsnummersekvens |

### RLS och grants

RLS används för användarisolering. Normala användare ska endast kunna läsa sin egen bokföringsdata.

Direkta klientskrivningar till `transactions` och `journal_entries` är begränsade; normala bokföringsskrivningar går via server-side RPC:er.

`profiles` tillåter vanlig användare att uppdatera avsedda företagsfält, medan roll-, subscription- och Stripe-fält inte är klientredigerbara.

Adminåtkomst avgörs av server-/databasverifierad roll.

## Storage

Bucket: `attachments`

Konfiguration:

- Privat bucket.
- Objekt lagras under `<user-id>/...`.
- Storage RLS begränsar SELECT, INSERT och DELETE till den inloggade användarens egen mapp.
- Max filstorlek: **10 MB**.
- Tillåtna MIME-typer:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `application/pdf`

Frontend validerar också filtyp och genererar säkra filnamn, men bucket-konfigurationen är det server-side skyddet mot andra filtyper/storlekar.

> Filstorlek och MIME-lista är Supabase bucket-konfiguration och ligger inte i PostgreSQL-migrationshistoriken. Ändringar där ska därför dokumenteras här.

## Edge Function: `delete-user`

Permanent adminradering följer i huvudsak:

```text
Verifiera anropare/admin
        ↓
Hantera Stripe-prenumeration
        ↓
Radera Storage-bilagor
        ↓
Atomisk PostgreSQL-radering
        ↓
Extra Storage-sweep/kontroll
        ↓
Radera Supabase Auth-användare sist
```

Databasraderingen sker genom `delete_user_data_atomic`, som tar bort appdata i en PostgreSQL-transaktion.

Hela kedjan kan inte vara globalt atomisk eftersom Stripe, Storage, PostgreSQL och Auth är separata system. Extra Storage-kontroll används för att minska risken för filer som skapas under raderingsflödet.

Self-service account deletion är inte implementerad; permanent radering är tills vidare en adminfunktion.

## Stripe

Stripe används för Checkout, Customer Portal och webhook-synkronisering.

Next.js API-routes accepterar inte ett klientangivet användar-ID som sanning. Supabase-token verifieras server-side och användaren härleds från den verifierade sessionen.

Webhooken uppdaterar prenumerationsinformation i `profiles` när relevanta Stripe-events tas emot.

Prenumerations-/free-limit-regler är främst produktregler på klient/UI-nivå. De ska inte betraktas som samma säkerhetsgräns som RLS och server-side bokföringsvalidering.

## Databasbaseline och migrationsprincip

Verifierad produktionssnapshot:

`supabase/baseline/20260910_production_schema_baseline.sql`

Baselinen dokumenterar det verifierade produktionsläget för audit/recovery. Den är inte tänkt som en garanterat komplett fresh-install migration.

Historiska migrationsfiler behålls. Framtida databasändringar ska göras som nya, små migrationsfiler i stället för att skriva om gamla fullständiga funktionskopior.

## Viktiga integritetsregler

- Bokförda poster rättas med KORRVER, inte normal hårdradering.
- Samma originalverifikation kan inte korrigeras två gånger.
- Använda kontoplanskategorier kan inte tas bort.
- Bokföringsdatum på bokförd transaktion kan inte flyttas efter bokföring.
- Låsta år blockerar relevanta ändringar.
- Bokförings-RPC:er verifierar användaren server-side/databas-side.
- Bilagor isoleras per användare genom Storage RLS.

## Kända avgränsningar / teknisk skuld

- Projektet innehåller fortfarande TypeScript `any` på flera ställen. Detta är accepterad teknisk skuld och inte i sig en säkerhetsgräns.
- Free/trial/paywall-enforcement är huvudsakligen klientbaserad och betraktas som en accepterad affärsrisk, inte som skydd för bokföringsdata.
- Self-service permanent kontoradering är inte implementerad.
- Storage bucket-inställningar för maxstorlek/MIME dokumenteras här eftersom de inte ligger i Git-migrationerna.
