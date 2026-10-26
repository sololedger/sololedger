# KAN-112 – lokal rättning av två Staging-avvikelser

## Bedömning och exakt kandidat

**PASS lokal verifiering. BLOCKED hosted slutacceptans i väntan på nytt godkännande
av Staging-migration och publicering.** Ingen rättad version har testats hosted.

- Kandidat: `bf845c21955552a4bfb26e67cd45c189064663fa`.
- Gren: `codex/KAN-112-year-end-checklist`, arbetskopia
  `audit-packages/KAN-100-app-release-20261024`.
- Förälder: `8b5a384`, tidigare lokalt dokumentcheckpoint.
- Staging ligger kvar på produkt `91233be3a7da0887d4821583b96f54e847c54844`.
- Ny migration: `20261026110015_kan112_conflict_and_profile_scope.sql`.
- SHA256: `4d65559fe06bca24ce57cdbb65c8c6c2380c857598f1672d6b6abbb3f0fcaef1`.
- Endast lokal rollback-verifiering. Ingen fjärrmigration, push, app-/Edge-deployment,
  Supabase-inställning eller Jira-mutation utförd. Production orörd.

## Grundorsak och rättning

De publicerade Staging-definitionerna lästes med pg_get_functiondef före ändring,
liksom relevanta RLS, grants, constraint/index och låshjälpare. Funktionsavtrycken
stämde med den tidigare kandidaten. Jira KAN-112 lästes: Task/To Do/otilldelad;
ingen status eller annan uppgift ändrades.

**Samtidighet:** avsiktliga konflikter för gammal revision och ändrat underlag
kastade SQLSTATE 40001. Koden betyder tillfälligt serialization_failure och får
PostgREST att försöka om transaktionen. Det förklarar tidigare hosted timeout.
Lokalt reproducerades felkoden innan rättning. Supabase beskriver just detta fel
och rekommenderar PT409 för avsiktlig HTTP 409-konflikt:
https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

Rättningen byter bara dessa två avsiktliga SQLSTATE-värden till PT409. Samma
ägarlås, radlås, ägarhärledning, revision, underlagskontroll och replay bevaras.
Klienten tolkar PT409 och visar: **Checklistan eller underlaget har ändrats.
Läs om checklistan och kontrollera innan du bekräftar.** Äldre 40001 känns också
igen för kompatibilitet. Ingen automatisk överskrivning eller ny klientretry införs.
Den befintliga knappen Läs om checklistan rensar väntande försök och läser ny revision.

**Namnvarning:** dokument-, moms-, resultat- och skattepunkterna delade ett
profildigest med company_name. Faktiskt namnbyte reproducerades före rättning:
documents/vat/statements/tax ändrades. Nytt ekonomiskt profildigest utesluter
enbart company_name. Org.nr, momsnummer och samtliga sex tidigare moms-/skattefält
behåller sin påverkan. Dokument-/företagsuppgiftspunkten använder tidigare digest.
En namnändring ger därmed bara documents, medan ekonomiska fakta fortfarande varnar.

## Säker övergång av tidigare svar

Den nya framåtmigrationen har exakta preimage-villkor och ändrar bara två
befintliga funktionsdefinitioner. Inga nya tabeller, API-rättigheter eller Edge-kod.

För att själva algoritmbytet inte ska skapa ekonomiska omkontrollvarningar:

- Den tar befintligt ägarlås och därefter profillås i etablerad ordning.
- Bara bekräftade vat/statements/tax-rader vars sparade digest exakt matchar det
  aktuella gamla underlaget översätts till motsvarande nya digest.
- Bekräftelse och confirmed_at bevaras. Revision ökar för att en gammal flik ska
  behöva läsa om; updated_at beskriver den tekniska uppdateringen.
- Begäran-id/payload bevaras, och en tidigare förlorad respons kan fortfarande
  replayas utan en extra revision.
- Stale, avmarkerade och okända/otillgängliga underlag förklaras aldrig aktuella.
  Befintliga varningar kan därför behöva bekräftas igen av användaren. Namnbyte
  före migration går inte säkert att skilja från andra äldre underlagsändringar.
- Ägaranspråk används bara transaktionslokalt för den privata läsaren och återställs.
  Inga permanenta Auth-/sessionsinställningar ändras.

## Exakta produktfiler i rättningscommiten

1. `src/lib/yearEndChecklistClient.ts`: identifiera PT409 och begriplig omläsningstext.
2. `supabase/migrations/20261026110015_kan112_conflict_and_profile_scope.sql`:
   de två SQLSTATE-koderna, ekonomiskt profildigest och konservativ översättning.
3. `scripts/test-year-end-checklist-client.mjs`: PT409/äldre 40001, ett anrop,
   inga råa serverfel till användaren.
4. `scripts/test-year-end-checklist-db.mjs`: verifiera båda migrationerna och PT409.
5. `scripts/test-year-end-checklist-fixes-db.mjs`: före/efter-reproduktion,
   övergång av svar/replay, profiler, verklig bokning och faktura, katalog/ACL.
6. `package.json`: inkludera nya DB-regressionen i befintligt DB-testkommando.

Ingen dependency/lockfil, UI-komponent, rapportberäkning, journal-, moms-, NE-,
årslås- eller raderingslogik ändrad. Inga nya transaktionskällor. Integrationsytan
är läsning av tidigare kända källor för checklistvarningar och checklistans egen
skrivning; native bokning/faktura används enbart i syntetiska rollback-fixtures.

## Testresultat

- `npm run test:year-end-checklist:db`: **19 grupper PASS** (12 befintliga + 7 nya).
- Guard före varje lokal session: PostgreSQL17, sololedger_kan62_disposable_20261021,
  127.0.0.1:5432, OID57199 och tidigare unik syntetmarkör. Ingen ny DB/reset.
- Nödvändiga äldre KAN-100-definitioner och båda KAN-112-migrationerna installerades
  bara inom ROLLBACK. Inget lämnades permanent installerat.
- Riktig andra lokal session verifierar ägarlås och att annan ägare inte blockeras.
  Avsiktlig stale-revision/basis ger PT409. Detta är inte ett hosted tvåsessionstest.
- Verifierat: inga överskrivningar, replay, två ägare/år, RLS/ACL, anon/service-denial,
  låst historiskt år, kapacitetsfallback och befintlig raderingsgräns.
- Verifierat före/efter: faktisk namnändring, samtliga sex relevanta moms-/skattefält,
  verklig bokning med moms och obokförd kundfaktura. Rätt varningar, bevarade kryss.
- Uppgradering: aktuella digest översätts; redan stale bekräftelser, datum och
  begäran-id bevaras. Övriga funktionsdefinitioner/ACL och tabellgrants/RLS oförändrade.
- `npm run test:year-end-checklist`: PASS.
- `npm run test:regression`: **PASS**, inklusive faktisk Home/guide på dator/mobil
  med syntetisk transport och publik Playwright-smoke 2/2. Explicit syntetisk
  localhost-Supabase-konfiguration; inga verkliga fjärrkonton i regressionen.
- `npm run typecheck`: PASS; riktad ESLint för samtliga ändrade kod/testmoduler: PASS.
  Extra typkontroll efter regression fann en trasig genererad dev-validator.
  Endast den specifika cachefilen togs bort och Next typegen regenererade typer;
  efterföljande typkontroll/lint PASS. Inga genererade filer handredigerades.
- `git diff --check`: PASS.
- Ingen full produktionsbuild eller ny hosted acceptans körd. Ingen generell
  årslås-/SQL-testrättning. Det äldre Unexpected close-year delegate transformation
  är oförändrat och separat; KAN-113 har inte implementerats/reproducerats.

Bevis i `coverage/kan112-fixes/`: db-result.json (inklusive exakta nya funktions-MD5),
all-db.log, regression.log, typegen.log, typecheck.log och lint.log. Tidigare
`coverage/kan112-local/db-result.json` innehåller också nya migrationens testreferens.

## Nästa Staging-omtest – kräver nytt ledarbeslut

1. Godkänn exakt kandidat bf845c21955552a4bfb26e67cd45c189064663fa och den nya
   migrationen med SHA256 ovan för Staging fzxqiqenqjzhlyxxpvhg.
2. Kontrollera ledger och aktuella preimage/ACL; installera **endast nya migrationen**
   med officiell CLI och verifiera funktionsavtryck. Den gamla filen ändras inte.
3. Publicera exakt kandidaten till staging med uttrycklig GitHub-väg eftersom origin
   är lokal. Kontrollera verkligt alias, SHA och Staging-ref. Edge v9 återanvänds.
4. Två verkliga separata Auth-sessioner och två browserflikar: samma revision,
   exakt en sparning, snabb HTTP409 (testgräns 5 s), begripligt besked utan falskt
   Sparat, Läs om och fortsätt. Kontrollera även replay, nätverksfel och annan ägare/år.
5. Faktiskt namnbyte: ingen moms/resultat/skattevarning; dokumentpunkten får ändras.
   Relevanta profiluppgifter, bokning/moms och faktura ska fortsatt varna rätt.
6. Återläs data/ACL och bekräftelser, testa dator/mobil. Ingen Production-operation.

Ett förberett men **inte kört** hosted API-omtest finns i root-kopians
`audit-packages/KAN-112-staging-20261026/fix-acceptance.mjs`. Det återanvänder den
tidigare verifierade syntetiska kohorten, kräver uttrycklig ny approval/commit,
READY Preview/alias, installerad migration och exakta lokalt testade funktions-MD5
före skrivning. Det verifierar olika session_id, konfliktens svarstid, en revision,
replay/omläsning, namn-/moms-/boknings-/fakturapåverkan och oförändrade tidigare data.
Browserdelen behöver dessutom köras mot den nya publicerade kandidaten.

Dokumentation sparas i ett senare lokalt docs-checkpoint. Ingen sådan senare
docs-commit ska av misstag ersätta den här exakta produktkandidaten vid publicering.
Root-kopians tidigare ändringar och alla andra grenar/fixtures är bevarade.
