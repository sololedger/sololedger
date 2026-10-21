# KAN-62: kompletterat testunderlag, ingen databaskörning

2026-10-21. Ledarens godkännande omfattar testkod och körvakter, inte databasskapande, migrationer eller skrivande databastester.

## Utfall

Samtliga efterfrågade testområden finns nu som förberedda prov. **Detta är ett förberedelsekvitto, inte ett SQL-, RLS-, samtidighets- eller bokförings-PASS.** Testernas verkliga körbarhet och installerad DB måste verifieras i nästa separat godkända steg. Ingen databas har kontaktats i denna komplettering.

Förändrade filer i detta steg:

- `supabase/tests/kan62_rule_contract_candidate.sql`: ingång till utökad rollback-svit.
- Nya `kan62_identity_guard.sql`, `kan62_test_helpers.sql`, `kan62_rule_contract_expanded.sql`: exakt identitetsvakt, helpers och SQL-prov.
- Nya `scripts/kan62-local-db-guard.mjs`, `run-kan62-local-db.mjs`, `test-kan62-db-concurrency.mjs`, `test-kan62-local-db-guard.mjs`.
- `package.json`: enbart tillagt säkert skript `test:kan62:offline` utöver tidigare kandidatändringar.
- Detta dokument, testplanens uppdatering och kandidatens `PROJECT_STATE.md`.

Produktkod, migrationsfiler, låsfil, befintliga databaser, ursprungliga arbetskopior och miljö-/credentialfiler har inte ändrats i detta steg.

## Förberedda verifieringar

SQL-sviten jämför faktiska journalrader, exakta konton/radantal/debet/kredit, balans, datum/ägare/verifikationsnummer, transaktionskälla/momssats/belopp, register, kvitto och anskaffningsevent. Facit inkluderar 28 000+7 000 och strikt gräns 29 600; faktisk moms skiljs från momsavdrag. Alla momssatser och avrundning provas med full/ingen avdragsrätt.

Tre successiva paketköp körs för båda avdragslägena. C väljer B och måste få A+B. Alla tre slutliga medlemskap, A:s beständiga grupplänk, omklassificeringsjournal/event och oförändrade ursprungsjournaler/event kontrolleras. Replay måste lämna hela radinnehållet oförändrat. Kortliv provas under, vid och över gränsen samt i senare grupp och med känt planerat paket. Känd plan består, oklar äldre plan och ofullständig gammal länk stoppas. Explicit koppling över år nekas, fristående annat år accepteras.

Negativa anrop kontrollerar SQLSTATE och rätt felmeddelande. Behörighetsfel matchar även den avsedda funktionen/tabellen/schemat för att undvika falskt PASS från en trasig testhelper. Före/efter jämförs transaktioner, journaler, inventarier, grupper, event, idempotens, runs, räknare, momsperioder, årslås, profil och betalningsroller. Publika rättelse-/uppdateringsvägar provas för inventariekällorna. Stängda/deklarerade momsperioder skapas genom verkliga publika RPC:er; både fristående köp och gruppköp ska nekas. Överlappande perioder och stängt år ingår.

Bokningsanropen går under **current_user=authenticated**, med verifierad auth.uid(); enbart ändrad claim som postgres räcker inte. Testhelpers är SECURITY INVOKER. Positiv egen läsning plus frånvaro av främmande rader provas åt båda håll för inventarier, grupper, events, runs, journaler och transaktioner. En minimal syntetisk run-rad används endast för RLS i rollback-sviten; ingen avskrivning bokförs. Privat bokningsfunktion och privat årslåshelper nekas även vid direktanrop som anon/authenticated/service_role. Vanliga klienters direkta DML i inventarietabellerna och åtkomst till idempotens nekas. Privata profil-/betalningshelpers, schema-CREATE, overload, ägare/ACL, rollmedlemskap och temporär tabellskuggning kontrolleras.

Före kandidatmigrationen måste en äldre payload bokas **genom föregångar-RPC**, med nytt syntetiskt fullavdragskonto. Fixture/kvitto/ursprungsrader och säkerhetskatalog sparas lokalt. Efter uppgradering provas exakt replay utan nytt kontrakt, ändrad payload samt ny bokning efter profiländring. Katalogjämförelsen tillåter endast den avsedda privata funktionskroppen/kommentaren att skilja; övriga funktioner/ägare/ACL/inställningar, tabeller, constraints, triggers, index, RLS, schemarättigheter och rollmedlemskap måste matcha. Rollback-sviten jämför även kvarvarande data före/efter hela körningen.

## Nio verkliga samtidighetsfall, förberedda men okörda

1. Två konkurrerande paketköp utan avdrag: gammalt förhandsunderlag nekas; omladdning ger tre korrekta delar.
2. Samma paketfall med fullt avdrag och korrekt moms/omklassificering.
3. Samma nyckel/payload: en bokning och en samtidig replay, inga extra rader.
4. Samma nyckel/olika payload: en vinnare och en tydlig konflikt, inga extra rader.
5. Verkligt årsavslut först: väntande köp nekas efter commit.
6. Köp först: verkligt årsavslut väntar och lyckas med redan bokat underlag.
7. Verklig momsstängning först: väntande köp nekas efter commit.
8. Köp först: momsstängning väntar och omför exakt 250 kr ingående moms; verklig avslutsjournal kontrolleras.
9. Annan ägare kan boka medan A:s köp fortfarande är öppet, med isolerade rader.

Olika backend-PID:n krävs. En tredje session verifierar blockerande PID och faktisk `Lock/advisory` via `pg_blocking_pids` och `pg_stat_activity`. Pollning är tidsbegränsad; tidsbaserad väntan ensam räcker aldrig som bevis. Årsfallen använder egna konton och en riktig syntetisk egen insättning för att inte misslyckas på negativ bank. Ingen årsavskrivning behövs i dessa fixtures.

## Körvakt och avgränsning

Ingen anslutning sker vid modulimport. Saknat uttryckligt godkännande stoppar före fil-/DB-laddning. Endast exakt databas `sololedger_kan62_disposable_20261021`, TCP 127.0.0.1:5432, PostgreSQL 17, förväntad session och unik UUID-markör/OID accepteras. Identiteten läses före sessionsinställningar och kontrolleras åter före varje operativt SQL-steg, även COMMIT/ROLLBACK. SQL-filerna har också en skrivskyddad identitetskontroll före temporär DDL, och boknings-/fixturehelpers återkontrollerar identiteten.

Miljön till psql byggs med whitelist. Ärvt PGHOST/PGDATABASE/PGPORT, tjänster, lösenord, URL:er, apphemligheter och PGOPTIONS vidarebefordras inte. Bara etablerat lokalt passfile används, utan att dess innehåll läses. `-X`, `-w`, ON_ERROR_STOP, explicita lokala anslutningsargument och korta timeouter används. lc_messages=C, READ COMMITTED och row_security=on sätts **per session**, inte globalt.

Verktygen har endast operationerna `legacy-fixture`, `rollback`, `concurrency`; de har **ingen create/install/reset/städoperation**. De kräver både exakt SOLOLEDGER_KAN62_TEST_DB, rätt SOLOLEDGER_KAN62_APPROVED_OPERATION och korrekt PGPASSFILE. Det lokala identitetsmanifestet ska ha fälten database, address, port, postgresMajor, oid, marker och syntheticOnly=true. Markörformat: `KAN62 disposable synthetic only <unik UUIDv4>`. Manifestet får skapas först efter separat godkänt databasskapande. Det finns inte nu och körning ska därför förbli blockerad.

Alla 55 migrationshashar kontrolleras innan testanslutning. Installation sker separat enligt migrationsplanen, med identitetskontroll före varje fil och bevarade preimage-skydd. Inga historiska filer har ändrats. Det lokala identitetsmanifestet och körbevis ska ligga i ignorerad `coverage/kan62-local-db/`; inga credentials i bevisen. Inga gemensamma roller, lösenord eller serverinställningar skapas/ändras. GRANT i testkod gäller bara sessionens temporära schema, inte klusterroller. Vid fel stängs endast egna sessioner för rollback; redan committade fixtures och felbevis bevaras. Befintliga databasnamn/fixturefiler får aldrig ersättas automatiskt.

## Genomförda kontroller utan databas

- `npm run test:kan62:offline`: PASS. Felaktigt namn/adress/port/OID/markör/roll/godkännande nekas. Mockad psql-transport bevisar att fel identitet stoppar före skrivsteg och att operativa kommandon får vakten först. Ärvt fjärrmål/lösenord/URL filtreras bort. Låsobservatörens logik provas med syntetiska svar. Båda riktiga entry points provas med saknat godkännande och nekas utan DB-anslutning.
- Samma svit: PASS för SQL-include-lista, identitetskontroll före DDL, rollback/negativa hjälpares struktur, parvisa dollaravgränsare, frånvaro av globala roll-/server-/reset-kommandon och alla 55 oförändrade migrationshashar.
- Node-syntaxkontroll av fyra nya JavaScript-filer: PASS.
- Riktad ESLint, noll varningar: PASS.
- Befintliga `test-fixed-assets.ts` och `test-fixed-asset-rule-contract.ts`: PASS. Enbart rena domänprov.
- `git diff --check`: PASS, endast befintliga Git-meddelanden om radslut. Ingen dependency-/lockfilsändring.

SQL-strukturkontrollen är **ingen PostgreSQL-/PLpgSQL-parser**. Ingen fristående sådan parser fanns tillgänglig i kontrollerade lokala Python-miljön; inget installerades. SQL-syntax, aktuella constraints, rollprov, feltexter, preimages och samtidighetsutfall är inte körverifierade. Ingen ny TypeScript-/webbkod ändrades, så bygg-/webbläsar-/externa regressioner omkördes inte för denna testkomplettering.

## Exakt omfattning för ett eventuellt nästa körgodkännande

1. Skapa **en ny** databas med namnet ovan från template0 och sätt dess unika markör; spara exakt OID/identitet. Befintligt namn betyder STOPP. Ingen reset/radering av andra databaser.
2. Importera enbart granskad lokal auth/storage-DDL, utan tabelldata, roller eller public-schema från någon källa. Källan är lokal och läses endast.
3. Installera manifestets position 1–54 i ordning, inklusive de två gamla KAN-62-filerna, med egna transaktionsgränser för samtidiga indexbygget. Preimagefel stoppar utan historikreparation.
4. Kör `legacy-fixture`: skapa och committa **en** syntetisk användare/profil/konton/betalningsroll, en äldre inventariebokning och dess journal/event/idempotens; spara lokalt kvitto. Inga riktiga konton kopieras.
5. Installera endast position 55, `20261020233000_kan62_rule_contract.sql`, efter katalogavläsning. Jämför säkerhets-/schemakatalogen mot föregångaren.
6. Kör `rollback`: temporära SQL-helpers, syntetiska användare/rader, metadata-fixtures, köp/omklassificeringar, rollprov, rättelseförsök, momsperiodstängning/deklaration och årslåsfixture. Allt i denna svit återställs; det äldre committade kontot ska vara exakt bevarat.
7. Kör `concurrency`: nio fall, **tio nya syntetiska användare** med konton/profiler/betalningsroller. Bestående köp, paketlänkar/omklassificeringar/journaler/events/idempotens, två egna insättningar samt syntetiska års-/momsstängningar. Ingen avskrivning bokförs. Data och loggar sparas; ingen städning följer automatiskt.

Punkt 1–7 är **inte utförda eller godkända i denna komplettering**. Godkännande av lokal körning innebär inga externa ändringar. KAN-73 och KAN-76 samt full Supabase/JWT/HTTP-paritet kvarstår utanför detta kvitto. Efter lokal körning ska verkliga PASS/FAIL och eventuella installations-/produktblockerare rapporteras innan något nytt ledarbeslut om Staging.
