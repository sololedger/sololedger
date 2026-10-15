# KAN-74 – serververifierad SIE-import, lokal implementationskandidat

2026-10-15. Implementerad och lokalt verifierad på codex/KAN-74-sie-opening-guard,
HEAD/base 1d297c1fd387be2f3f6cd54a780b8c58c2901732. Allt ocommittat.
**Redo för oberoende kod-/SQL-granskning. Hosted release är fortfarande blockerad av villkoren nedan.**

Aktuell riktad uppföljning: [företagslåsning och 4 MB-gräns](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/docs/reviews/KAN-74-company-lock-followup.md). Den innehåller P2 RED/GREEN och senaste verifieringen.

## Resultat och obligatorisk importväg

Vald originalfil -> autentiserad /api/sie/import -> befintlig avkodare/parser i
strikt läge -> serverhärlett period-/bokföringsunderlag -> skyddat DB-kvitto ->
import_sie_batch med användarens ursprungliga JWT -> befintlig atomär bokföring.
Klienten skickar endast filbytes, aldrig egna periodfält, hash, ägare eller journalrader.

- Fullständig #RAR 0 krävs exakt en gång. Verkliga datum, start <= slut, ett
  kalenderår och samtliga VER-/effektiva TRANS-datum inom perioden kontrolleras.
- IB kräver start 1 januari; befintlig IB-/RES -1-kontroll och 2019-brygga återanvänds.
  UB läses och valideras som metadata men bokförs aldrig. Jämförelse-IB importeras inte.
- Samma tokenizer/parser används; strikt läge stoppar trasiga kritiska poster,
  tvetydigt ORGNR, okända bokföringsrader, orimliga index och icke-finita belopp.
  Kompatibilitetsläget finns kvar; inga nya beräkningsregler införs.
- Gränser: 4 MB = 4 000 000 originalbytes, högst 50 000 nya journalrader inklusive
  IB/bryggrad. Faktiskt mottagen body begränsas även när Content-Length är felaktig.
- getUser(token) verifierar identiteten. Service-klienten registrerar kvittot;
  en separat klient med användar-JWT konsumerar det. Ingen SQL-impersonering.

## Behörigheter, företag, atomaritet och städning

- Ny sie_import_inputs har RLS. anon/authenticated saknar all tabellåtkomst.
  Bara service_role kan anropa registrerings-RPC:n; en extra JWT-rollkontroll
  finns. Privat periodvalidator kan inte anropas av klient- eller serverrollen direkt.
- service_role har endast direkt SELECT för adminräkning/residualkontroll, med
  en explicit rollbegränsad RLS-policy. Registrering/rensning görs genom RPC.
- Företagets bokföringsidentitet är befintligt user_id/profiles.id; ingen separat
  flerföretagsmodell införs. Profil måste finnas. När dess organisationsnummer
  finns krävs matchande filnummer efter borttagning av skiljetecken. Numret binds
  till kvittot, läses om efter advisory-låsväntan och hålls med FOR SHARE NOWAIT till transaktionsslut. Kroppens user_id ignoreras inte
  som alternativ auktoritet utan tillåts över huvud taget inte som extra formulärfält.
- import_sie_batch accepterar exakt {receipt_id}. Fri JSON, extra ersättningsfält,
  annans/okänt/utgånget/förbrukat kvitto avvisas; ingen gammal fallback finns.
  Hela payloaden hämtas från låst kvitto och period/raddatum kontrolleras igen i DB.
- Låsordning: kvittorad -> alla momsmånader -> användarens importlås -> IB-dag
  -> profil FOR SHARE NOWAIT -> historikkontroller/skrivning. READ COMMITTED kvarstår. Giltigheten kontrolleras
  efter kvittolåset, efter övrig låsväntan och före slutlig konsumtion.
- Kvitto gäller högst 10 minuter med DB-satt tidsstämpel och CHECK. Det raderas
  endast vid lyckad import, i samma transaktion som bokföringen. Fel rollbackar
  alla skrivningar och lämnar kvittot oanvänt; återspelning kan inte bokföra igen.
- Befintlig filhash beräknas nu av servern men är bytekompatibel med tidigare
  kanonisk hash. Råfilens SHA-256 är separat metadata, inte ny dubblettnyckel.
- Bounded cleanup raderar högst 100 utgångna kvitton per registrering med SKIP LOCKED.
  FK-cascade till både Auth och profil täcker även reset/radering. Auktoritativ
  delete_user_data_atomic raderar/räknar kvitton före övriga data. Edge-raderingens
  räknelista och residualkontroll har uppdaterats innan Auth tas bort.
- Inga råa parser-/DB-fel loggas/returneras. SQLSTATE bevaras vid sanitiserad
  återkastning efter rollback; HTTP-fel är fasta svenska meddelanden. Vid osäkert
  nätverkssvar uppmanas användaren kontrollera historiken, utan falskt rollbacklöfte.

## Exakta migrationsförslag (i denna ordning)

1. [supabase/migrations/20261015115900_kan74_sie_verified_inputs.sql](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/migrations/20261015115900_kan74_sie_verified_inputs.sql)
2. [supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql)
3. [supabase/migrations/20261015121000_kan74_sie_receipt_deletion.sql](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/migrations/20261015121000_kan74_sie_receipt_deletion.sql)

115900 skapar kvittotabell, index, FK, RLS/grants, registrerings-RPC och privat
periodvalidator. 120000 ersätter endast import_sie_batch. 121000 lägger endast
kvittoradering/-räkning till den inspekterade delete_user_data_atomic-definitionen.
Inga befintliga bokföringsrader, batchår, saldon, NE-/exportfunktioner eller låsdata ändras.

Övriga ändrade/nya implementations- och testfiler i kandidaten:

- [src/app/api/sie/import/route.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/app/api/sie/import/route.ts)
- [src/lib/sieImportServer.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/sieImportServer.ts)
- [src/lib/sieImportPayload.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/sieImportPayload.ts)
- [src/lib/sieParser.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/sieParser.ts)
- [src/lib/sieImport.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/sieImport.ts)
- [src/components/SieImportModal.tsx](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/components/SieImportModal.tsx)
- [src/lib/adminDeleteDryRun.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/adminDeleteDryRun.ts)
- [supabase/functions/delete-user/index.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/functions/delete-user/index.ts)
- [scripts/test-sie-import.mjs](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/scripts/test-sie-import.mjs)
- [scripts/test-sie-opening-guard.mjs](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/scripts/test-sie-opening-guard.mjs)
- [scripts/check-db-regression-invariants.mjs](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/scripts/check-db-regression-invariants.mjs)
- [supabase/tests/kan74_sie_opening_guard.sql](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/tests/kan74_sie_opening_guard.sql)
- [supabase/tests/helpers/kan74_receipt_fixture.sql](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/tests/helpers/kan74_receipt_fixture.sql)
- [package.json](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/package.json)
- [PROJECT_STATE.md](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/PROJECT_STATE.md)

Dokumentation: denna rapport och aktuell PROJECT_STATE; äldre KAN-74-rapporter
har behållits som historiska bevis och markerats som ersatta för aktuell status.

## Lokal verifiering

- test:kan74:db PASS: 66 rollback-scenarier. Tidigare 47 historik-/P1-/IB-/
  företagsfall plus 18 kvitto/ACL/period/livscykelfall och en fullständig
  raderingssekvens inklusive sent fel/rollback, räkning, residualer och Auth-cascade.
- 15 befintliga tvåsessionsracer PASS med observerad låsväntan (plus tre nya profilfall i uppföljningen): båda årsföljderna,
  samma år, med/utan IB, momsens låsordning, P1 via 2018, rollback-vinnare,
  samma kvitto, samma fil med olika kvitton och kvitto som går ut under väntan.
  Två starkare isoleringsnivåer avvisas utan bokföring och utan konsumerat kvitto.
- Fem befintliga SQL-sviter PASS: tre KAN-71 samt KAN-72 manuell bokföring och
  KAN-63 kundfakturamoms. Säkerhetsassertionerna bevaras. Endast syntetiska import-
  fixtures använder kvittoregistrering; KAN-71 row_year_cross byggs som befintlig
  historik inom rollback enligt tidigare dokumenterad anpassning. Faktiska
  KAN-71-resultat körs även genom befintliga rapport-/NE-/dashboardassertioner.
- Verklig serverparser/handler/route/klient testas med nätverk/Auth ersatt vid
  gränsen: normal fil, P2, saknad/duplicerad/ogiltig RAR, IB-start, datumgräns,
  skadad syntax, storlek/radantal, UTF-8/CP437/CP850, session, säkra fel och gammal hash.
  P2 stoppas innan något registrerings-/bokföringsanrop; inte bara i klientpreview.
- Fem verkliga servergenererade underlag körs därefter genom riktiga lokala
  registrerings-/bokförings-RPC:er: normal, IB, RES-brygga, UB och EXAKT 50 000 rader.
  Kontrollerat saldo 100/10 100 kr respektive 25 000 kr i 50k-fallet; UB ger ingen
  extra bokföring och bryggan ger -2 000 på 2019.
- Alla nya race-/integrationsanvändare och data tas bort via ordinarie atomära
  raderings-RPC:n och Auth-radering. Ursprungliga Auth-antal och innehåll/antal
  för profiler, transaktioner, journaler, batcher, sekvenser, momsperioder, stängda
  år och kvitton är identiska före/efter. Noll kvitton kvar. Inga riktiga användare.
- Exakta tre migrationsfiler provade från tillstånd utan kvittodomän inom
  rollback; aktuella funktionsdefinitioner överensstämmer med filerna. Alla
  övriga public-funktioners kroppar/ägare/ACL är identiska. Import-/raderings-ACL bevarade.
- Build, separat typecheck, test:regression (full domänsvit + publik lokal
  Playwright 2/2), riktad lint, DB-invarianter, admin dry-run och skrivskyddad
  lokal raderingslivscykel-postcheck PASS. Dummy-konfiguration används vid build/smoke.
- Full npm run lint är fortfarande RÖD: 85 fel och sex varningar. Kvarvarande
  diagnostik jämförd mot HEAD: oförändrade filer eller exakt samma befintliga
  diagnostik i ändrad Edge-fil (fem). Inga nya lintfel; skulden har inte gömts eller fixats brett.

## Kvarstående risker och releasevillkor

1. Tidigare 10 MB-hostinghinder är löst genom ledarens beslut om 4 MB.
   Serverns totala bodytak är 4 065 536 byte inklusive multipart; gränserna är
   lokalt verifierade. Hosted uppladdningsacceptans återstår; se aktuell uppföljning.
   Källa: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations).
2. TTL innebär giltighetstid, inte schemalagd fysisk radering efter tio minuter.
   Expirerade kvitton städas vid nästa registrering eller full användarradering.
   Ingen hosted städjobbsinstallation har gjorts.
3. Fleråriga importer förblir avsiktligt blockerade, även legitima rena rörelser
   och byte av år efter ångring. Saknad RAR och IB med annan start än 1 januari
   stöds inte. Olika representationslängd på organisationsnummer kan ge ett
   konservativt avslag; ingen osäker gissning mellan exempelvis 10 och 12 siffror.
4. Överlappande vanliga verifikationer inom samma år och olika filhash är
   fortfarande inte en fullständig dubblettmodell. Befintliga historiska fel
   rättas inte; manuell bokföring får fortsatt skapa användarvalda belopp.
5. Inte körda: hosted write-E2E, live pg_get_functiondef-jämförelse, full
   webbläsaracceptans med verklig Auth/PostgREST och körd hosted delete-user-Edge.
   Lokal Auth/nätverksgräns är kontrollerad testersättning; DB-funktionerna är verkliga.

Före Staging/Production: färsk livejämförelse för båda ändrade RPC:erna samt
relevanta grants/RLS/FK/index, kontroll av namn/overloads och officiell migrations-
identitet, separat godkännande för migration/deploy samt hosted uppladdningsacceptans.
Publiceringsordning måste neka gamla klienters fria JSON utan fallback.
Kort godkänd E2E-checklista: en representativ fil -> journal/IB -> momsrapport
och NE/dashboard/bank -> dubblett -> ångring/periodskydd; kvittoradering och
företagsisolering. Inga fakturor/fordringar ska skapas av SIE; vanlig fakturaväg
och årslåsning kontrolleras oförändrade. Ovan är framtida verifiering, inte utförd hosted testning.

## Bevarat arbetsläge

Samtliga 13 ursprungliga worktrees/HEAD/dirty states, KAN-62/65 och docs-commit
11d8306 är bevarade. Hela nya arbetet är ocommittat i befintlig KAN-74-worktree.
Ingen hosted skrivning/migration, deploy, push, commit, datarättning eller Jira-
ändring. KAN-74 lästes To Do/High/unassigned, status inte ändrad och inte Done.
Ingen ändring av AGENTS.md, Architecture.md, PROJECT_ARCHIVE.md, package-lock
eller beräknings-/NE-/exportkod. Avvakta ledarchattens beslut efter granskning.

Evidens: C:\Users\Familjedator\.codex\visualizations\2026\10\15\01a13dfa-6f68-7063-b1dc-9ca3f87c2006\kan74/receipts/. audit.json, db-before/final.json, lint-baseline.json,
final-db-suite.log, final-regression.log och migrationsprovet finns där.
Slutlig självbärande DB-testkörning sparade ytterligare lokal evidens i
C:/Users/Familjedator/AppData/Local/Temp/sololedger-kan74-receipts-AyqFoM/.
