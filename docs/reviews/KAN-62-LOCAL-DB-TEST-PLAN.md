# KAN-62: plan för isolerad lokal databastestning

2026-10-21. **Planeringsunderlag för ledarbeslut. Ingen körning godkänd eller utförd.**
Ledarens PASS gäller förberedelse, inte databasexekvering, Staging eller Production.

**Komplettering 2026-10-21:** testkod och körvakter är nu förberedda enligt separat
ledargodkännande. Aktuella filer, utförda kontroller utan databas och exakt nästa
skrivomfattning finns i [KAN-62-TEST-PREPARATION.md](KAN-62-TEST-PREPARATION.md).
Tabellen nedan dokumenterar ursprungliga luckor; kompletteringarna är skrivna men
ännu inte SQL-/RLS-/samtidighetskörda. Inget databasskapande eller migration godkänt.

## Beslut som rekommenderas

Godkänn ett separat lokalt verifieringssteg i två grindar:

1. Komplettera enbart testunderlaget och en lokal körvakt enligt nedan. Visa diffen och körvaktens negativa prov utan DB-skrivningar.
2. Efter granskning: skapa exakt den nya databasen, installera den frysta kedjan och kör de syntetiska proven. Inget automatiskt omtag, ingen rensning och ingen extern anslutning.

Det befintliga SQL-testet ska **inte köras oförändrat som ett fullständigt acceptansprov**. Det saknar samtidighet, momsperiodsprov och tillräckligt stark verifiering av faktisk användarroll/journal. Kandidatens SQL-syntax och beteende är fortfarande okörverifierade. Inga produktändringar föreslås av denna plan.

## 1. Miljö och säker identitet

Skrivskyddat verifierat i denna session:

- PostgreSQL **17.11**, TCP **127.0.0.1:5432**, under `postgres`, med `transaction_read_only=on`.
- Föreslagen databas **`sololedger_kan62_disposable_20261021` finns inte**. Befintliga KAN-17/71/72/74/75/80/84/97-databaser lämnas orörda.
- PostgreSQL-klienterna finns under `C:/Program Files/PostgreSQL/17/bin/`.
- Roller `anon`, `authenticated`, `service_role` finns, utan superuser/BYPASSRLS/LOGIN i detta lokala kluster. De saknar medlemskap i `postgres` och CREATE i plattformskällans public-schema. Kontrollera målbasens rättigheter igen efter installation.
- Den etablerade lokala plattformskällan `sololedger_kan84_operator_20261015` innehåller en minimal Auth/Storage-modell: auth.users, storage.buckets, storage.objects, auth.uid() och storage.foldername(). Detta är **inte en full Supabase/Auth/PostgREST-installation**. auth.uid() läser en sessionsclaim; inga JWT-signaturer verifieras här.

Rekommenderat: en ny separat databas på denna server, inte återbruk av en fylld testdatabas och inte en klon av produktdata. Databasisolering gäller schema/data; klusterroller, serverresurser och advisory locks delas. Slumpade testanvändar-ID:n och korta tidsgränser minskar kollisioner. Ändra inga klusterroller, serverinställningar eller andra databaser. Om ett helt eget serverkluster krävs behövs separat initdb-/port-/startplan; det ingår inte i det föreslagna steget.

Körvakten måste före **varje** schema-/testsession kontrollera:

- Hårdkodat exakt databasnamn, hostadress 127.0.0.1, port 5432, PostgreSQL 17 och förväntad sessionsroll.
- Vid första skapandet: frånvaro av exakt namnet, tom template0-bas, därefter en unik databasmarkör och katalog-OID sparade i ett lokalt manifest. Vid alla följande anslutningar: både OID och `shobj_description(...,'pg_database')` ska matcha. Namnkollision betyder STOPP, inte återställning.
- Explicit lokalt körgodkännande. Inga anslutningsuppgifter får tas från appens .env, länkad Supabase, DATABASE_URL eller CLI-standardprojekt.
- Processlokal PGPASSFILE=`C:/SoloLedger/LocalTest/pgpass.conf`, utan att läsa filen. Explicit PGHOSTADDR=127.0.0.1, PGSSLMODE=disable, anslutningstid 5 s; rensa ärvda PGSERVICE/PGSERVICEFILE/PGPASSWORD/PGOPTIONS och alternativa databas-URL:er innan den egna miljön sätts.
- Använd `psql -X -w -v ON_ERROR_STOP=1` med explicit host/port/user/database. Ingen lösenordsprompt och ingen psql-startfil. Migrationssessioner och privilegierade avläsningar kör som postgres; boknings-/RLS-proven byter uttryckligen till rätt roll.
- Ingen hosted hostadress, pooler, projektref eller fallback. Ingen Supabase/Vercel-upptäckt, länkning eller nätverksberoende installation.

Befintligt SQL-prefixskydd är otillräckligt: `LIKE 'sololedger_kan62_%'` är ett mönster där understreck också är jokertecken. Exakt namn/OID/markör/port ska ersätta prefixet i körvakten och användas av samtliga testsessioner. Godkännandeflaggan ensam identifierar inte databasen.

## 2. Skapande och exakt migrationsordning

Efter separat körgodkännande:

1. Läs lokal serveridentitet och kontrollera att målnamnet fortfarande saknas.
2. Skapa en ny UTF-8-databas med `createdb --template=template0 --encoding=UTF8 sololedger_kan62_disposable_20261021`, med ovanstående explicita lokala anslutning. Skapa databasmarkören och spara identitetsmanifestet. Återanvänd aldrig en befintlig databas automatiskt.
3. Exportera **endast schema** auth/storage från den verifierade lokala plattformskällan: `pg_dump --schema-only --schema=auth --schema=storage --no-owner`. Ingen public, ingen tabelldata, inga globals/roller och ingen fjärrdump. Jämför DDL med det tidigare granskade plattformsunderlaget; avvikelse stoppar före import. Importera i nya basen och kontrollera noll auth-användare och noll public-tabeller. Använd en ny session därefter: dumpens `row_security=off` och andra sessionsinställningar får inte läcka in i testerna.
4. Tillämpa **54 historiska filer**, skapa därefter den separat godkända äldre syntetiska idempotens-fixturen, och tillämpa sist **1 ny kandidatfil**, exakt enligt listan och SHA-256 i `KAN-62-LOCAL-DB-MIGRATIONS.json`. Det är hela aktuella kedjan, inte ett antaget minimalt tabellurval. Inga seeds, arkivfiler eller audit-/recovery-baselines.
5. Historiken börjar med `20260925000000_pre_kan17_cli_baseline.sql`, den aktiva rekonstruktionsbaslinjen, endast i den nya tomma lokala basen. `supabase/baseline/` och `migration_archive/` ska inte köras.
6. Position **36–37** är oförändrade `20261012123000_kan62_fixed_asset_gross_vat_rate.sql` och `20261012153000_kan62_fixed_asset_group_locking.sql`. De inkluderas för att testa kandidatens föregångare. Detta är **inte ett migrationsurval för Production**, där dessa enligt senaste tidigare kontroll saknas.
7. Position **40**, `20261014123000_kan72_journal_user_ver_index.sql`, innehåller CREATE INDEX CONCURRENTLY och `transaction=false`. Kör inte hela kedjan med `--single-transaction`, BEGIN runt alla filer eller en transaktionell testrunner.
8. Position **52–54**: KAN-75 `20261019120000`, KAN-97 `20261019200000`, KAN-97-kontext `20261020130000`. Befintliga preimage-kontroller måste passera oförändrade. Fel betyder STOPP, inte ändrad hash, borttagen guard eller historikreparation.
9. Före position **55**: spara `pg_get_functiondef`, ägare, ACL, funktionsinställningar, relevanta tabell-/RLS-/trigger-/index-/constraintdefinitioner. Bekräfta den publika wrapperns KAN-54- och KAN-75-skydd. Tillämpa sedan endast nya `20261020233000_kan62_rule_contract.sql`.
10. Jämför katalogen efteråt: bara den privata implementationen och dess funktionskommentar ska ändras; rättigheter ska vara oförändrade och korrekta. Ingen annan funktion, tabell, policy eller journal får ändras av den nya migrationen. Före äldre fixturen ska app-/auth-användartabeller vara tomma; efter uppgradering ska exakt den godkända äldre fixturen bestå. Kedjans regel-/konfigurationsrader är avsiktliga.

Lokal installation använder den etablerade PostgreSQL-vägen med en bevakad `psql`-session per fil, filens egna transaktionsgränser och stopp vid första fel. Manifestet registrerar fil/version/hash/ordning/exitkod och databasidentitet; det är **körbevis, inte en fabricerad Supabase-migrationsledger**. Framtida hosted installation måste separat använda projektets officiella CLI-flöde med bevarad migrationsidentitet. Varken `db push`, `db reset`, migration repair eller `--include-all` ingår här.

Tidigare KAN-97-bevis visar lyckad lokal rekonstruktion för position 1–52. Alla dessa 52 filers SHA-256 matchar nu exakt. Position 53 har samma text som tidigare lyckad körning när CRLF/LF jämförs, men annan rå filhash. Det är en verifierad radslutsskillnad, inte tillåtelse att skriva om filen eller ignorera nästa preimage-kontroll. Position 54 och 55 påstås inte vara körverifierade i denna bas.

Frys nuvarande bytes med manifestet. Före körning: jämför både historiska filer mot HEAD och alla 55 hashvärden mot manifestet. Ingen av de historiska filerna har ändrats i kandidatdiffen. Ingen gamla migrationer ska redigeras för att få ett test grönt. Vid nödvändig produktfix används en separat granskad framåtmigration, utan ändring av redan tillämpade Staging-filer.

## 3. Testgranskning och obligatoriska kompletteringar

Granskat: `supabase/tests/kan62_rule_contract_candidate.sql`. Det applicerar inga migrationer, använder syntetiska UUID:n och avslutar med ROLLBACK. Alla nedanstående prov är **planerade**, inte körresultat.

| Yta | Vad som finns nu | Krav före fullständigt DB-kvitto |
| --- | --- | --- |
| Journal | Returbelopp, balans, A:s ursprungsjournal, ingen 2641 i omklassificering | Läs faktiska rader per verifikation. Exakt kontouppsättning, radantal, debet/kredit, datum, ägare, ver_nr, källa och transactions.vat_rate. Stäm av register, audit, event och kvitto mot samma belopp. |
| Tre successiva köp | A → B kopplad till A → C väljer bara B; servern ska expandera A+B | Kontrollera alla tre slutliga gruppmedlemskap, samtliga event och oförändrade ursprungsjournaler. Ingen tappad A, dubbel medlem eller dubblerad omklassificering. Kör med både full och ingen avdragsrätt. |
| Korttidsinventarier | Bekräftat kortliv under gränsen bevaras vid senare gruppaktivering | Lägg även kortliv vid/över gränsen, planerat paket och stale-preview-prov. Kontrollera faktisk 5410-journal, ingen omklassificering av kortliv, samma regel som domän/UI. |
| Gränser/moms/år | 28 000+7 000, exakt 29 600, satser, andra år och plan | Lägg 29 599,99/29 600/29 600,01 netto för full/none, alla satser och avrundning. Annat år: explicit koppling nekas men fristående inköp tillåts; inget automatiskt samband. Okänt/äldre planunderlag stoppas med rätt felorsak. |
| Idempotens | Exakt replay och ändrat underlag nekas | Samma tx/asset/event/journal/nyckelantal före/efter replay; inga nya gruppändringar. Äldre exakt payload utan nytt kontrakt efter uppgradering återspelas; ändrad äldre payload nekas. Ändrad profil får inte skapa nytt momsavdrag. Samma nyckel hos annan ägare ska vara separerad. Lägg samtidig replay. |
| RLS/ägare | Fel ägar-ID nekas av RPC; slutlig SELECT som authenticated | Positiv kontroll att A ser egna rader, negativ att A inte ser B, samt omvänt. Faktisk authenticated-roll för lyckad publik RPC och nekad privat RPC/DML. Grupper, inventarier, events, runs, journal/transactions; idempotens ska helt sakna klientåtkomst. Syntetiska run-fixtures testar lässkydd, inga avskrivningsbokningar. |
| Samtidighet | Saknas: allt körs i en session/transaktion | Separat flersessionsprov enligt avsnitt 4. En enda DO/ROLLBACK kan inte bevisa detta. |
| Stängda perioder | Endast stängt år | Lägg closed respektive declared SoloLedger-momsperiod, överlappande perioder, båda avdragslägen och gruppköp. Fristående positiv kontroll i öppen period. Stopp ska lämna även gruppmetadata/events/idempotens oförändrade, inte bara transactions. |
| Rättelser/atomaritet | Generisk correction-INSERT och källklassning nekas | Prova verkliga publika correction/update-RPC:er under authenticated; särskild kontroll av omklassificeringskällan. Kontrollera originaljournal/events och alla berörda tabeller före/efter nekade anrop. Testa ingen ny retur-/rättelsefunktion. |

Negativa prov måste kontrollera förväntad SQLSTATE **och rätt felorsak**, inte bara fånga valfri exception. Nuvarande `assert_rejects` kan ge falskt grönt vid ett orelaterat behörighets-/setupfel. Lägg också misslyckade anrops före/efter-snapshots av register/grupper/events/idempotens/journal/transaktioner/verifikationsräknare. Setup får köras som postgres, men bokningsproven ska göra `SET LOCAL ROLE authenticated` med sessionsclaim och kontroll av current_user/session_user/auth.uid(). Ingen SECURITY DEFINER-testhelper får dölja vilken roll som faktiskt provar funktionen.

Konkreta journalfacit:

- **28 000 + 7 000, inget avdrag:** gräns 28 000; D5410 35 000 / K1930 35 000; ingen 2641, inget 1220.
- **Samma köp, fullt avdrag:** gräns 28 000; D5410 28 000, D2641 7 000 / K1930 35 000.
- **Exakt 29 600 netto:** mindre-värde räcker inte. Utan livslängdsbesked stopp; bekräftat högst tre år kan ge direktkostnad enligt separat regel. Med 25 % och inget avdrag blir kortlivskostnaden 37 000, med fullt avdrag 29 600 + 7 400 på 2641.
- **Tre paketdelar à 10 000 netto, 25 %, inget avdrag:** A/B kostnadsförs 12 500 vardera; C ger gräns 30 000. Saknat livslängdsbesked stoppas utan deländring. I bevarad aktiveringsväg: C D1220 12 500 / K1930 12 500 samt separat D1220 25 000 / K5410 25 000. Ingen ny moms. Vid full avdragsrätt: C D1220 10 000 + D2641 2 500 / K1930 12 500 och omklassificering 20 000. Dessa är tekniska regressionsfacit, inte acceptans för allmän aktivering eller fleråriga avskrivningar.

För kompatibilitetsprovet ska en **syntetisk** gammal idempotenspost framställas via föregångar-RPC före migration 55 och sparas för senare exakt replay. Ingen verklig historik kopieras. Detta kräver en lokal commit av testdata före uppgraderingen, separat från den vanliga rollback-sviten.

## 4. Verklig samtidighet

Ny lokal runner behövs; den gamla KAN-97-runnern får inte importeras/köras direkt eftersom dess top-level-kod skapar artefakter och dess argument kan bootstrap:a fel databas. Återanvänd principerna, inte dess fasta databasnamn eller hela regressioner med äldre payload.

Minst två separata psql-processer med varsin transaktion i READ COMMITTED. Logga backend-PID:n och observera `pg_blocking_pids`/pg_locks från tredje lokal observatör; synkronisera med verifierade låsbarriärer, inte enbart tidsbaserad sleep. Sessionerna ska ha kort lock/statement/process-timeout och samma exakta identitetsvakt.

1. **Två nya köp mot samma befintliga paket och samma förhandsläge:** håll första transaktionen före commit, starta andra och verifiera verklig väntan. Efter första commit ska andra nekas som gammalt underlag, utan delskrivning. Ladda om och försök med nyckel/underlag enligt klientkontraktet; slutgruppen ska innehålla alla tre inköp exakt en gång. Ingen förlorad uppdatering eller dubbel omklassificering.
2. **Samma idempotensnyckel, samma payload:** en bokning och en replay, samma kvitto-ID:n; exakt ett journal-/event-/nyckelpaket.
3. **Samma nyckel, olika payload:** en vinnare, en tydlig konflikt; ingen andra bokning.
4. **Årsstängning i båda låsordningar:** verifiera samma KAN-75 owner-gate med exclusive/shared. På separat fixture som uppfyller verklig close_year_atomic:s förvillkor: stängning först → köp nekas; köp först → stängning väntar och behandlar redan bokat underlag enligt befintliga regler. Att en administratör tar helperlåset bevisar bara låset, inte hela årsavslutsflödet; redovisa eventuell begränsning separat.
5. **Momsstängning i båda ordningar:** använd verklig close_vat_period_atomic på separat giltig fixture. Stängning först → köp nekas; köp först → stängning väntar och får rätt färsk journal. Ingen inpassering efter closed/declared. Ofullständigt momsrapportstöd KAN-73 får inte döljas av detta test.
6. **Olika ägare:** håll A:s ägar-/årslås och visa att B:s fristående köp kan slutföras. Verifiera sedan inga blandade journaler, grupper eller idempotensposter.

Detta kräver **committade syntetiska fixtures och köp** i den nya lokala basen. Yttre ROLLBACK kan inte städa data som andra sessioner behöver se. Data och bevis sparas efter körningen; ingen automatisk DELETE/DROP. Vid timeout/fel stoppas endast runnerns egna sessioner, transaktioner återställs när anslutningarna stängs. Delvis färdig databas bevaras för diagnos; inget automatiskt omtag.

## 5. Privat implementation och publik säkerhetsgräns

Granskad anropskedja i migrationskoden:

`authenticated → book_fixed_asset_acquisition_atomic(jsonb) → KAN-75 owner/year-gate → auth.uid()/payload/idempotenskontroller → KAN-54 profilkontroll för nytt momsavdrag → book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)`.

Wrapper och delegate är SECURITY DEFINER. KAN-62 ändrar endast delegaten. Wrappern fortsätter härleda ägaren från auth.uid(), inte payload. Delegaten kontrollerar ägare/år/grupp, datum, belopp, VAT-/årsspärrar, stale preview och idempotens. Exakt redan bokad replay får återge tidigare kvitto före nytt kontrakt/profilbeslut; den får aldrig skriva nya belopp eller ge ny avdragsrätt.

Privat betyder här **EXECUTE spärrad**, inte privat SQL-schema: funktionen ligger i public. KAN-54 samt båda äldre KAN-62-filerna och nya migrationen nekar PUBLIC/anon/authenticated/service_role direkt exekvering, tillåter postgres. Den publika wrappern tillåter authenticated/service_role, inte PUBLIC/anon. Wrapperns ägarrätt gör den interna anropsvägen möjlig utan att klienten får den privata rättigheten. Betalningshelper/profilhelper har etablerad service_role-rätt men ger inte den privata bokningsfunktionen till klienten. KAN-75-helpern är privat.

Ingen ny klientväg runt skydden har identifierats i källan. Detta är **statisk granskning, inte bevis för installerad katalog**. service_role har dessutom etablerade direkta tabellrättigheter och postgres är administratör; de är betrodda servergränser och ska inte beskrivas som RLS-begränsade vanliga användare. En exponerad servernyckel eller godtycklig SQL som postgres ligger utanför klientisoleringens garanti.

Obligatoriskt före/efter installation: kontrollera funktionsägare, proacl inklusive PUBLIC och ärvda roller, SECURITY DEFINER/search_path, rollmedlemskap, schema-CREATE, relevanta triggers/policies/grants och samtliga överlagringar/anropare. Visa oförändrad wrapper med `pg_get_functiondef`. Verifiera att auth.uid/public-objekt inte är skrivbara av klientroller och att målrollernas RLS inte kringgås. Under faktisk roll: publik RPC lyckas för egen giltig fixture, privat RPC nekas för anon/authenticated/service_role, publik RPC nekas för anon och utan auth, främmande grupp/asset och direkt DML i inventarietabellerna nekas för authenticated. Journal/transaktioner kontrolleras mot sina befintliga grants, RLS och käll-/rättelseskydd, inte ett antagande om total DML-spärr. Testa försök att skugga tabeller/helpers med temporära objekt; affärstabeller är kvalificerade med public i kandidaten. Rättighetsavvikelse är STOPP, ingen automatisk GRANT/REVOKE-reparation.

## 6. Risker, ändringar och leveransbevis

- **Bestående lokala skrivningar:** CREATE DATABASE, databasmarkör, auth/storage-DDL, 55 migrationer, regel-/konfigurationsdata samt syntetiska kompatibilitets-/samtidighetsfixtures. Rollback-sviten gör dessutom tillfälliga DML/DDL-skrivningar. Inget av detta är godkänt att köra genom denna plan.
- **Destruktiva element i historiken:** DROP/ersättning av vissa triggers, policyer, constraints och en äldre declare-signatur. De får bara utföras i den nya lokala basen. Ingen DROP DATABASE, TRUNCATE, schemareset, radering av tidigare testmiljöer eller ändring av riktiga användardata ingår. Funktioner med DELETE i kropp installeras historiskt men ska inte användas för städning.
- **Beroenden:** fungerande lokal PostgreSQL 17 och klienter, tillgängligt lokalt passfile, befintliga roller och minimal auth/storage-modell, skrivutrymme för ny databas/bevis och rätt att skapa databasen. Om detta saknas: STOPP, aldrig hosted fallback. Anslutningen krävde sandboxundantag för enbart lokal skrivskyddad metadata; denna sessions läsning lyckades, det är ingen produkt-/authblockerare.
- **Miljögräns:** SQL med SET ROLE och kontrollerade claims verifierar DB/RPC/RLS, inte JWT-signering, Auth-HTTP, PostgREST, webbläsarbokning eller full Supabase-plattformsparitet. Sådan verifiering kräver ett separat senare godkänt steg. Befintliga UI/service-domäntester ersätter inte verkliga DB-prov.
- **Redovisningsgräns:** KAN-73 rapportmoms/dashboard och KAN-76 avskrivningar kvarstår. Ett lokalt grönt KAN-62-kvitto innebär ingen generell inventarieacceptans eller rätt att publicera. EU-varor, obetalda fakturor, returer och fleråriga avskrivningar införs inte.

Körbevis ska omfatta start-/slutidentitet, fryst filmanifest, exakt installerad privat/publik funktion och ACL, migrationslogg per fil, namngivna testfall med förväntat/faktiskt journalutfall, sessions-/låsbevis, felorsak/SQLSTATE för negativa prov, rollback-/restkontroll och bevarade fixture-ID:n. Inga credentials i bevisen. PASS får endast ges när alla obligatoriska fall har provats; ofullständiga fall redovisas som blockerade, aldrig som godkända av frånvaro av fel.

## Aktuellt utfall och nästa steg

Planeringen har endast läst Git/kod, Jira KAN-62, tidigare lokala bevis och lokal server-/schemametadata. Ingen kontakt med Staging/Production behövdes eller gjordes. Kandidatgren codex/KAN-62-rule-contract, HEAD d4320f5d6524216948904e0e58cae3a30ddd76fa, befintliga produktändringar bevarade ocommittade. Denna plan och dess migrationsmanifest har lagts till och kandidatens PROJECT_STATE.md har uppdaterats; ingen test-/produkt-/migrationskod ändrad.

**Aktuella blockerare före körning:** testkompletteringarna ovan är nu förberedda; se förberedelsekvittot. Ny lokal databas/identitetsmanifest, installation och testskrivningar kräver fortfarande uttryckligt körgodkännande. Ingen SQL-/RLS-/samtidighetsverifiering påstås. Om historisk installation eller preimage-kontroll fallerar tillkommer en konkret blockerare som ska granskas separat.

Ingen migrationsexekvering, skrivande DB-testning, Jira-mutation, commit, push eller deployment utförd. Nästa ledarbeslut gäller enbart ovanstående isolerade lokala steg, aldrig Staging/Production.
