# KAN-90 – fullständig kontotäckning i NE

Datum: 2026-10-18. Endast lokal kandidat, ingen publicering eller databasskrivning.

## Bas och reproduktion

- GitHub main återläst: `fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0`, accepterad KAN-80. Separat lokal klon av bevarad exakt produktcommit, gren `codex/KAN-90-ne-account-coverage`. Desktop-kopians äldre produktkod används inte som bas. Inga managed worktrees skapade, flyttade eller städade.
- AGENTS, aktuell Desktop PROJECT_STATE, Architecture, relevanta arkivavsnitt och KAN-88-underlag lästa. Tidigare skrivskyddad analys återläst från chatten ”Granska SoloLedgers NE-kontotäckning”, 2026-10-18. Den analysens rättningar utanför KAN-90 införs inte här.
- Jira KAN-90 verifierad: Sololedger/KAN, Bug, initialt To Do, otilldelad. Övergång till In Progress och därefter In Review gjord inom uppdraget; tilldelad verifierad Pontus med kort granskningskommentar.
- Automatiskt före/efter-test med den verkliga tjänsten och NE-komponenten: 1210 debet 1000 och 2890 kredit 1000 försvinner i basversionens balansrader, differensen är 0 och den gamla gröna balanseringstexten visas. Kandidaten visar båda kontona med saldo och granskningsorsak trots samma differens 0.

## Minsta ändring

- `neAccountCoverage.ts`: ren kontroll av samtliga fyrsiffriga BAS-konton i klass 1–8 med saldo i rapportens befintliga indata. Resultatkonton läses för året, balanskonton kumulativt till årets slut.
- Tre explicita tillstånd: befintlig koppling, uttryckligt undantag, behöver granskning. Tekniska 899x följer befintligt undantag; eget kapital följer befintliga exakta 201x-konton.
- Balanskoppling identifieras genom den befintliga rena balansberäkningen med en isolerad enhetspost. Ingen ny parallell kontointervalltabell, NE-mappning eller skatteregel införs.
- Motsatta saldotecken på tillgångs-/skuldkonton varnas individuellt innan nettning/nollklippning kan dölja dem. Den uttryckliga befintliga moms-/skattenettningen B8/B14 och signerade kapitalberäkningen bevaras.
- Resultatklassificering använder befintlig motor. 3010 följer sparat KAN-88-underlag; osäkert underlag är fortfarande osäkert. Ingen klassificering utifrån dagens profil.
- `getNEData` tillför endast `accountCoverage`. Samma läsanrop med samma parametrar; alla tidigare returnerade värden, klassificeringsbeslut och varningar jämförs exakt mot HEAD före checkpoint.
- NE-vyn visar kontonummer, saldo och orsak, samt en öppningsbar kontotäckning med tre grupper. KAN-77-varningarna finns kvar och visar även saldo. Noll differens tillsammans med granskningsbehov visas i gult. Årslåsreglerna är oförändrade; en låsning intygar inte att NE är komplett.

## Integrationsyta

| Yta | Påverkan och verifiering |
| --- | --- |
| Journal, metadata, RPC-skrivningar, transaktionskällor | Ingen ändring, inga nya källor eller läsanrop. Testtransporten nekar varje oväntat anrop. |
| Momsrapport, perioder, dashboard, uttagsutrymme | Ingen ändrad beräkning. Befintliga domän-/UI-tester används. |
| NE/resultat/balans/årsslut | Endast nytt kontrollunderlag och presentation. Alla gamla servicefält jämförda exakt, inklusive B10 och R1/R2-fördelning. Års- och kumulativt underlag hålls åtskilda. |
| Betalningar, kundfordran, årsskifte | Ingen ny boknings-/betalningsväg. Syntetiskt flerårsfall kontrollerar saldoperiod och RPC-datum. |
| Rättelser, ånger, SIE, låsta år | Signerade saldon, delrättelse, full återföring till noll, verklig SIE-parser för ingående balanser och låst/öppet UI testas offline. Ingen verklig import eller rättelse körs. |
| DB, RLS, grants, schema och radering | Ingen ändring eller ny datadomän. Vid slutgranskning lästes Stagings tre NE-funktioner via pg_get_functiondef. Funktionskroppar matchar exakt motsvarande Production-basmigration efter whitespace-normalisering; SECURITY INVOKER, authenticated EXECUTE och nekad anon EXECUTE verifierade. Ingen ändring eller läsning av användarrader. Detta är kompatibilitetskontroll, inte full hosted acceptans. |

Ingen full bokförings-E2E krävs för denna additiva, skrivskyddade kontroll eftersom inga belopp eller bokningsvägar ändras. Inför Staging/Production: kontrollera ett representativt underlag med 1210/2890, jämför journal och befintliga NE-/moms-/dashboardvärden, kontrollera varningens nummer/saldo/orsak och att sparad KAN-88-fördelning består. Befintliga syntetiska fixturer kan användas utan nya bokningar; eventuell hosted testdataskrivning kräver separat uttryckligt godkännande.

## Verifiering

- Riktat `node scripts/test-ne-account-coverage.mjs --compare-head`: PASS. 21 service/renderingsfall, samtliga gamla fält identiska, samma RPC-anrop, oföränderliga saldon/beslut. Reproduktion mot basversionen ingår bara med explicit flagga, så regressionstestet fungerar även efter commit.
- Bortfall som tar ut varandra för både resultat och balans; okända resultatkonton; negativt saldo under 1 kr; nettning/nollklippning; avsiktlig skattenettning/fordran; omappat eget kapital; signerad rättelse, nollad återföring, årsskifte, SIE-ingång, sparad och saknad R1/R2-klassificering, tekniskt resultatkonto, tom rapport.
- Ett tillstånd per konto i en syntetisk matris med 8000 fyrsiffriga BAS-konton (1000–8999). Detta verifierar fullständighet i klassificeringen, inte att samtliga konton är sakligt rätt mappade enligt skattelagstiftningen.
- Riktig React/Tailwind/Playwright vid 1440, 390 och 320 px, tio fall × låst/öppet: PASS. Varningar och öppningsbar gruppering synliga, ingen horisontell överrinning, inga nätanrop eller skrivningar. Desktop- och mobilbilder visuellt granskade.
- Typkontroll, fokuserad lint och diffkontroll: PASS.
- Säkra regressionens samtliga delar PASS som delkommandon: domain (inklusive KAN-77/88/B14 och KAN-90), history-groups, history-presentation, history-ui, history-presentation-ui, ui-round, public-auth smoke 2/2, category-visibility-ui och standard-booking-browser. Standardkommandot npm run test:regression avslutades med fel efter känd Turbopack/dependency-junction-begränsning i smoke; detta omklassificeras inte till PASS. Ett avgränsat Webpack-smoke-omförsök med syntetisk processlokal localhost-konfiguration gav 2/2 PASS, och återstående offline-delar kördes separat och passerade. Inga credential-/env-/auth-filer har lästs eller kopierats.
- Inga hosted skrivtester, migrationer, bokningar eller importsparningar körda. Ingen full Production-/Staging-acceptans påstås. Slutgranskningens produktionsliknande build (npm run build -- --webpack) PASS, inklusive TypeScript och statiska sidor. Därefter next start med public-auth smoke 2/2 PASS. Enbart syntetisk processlokal localhost-konfiguration; inga miljöfiler lästa/kopierade. Full repo-lint upprepas inte; fokuserad lint för samtliga ändrade produkt-/testfiler PASS.

## Begränsningar och nästa beslut

- Negativa balanssaldon kan vara korrekt värdereglering/kontrakonto men kräver granskning i denna försiktiga kontroll. Ingen automatisk flytt eller gissning görs.
- ”Kopplade enligt befintliga regler” är inget skatterättsligt godkännande. KAN-91–94:s frågor om skattejusteringar, kontoplansbetydelse, resultatomföring och vidare granskning ändras inte. 4700/7970-besluten behålls. KAN-62/65 förblir pausade.
- Kandidatens produktfiler: `src/lib/neAccountCoverage.ts`, `src/lib/accountingService.ts`, `src/components/NEBilaga.tsx`, `scripts/test-ne-account-coverage.mjs`, `package.json`. Dokumentation: denna rapport och `PROJECT_STATE.md`. Ingen ändring i package-lock eller migrationskedjan.
- Pontus har därefter uttryckligen godkänt en lokal commit av endast KAN-90 efter slutkontrollerna. Checkpointens SHA hämtas med git log -1 i kandidatkopian; dess enda förälder ska vara fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0. Inget publiceringsmandat följer av den lokala commiten.

## Slutgranskning och isolerad Staging-plan

- GitHub main återläst till exakt fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0; kandidatens ursprungliga HEAD matchar. Endast sju KAN-90-filer i checkpointen: fem produkt-/testfiler enligt listan ovan, denna rapport och PROJECT_STATE.md. Inga beroenden, lockfiler, andra skript, migreringar eller Edge-filer ändrade. package.json är JSON-jämförd: enda skillnaden är registrering av det nya regressionstestet i test:domain, vilket även tar med det i test:regression.
- Extra regression för korrekt värdeminskning: 1220 debet 10000, 1229 kredit 2000, 2010 kredit 8000. B4 och B10 förblir 8000, differens 0, ingen ny årslåsspärr. 1229 visas försiktigt för kontroll; texten säger att detta kan vara korrekt och att bokföringen inte ska ändras bara för att ta bort varningen. Samtliga 21 fall jämför fortfarande alla gamla servicefält och årslåsstatus mot basversionen. Ingen ny klassificeringsregel infördes under slutgranskningen.
- Varningsspråket förklarar att belopp kan ta ut varandra. Varje konto visar saldo, vad som saknas och att bokningarna behöver kontrolleras; redovisningskunnig hjälp rekommenderas vid osäkerhet. Ingen ny spar-/omklassificeringsfunktion införs.
- Live Staging på känt fzxqiqenqjzhlyxxpvhg: 50 migrationer, både KAN-62-versionerna 20261012123000/20261012153000 samt KAN-88 och KAN-80 kvar. Session Pooler med TLS 1.3 från klienten, samma backend-PID genom en READ ONLY-transaktion. pg_stat_ssl på databasens interna pooleranslutning är false och används inte som intyg om klientens TLS; psql conninfo verifierar klient-TLS. Endast katalog-/definitionsläsning, inga användardata.
- Befintlig KAN-62-inventariefunktion använder fortfarande gross_amount/vat_rate. Production/KAN-80-klientens inkompatibla inventariebokning är fortsatt pausad. NE läser journalens vanliga saldon och påverkas inte av den skrivsignaturen. Inga KAN-62-migrationer rensas eller ändras. KAN-90 kräver ingen DB- eller Edge-ändring.
- GitHub staging kvar på 5809094dd3ce808dba35986c65e772b842f0d0e1. Dess unika historik omfattar KAN-62/65 och grenen kan inte fast-forwardas till kandidatens main-bas. Ingen merge, force-push eller återställning av den grenen ingår i planen.

Efter ett nytt uttryckligt publiceringsgodkännande:

1. Verifiera checkpoint-SHA, ren kandidat och exakt parent/main-bas igen. Förbered en separat källexport endast från commitens Git-blobbar; inkludera inga ignorerade env/auth/credential-, .git-, .next-, node_modules-, .vercel-, Supabase CLI-state- eller testutdatafiler. Verifiera fillista och bytes mot commiten före uppladdning.
2. Använd den redan verifierade KAN-80-vägen för en separat Vercel Preview från denna exakta commit, mot befintlig Supabase Staging fzxqiqenqjzhlyxxpvhg och befintliga Staging-serverinställningar. Ingen publicering från gamla GitHub staging-grenens kod, ingen GitHub-push och ingen ändring av projektinställningar eller byggspärr. Ingen ny migration eller Edge-publicering.
3. Kontrollera READY, commitidentitet, faktiskt serverlagrad fillista/innehållsidentitet och att byggd klient/server pekar på Staging. Blockera Production i browserkontrollen. Använd den unika Preview-URL:en för isolerad acceptans; ordinarie Staging-alias och dess nuvarande KAN-80-deployment behöver inte ändras.
4. Läsande acceptans med dedikerad testanvändare: korrekta befintliga NE-värden, KAN-77/88-varningar och sparade beslut, B14-hjälp, kontotäckning och oförändrad årslåsspärr på desktop/mobil. Bortfalls-/värdeminskningsfall har lokal syntetisk evidens. Om motsvarande hosted fixturer saknas ska ny SIE-import, bokning eller testdataskapande invänta separat exakt godkännande; ingen verklig användardata används som testdata.
5. Lämna unik Preview-URL till Pontus för acceptans. Eventuellt byte av ordinarie Staging-alias kräver separat uttryckligt godkännande för den nya deploymenten. Production är ett senare eget beslut.

Nästa begärda mandat är därmed publicering av exakt den lokala KAN-90-checkpointen som isolerad Preview mot befintlig Staging samt läsande acceptans. Det omfattar ingen GitHub-push, migration, Edge-publicering, aliasändring eller databasskrivande test.
