# KAN-78 – slutgranskning och Staging-förberedelse

**Senare hostad acceptans 2026-10-19:** exakt `67d314a` är publicerad som isolerad
Preview. KAN-78:s riktade verkliga boknings-/moms-/isoleringsprov PASS på desktop
och mobil. **Production BLOCKED av separat KAN-104**, nu hostat reproducerat med
fel företagsprofil, beständigt övertagna momsinställningar och påverkan på nästa
bokning. Både kvarliggande profil vid byte och sent A-svar efter färdig B-profil
reproducerades. Ingen authfix eller produktändring gjordes. Se
`docs/reviews/KAN-78-hosted-staging-acceptance.md` för exakta bevis och begränsningar.
Tidigare gransknings-/publiceringsplan nedan är historik; den ersätter inte detta beslut.

2026-10-19. **PASS för separat godkännande av isolerad Preview/Staging-publicering efter lokal rättning. Ingen publicering utförd eller godkänd här.**

## Ny lokal kandidat efter godkänd minimal rättning

Den tidigare kandidaten `0db6fe8` var blockerad av fynd 1 nedan. Rättningen är nu
implementerad och verifierad. Den nya kandidaten är denna rapports lokala
checkpoint på `codex/KAN-78-accounting-load-safety`; exakt SHA anges av
`git log -1 --format=%H` och i slutrapporten. Den består av ursprunglig KAN-78-commit
och en avgränsad rättningscommit ovanpå samma main-bas.

- GitHub-main verifierades på nytt med lyckad `git ls-remote` 2026-10-19:
  **e7f1442921338bc3983a96ae75a4aaeca4bc8bcd**. Den är identisk med kandidatens
  merge-base. Inga nya main-ändringar, ingen merge eller rebase.
- `src/app/page.tsx`, `Home`: befintlig återupptagningsruta flyttas utanför
  `AccountingDataBoundary`. Den kräver dashboardfliken, `bookingOwnerLoaded === user.id`
  och `pendingBooking.userId === user.id`. Försökets eget datum, beskrivning och belopp
  visas tydligt som sparat bokningsunderlag. Rapportbelopp och nytt bokningsformulär
  ligger kvar bakom laddnings-/felgränsen.
- Samma `runStandardBooking(true)` används endast efter användarens klick. Ingen
  automatisk återbokning, ny nyckel, payloadändring eller uppladdning införs.
  Ägarbunden lagring, Web Locks och servicekontrollen av verifierad användare består.
  `accountingService.ts`, `standardBookingAttempt.ts`, `useAuth.ts` och `supabase/`
  är oförändrade jämfört med `0db6fe8`.
- `scripts/test-standard-booking-browser.mjs`: två befintliga scenarier behålls;
  två permanenta scenarier tillkommer för ekonomiskt laddningsfel vid omladdning,
  desktop 1280 px och mobil 390 px. Faktisk Home/TransactionForm, OverviewCards,
  NEBilaga och laddningsgräns används med syntetiska tjänstesvar. Sviten ingår redan
  i `npm run test:regression`; inga testkrav har tagits bort eller försvagats.

| Kontroll på rättad produktkod | Resultat |
| --- | --- |
| Bokningsbrowser, 4 scenarier, desktop/mobil | PASS |
| Återupptagning vid läsfel, annan användare ser varken knapp eller underlag | PASS |
| Gamla sentinelbelopp dolda i dashboard och NE, feltext och återförsök | PASS |
| Ingen automatisk submission; samma payload/nyckel; uppladdning en gång | PASS |
| Tvåflikslås, tappat svar och exakt ett syntetiskt bokningskvitto | PASS |
| Rapportåterförsök återställer vy utan ny bokning | PASS |
| Full säker regression, inklusive årsbyten/sena svar, 16 laddningsgrupper, 4 panelgrupper och publik smoke 2/2 | PASS |
| TypeScript och webpack-byggkontroll | PASS |
| Riktad ESLint för ändrat bokningsbrowser-test | PASS |
| Full lint | Tidigare FAIL 82 fel/7 varningar mot main 86/8; inte omkörd, inget generellt lint-PASS påstås |

Byggkontroll och hela säkra regressionen passerade på den rättade produktkoden
före nätverksstoppet. Inga produkt-/teständringar har tillkommit efter dessa körningar.
Den återupptagna slutkontrollen: bokningsbrowser-testet **4/4 PASS**, TypeScript
**PASS**, riktad testlint **PASS**, diffkontroll **PASS** före commit.
Tester är syntetiska och gör inga hostade DB-skrivningar.
Lokala loggar finns utanför kandidatens Git-träd: `../KAN-78-fix-build.log` och
`../KAN-78-fix-regression.log`; de ingår inte i commit.

Profilracet hanteras enligt ledarbeslut separat i **KAN-104**. Ingen authändring eller
ändring av det ärendet görs här. Den aktuella återupptagningen kopplas till `user.id`
och den verifierande servicekontrollen, inte den asynkrona företagsprofilen. Ingen
ny authberoende säkerhetslucka har påvisats i denna rättning; fullständig acceptans
av profilbyte återstår separat.

**Nästa steg:** ledargranskning av den nya exakta SHA:n och separat uttryckligt
godkännande av en isolerad Preview enligt planen nedan. Gamla `0db6fe8` är inte
testkandidaten. Miljöuppgifterna nedan är från föregående slutgranskning samma datum,
inte en ny livekontroll i rättningen. Delat staging, dess främmande commits och de
två extra inventariemigrationerna ska inte följa med genom merge eller DB-synk.
KAN-78 är livekontrollerat **In Review / Pontus Åkerhage** och lämnas så.

## Historisk oberoende granskning av 0db6fe8 (före rättningen)

Den faktiska diffen mot färskhämtad GitHub-main har granskats. Produktkoden har inte
ändrats under denna granskning. Den tidigare rapportens PASS-testresultat ersätter
inte det nya negativa regressionsfyndet nedan.

## Granskat Git-läge

- Kandidat: **0db6fe8dcb5cab1d2006501002017f692daf182b**, gren `codex/KAN-78-accounting-load-safety`.
- GitHub-main: **e7f1442921338bc3983a96ae75a4aaeca4bc8bcd**, färskläst och hämtad till `kan78-review/main`.
- Kandidaten består av exakt en commit ovanpå main: 20 filer, 696 tillagda/338 borttagna rader. Inga SQL-, RPC-, domänberäknings-, lockfils- eller CI-ändringar i diffen.
- GitHub-staging: **5809094dd3ce808dba35986c65e772b842f0d0e1**, hämtad till `kan78-review/staging`. Grenarna divergerar: 12 commits bara i staging, 30 bara i kandidaten. Slå inte ihop staging med KAN-78 för att skapa testkandidaten.
- Worktreens origin är en lokal KAN-75-bundle, inte GitHub. De nya granskningsreferenserna ändrar inte origin eller arbetsgrenen.
- Kandidaten var helt ren vid granskningens start. Efter granskningen finns bara denna nya rapport och en lokal uppdatering av PROJECT_STATE.md som ocommittad dokumentation; produktkoden är fortfarande exakt 0db6fe8.
- Desktop-repots andra ändringar har lämnats orörda. Ingen ny commit eller push görs i granskningen.

## Fynd 1 – publiceringsblockerande regression i återupptagning

**P1:** `src/app/page.tsx:1155` lägger hela dashboarden innanför
`AccountingDataBoundary`. Knappen vid `page.tsx:1209`, Återuppta bokningsförsöket,
ligger därmed också bakom ekonomiladdningens ready-status. Vid laddning/fel
renderar `AccountingDataBoundary.tsx:11–16` inga av dessa barn.

Reproduktion med faktisk Home/TransactionForm och syntetiska service-/läsgränser:

1. Skapa ett syntetiskt bokningsförsök vars svar tappas efter det simulerade kvittot.
2. Verifiera att försöket finns i användarbunden localStorage och kan återupptas.
3. Ladda om med ett ekonomiskt läsfel (`accountingDataReady=false`, separat feltext).
4. Försöket finns fortfarande kvar, men återupptagningsknappen saknas.

Jämförelse på samma offline-fixture: **main PASS, knapp finns**, medan
**0db6fe8 FAIL, knapp gömd**, på både desktop och mobil. Ingen riktig bokning eller
extern nätverksförfrågan utfördes. Skrivfunktionerna är oförändrade men tillgången
till den redan etablerade säkra återhämtningsvägen har försämrats.

Minsta föreslagna rättning, **inte genomförd**: behåll den ägarbundna rutan för ett
redan sparat bokningsförsök utanför gränsen för ekonomiska sammanställningar. Visa
försökets eget datum och underlag tydligt, och återanvänd befintlig idempotenta
återupptagning. Håll rapportbelopp och ny bokning spärrade/dolda när underlaget
inte är verifierat. Ingen RPC-/bokföringssemantik-/authändring behövs för denna fix.

Komplettera regressionen med verkligt felläge vid omladdning: återupptagning ska
vara tillgänglig, samma nyckel/underlag ska återanvändas och inga ekonomiska kort
eller gamla rapportbelopp får synas. Den korrigerade produktkoden får en **ny SHA**;
0db6fe8 ska inte vara den godkända Staging-kandidaten.

## Tester och testgranskning

- Ny omkörning: `npm run test:accounting-load` **PASS, 16 Chromium-grupper + 4 callbackgrupper**.
- Ny TypeScript-kontroll **PASS**.
- Ny omkörning: momsöversikt **22 assertioner PASS**, moms-livscykel, avräkning och skattekontoflytt **PASS**.
- Ny oberoende negativ probe av återupptagning: **FAIL för kandidaten / PASS för main**, desktop och mobil.
- Tidigare kompletta build-/safe-regression-loggar från samma produkt-SHA finns och har lästs. Build, safe regression och publik smoke 2/2 passerade då; de omkörs inte för att överskugga den nu reproducerade bristen.
- Full lint är sedan tidigare röd: kandidat 82 fel/7 varningar, bas 86/8. Ingen kod har ändrats i denna granskning och full lint har inte körts om.

Inga befintliga assertioner har tagits bort. NE-testets ändrade resolveDir rättar
en sökväg. Moms-historiktestets ändring kräver tekniskt fel i stället för nollfallback.
Bokningsbrowser-testet behåller sina assertioner, men dess loader-fixture på rad 13
ger alltid `accountingDataReady:true`, även när dess refresh-status är false. Därför
täcker det inte verklig omladdning med läsfel och upptäckte inte fynd 1. Detta är
en konkret täckningslucka; tidigare PASS räcker inte som kvitto för detta scenario.

## useAuth – konkret befintligt separat profilrace

`src/hooks/useAuth.ts:98–107` byter användare men behåller tidigare profil medan
nästa hämtas; `applyProfile` kontrollerar bara montering, inte vem svaret gäller.
En faktisk offline-körning av hooken reproducerar båda följande:

- användare B + profilen Company A medan B:s svar väntar;
- användare B + Company A late efter att B:s korrekta profil först hunnit laddas.

Filen är byte-identisk mellan main och kandidaten. Detta är ett konkret befintligt
UI-/profilisoleringsfel, inte ett fynd som KAN-78 har infört. Profilen används till
företagsnamn och moms-/produktbeslut i UI, så det får inte avfärdas som kosmetik.
Ingen RLS-/RPC-behörighetsöverträdelse, verklig dataläcka eller Production-incident
har påvisats av proben. KAN-78:s ekonomiska snapshot avvisar samtidigt andra
användares tidigare laddningar i de separata riktade testerna.

Rekommendation: separat avgränsat Jira-ärende för profilens ägarkoppling och sena
svar, utan orelaterad authrefaktor i KAN-78. Jira-sökning gav ingen relevant
dubblett utöver KAN-78. Inget nytt ärende skapas här. Fullständig acceptans för
kontobyte bör inte ges innan profilracet hanterats. Ett senare isolerat KAN-78-test
ska använda dedikerad Staging-identitet och full utloggning/omladdning mellan konton.

## Live verifierad Staging-/Preview-miljö

Vercels connector nekade projekt/deployment-läsning (404/403). Den dokumenterade
CLI-reservvägen fungerade med explicit samma team/projekt; detta är ett connector-
behörighetsproblem, inte bevis för ett produktfel.

| Del | Verifierat läge |
| --- | --- |
| Vercel-projekt | `sololedger`, `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL` |
| Production | READY, main/e7f1442, `dpl_Gp2aeKFnu8RaGx8bHRfYdMtwrcQZ` |
| Senaste Preview | READY, `dpl_EjNHt4mSmhzWjshEqwvGCSS9Y4dv`, ca6f5ca7b38cdbb1fa494ead73e2bf6e618591ea, `sololedger-c902wrtoo-sololedger1.vercel.app` |
| Befintligt Staging-alias | `sololedger-git-staging-sololedger1.vercel.app` pekar på READY `dpl_9nEEL8RQkRqWumceFbB6FavB4FZF`, KAN-80/fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0, `sololedger-jaohjpnp8-sololedger1.vercel.app` |
| Git-publicering från staging | Pausad via Vercels ignore-command specifikt för staging och icke-production. Ändra inte spärren inom KAN-78. |
| Preview DB-adress | Publika `NEXT_PUBLIC_SUPABASE_URL` verifierad till `https://fzxqiqenqjzhlyxxpvhg.supabase.co`, generellt Preview-scope utan branchvillkor |
| Övriga Preview-miljövariabler | Separata poster finns för anon/service-role/site URL. Hemliga värden har inte lästs eller skrivits ut. Production-poster har separat target. |
| Supabase Staging | `sololedger-staging` / `fzxqiqenqjzhlyxxpvhg`, ACTIVE_HEALTHY, PostgreSQL 17 |
| Migrationsledger | Staging 52, Production 50; båda slutar på `20261019120000_kan75_year_close_concurrency` |

Staging har exakt de två sedan tidigare kända extra migrationerna:

- `20261012123000_kan62_fixed_asset_gross_vat_rate`
- `20261012153000_kan62_fixed_asset_group_locking`

Deras filer finns redan i main och kandidaten, men de är inte tillämpade i
Production. KAN-78 har **ingen migrationsdiff**. Ingen `db push`, include-all,
repair, baseline eller annan migration ska ingå i KAN-78-publiceringen.

Läsande katalogkontroll bekräftar att de tre kontrollerade saldon/NE-RPC-kropparna
`get_period_account_balances`, `get_cumulative_account_balances` och
`get_ne_sales_summary` matchar mellan Staging och Production. Inventariedelegeringen
`book_fixed_asset_acquisition_atomic_unchecked_kan54` skiljer däremot fortfarande:
Staging-definitionen innehåller gross_amount, Production-definitionen gör det inte.
Den kända KAN-62/65-kompatibilitetsbegränsningen kvarstår. KAN-78 innebär inget
godkännande av nya inventariebokningar eller någon synk av dessa scheman.

## Förberedd publiceringsplan – kräver nytt godkännande

1. Rätta först fynd 1 lokalt och lägg den saknade regressionen i sviten. Verifiera
   att rapportbelopp förblir dolda vid fel, att återupptagning fungerar och att
   riktade kontroller samt säker regression passerar. Fastställ den nya exakta SHA:n.
2. Skapa efter uttryckligt godkännande en **separat Preview** från en ren export/
   checkout av enbart den godkända SHA:n ovanpå verifierad main. Utgå inte från
   Desktop-staging och mergea inte in dess 12 separata commits. Trädet får inte
   innehålla auditpaket, `.env`, autentiseringslagring eller gamla lokala byggfiler.
3. Använd det verifierade Vercel-projektet/teamet och Preview-miljön. En lokal
   källpublicering till Preview undviker både Git-push och förändring av den pausade
   staging-grenen. Den är fortfarande en deploy och måste godkännas uttryckligen.
   Registrera verklig käll-SHA och filmanifest; använd deploymentens unika URL.
4. Flytta inte Production- eller det delade Staging-aliaset. Ändra inte miljövärden,
   byggspärr eller Supabase. Bekräfta efter bygget READY, rätt käll-SHA och publik
   Supabase-ref i den färdiga Preview-versionen innan något testkonto används.
5. Testa först läsande: publik login-smoke, dedikerad Staging-inloggning, 2026→2027,
   injicerade fel i vardera läsgren, återförsök, korrekt tomt år, snabba svar i fel
   ordning, dashboard/detaljer/NE, fakturors årsfilter och momsrapportens eget års-
   och periodval. För inventarier testas visning/felläge och känd KAN-62/65-hold,
   inte nya anskaffningar mot ett inkompatibelt schema.
6. Ett hostat boknings-/återupptagningsprov med tappat svar bör verifiera samma
   idempotensnyckel, en bokning/journal och korrekt efterföljande rapportläsning.
   Det kräver **separat godkännande av Staging-skrivtest** och dedikerade syntetiska
   data. Inga sådana skrivtester eller nya testdata är godkända/gjorda nu.

Återställning: sluta använda den nya isolerade Preview-URL:en och återgå till en
tidigare godkänd testversion. Eftersom delade alias, main, Production och DB inte
ändras behövs ingen DB-/Production-rollback för denna plan. Om ett alias senare
ska flyttas tillbaka kräver även det godkännande. Radera inte bokföringsdata som
"rollback"; eventuella godkända testskrivningar hanteras separat och auditerbart.

## Historiskt slutläge före rättningen

**BLOCKED:** rätta och testa återupptagningsregressionen innan någon KAN-78-Preview
godkänns för publicering. Separat profilärende föreslås; ingen authfix genomförd.
KAN-78 behålls i In Review / Pontus. Ingen push, deploy, migration, DB-skrivning,
ny commit eller ändring av andra Jira-ärenden har gjorts i denna granskning.

Reproducerbara prober och syntetiskt auth-resultat finns lokalt utanför kandidaten
i `audit-packages/KAN-78-verification/final-review/`: `recovery-boundary-probe.mjs`
(kör även med `--main`), `auth-profile-race.mjs`, `auth-profile-result.json`.
