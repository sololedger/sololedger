# SoloLedger Project State

Avstämt 2026-10-21 efter återstart. **Gemensam inventariekandidat LOCAL PASS.**
Arbetsmodell: LOCAL → STAGING → PRODUCTION. Ingen Staging-publicering godkänd.
Produktmål/prioriteringar finns i AGENTS.md: korrekt och enkel bokföring år efter år för Jessika.

## Aktuell kandidat och nästa steg

- Scope: KAN-62/65/73/76 inklusive säker kollektiv K1-årsavskrivning för normalfall.
- Arbetskopia: `audit-packages/KAN-62-rule-contract-local`, vanlig bevarad lokal klon.
- Gren **codex/KAN-62-65-73-76-inventory**.
- Produktcheckpoint **ab664fc61a21dbce2fabe4feaf763eec36a9b5e7**; följande docscheckpoint
  innehåller denna state, Architecture.md och samlad verifieringsrapport.
- Bevarad KAN-62-förfader **89afeefa90faa3ad0c3a6d7622a739c3fcfa7ebc**, även på
  `codex/KAN-62-staging-preparation`. Ingen historikomskrivning eller orelaterad produktcommit.
- Kandidatens origin är lokal KAN-97-kopia, INTE GitHub. `github/main`/`github/staging`
  är tidigare hämtade GitHub-referenser. Root Desktop/staging får inte pushas som produktrelease.
- **Nästa säkra steg:** ledargranska lokal checkpoint och förbered exakt gemensam
  Staging-acceptans. Stoppa före push, hosted migration, byggspärrändring eller deployment.
- Full rapport: **docs/reviews/INVENTORY-LOCAL-PASS.md** i kandidaten.
  Tidigare analys finns i root `audit-packages/KAN-62-INVENTORY-DELIVERY-REVIEW-20261021.md`.

## Implementerat och verifierat

- KAN-62:s strikt netto-under-29 600-regel 2026, ej avdragsgill moms i bokfört värde,
  beständiga paket, kortliv, preview/server och tidigare säkerhetskontroller bevarade.
- KAN-65: ägarbundna tvåvägslänkar köp/omklassningsjournal, sökning och mobil/desktop.
- KAN-73: verklig 2641 från komplett validerat inventarieverifikat i momsrapport/dashboard;
  momsavslut/deklarationsavstämning bevarad, momsfri årsavskrivning tillåts efter momsavslut.
- KAN-76/K1: gemensam server-preview/bokning, komplett historik, årsföljd, lås/replay,
  nollvärde och skydd mot sena underlagsändringar. Högst halvt PBB → hel avskrivning,
  annars 30 procent. Bekräftelse av normalt kalenderår och färdiga årsinköp krävs.
- **Full SQL PASS** `runs/inventory-sql-r07`: även gamla KAN-62:s 59 lyckade/114 negativa
  anrop, äldre replay efter uppgradering, journalrader/balanser, klientroller/RLS/privata anrop.
- **10/10 nya samtidighetsfall PASS** `runs/inventory-concurrency-r03`, inklusive verklig
  låsväntan, moms-/årsstängning, lika/ändrad replay och olika ägare.
- **9/9 tidigare KAN-62 samtidighetsfall PASS** `runs/inventory-kan62-concurrency-r01`.
- Två år med/utan momsavdrag: faktiska journaler → moms/NE R10/B4/dashboard PASS.
- Hel domänsvit, säkra regressionens återstående sju delar, panel/historiklänkar,
  TypeScript, scoped lint, offlinevakter, DB-invarianter och admin-delete dry-run PASS.
- Standard **Next16.2.6/Turbopack build PASS**, 8/8 statiska sidor; publik smoke på byggd
  app **2/2 PASS**. Tidigare Turbopack-fel återkom inte. Syntetisk localhost-konfiguration.
- TransactionTable har 13 befintliga lint-fel, oförändrat mot 89afeef; full repo-lint
  påstås inte grön. Hosted JWT/HTTP och autentiserad Staging-acceptans är inte körda.
- Bevis bevaras i kandidatens ignorerade `coverage/kan62-local-db/`, inga gamla FAIL-försök
  eller fixtures raderade. Rapporten anger exakta bevisvägar och verifieringens gränser.

## Isolerad lokal databas och migrationsurval

- Enda skrivmål: **sololedger_kan62_disposable_20261021**, **127.0.0.1:5432**, PG17.11,
  OID **57199**; unik markör i ignorerad `coverage/kan62-local-db/database-identity.json`.
- 55 historiska migrationer oförändrade + tre nya installerade endast lokalt = 58.
  Manifest: `docs/reviews/INVENTORY-LOCAL-MIGRATIONS.json`; alla hashkontroller PASS.
- Slutlig READ ONLY-kontroll PASS: 60 syntetiska användare, 69 tillgångar, 152 transaktioner,
  323 journalrader, 29 årskörningar, inga obalanser eller kvarvarande testsessioner.
  Ursprungliga 19 användares rader, gemensamma roller/medlemskap och andra DB-metadata bevarade.
- Förväntat Staging-tillägg, ordning:
  1. `20261020233000_kan62_rule_contract.sql` (bevarad KAN-62-checkpoint).
  2. `20261021120000_inventory_k1_depreciation_contract.sql`.
  3. `20261021123000_inventory_journal_boundary.sql`.
  4. `20261021130000_inventory_prior_year_validation.sql`.
- Live ledger/definitioner/grants ska återjämföras före eventuell godkänd körning.
  Inga gamla migrationer/baseline ska återspelas. Ingen include-all/repair.
- Nya klienten kräver preview/checked RPC. Äldre integer-års-RPC är replay-only.
  Migration först under pausad inventarieacceptans, sedan matchande klient; gammal klient
  kan stoppas. Produktionsurval kräver separat kontroll av dess annorlunda migrationshistorik.

## Avgränsning och kvarstående risker

- Stöd: svenska betalda köp, full/ingen momsavdragsrätt, verifierade normala kalenderår;
  regelparametrar för 2025/2026. Andra regelår stoppas tills verifierade parametrar finns.
- Spärrat: aktiverade tillgångars kredit/avyttring/utrangering, automatisk rättelse av
  årsavskrivning, osäkra ingående/importerade värden, äldre körning utan verifierad
  årslängd, okända/förkortade/förlängda år. Ingen historisk datakonvertering.
- Ingen utvidgning till EU, obetalda fakturor, partiellt momsavdrag eller andra metoder.
  Säkra direktavdrag/korttidsinventarier blockeras inte av redan bokad årsavskrivning.
- Ingen ändring av Jessikas bokföring, push, extern migration, deployment eller Jira-mutation.

## Senast verifierade externa läge – inte nyligen ompublicerat

- GitHub main **d4320f5d6524216948904e0e58cae3a30ddd76fa** (KAN-105), Production READY
  `dpl_4axRc8RXNvcLoyna8HVbrccA9VFy`, sololedger.vercel.app, vid granskning 2026-10-21.
- Production Supabase `wbaxmuvudpnkvuliicuy`: 52 migrationer, senast 20261020130000.
- GitHub staging **d57161756fec9999094b1e068db2a1e9cde22b2b**; kandidatbasen inkluderar KAN-105.
- Staging Supabase `fzxqiqenqjzhlyxxpvhg`: 54 migrationer; extra 20261012123000/20261012153000.
- Vercel staging-byggspärr kvar vid senaste kontroll; ordinarie alias visade ännu KAN-80
  fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0. Aktuell inventariekandidat är inte publicerad.
- Äldre get_next_ver_nr-ACL-avvikelse i Staging ligger utanför detta scope.
- Jira senast återläst: KAN-62 In Review/Pontus, KAN-65 In Review/ej tilldelad,
  KAN-73/76 To Do/High/ej tilldelade. Ingen statusändring eller nytt Done-påstående.

## Bevarat övrigt arbete

- Root AGENTS.md:s tidigare personalavgränsning bevaras utanför denna scoped docscommit.
  Root `audit-packages/` och `scripts/create-kan63-staging-user.mjs` är tidigare lokalt material.
- Andra arbetskopior, miljöfiler/auth och testbevis bevaras. Ingen reset/radering/cleanup.
- Äldre separata SIE/flerårsrisker KAN-95/96/83/34 är inte lösta av inventarieuppdraget.
  Historik i PROJECT_ARCHIVE.md. Aktiv gemensam leverans arkiveras inte före acceptans.
