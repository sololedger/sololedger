# SoloLedger Project State

Avstämt 2026-10-21. **Inventarie-UX/profilutkast LOCAL PASS; kompletterande Staging kräver beslut.**
LOCAL → STAGING → PRODUCTION. Produktmål och permanenta regler finns i AGENTS.md.
Inga externa ändringar är gjorda i det aktuella UX-uppdraget.

## Aktuell lokal kandidat

- Arbetskopia: `audit-packages/KAN-62-rule-contract-local`, bevarad vanlig lokal klon.
- Gren **codex/inventory-ux-profile-drafts**, bas **ad0f54c3fee016bc53ac841d7ebd1646cf4a36da**.
- Kodcheckpoint **261147ccd71d57ea9e989da4d5185c30f912a2d1**, följande docscheckpoint innehåller
  denna state, arkitekturanteckning och **docs/reviews/INVENTORY-UX-LOCAL-PASS.md**.
- Den godkända inventariegrenen **codex/KAN-62-65-73-76-inventory** står kvar på ad0f54c.
  Äldre KAN-62-checkpoint **89afeefa90faa3ad0c3a6d7622a739c3fcfa7ebc** bevarad som förfader.
- Origin är lokal KAN-97-kopia, INTE GitHub. Root Desktop/staging är separat docs-/verktygskedja;
  pusha aldrig den som produktrelease. Exakt UX-release ska tas från denna kandidatgren.
- **Nästa steg:** ledarbeslut om exakt UX-SHA till Staging och avgränsad syntetisk UI-acceptans.
  Inga migrationer behövs. Ingen push/deployment/hosted dataändring utan nästa godkännande.

## Implementerat i UX-kompletteringen

- Förhandsbedömning visar faktiska domänvärden för betalning, avdragsgill moms, direkt
  resultatkostnad eller aktiverat inventarievärde. Privat betalning beskrivs som egen insättning.
- Årsavskrivningens serverbelopp förklaras som resultat-/värdeminskning utan bankbetalning/moms.
  Paketomklassningens separata effekt förklaras; inga parallella ekonomiska beräkningar.
- Kontextuell hjälp, tangentbord/Escape och mobil placering. Blockerad bedömning anger orsak
  och spärrar knappen. Fastställt årsunderlag får inte spärra säkra direktavdrag/kortliv.
- Registerknappen heter **Inte längre i bruk**, med tydlig registereffekt utan ekonomisk avyttring.
- Profilutkast i användarägt HomeSession-minne överlever intern navigation och profil-refresh.
  Företags-/moms-/betalningskonto- och lösenordsfält har fortsatt separata aktiva sparåtgärder.
  Nyare ändring under save bevaras; logout/kontobyte rensar. Ingen browserlagring/persistens.
  Bokföringen använder enbart sparad profil/konfigurerade roller, aldrig utkastet.
- Dashboard/modal: **Moms att få tillbaka**, **Moms att betala**, neutral **Moms i balans**.
  Positiva presentationsbelopp; signerade data och momsrapportens beräkning oförändrade.
- Inga ändringar i RPC/SQL, migrationskedja, fixedAssets-domän, accountingService,
  calculations/resultat/NE, momsaggregation/service, RLS, datamodell i DB eller dependencies.

## Verifiering

- **LOCAL PASS**: hel domänsvit (`inventory-ux-domain-r02.log`), slutlig fokuserad UX
  (`inventory-ux-focused-final-r02.log`), befintlig profil-/Auth-regression och typer.
- Slutligt **Next16.2.6/Turbopack standardbygge PASS**, TypeScript och 8/8 statiska sidor,
  `inventory-ux-build-final-r01.log`. Endast syntetisk localhost-konfiguration.
- Faktiska komponentprov: momsfordran/skuld/noll/kontrollspärr, full/ingen/delvis avdragsrätt,
  privat betalning, kortliv/gränser/paket, årsbelopp och säker registerstatus, desktop/375px hjälp.
- Profilprov: navigation/remount/refresh, aktiv separat sparning, sparad-only bokningsmoms,
  betalningskonto/lösenordsutkast, A→B→A/logout och tom localStorage/sessionStorage.
- Ren riktad lint PASS utan varningar. ProfileSettings: 9 befintliga fel mot 11 vid bas;
  page: oförändrade 10. Inga nya regel-/feltyper; full repo-lint påstås inte grön.
- 58 migrationshashar verifierade offline; inga DB-anrop eller stora DB-sviter i detta uppdrag.
- Bevis i kandidatens ignorerade `coverage/kan62-local-db/inventory-ux-*` och
  `test-results/inventory-ux-1792585665323/`. Tidigare FAIL-försök/bilder/bevis bevaras.
- Utkast överlever inte full omladdning/stängd app/utloggning. Delvis momsavdrag får inget nytt stöd.
  Ingen ny hosted UI-verifiering för denna UX-kandidat påstås.

## Bevarad ekonomisk grund och senast verifierat externt läge

- Gemensam KAN-62/65/73/76: **LOCAL PASS och STAGING PASS**. Ledaren har därefter uppgett
  manuell acceptans för normalt direktavdrag, aktivering och kollektiv årsavskrivning.
- Senaste externa kontroll 2026-10-21 11:00 UTC: GitHub staging **ad0f54c**, Vercel Preview
  **dpl_A3wWJNXdbyENpg7bD8vxBECKb9KN READY**, ordinarie Staging-alias pekar dit och serverar
  rätt klient. Den gamla KAN-80-aliasassociationen rättades i separat godkänt steg.
- Supabase Staging **fzxqiqenqjzhlyxxpvhg**: **58 migrationer, 96 funktioner** verifierade.
  Senaste godkända tillägg: 20261020233000, 20261021120000, 20261021123000, 20261021130000.
  Kör dem inte igen. Tidigare 22+6 API-testgrupper och faktisk hosted UI/rapportkedja PASS.
- Tidigare djup lokal regression: 59 lyckade/114 negativa KAN-62-anrop, 9+10 samtidighetsfall,
  tvåårskedja, deklarerad momsperiod, replay/RLS/privata anrop. Bevis återanvänds, inte omkörda.
- Lokal syntetisk DB **sololedger_kan62_disposable_20261021**, **127.0.0.1:5432**, OID57199,
  identitetsmarkör i ignorerad coverage-fil. Befintliga data/arbetskopior bevaras; ingen reset.
- Senast verifierad Production: main **d4320f5d6524216948904e0e58cae3a30ddd76fa**, KAN-105,
  Supabase **wbaxmuvudpnkvuliicuy** med 52 migrationer. Inte nyansluten/kontrollerad i UX-steget.
  Production kräver separat exakt release- och migrationshistorikbedömning; anta inget urval.
- Krediter/avyttring av aktiverade tillgångar, automatisk avskrivningsrättelse, osäkra ingående
  värden, okänd/avvikande årslängd, EU/obetalda köp och partiellt avdrag förblir utanför stödet.
  Normala kalenderår med verifierade regler 2025/2026; andra år stoppas utan regelparametrar.
- Ingen Jira-statusändring ingår. Tidigare statusar ska inte tolkas som nykontrollerade här.

## Bevarat övrigt arbete

- Root AGENTS.md:s tidigare personalavgränsning är orörd och exkluderas från scoped docscommit.
  Root `audit-packages/` och `scripts/create-kan63-staging-user.mjs` är tidigare lokalt material.
- Övriga arbetskopior, auth/miljöfiler och verkliga användardata/Jessikas bokföring orörda.
- Tidigare separat SIE/flerårshistorik finns i PROJECT_ARCHIVE.md; aktiva UX-bevis arkiveras inte.
