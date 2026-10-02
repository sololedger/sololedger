# SoloLedger - Arkitektur

Det här dokumentet är en karta över SoloLedgers nuvarande kod och datamodell. Det beskriver vad som faktiskt finns i repot och hur huvudflödena hänger ihop.

SoloLedger är en svensk bokföringsapp för enskild firma utan anställda. Grundprincipen är att bokföring, moms, NE, SIE och historik ska vara kontrollerbara och isolerade per användare. När appen saknar tillräcklig information ska den stoppa eller be om mer fakta i stället för att gissa.

## Övergripande Modell

```text
Browser / React / Next.js App Router
  |
  |-- Supabase Auth
  |-- Supabase RLS-läsningar för användarens data
  |-- PostgreSQL RPC för känsliga bokföringsskrivningar
  |-- Supabase Storage för bilagor
  |
  |-- Next.js API routes
      |-- Stripe Checkout
      |-- Stripe Customer Portal
      |-- Stripe Webhooks
  |
Supabase
  |-- PostgreSQL-tabeller, RLS, constraints, triggers och RPC:er
  |-- Storage-bucket attachments
  |-- Edge Function delete-user
```

Frontend samlar användarfakta och visar rapporter. Domänlogik i `src/lib` avgör behandling, bygger planer och skyddar UI-flöden. Databasen är den auktoritativa gränsen för bokföringsskrivningar, verifikationsnummer, låsta år, momsperioder, idempotens och användarisolering.

## Huvudflöden

### Vanlig Bokföring

`src/app/page.tsx` håller huvudvyn och skickar vanliga transaktioner via `bookTransaction()` i `src/lib/accountingService.ts`.

Klienten skickar datum, beskrivning, belopp, kategori, momssats och eventuell bilaga till RPC:n `book_transaction_atomic`. Databasen hämtar användarens `accounts`-rad, skapar `transactions`, verifikationsnummer och `journal_entries` atomiskt, samt skapar momsrad för stödda svenska momssatser där det behövs.

Vanliga bokningar bygger alltså inte direkt journalrader i klienten.

### Redigering Och Rättelser

`updateTransaction()` anropar `update_transaction_safe`. Bokförda transaktioners ekonomiska kärna skyddas server-side; tillåtna metadataändringar går via RPC.

`createCorrectionTransaction()` anropar `create_correction_transaction_atomic`. En felaktig bokning rättas med en separat KORRVER som spegelvänder journalraderna. Historiken hårdraderas inte i normalflödet.

`src/lib/transactionSourceUi.ts` styr vilka transaktionskällor som får generisk edit/correction i UI. Systemstyrda källor som momsavslut, VAT V2, momsavräkning och skattekontorörelser behandlas särskilt.

### Momsrapport Och Momsperiod

`src/components/Momsrapport.tsx` är huvudvyn för momsrapport, periodstatus, stängning, deklarationsmarkering och skattekontohändelser.

Aktuella momsperioder skapas/läses via `ensureVatPeriods()` och `getVatPeriods()` i `accountingService.ts`. Stängning går via `close_vat_period_atomic`, och deklarationsmarkering via `declare_vat_period_atomic`.

Momsrapportens fält beräknas genom:

- `src/lib/vatReportService.ts` - laddar relevanta transaktioner, journalrader och VAT V2-snapshots komplett.
- `src/lib/vatReportAggregation.ts` - summerar SKV-fält och stoppar vid osäkerhet.
- `src/lib/vatReportPresentation.ts` - gör resultatet begripligt för UI.
- `src/lib/legacyVatInference.ts` - begränsad, säker BAS-baserad inferens för äldre/manuella/SIE-rader.

Ambigua legacy/SIE-rader med reverse-charge-indikatorer ska blockera momsrapporten i stället för att gissas.

### VAT V2 Och Utländska Inköp

VAT V2 är behandling-först, inte konto-först.

Vägen är:

```text
profil + transaktionsfakta
  -> vatProfileAdapter
  -> vatTreatmentDecision
  -> vatTransactionPreflight
  -> vatJournalPlan
  -> vatAuditSnapshot
  -> book_vat_v2_eu_service_reverse_charge_atomic
```

Viktiga filer:

- `src/lib/vatDomain.ts` definierar profil, fakta och treatment-typer.
- `src/lib/vatTreatmentDecision.ts` avgör om fakta räcker och vilken behandling som gäller.
- `src/lib/vatTransactionPreflight.ts` kopplar formulärfakta till treatment och blockeringsmeddelanden.
- `src/lib/vatJournalPlan.ts` bygger journalplanen för verifierad VAT V2-slice.
- `src/lib/vatAuditSnapshot.ts` bygger audit snapshot som senare momsrapporten kan verifiera mot.
- `src/lib/vatRuntimeBooking.ts` hanterar runtime-idempotens, filsignatur och submit-skydd.
- `src/lib/accountingService.ts` anropar den kontrollerade VAT V2-RPC:n.

Nuvarande persistenta VAT V2-slice är EU-tjänst med omvänd moms inom det verifierade stödet. Bredare VAT V2-scope finns i backlog/epics men ska inte beskrivas som implementerat.

### Momsbetalning Och Skattekonto

SoloLedger skiljer på två närliggande saker:

- `Skatter & avgifter - eget uttag` / BAS 2012 som användarkategori för ägarens privata skatter/F-skatt betalda med firmans pengar.
- Kontrollerade moms-/skattekontoflöden i momsrapporten.

Kontrollerad momsavräkning använder:

- `tax_account_events` för händelsen på skattekontot kopplad till momsperiod.
- `record_vat_settlement_atomic` via `src/lib/vatSettlementRpc.ts`.
- `src/lib/vatSettlementUi.ts` för read model, validering och idempotens i UI.

Överföring till/från skattekonto använder:

- `tax_account_movements`.
- `record_tax_account_movement_atomic` via `src/lib/taxAccountMovementRpc.ts`.
- `src/lib/taxAccountMovementUi.ts` för val, riktning, labels och idempotens.

`company_payment_account_roles` används när ett flöde behöver veta vilket BAS-konto som är företagets betalningskonto eller ägarens privata betalningskonto.

### Periodisering

Periodisering över årsskifte finns implementerad för utgifter. UI:t i `page.tsx` kan skicka `periodisera` och framtida periodmånad till `bookPeriodizedTransaction()`, som anropar `book_periodized_transaction_atomic`.

Databasen skapar original- och vändningsverifikation atomiskt. Rättelser av periodisering hanteras av korrigeringsflödet så att vändningsverifikationen följer med.

### SIE Import Och Export

SIE-importflödet består av:

- `src/lib/sieParser.ts` - parser och validering av SIE-innehåll.
- `src/lib/cp437.ts` - teckenkodning för SIE.
- `src/lib/sieImport.ts` - importanrop mot `import_sie_batch`.
- `src/components/SieImportModal.tsx` - UI-steg för filval, preview och import.
- `src/components/ProfileSettings.tsx` - visar importhistorik och undo.

Importen är atomisk i databasen. Undo av orörd import går via `undo_sie_import_atomic` och skapar korrigeringsverifikationer i stället för att radera bokföringshistorik.

SIE-export finns i `src/lib/sieExport.ts`. Exporten laddar transaktioner, journalrader, konton och saldon med complete-safe läsningar och inkluderar använda konton även om de inte längre finns i användarens `accounts`.

### NE Och Förenklat Årsbokslut

`src/components/NEBilaga.tsx` visar NE-underlag och balansrader.

Beräkningen hämtas via `getNEData()` i `accountingService.ts`, som bygger på:

- `src/lib/resultEngine.ts` för resultatkonton och NE-rader R1-R10 samt olösta/scenario-beroende rader.
- server-side saldo-RPC:er för period- och balanssaldon.
- egen kapital-logik för insättningar, uttag och B-rutor.

Balanskonton beräknas kumulativt till årets slut. Resultatkonton beräknas per räkenskapsår.

### Årslås

`closed_years` lagrar låsta år per användare. `isYearClosed()` läser status, och `closeYear()` anropar `close_year_atomic`.

Bokförings-RPC:er kontrollerar låsta år innan relevanta skrivningar. UI:t döljer eller blockerar också ändringar, men databasen är den viktiga gränsen.

### Användarradering

Adminflödet finns i:

- `src/components/AdminPanel.tsx`.
- `src/lib/adminDeleteDryRun.ts`.
- `supabase/functions/delete-user/index.ts`.
- RPC:n `delete_user_data_atomic`.

Edge Function verifierar admin, hanterar Stripe och Storage, anropar atomisk databasradering, gör extra Storage-sweep och raderar Supabase Auth-användaren sist. DB-delen är atomisk; hela kedjan är inte globalt atomisk eftersom Stripe, Storage, Postgres och Auth är separata system.

## Kontomodellen

SoloLedger använder flera olika "konton"-begrepp. De får inte blandas ihop.

### Bokföringskategori I `accounts`

`accounts` är användarens valbara bokföringskategorier. En rad har kategori-ID, namn, debitkonto, kreditkonto, standardmoms och kommentar. När användaren väljer en kategori i vanlig bokning använder RPC:n raden för att skapa BAS-journalrader.

Historiska transaktioner sparar `transactions.type` som kategori-ID, men rapporter bygger på faktiska `journal_entries`.

### BAS-Kontonummer I `journal_entries`

`journal_entries.account_number` är det faktiska BAS-liknande kontonumret som rapporter, NE, moms, SIE och saldon räknar på. Om en kategori senare byter namn eller konto påverkar det inte redan bokförda journalrader.

### Systemkonto I Kunskapsmodellen

`SYSTEM_ACCOUNTS` i `src/lib/accountingKnowledge.ts` är BAS-konton som SoloLedger behöver förstå men som normalt inte ska vara vanliga användarkategorier. Exempel: 1930, 2010, 2012, 2611, 2641, 2650 och 7830.

### Payment Account Role

Payment roles beskriver vilken användarkonfigurerad roll ett BAS-konto har i betalningsflöden:

- `business_payment_account`
- `owner_private_payment`

De sparas i `company_payment_account_roles` först när användaren/funktionen konfigurerar dem. De är inte samma sak som `accounts`.

### VAT/Tax-Account Lifecycle Data

Tabeller som `vat_periods`, `vat_audit_snapshots`, `tax_account_events`, `tax_account_movements` och `vat_v2_booking_idempotency` är lifecycle-/auditdata. De ska inte ersättas med vanliga bokföringskategorier.

### Dagens Canonical Defaults

Nya användare får 9 defaultkategorier från `getDefaultAccountPresetsV1()`:

| ID | Namn | Debet | Kredit | Moms |
|---|---|---:|---:|---:|
| `forsaljning` | Försäljning | 1930 | 3010 | 25 |
| `forbrukningsinventarier` | Förbrukningsinventarier | 5410 | 1930 | 25 |
| `programvaror` | Programvaror & prenumerationer | 5420 | 1930 | 25 |
| `resor` | Resor i verksamheten | 5800 | 1930 | 6 |
| `bankavgift` | Bankavgifter | 6570 | 1930 | 0 |
| `kurser` | Kurser & fortbildning | 6991 | 1930 | 0 |
| `skatter_avgifter` | Skatter & avgifter - eget uttag | 2012 | 1930 | 0 |
| `eget_uttag` | Eget uttag | 2013 | 1930 | 0 |
| `egen_insattning` | Egen insättning | 1930 | 2018 | 0 |

Kontoplanens snabbförslag kommer från `getQuickAccountPresetsV1()` och är 14 stycken: `varor_material`, `kopta_tjanster_kunduppdrag`, `lokalhyra`, `el_verksamhetslokal`, `frakt`, `egen_bil`, `reklam`, `kontorsmaterial`, `mobiltelefoni`, `internet`, `porto`, `foretagsforsakring`, `redovisningstjanster`, `it_tjanster`.

Kunskapslagret har 14 systemkonton i `SYSTEM_ACCOUNTS`.

Äldre användare kan ha legacy category IDs och äldre defaults. UI-kompatibilitet för kända canonical/legacy-ID:n finns i `src/lib/accountCategoryUi.ts`. Det finns ingen generell automatisk upgrade-motor som skriver om befintliga användares kontoplaner.

## Inventarier Och Avskrivningar

Nuläget är medvetet delvis:

- `BOOKING_CATEGORIES` har guided kategori `inventarier` med primary account 1220.
- `SYSTEM_ACCOUNTS` känner till 7830 som systemkonto för avskrivning på inventarier.
- `resultEngine.ts` kan klassificera 783x till R10 och 782x till R9.
- `getNEData()` placerar 1220-1249 i B4 Maskiner och inventarier.
- SIE-export tar med använda journal-/balanskonton även om de inte finns som `accounts`-rader.

Det finns däremot inget dedikerat inventarieregister, ingen nyttjandeperiod/livslängd, ingen avskrivningsplan och ingen automatisk årlig avskrivningsverifikation. Framtida produktarbete är fångat i Jira KAN-36.

Legacy-kategorin `avskrivning_inventarier` i `ACCOUNT_PRESETS` ska inte framställas som en nödvändig vanlig defaultkategori. Den är legacy-kunskap, inte ett bevis på att ett komplett avskrivningsflöde finns.

## Viktiga Mappar Och Filer

### Root Och Konfiguration

- `package.json` - npm-skript, Next/React/Supabase/Stripe-beroenden och testkommandon.
- `next.config.ts` - Next-konfiguration.
- `eslint.config.mjs` - ESLint-konfiguration.
- `tsconfig.json` - TypeScript-konfiguration.
- `playwright.config.ts` - Playwright-konfiguration.
- `postcss.config.mjs` - PostCSS/Tailwind-relaterad konfiguration.
- `README.md` - kort produkt- och utvecklingsöversikt.
- `AGENTS.md` - arbetsregler för Codex/utvecklingssessioner.
- `PROJECT_STATE.md` - aktuell handoff/status.
- `PROJECT_ARCHIVE.md` - kompakt historik för avslutade arbetsströmmar.
- `Architecture.md` - detta dokument.

### `src/app`

- `page.tsx` - huvudapplikationen: tabbar, formulärsubmit, filuppladdning, SIE-export, periodisering, VAT V2-runtime och koppling mellan hooks och komponenter.
- `layout.tsx` - Next root layout och font/global layout wiring.
- `globals.css` - global styling.
- `icon.svg` - appikon.
- `api/checkout/route.ts` - server-side verifierad Stripe Checkout.
- `api/portal/route.ts` - server-side verifierad Stripe Customer Portal.
- `api/webhook/route.ts` - Stripe-webhook som synkar subscription-status till `profiles`.

### `src/components`

- `AdminPanel.tsx` - adminvy för användare, dry-run och permanent radering.
- `EmptyBookkeepingState.tsx` - tomt bokföringsläge i UI.
- `FAQ.tsx` - informations-/hjälptexter. Viss skattekonto/moms-copy kan behöva framtida översyn så den tydligt skiljer 2012 som eget uttag från kontrollerade momsflöden.
- `FavoriteChips.tsx` - sparade favoritbokningar.
- `Kontoplan.tsx` - UI för användarens `accounts`, snabbförslag, manuell kategori, edit/delete och BAS-varningar.
- `Layout.tsx` - navigation, aktiv tab, logout och adminflik.
- `Momsrapport.tsx` - momsrapport, momsperioder, stäng/deklarera, momsavräkning och skattekontorörelser.
- `NEBilaga.tsx` - NE-underlag och balansrader.
- `OverviewCards.tsx` - dashboardkort för bank, intäkter, kostnader, resultat, moms och säkert uttag.
- `Paywall.tsx` - meddelande för låsta funktioner.
- `ProfileSettings.tsx` - profil, momsprofil, lösenord, SIE-importhistorik och undo.
- `SieImportModal.tsx` - SIE-importens filval, parsing, preview och import.
- `SubscribeButton.tsx` - startar Stripe Checkout.
- `SubscriptionGuard.tsx` - UI-gate för prenumerationsfunktioner.
- `TransactionForm.tsx` - vanlig bokning och VAT V2-faktainsamling; hanterar kategori, moms, bilaga, periodisering och payment-role-konfiguration.
- `TransactionTable.tsx` - historik, journalrader, källbadges, KORRVER, SIE-undo-grupper och systemtransaktionsskydd.

### `src/hooks`

- `useAuth.ts` - Supabase Auth, profil, login/register/logout, password recovery och profiluppdatering.
- `useAccountingData.ts` - årsspecifik laddning av transaktioner, journalmap, saldon, balanssaldon, NE, momsöversikt, kontoplan och årslås.

### `src/lib` - Bokföring Och Rapporter

- `accountingService.ts` - central klientnära service för bokförings-RPC:er, momsperioder, skattekontohändelser, saldon, rättelser, periodisering, årslås och NE-data.
- `resultEngine.ts` - ren motor för resultat- och NE-klassificering. Ska inte få I/O.
- `calculations.ts` - dashboardberäkningar ovanpå saldon och momsbreakdown.
- `supabaseClient.ts` - browser-Supabase-klient.
- `supabaseFetchAll.ts` - strikt fetch-all/chunk-helper för läsningar som inte får tyst trunkeras.
- `subscriptionLimits.ts` - free/trial/paid/admin-regler och räknad gratisanvändning.
- `adminDeleteDryRun.ts` - normalisering och labels för admin delete dry-run.

### `src/lib` - Konton Och Kunskap

- `accountingKnowledge.ts` - canonical kontoplan/kunskapsmodell, defaultkategorier, snabbförslag, systemkonton, BAS-hjälp, payment-role-validering och legacy presets.
- `setupDefaultAccounts.ts` - seedar dagens 9 canonical defaultkategorier för nya användare.
- `accountCategoryUi.ts` - UI-kompatibilitet för canonical/legacy category IDs i bokningsformulär och historik.
- `paymentAccountRoles.ts` - läser/skriver användarens payment account roles.

### `src/lib` - SIE

- `sieParser.ts` - SIE-parser, strukturering och validering.
- `sieImport.ts` - anropar `import_sie_batch`.
- `sieExport.ts` - skapar SIE 4-export med komplett verifierad dataladdning.
- `cp437.ts` - kodning till SIE/PC8.

### `src/lib` - VAT V2 Och Momsrapport

- `vatDomain.ts` - typad momsdomän: profil, fakta, treatment och rapportfält.
- `vatProfileAdapter.ts` - mappar `profiles` till VAT domain-profil.
- `vatTreatmentDecision.ts` - bestämmer treatment eller blockerar vid saknad/osäker fakta.
- `vatTransactionPreflight.ts` - UI-nära preflight för VAT V2-transaktioner.
- `vatJournalPlan.ts` - bygger kontrollerad journalplan för verifierad VAT V2-slice.
- `vatAuditSnapshot.ts` - bygger audit snapshot och reconciliation för VAT V2.
- `vatRuntimeBooking.ts` - runtime submit guard, idempotens, filsignatur och felklassning för VAT V2-bokning.
- `vatPaymentSource.ts` - val och readiness för vilket betalningskonto/roll som används i VAT V2.
- `vatReportService.ts` - dataladdning och servicegräns för momsrapporten.
- `vatReportAggregation.ts` - fältaggregering och blockeringslogik.
- `vatReportPresentation.ts` - presentation av momsrapportresultat och blockeringsmeddelanden.
- `legacyVatInference.ts` - begränsad BAS-baserad inferens för äldre/manuella/SIE-momsrader.
- `vatLifecycleUi.ts` - UI-regler/texter för momsperiodstatus och deklarationsdatum.
- `vatDeclarationRpc.ts` - bygger argument till deklarations-RPC.
- `vatSettlementRpc.ts` - RPC-kontrakt för momsavräkning på skattekontot.
- `vatSettlementUi.ts` - read model, labels, validering och idempotens för momsavräkning.
- `vatSettlementErrors.ts` - felklassning för momsavräkning.
- `taxAccountMovementRpc.ts` - RPC-kontrakt för pengar till/från skattekontot.
- `taxAccountMovementUi.ts` - read model, val, labels och idempotens för skattekontorörelser.
- `taxAccountMovementErrors.ts` - felklassning för skattekontorörelser.

### Scripts Och Tester

`package.json` har:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:domain`
- `npm run test:e2e`
- `npm run test:regression`

Viktiga scripts:

- `scripts/test-result-engine.ts` - resultat/NE-motor.
- `scripts/test-accounting-knowledge.ts` - canonical default/quick-kategorier.
- `scripts/test-account-category-ui.ts` - canonical/legacy category-ID UI-kompatibilitet.
- `scripts/test-vat-*.ts` - VAT domain, treatment, journal, audit snapshot, runtime, rapport, lifecycle och settlement.
- `scripts/test-tax-account-movement-ui.ts` - skattekontorörelse-UI/service.
- `scripts/test-sie-export-completeness.ts` - komplett SIE-export.
- `scripts/test-supabase-fetch-all.ts` - fetch-all/chunk-helper.
- `scripts/test-dashboard-calculations.ts` - dashboardberäkningar.
- `scripts/test-payment-account-roles.ts` och `.sql` - payment account roles.
- `scripts/test-admin-delete-dry-run.ts` - admin deletion dry-run count shape.
- `scripts/run-playwright-e2e.mjs` och `tests/e2e/public-auth.spec.ts` - publik/auth smoke-E2E.
- SQL-testfiler under `supabase/tests/` - migrations-/RPC-kandidat- och regressionstester för DB-flöden.

### Supabase

- `supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql` - aktiv CLI-cutover/reconstruction-baseline för den manuellt applicerade legacy-SQL-eran.
- Senare migrationsfiler bygger vidare med VAT account classification, VAT V2, payment roles, declarations, settlements, tax-account movements, audit hardening, delete-user coverage, idempotency och complete-safe balance RPCs.
- `supabase/baseline/` - audit/recovery snapshot av produktionsschema. Ska inte köras mot liveprojektet.
- `supabase/migration_archive/pre_20260925000000_legacy_date_only/` - historiska manuella SQL-filer. Arkiv, inte aktiv migrationskedja.
- `supabase/functions/delete-user/` - Edge Function för adminstyrd permanent användarradering.
- `supabase/.temp/` - genererad Supabase CLI-state lokalt; ska normalt inte läsas för innehåll, ändras eller committas.

## Centrala Databaskontrakt

Viktiga tabeller:

- `profiles` - profil, företag, momsprofil, roll, Stripe/prenumeration.
- `accounts` - användarens bokföringskategorier.
- `transactions` - bokföringshändelser/verifikationer och source/correction/importmetadata.
- `journal_entries` - faktiska debet-/kreditrader.
- `favorites` - sparade favoritbokningar.
- `closed_years` - låsta räkenskapsår.
- `import_batches` - SIE-importhistorik och undo-status.
- `ver_nr_sequences` - användarens verifikationsnummersekvens.
- `vat_periods` - momsperioder och status.
- `vat_audit_snapshots` - VAT V2 audit/reconciliation.
- `company_payment_account_roles` - användarkonfigurerade payment roles.
- `tax_account_events` - momsavräkning på skattekontot.
- `tax_account_movements` - pengar till/från skattekonto.
- `vat_v2_booking_idempotency` - durable idempotens för VAT V2-bokning.

Viktiga RPC:er:

- `book_transaction_atomic`
- `update_transaction_safe`
- `create_correction_transaction_atomic`
- `book_periodized_transaction_atomic`
- `import_sie_batch`
- `undo_sie_import_atomic`
- `close_year_atomic`
- `ensure_vat_periods`
- `close_vat_period_atomic`
- `declare_vat_period_atomic`
- `book_vat_v2_eu_service_reverse_charge_atomic`
- `record_vat_settlement_atomic`
- `record_tax_account_movement_atomic`
- `get_period_account_balances`
- `get_cumulative_account_balances`
- `delete_user_data_atomic`

## Legacy Och Kompatibilitet

Följande delar kan se gamla ut men fyller fortfarande en roll:

- `ACCOUNT_PRESETS` i `accountingKnowledge.ts` innehåller legacy-kategorier och historisk kompatibilitet. Dagens nya användare seedas däremot från `BOOKING_CATEGORIES` via `getDefaultAccountPresetsV1()`.
- `accountCategoryUi.ts` stödjer både canonical och legacy category IDs, exempelvis `skatter_avgifter`/`skattekonto_default` och `egen_insattning`/`egen_insättning`.
- `legacyVatInference.ts` behövs för äldre, manuella och SIE-importerade momsverifikationer.
- `transactionSourceUi.ts` behövs för att gamla och nya `transactions.source`-värden ska presenteras och skyddas rätt.
- `supabase/migration_archive/` och den stora CLI-baselinen är historiska men viktiga för audit/reconstruction. De ska inte städas bort bara för att de inte är framtida migrationsmallar.

Misstänkta framtida cleanup-kandidater att utreda separat:

- Kommentarer i `accountingKnowledge.ts` runt legacy helpers säger fortfarande att de används av nuvarande setup/Kontoplan, trots att dagens kod använder V1-helpers. Ändra inte utan separat scope.
- `FAQ.tsx` har copy om "Skattekonto (2012)" som bör skilja tydligare mellan privat skatt/F-skatt och dagens kontrollerade moms-/skattekontoflöden.
- Full repo lint har äldre `any`-/React-lintskuld i flera filer; det är inte del av denna arkitekturdokumentation.

## Var Ändrar Jag Vad?

- Ny vanlig bokföringskategori eller defaultkonto: `src/lib/accountingKnowledge.ts`, `src/lib/setupDefaultAccounts.ts`, eventuellt `scripts/test-accounting-knowledge.ts`.
- UI-gruppering av category IDs: `src/lib/accountCategoryUi.ts`, `TransactionForm.tsx`, `TransactionTable.tsx`.
- Vanligt transaktionsformulär: `src/components/TransactionForm.tsx` och submit-hantering i `src/app/page.tsx`.
- Transaktionshistorik och systemkällor: `src/components/TransactionTable.tsx` och `src/lib/transactionSourceUi.ts`.
- Ny bokföringsskrivning/RPC: ny Supabase migration, wrapper i `src/lib/accountingService.ts`, relevanta DB-tester under `supabase/tests/`.
- Resultat/NE-mappning: `src/lib/resultEngine.ts`, `src/lib/accountingService.ts`, `src/components/NEBilaga.tsx`, `scripts/test-result-engine.ts`.
- Dashboard-siffror: `src/lib/calculations.ts`, `src/components/OverviewCards.tsx`, `scripts/test-dashboard-calculations.ts`.
- Momsrapport: `vatReportService.ts`, `vatReportAggregation.ts`, `vatReportPresentation.ts`, `Momsrapport.tsx`.
- VAT V2 treatment: `vatDomain.ts`, `vatTreatmentDecision.ts`, `vatTransactionPreflight.ts`, `vatJournalPlan.ts`, `vatAuditSnapshot.ts`, `vatRuntimeBooking.ts`.
- Momsperiod close/declare: `accountingService.ts`, `vatLifecycleUi.ts`, `Momsrapport.tsx`, migrations/RPC.
- Momsavräkning på skattekonto: `vatSettlement*.ts`, `Momsrapport.tsx`, `tax_account_events`.
- Pengar till/från skattekonto: `taxAccountMovement*.ts`, `Momsrapport.tsx`, `tax_account_movements`.
- Payment account roles: `accountingKnowledge.ts`, `paymentAccountRoles.ts`, `vatPaymentSource.ts`, `TransactionForm.tsx`.
- SIE-import: `sieParser.ts`, `sieImport.ts`, `SieImportModal.tsx`, `ProfileSettings.tsx`, `import_sie_batch`.
- SIE-export: `sieExport.ts`, `cp437.ts`, exportknapp i `page.tsx`.
- Användarradering: `AdminPanel.tsx`, `adminDeleteDryRun.ts`, `supabase/functions/delete-user/index.ts`, `delete_user_data_atomic`.
- Prenumeration/Stripe: `src/app/api/checkout`, `src/app/api/portal`, `src/app/api/webhook`, `subscriptionLimits.ts`.
- Fetch completeness: `supabaseFetchAll.ts`, KAN-33 RPCs, berörda servicefiler.

## Saker Som Inte Ska Antas Finnas

- Ingen generell automatisk upgrade-motor för gamla användares `accounts`.
- Inget komplett inventarie-/avskrivningsflöde.
- Ingen self-service permanent kontoradering.
- Ingen elektronisk inlämning av NE eller momsdeklaration till Skatteverket.
- Ingen generell internationell försäljningsmotor i VAT V2.

## Integritetsregler Att Bevara

- Bokföringshistorik rättas med kontrollerade flöden, inte tyst mutation.
- Journalrader är ekonomisk sanning för rapporter och export.
- Centrala bokföringsskrivningar går via server-side/databas-side validering.
- RLS, grants, constraints och triggers är säkerhetsgränser.
- Låsta år och stängda/deklarerade momsperioder ska stoppa relevanta ändringar.
- Complete-safe rapportläsning ska bevaras där ekonomiska belopp summeras.
- Om fakta saknas och kan ändra moms-/bokföringsbehandling ska SoloLedger stoppa eller be om mer fakta.
