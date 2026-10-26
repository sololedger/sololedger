# KAN-112 – lokal implementation, 2026-10-26

## Beslut och kandidat

Pontus godkände lokal implementation av reviderad UX: fyra utfällbara delar,
elva permanenta manuella bekräftelser, automatisk lagring och avgränsad
ändringskontroll. Fjärrmigrationer, push, app-/Edge-deployment är inte godkända.

- Arbetskopia: `audit-packages/KAN-100-app-release-20261024`.
- Gren: `codex/KAN-112-year-end-checklist`, produktbas
  `6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`.
- Ingen ny arbetskopia, DB, reset eller återanvändning av verkliga användare.
- Root och tidigare arbetsgrenar innehåller bevarat separat arbete; ingår inte.
- Origin för denna kopia är lokal KAN-62-kopia, inte GitHub. Ingen push har gjorts.

## Funktion och gränser

Årsavslut återanvänder befintlig navigation och instruktioner. Manuell
bekräftelse, datum och antal visas separat från årslås, momsperioder och antal
deklarationsversioner. Inget besked innebär godkänt bokslut eller verifierad
myndighetsinlämning. Momsens egna tidsfrister framgår. Läsfel visar inte falska
tomma kryssrutor. Snabba upprepade klick spärras medan sparandet pågår.

`year_end_checklist` har en rad per ägare/år/kontrollpunkt. Sparande hämtar
ägaren från `auth.uid()`, använder befintlig exklusiv ägargräns, revisionsvillkor
och återspelningsbar begäran. Återförsök med samma begäran skapar ingen ny
revision. Samtidig ändring eller ändrat underlag kräver omläsning. Klienten
kontrollerar också profilgeneration, session och svarets ägare/år.

RLS tillåter endast egen läsning för authenticated. Direkta API-skrivningar
nekas. Anon saknar åtkomst. Service-role har endast avsiktlig tabelläsning för
adminräkning/restkontroll, inga nya API-skriv- eller RPC-grants. Privat
fingerprinthjälpare saknar API-exekveringsrätt. FK till profiles har cascade,
och auktoritativ raderings-RPC utökas med explicit radering, antal och
restkontroll. Den befintliga auktoriseringen/delegeringen bevaras.

Inga nya transaktionskällor, journalplaner, rapportberäkningar eller
års-/momsperiodlås. FAQ/KAN-102 och NE-layout/historik/KAN-109 är oförändrade.

## Ändringskontroll

Sorterat registrerat underlag jämförs via kontrollvärden. Dessa är inte
digitala signaturer eller intyg om bokföringens riktighet.

| Kontroll | Relevanta registrerade källor |
| --- | --- |
| Underlag/företagsuppgifter | Årets transaktioner inklusive bilagereferenser, relevanta profiluppgifter |
| Bank | Kumulativa 19xx-journalrader, betalningskontoroller |
| Kundfakturor | Fakturor till årets slut, deras kopplade bokningar inklusive senare betalning |
| Leverantörsfakturor | Bokslutsskulder till och med året och deras händelser |
| Inventarier | Tillgångar, relevanta händelser, 12xx och årets 78xx-journalrader |
| Momsunderlag | Årets 26xx-journal, VAT-snapshots och momsprofil |
| Resultat/balans och skatteunderlag | Journal till årets slut, NE-klassificeringar och relevanta profiluppgifter |
| Inkomstdeklaration/kvittens | Årets sparade deklarationsversioner; inget externt mottagandebesked |
| Betalningar | Perioder och kopplade skattekontohändelser/pengaflyttar |
| Nästa år | Kund-/leverantörsposter och betalningskopplingar, bank |

En obokförd kundfaktura ändrar bara kundkontrollen och nästa-år-kontrollen.
Om den bokförs påverkas även kontroller vars journalunderlag faktiskt ändras.
Tidigare bekräftelser raderas aldrig automatiskt. Användaren kan behålla,
avmarkera eller bekräfta igen. Nya externa underlag kan inte upptäckas.

Över 50 000 rader i någon relevant ägarkälla uteblir ändringsjämförelsen;
svar kan fortfarande läsas/ändras, med tydligt undantagsbesked. Ingen kapning
eller falsk kontroll av oförändrat underlag. Återkomst till guiden, fokus och
meddelande från annan flik läser på nytt. Ingen kontinuerlig fjärrövervakning.

## Verifiering

- `npm run typecheck`: PASS.
- Riktad ESLint för nya/ändrade kontrollmoduler och tester: PASS.
- `npm run lint:year-end-guide`: PASS utan nya fel; tidigare Home/Layout-fel
  jämförs mot befintlig baseline. React-kontroll: ägar-/årsnycklar, städning,
  stale-response-skydd, tangentbord och etiketter granskade.
- `npm run test:regression`: PASS med syntetisk publik lokalkonfiguration,
  inklusive public-auth 2/2. Befintliga domän-/faktura-/rapporttester ingår.
- Nya store- och faktiska klienttester ligger i regressionen: återbesök,
  fel, förlorat svar, identiskt återförsök, avmarkering, omkontroll, snabba
  klick, versionskonflikt, svar för fel ägare/år och profilgenerationsbyte.
- Faktiska Home/Layout/guide/React-store testade i Playwright 1440/390 px.
  Checklisttransport och övriga ekonomipaneler är syntetiska; externa anrop
  nekas. Markera/avmarkera, återbesök, användare A–B–A, år A–B–A, låst år,
  nätverks-/läsfel, ändringsvarning och alla målvyers återgång: PASS.
- Skärmbilder för dator/mobil inspekterade; inget horisontellt överflöde.
- `scripts/test-year-end-checklist-db.mjs`: 12 lokala testgrupper PASS.
  Återanvänd PostgreSQL17 `sololedger_kan62_disposable_20261021`,
  `127.0.0.1:5432`, OID 57199 och tidigare unik syntetmarkör verifieras av
  befintlig säkerhetsvakt före SQL. Ingen credentialfil läses eller kopieras.
- Den bevarade lokala DB:n saknar KAN-100. De två redan publicerade
  KAN-100-migrationerna och nya KAN-112 kördes ENDAST i en transaktion med
  ROLLBACK. Ingen permanent migrationsinstallation eller ledgerändring.
- Faktisk RLS/ACL, separata ägare/år, replay, gammal revision/bas,
  verklig syntetisk bokning, kundfakturans avgränsade påverkan, låst år,
  storleksgräns 50 001 rader och auktoritativ radering med antal: PASS.
- Separat verklig session verifierar att sparandet håller ägarens exklusiva
  lås medan annan ägares lås är tillgängligt. Stale-write-villkor testas
  separat. Detta är inte två samtidiga inloggade webbläsare mot hosted RPC.
- Före/efter-digester för profiler, konton, journal, transaktioner, moms,
  årslås, fakturor, inventarier, skulder och skattekontohändelser är identiska
  efter rollback. Befintliga fixtures bevarade.
- Admin dry-run-kontrakt: PASS med ny räknenyckel.

### Kända testbegränsningar

`npm run test:db-invariants` har ett redan befintligt statiskt fel:
`Unexpected close-year delegate transformation`. Samma fel reproducerades
på oförändrad produktbas 6ad27f1. Kontrollens raderingsdel har anpassats för
att följa KAN-112:s wrapper och bevarade inre raderingsfunktion, med nya
specifika assertions; originalkontrollerna är kvar. Årslåskontrollen har inte
försvagats eller ändrats inom KAN-112. Den direkta PostgreSQL-verifieringen
ovan passerar. Den äldre live-postcheck-kommandovägen kördes inte färdigt
eftersom ingen anslutnings-URL var angiven; lokal restkontroll ingår i DB-testet.

Första publika smoke saknade lokal nätverksåtkomst och appkonfiguration.
Efter avgränsad kontroll kördes den med syntetisk URL till localhost och en
syntetisk publik nyckel, utan fjärrkonto. Slutlig full regression PASS.

Råbevis (ignorerade): `coverage/kan112-local/db-result.json`,
`coverage/kan112-browser/`, `coverage/kan112-final-regression.log`,
`coverage/kan112-final-lint.log`, `coverage/kan112-baseline-invariant-result.log`.

## Exakta kandidatfiler

- `src/components/YearEndGuide.tsx`
- `src/components/YearEndChecklistControls.tsx`
- `src/lib/yearEndChecklist.ts`
- `src/lib/yearEndChecklistClient.ts`
- `src/app/page.tsx` (ägare skickas till befintlig guide)
- `src/lib/adminDeleteDryRun.ts`
- `supabase/functions/delete-user/index.ts` (endast räkne-/restkontrollista)
- `supabase/migrations/20261026092741_kan112_year_end_checklist.sql`
- `scripts/test-year-end-checklist.mjs`
- `scripts/test-year-end-checklist-client.mjs`
- `scripts/test-year-end-checklist-db.mjs`
- `scripts/test-year-end-guide.mjs`
- `scripts/test-admin-delete-dry-run.ts`
- `scripts/check-db-regression-invariants.mjs`
- `package.json` (endast testkommandon; inga beroende-/lockfiländringar)
- `Architecture.md`, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md` och denna rapport.

Migration SHA256:
`4ee37317959b7b68758f98776c347a646c62ca43e7ce5ac84c18c7e3fa4c64a5`.
CLI skapade filen; inga gamla migrationer eller baselinefiler är ändrade.

## Jira och nästa isolerade steg

Dubblettsökning utförd. KAN-113 skapad på uttryckligt uppdrag och återläst
Bug/To Do: årslås av pågående/framtida år. Ingen reproduktion/rättning.
KAN-112 har inte kommenterats, tilldelats eller statusändrats.

Nästa beslut bör omfatta separat:
1. Exakt nya migrationen till verifierat Supabase Staging
   `fzxqiqenqjzhlyxxpvhg`, med CLI som bevarar versionsidentiteten.
2. Exakt KAN-112-kandidat till Staging app samt uppdaterad delete-user Edge.
   Schema först: klienten kräver nya RPC:er, och Edge räknar nya tabellen.
3. Hosted syntetisk acceptans: ny inloggning/omladdning, två verkliga flikar,
   två användare, olika år, avgränsad ändringsvarning och radering.

Verifiera Stagings aktuella preimage/ledger först; ingen historisk replay.
Låt befintliga konton/fixtures ligga kvar och skapa separat testkohort.
Ingen Production-åtgärd eller generell årslåsrättning följer av kandidaten.
