# KAN-62 – samlad lokal verifiering 2026-10-21

## Beslut: lokal PASS inom det godkända regelkontraktet

Hela SQL-regressionen och samtliga nio verkliga samtidighetsfall har passerat. Verkliga journalrader, RLS/klienträttigheter, äldre idempotenspayload efter uppgradering, stängda/deklarerade perioder och bevarande av tidigare data är verifierade. Ingen produktkod eller migrationsfil behövde ändras efter den första databaskörningen.

**Rekommendation: kandidaten är redo för avgränsad verifiering i Staging efter ledargranskning.** Detta gäller betalda svenska inventarieköp, moms-/beloppsvalidering, direktavdrag och paketspårning enligt KAN-62. Det är inte ett generellt godkännande av aktivering, fleråriga avskrivningar, returer, EU-varor eller obetalda fakturor. KAN-73:s rapportmoms/dashboard och KAN-76:s avskrivningslucka kvarstår och blockerar generell inventarie-/Production-acceptans. Ingen Staging-/Production-ändring är utförd eller automatiskt godkänd.

## Vad som rättades

1. Testet för äldre ofullständig grupplänk får nu giltigt livslängdsbesked samt korrekt belopps-/medlemsunderlag för gruppen efter tredje köpet. Därmed nås den avsedda spärren, med fortsatt exakt SQLSTATE och felorsak. Ingen valfri 23514 accepteras.
2. Journalhjälparen jämför momssats NULL-säkert. Momsavslutets befintliga metadata förväntas uttryckligen vara NULL; köp och omklassificering har fortsatt sina egna exakta momssatser. Ingen generell omtolkning av NULL till 0.
3. Testverktygen använder en explicit unik körningsidentitet och nya artefaktkataloger. Befintligt körnings-ID, filnamnsöverlagring och sökvägsflykt nekas. Rollback-kontrollen kräver oförändrat faktiskt användarantal, inte det äldre antagandet om exakt en användare.
4. Samtidighetssviten jämför alla tidigare ägares konton/profiler/betalningsroller, journaler, transaktioner och inventariedata före/efter. Nya fixtures har nya UUID:n. Databasen och tidigare testuppsättningar återställs eller raderas aldrig. Testloggar visar faktisk klientroll och exakta negativa felorsaker.

Berörda testfiler: `supabase/tests/kan62_rule_contract_expanded.sql`, `kan62_test_helpers.sql`, `scripts/run-kan62-local-db.mjs`, `test-kan62-db-concurrency.mjs`, `test-kan62-local-db-guard.mjs` och nya `scripts/kan62-local-test-run.mjs`. Dessutom uppdaterad PROJECT_STATE och denna rapport. Produktkod, de 55 migrationsfilerna, package-lock, befintliga arbetskopior och credentials är bevarade.

## Databas och migrationer

- Samma bevarade databas **sololedger_kan62_disposable_20261021**, **127.0.0.1:5432**, PostgreSQL **17.11**, OID **57199** och oförändrad unik markör.
- Fortsatt exakt **55 installerade migrationer**. Inga nya, omskrivna eller återspelade migrationer under denna färdigställning. Alla 55 filhashar matchar det frysta manifestet.
- Exakt ordning/hash: `coverage/kan62-local-db/installed-migrations.json`. Full namnlista finns även i den tidigare installationsrapporten `KAN-62-LOCAL-DB-RESULT.md`.
- Publik wrapper och privat implementation matchar exakt `candidate-postimage.json`. ACL, RLS, constraints, triggers, index och övriga funktioner är oförändrade. Gemensamma roller/medlemskap och övriga befintliga databasers metadata är oförändrade.
- Före varje operativ testsession/steg används fortsatt exakt namn/adress/port/OID/markör, lokal miljö-whitelist och hård avvisning av annat mål. Inga globala roller, lösenord eller serverinställningar ändrades.

## SQL-regression: PASS

`rollback-r02` passerade med de nio tidigare användarna bevarade. Slutkörningen **rollback-r03** passerade även efter den nya samtidighetsomgången, med **samtliga 19 användare och deras tidigare rader oförändrade**. Alla testskrivningar i SQL-sviten låg i den egna återställda transaktionen; befintlig idempotens-fixture behölls exakt.

Verifierad täckning:

| Område | Verifierat utfall |
| --- | --- |
| Faktiska journaler | Exakta konton, radantal, debet/kredit, balans, datum/ägare/ver_nr, källa, belopp och momssats; överensstämmelse mellan kvitto/register/audit/event. |
| 28 000 + 7 000 utan avdrag | Gränsprövning 28 000; D5410 35 000 / K1930 35 000; ingen 2641. |
| Samma köp med full avdragsrätt | D5410 28 000, D2641 7 000 / K1930 35 000. |
| Gränsvärden | 29 599,99 direktavdrag för mindre värde; exakt 29 600 och högre kräver separat livslängdsbedömning. Kortliv vid 29 600 och 40 000 netto verifierat i båda avdragslägena. |
| Paket i tre steg | A → B → C som väljer B inkluderar A+B. Tre beständiga medlemmar, historiska journaler/event bevarade. Omklassificering utan ny moms: 25 000 utan avdrag respektive 20 000 med avdrag. |
| Kortliv/planer | Kortliv står kvar som kostnad i senare grupp och omklassificeras inte. Känt planerat NET-belopp består. Oklar äldre plan/ofullständig länk stoppas. |
| År/moms/avrundning | Koppling till annat år nekas, fristående annat år tillåts. 0/6/12/25 %, öresavrundning, manipulerad moms och för många decimaler kontrollerade. |
| Idempotens | Exakt omförsök ger samma kvitto utan nya rader/gruppändringar. Ändrad payload nekas. Samma nyckel för olika ägare hålls åtskild. |
| Äldre idempotens | Den verkligt före uppgradering bokade payloaden utan nytt kontrakt återspelas efter uppgradering och profiländring utan nya rader. Ändrad gammal payload och nytt otillåtet momsavdrag nekas. |
| RLS/behörighet | Faktisk authenticated-roll för lyckade bokningar och icke-vakuös läsning av egna rader utan främmande data. Direkta inventarietabellskrivningar och idempotensläsning nekas. Privata boknings-/årslåshelpers nekas för authenticated/anon/service_role. Profil-/betalningshelper, schema-CREATE och skuggning kontrollerade. |
| Perioder/rättelser | Köp och gruppköp nekas i stängd/deklarerad momsperiod; överlappande perioder och stängt år stoppas. Verkliga generiska correction/update-RPC:er nekas för inventariekällor av rätt orsak. |

SQL-spåret innehåller **59 lyckade klient-RPC-anrop inklusive omförsök och 114 negativa kontroller med rätt SQLSTATE/felorsak**. RLS/profil/journalprov ersätts inte av en administratörssession med enbart ändrad claim: själva anropen görs efter verifierat SET ROLE authenticated. Testhelpers är SECURITY INVOKER. En syntetisk run-rad användes endast för RLS i rollback-sviten; ingen avskrivning bokfördes.

## Samtidighet: 9/9 PASS

`concurrency-r02`, separata verkliga backend-sessioner och observatör:

1. Två paketköp utan momsavdrag: gammalt underlag nekas, omladdning ger tre korrekta delar.
2. Samma fall med full avdragsrätt och korrekta journaler.
3. Samtidig identisk replay: en bokning, samma kvitto, inga extra rader.
4. Samma nyckel/olika payload: en vinnare, korrekt konflikt, inga extra rader.
5. Årsstängning först: väntande köp nekas efter commit.
6. Köp först: verkligt årsavslut väntar och lyckas med färskt underlag.
7. Momsstängning först: väntande köp nekas efter commit.
8. Köp först: verklig momsstängning väntar och ger D2650/K2641 250 kr, rätt datum/belopp och NULL-metadata.
9. Olika ägare: B kan slutföra eget köp medan A:s köp fortfarande hålls öppet; inga blandade rader.

Låsfallen verifierar blockerande PID via pg_blocking_pids och faktisk advisory-låsväntan, inte enbart tidsfördröjning. Före-/efterjämförelsen visar att samtliga nio äldre användares data är oförändrade. Tio nya syntetiska användare skapades; de och deras data bevaras.

## Övrig lokal regression

- `npm run test:domain`: **PASS**, inklusive inventariedomän, faktisk service med syntetisk transport och faktisk panel med lokal nätverksinterception.
- Säkra regressionssvitens övriga delkommandon: **PASS** för history-groups, history-presentation, history-ui, history-presentation-ui, ui-round, category-visibility och standard-booking-browser. Kördes separat för att skydda tidigare artefakter.
- Publik lokal Playwright-smoke: **2/2 PASS**, utan inloggning/registrering/bokning och med syntetisk localhost-Supabase-adress.
- Typkontroll utan incremental, riktad ESLint med noll varningar, DB-invariantkontroll och offline körvaktsprov: **PASS**.
- Körvaktens tester täcker även append-only run-ID/filer med mockat filsystem, avvisning av fel mål/roll/markör och att ingen DB-anslutning sker utan uttryckligt lokalt körgodkännande.

**Byggmiljöbegränsning:** standard-smoken träffade först sandboxens verifierade localhost-EACCES och därefter en Turbopack/PostCSS-arbetarkrasch i denna Windows-arbetskopia. Samma publika smoke passerade i Nexts stödda **webpack-läge** med nödvändig lokal nätverksåtkomst. Ingen appkonfiguration, dependency, miljöfil eller produktkod ändrades för detta. Misslyckade försök och lyckad körning är sparade. Ett fullständigt Production-bygge och standard-Turbopack-kvitto påstås inte. Staging-bygget måste verifieras vid nästa godkända publicering.

## Bevarat slutläge och nästa steg

Skrivskyddad slutkontroll: **19 syntetiska användare/profiler, 23 inventarier, 33 transaktioner, 75 journalrader, 31 inventarieevent, 23 idempotensposter, 4 grupper, 4 momsperioder och 4 stängda år**. **0 obalanserade verifikationer, 0 avskrivningskörningar och 0 kvarvarande DB-testsessioner**. Äldre fixture och tidigare testomgångars samtliga kontrollerade ägarrader är oförändrade. Inget raderat/återställt.

Tidigare FAIL-rapport och ursprungliga körbevis lämnas orörda. Nya huvudbevis:

- `coverage/kan62-local-db/runs/rollback-r02/` och `rollback-r03/`: inputs, faktisk klient-/felorsakslogg och resultat.
- `coverage/kan62-local-db/runs/concurrency-r02/`: 9 PASS, sessions-/låsloggar och retained-before/after.
- `coverage/kan62-local-db/final-read-only-evidence-r03.json`: exakta publika/privata definitioner, säkerhet, bevarad data, roller/databaser och balans.
- `coverage/kan62-local-db/quality-r02-domain.log`, `quality-final-static.log` och övriga quality-r02-loggar.
- `coverage/kan62-local-db/quality-r05-smoke-webpack/`: 2/2 Playwright, serverloggar och separat HTML/trace-utdata.

Nästa steg är ledargranskning av detta samlade lokala PASS och beslut om **STAGING**. Kontrollera då aktuell Staging-kod, live definitions-/migrationsläge och exakt publiceringsurval; denna lokala basinstallation är inte en instruktion att återspela historiska migrationer mot hosted miljöer. Bevara gränsen mot allmän aktivering/avskrivning och kontrollera journal, rapportmoms, NE/resultat, dashboard, grupphistorik och rättelsespärr i den avgränsade Staging-acceptansen.

Ingen commit, push, Jira-statusändring, extern databasskrivning eller deployment utförd. Ingen kontakt med Staging/Production eller ändring av Jessikas bokföring.
