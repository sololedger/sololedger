# SoloLedger

SoloLedger är en Next.js + Supabase-applikation för enkel bokföring i svensk **enskild firma utan anställda**.

Projektet innehåller bokföring, verifikationer, momsrapport, NE-underlag, SIE import/export, bilagor, årslåsning samt prenumerationshantering via Stripe.

## Projektstatus

Kärnflödena är implementerade och har testats löpande i utvecklings- och produktionsmiljö. Databasändringar hanteras med migrationsfiler under `supabase/migrations/`.

## Huvudfunktioner

### Bokföring
- Vanliga intäkter och kostnader bokförs via atomiska PostgreSQL-RPC:er.
- Verifikationsnummer skapas server-side och sekventiellt per användare.
- Bokförda transaktioner hårdraderas inte i normala användarflöden.
- Felaktiga verifikationer rättas med separat korrigeringsverifikation (KORRVER).
- Samma originalverifikation kan endast korrigeras en gång.
- Bokföringsdatum och ekonomiska kärnfält på en bokförd transaktion kan inte ändras i efterhand.
- Periodisering över årsskifte skapar original- och vändningsverifikation atomiskt.
- Låsta räkenskapsår blockerar relevanta bokföringsändringar.

### Moms och NE
- Moms stöds för 25 %, 12 %, 6 % och 0 %.
- Utgående moms routas till 261x/262x/263x och ingående moms till 264x enligt appens bokföringsmodell.
- Momsrapporten bygger på journalrader och hanterar interna momsombokningar.
- NE-vyn visar resultat- och balansrader för förenklat årsbokslut.
- Balanskonton beräknas kumulativt medan resultatkonton beräknas per räkenskapsår.
- NE-underlaget är ett hjälpmedel för deklarationen och ersätter inte Skatteverkets deklarationstjänst.

### SIE
- Import av SIE med verifikationer, ingående balans och resultathantering.
- Importen sker atomiskt: en felaktig import ska inte lämna ett halvt importerat underlag.
- Importhistorik sparas i `import_batches`.
- En orörd genomförd import kan ångras genom korrigeringsverifikationer; importerad bokföringshistorik hårdraderas inte.
- SIE-export genereras från bokförda verifikationer och journalrader.

### Kontoplan och historik
- Varje användare har sin egen kontoplan.
- Konton/kategorier som redan används av bokförda transaktioner kan inte tas bort.
- Historiska transaktioner presenteras utifrån de journalrader som faktiskt bokfördes, inte en senare ändrad kontoplansdefinition.

### Bilagor
- Kvitton och andra bilagor kan lagras i Supabase Storage.
- Tillåtna filtyper i appen är JPG, PNG, WebP och PDF.
- Storage-bucketens server-side begränsningar dokumenteras i `Architecture.md`.

## Prenumerationer

SoloLedger har stöd för `free`, `trial`, `paid` och administratörsbehörighet.

- Gratisversionen tillåter totalt 15 räknade bokföringsverifikationer per konto.
- Korrigeringsverifikationer och teknisk SIE-ingående balans räknas inte mot gratisgränsen.
- Trial är 14 dagar.
- Stripe Checkout används för att starta prenumeration.
- Stripe Customer Portal används för hantering av prenumerationen.
- Stripe-webhooks synkroniserar relevanta prenumerationshändelser till `profiles`, inklusive subscription updates.

> Prenumerations-/gratisgränsen är i nuläget främst ett produkt- och UI-skydd. Bokföringsintegritet och användarisolering skyddas separat i databasen med RLS, grants och server-side RPC-validering.

## Säkerhetsmodell

SoloLedger använder Supabase Auth och Row Level Security.

- Bokföringsdata isoleras per `user_id`.
- Direkta klientskrivningar till centrala bokföringstabeller är begränsade; känsliga flöden går via server-side PostgreSQL-RPC:er.
- Profilfält med behörighets- och prenumerationsdata kan inte ändras av en vanlig användare genom klienten.
- Adminbehörighet verifieras server-side/databas-side.
- Stripe Checkout och Customer Portal verifierar Supabase-sessionen på servern.
- Bilagor skyddas med Storage RLS till användarens egen mapp.

En verifierad produktionssnapshot av databasschemat finns under:

`supabase/baseline/20260910_production_schema_baseline.sql`

Baselinen är dokumentation/audit-underlag och ersätter inte migrationshistoriken.

## Admin och användarradering

Adminpanelen kan göra dry-run och permanent radering av användare.

Raderingsflödet hanterar:
1. Stripe-prenumeration när sådan finns.
2. Användarens bilagor i Storage.
3. Appdata genom atomisk PostgreSQL-RPC.
4. Supabase Auth-kontot sist.

Databasdelen är atomisk. Eftersom Stripe, Storage, PostgreSQL och Auth är separata system är hela kedjan inte en enda global transaktion.

Self-service-radering för slutanvändare är inte implementerad; permanent radering hanteras tills vidare av admin.

## Viktiga mappar

```text
src/app/                 Next.js-sidor och API-routes
src/components/          UI-komponenter
src/hooks/               Auth- och bokföringshooks
src/lib/                 Bokföring, beräkningar, SIE, limits och Supabase-klient
supabase/functions/      Supabase Edge Functions
supabase/migrations/     Databasmigrationer
supabase/baseline/       Verifierad schema-snapshot för audit/recovery
```

Mer detaljer finns i `Architecture.md`.

## Databas – centrala tabeller

| Tabell | Ansvar |
|---|---|
| `profiles` | Profil, företag, roll och prenumerationsdata |
| `transactions` | Transaktioner/verifikationer och korrigeringsmetadata |
| `journal_entries` | Debet-/kreditrader per transaktion |
| `accounts` | Användarens kontoplan |
| `favorites` | Sparade bokföringsfavoriter |
| `closed_years` | Låsta räkenskapsår |
| `import_batches` | Historik och status för SIE-importer |
| `ver_nr_sequences` | Server-side räknare för verifikationsnummer |

## Lokal utveckling

Installera dependencies och starta utvecklingsservern:

```bash
npm install
npm run dev
```

Supabase- och Stripe-konfiguration kräver projektets egna miljövariabler/secrets. Hemligheter ska inte committas till Git.
