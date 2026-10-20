# SoloLedger Project State

Uppdaterad **2026-10-20 inför byte av Codex-konto på samma dator**. KAN-97 Preview är publicerad, men **inte accepterad för Production**. Senaste faktura-/inventarieanalysen är färdig; föreslagen faktura-/UI-rättning är **inte implementerad**. Denna handoff ger inget implementations- eller publiceringsgodkännande.

## Läs först och bevara

- AGENTS.md är permanent regelbok. Produktmål: begriplig och korrekt bokföring för Jessikas enskilda firma år efter år; inga löneflöden. Osäker → SoloLedger gissar inte.
- Starta läsande i exakt befintlig utvecklingskopia: **C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user\audit-packages\KAN-104-source**. Katalognamnet är historiskt; uppdraget är KAN-97.
- Bevara alla lokala filer, ignorerade bevis, testdatabaser och arbetskopior. Skapa inte ny worktree/klon eller städa på grund av kontobytet. Använd inte den separata Desktop-rotens äldre stagingkopia av misstag.
- Nästa beständiga läsunderlag: **docs/reviews/KAN-97-INVOICE-INVENTORY-DEPENDENCIES.md** (aktuell analys och A/B/C-plan), därefter tidigare DB-/UX-/P1-rapporter vid behov. Äldre rapporters datum/status är historiska; aktuell status står här och i senaste releaserapport.
- Nästa konto kan sakna befintliga connector-/CLI-behörigheter. Verifiera identitet/åtkomst läsande; ingen ominloggning, miljöändring, ny hemlighet eller Production-fallback får antas godkänd. Läs/kopiera aldrig pgpass eller env/auth-innehåll.

## Git: utvecklingskopia, integration och externa grenar

- **Utveckling:** codex/KAN-97-withdrawal-space, produktcheckpoint **430842c082a58572079bda5a2c7b86cff899720b**, förälder/bas **984405a6ddf83cd125f5b9d0a02b632c1e2e09c3**, tree **d4c2a4e0114f45347e3163f6ff782bef57736285**. Checkpoint med exakt 37 godkända filer är committat och numera nåbart från GitHub staging via integrationen; produktarbetet är inte bara opushat lokalt.
- Origin fetch/push är **C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user/audit-packages/KAN-78-source**, **inte GitHub**. Ingen upstream. Lokal origins HEAD **67d314a95f9f964aa2adabce81e3cf799366eb3f** på codex/KAN-78-accounting-load-safety; den har varken main/staging eller KAN-97-grenen. Inga remotes/fetch-refar ändrade.
- **Integration:** ../KAN-97-staging-integration-20261020/candidate, ren vanlig fristående Git-klon, gren codex/KAN-97-staging-integration, inga remotes. HEAD **585c8942dac73f348be30ac92be692921d4d4a0c**, enda förälder **504ee839e8959a05beff98bb337e0e036ddf8b28**. Samma tree som utvecklingscheckpointet; tom identitets-releasecommit. Inga produktkodskillnader mellan dessa två kopior.
- Integration 504ee839 har föräldrar staging **5809094dd3ce808dba35986c65e772b842f0d0e1** och checkpoint **430842c082a58572079bda5a2c7b86cff899720b**. Bevarar staging-historik utan att återinföra KAN-62/65 pausade produktkod. Ingen force-push eller historikomskrivning.
- **GitHub läst på nytt vid handoff:** staging **585c8942dac73f348be30ac92be692921d4d4a0c**; main **984405a6ddf83cd125f5b9d0a02b632c1e2e09c3**. Main/Production har inte uppdaterats inom KAN-97. Lokal integration och GitHub staging är samma SHA.
- **Ocommittat vid denna handoff:** Före dokumentationscheckpoint: PROJECT_STATE.md och PROJECT_ARCHIVE.md modifierade; nya analysrapporten untracked. Därutöver 15 tidigare untracked filer nedan. Inget staged. Inga produktkodändringar efter checkpoint/release. Denna dokumentationscheckpoint är separat lokalt godkänd och omfattar endast tre dokument; ingen push är godkänd/utförd. Aktuell HEAD efter checkpoint läses med git rev-parse HEAD.

## Lokala filer och bevis – ska bevaras

- Sex tidigare untracked rapporter i docs/reviews/: **KAN-97-HANDOFF.md, KAN-97-critical-review.md, KAN-97-local-verification.md, KAN-97-P1-VERIFICATION.md, KAN-97-DB-VERIFICATION.md, KAN-97-UX-VERIFICATION.md**. Viktiga lokala bevis, inte förlorade/automatiskt releaseurval; deras befintliga innehåll ändras inte i handoffen.
- Nio tidigare untracked verifieringsfiler: scripts/**diagnose-kan97-smoke.mjs, test-kan97-db-browser.mjs, test-kan97-db-concurrency.mjs, test-kan97-db-edges.mjs, test-kan97-db-functional.mjs, test-kan97-db-lifecycle.mjs, verify-kan97-lint.mjs, verify-kan97-local-db.mjs** samt tests/fixtures/**withdrawal-local-db.sql**. Lokala miljöberoende bevis, inte automatiskt med i nästa release/commit.
- Coverage-bevis finns i **coverage/kan97-checkpoint-20261020/**, **kan97-ux-20261020/**, **kan97-db-20261019/** och **kan97-p1/**. Playwright kan rensa test-results; lägg nya råloggar utanför rensade kataloger.
- Separata tidigare testkopior bevaras under **C:\Users\Familjedator\.codex\visualizations\2026\10\19\01a15559-8dc2-7d21-be2a-5a9d8fb23f5b\KAN-97-regression-artifacts\**. Inga filer ska flyttas/raderas vid kontobytet.
- Senaste release-/identitetsrapporter och bevis finns under **../KAN-97-staging-integration-20261020/**, särskilt **KAN-97-CORRECTED-STAGING-PREVIEW.md**, **KAN-97-LOCAL-IDENTITY-RELEASE.md**, **identity-release-20261020/PREFLIGHT.md**, **corrected-release-20261020/**. De är lokala utanför kandidatträdet och inte pushade som rapportfiler. Pre-handoff state och filmanifest bevaras i **account-handoff-20261020/** där.
- Lokal disponibel PG17-testdatabas **sololedger_kan97_disposable_20261019**, 127.0.0.1:5432, OID 56112, syntetiska data, är tidigare verifierad och inte raderad. Återverifiera identitet/testmarkör före eventuell separat godkänd återanvändning; kör inte gamla skrivscript blint. Inga DB-skrivningar är godkända nu.

## Implementerat och lokalt verifierat

- Flerårig uttagsmodell: kvarstående moms/skatt, gemensam skattekontoavräkning och daterade ägarbundna bedömningsfakta/revisioner. Avstämning ändrar inte bokföringen. Bank 1930; okända källor/uppgifter ger spärr, ingen gammal positiv fallback vid laddning/konflikt.
- Tidigare P1 R1–R4 rättade: 2650 tappas inte/dubbelräknas inte, saknade momsperioder får inte antas årsnettas, konflikt invalidierar gammal rekommendation, sparad aktiv årsprocent påverkar rätt årsuppskattning. R5/R6 avgränsade rättningar och kvarvarande hjälpförklaringsrisk dokumenterade i P1-/UX-rapporter.
- Gemensam sparad årsprocent för skatteexempel/uttag, endast reglage i Dashboardens skattekort, explicit Spara/osparat, ingen global localStorage-import. Historiska år och preliminära/slutliga beslut bevaras; inget reglage på NE/gemensam verktygsrad.
- **PASS tidigare:** reproducerande FAIL före/PASS efter; lokal riktig PostgreSQL för RLS/grants/ägare, revisionshistorik, rollback, radering och åtta samtidighetsfall; R1–R4/flerårskedjor och UI/service. Slutlig checkpoint: TypeScript, riktad lint, domän, DB-invarianter, admin dry-run, optimerat webpack-bygge och hela säkra regressionen inklusive smoke/bokning PASS. Exakt samma produktträd publicerat.
- **FAIL kvar:** full lint **74 befintliga fel + 6 varningar**, inga nya diagnoser i senaste UX/checkpoint. Ingen bred städning. Äldre före-rapporter med 75 fel och misslyckad smoke ersätts av senare verifiering, inte av ett påhittat PASS för de gamla körningarna.
- Historiskt bevarandeavsteg: en tidig smoke-körning rensade äldre test-results; originalråloggar återställdes inte. P1-rapporten skiljer avskrift från senare regenererat bevis. Detta är inte grund för att påstå att samtliga äldre råloggar finns kvar.
- Produkt-/DB-/UX-tester omkördes inte under denna dokumentationshandoff. Ny faktura-/UI-rättning har inga FAIL/PASS-bevis ännu eftersom implementationen inte har startat.

## Faktiskt Staging-läge och återstående acceptans

- **Preview READY på nytt läst vid handoff:** **dpl_AvRns4EKKAsV8YBy85avfUg4Gq2n**, source cli, release **585c8942dac73f348be30ac92be692921d4d4a0c**, tree **d4c2a4e0114f45347e3163f6ff782bef57736285**.
- **Enda KAN-97-acceptansadress:** https://sololedger-i8zngng5w-sololedger1.vercel.app – befintligt Vercel-skydd. Gamla staging-aliaset pekar på äldre KAN-80 och är inte KAN-97-acceptans.
- Projekt **prj_chkSdedE06ppK2PlsqdtOhZfAKpT**, team **team_0Mrj7LMvSEfpbV8y5juQ5IiL**. Explicit Preview, CLI64.5.0 exit0; 422 uppladdningsfiler/hashar mot exakt godkänt tree, inga extra bevis/credentials. Remote optimerat Next16.2.6/Turbopack-bygge PASS.
- **Staging Supabase fzxqiqenqjzhlyxxpvhg**, läst på nytt: **53 migrationer**, senaste **20261019200000**, **delete-user v6 ACTIVE/verify_jwt=true**. Bara KAN-97-migrationen installerades i C, Edge i D1. Migration SHA256 **d7e8065b8746d5a71a869738910cfc74d8f14bac64f7ac7511c26eb0ae56c619**. Installationsdefinitioner/RLS/grants/KAN-75/delete-beroenden verifierade; inte samma sak som hostade användartester.
- **PASS avgränsat vid release:** byggd browserapp har enbart Staging-Supabase-URL; GET publika Auth-inställningar med byggd publishable-nyckel HTTP200. Befintlig skyddsåtkomst användes; inga nya konton/sessioner eller privata nyckelvärden lästes.
- **EJ VERIFIERAT/EJ KÖRT hostat:** privata servernyckelns faktiska projektsammanhörighet, inloggad Auth→RLS→RPC med två syntetiska användare, samtidighet mot bokning/årslås/radering, atomisk rollback och komplett Edge/Auth/Storage-raderingskedja. Kräver separat uttryckligt E-beslut; lokal verifiering ersätter inte detta.
- **Manuell acceptans återstår.** Pontus har observerat otydligt uttagskort; se nya analysrapporten. Ingen Production-release godkänd.
- **Production oförändrad:** main **984405a6ddf83cd125f5b9d0a02b632c1e2e09c3**, Vercel **dpl_2fPXCfpDijAV8JWhH1YbwbUvsetb**. KAN-97 har inte installerats/publicerats i Production. Ingen Production-åtgärd i handoffen.

## Senaste analys och nästa exakta arbete

- **Analysen är klar, implementation saknas:** docs/reviews/**KAN-97-INVOICE-INVENTORY-DEPENDENCIES.md** innehåller kod-/Jira-referenser, live verifierade journalformer och A/B/C-testplan. Nya kundfakturor/payment/reversal är customer_invoice och stoppas av KAN-97:s stödda-källor-lista trots redan existerande fakturaväg i momsrapporten. 1510 är inte bankmedel; senare reglering får inte bli ny intäkt/moms. Historiska manuella fakturalänkar får inte räknas igen.
- **Nästa avsedda implementation efter separat startbesked:** test-first kundfakturor/betalningar inom KAN-97, återanvänd befintliga journaler och resultat-/momsmotorer; belägg FAIL före/PASS efter, kontrollera obetalt/betalt, bokslutsfordran/senare betalning, ångra/ny betalning, år/period, 0/6/12/25 %, avrundning, historiska länkar och blandade manuella flöden. Ingen ny modell/migration har identifierats som nödvändig; stoppa om tester visar saknat underlag.
- **UI i samma avgränsning:** alltid rubriken **Säkert uttag**, separat spärrstatus och ingen grön framgångspresentation vid osäkert underlag; inget rekommenderat belopp vid incomplete. Återanvänd detaljeringspanelen; ändra inte säkerhetsmatematik, NE eller årsreglagets funktion.
- **Inventarier väntar:** KAN-62/65 In Review; KAN-73/76 To Do med konkreta moms-/avskrivningsrisker. Inget generellt tillåtande av fixed_asset/reclassification/depreciation. Skatteverkets svar inväntas på frågor skickade **12 oktober** om K1, sammanhängande/successiva köp, omklassificering, årsskiften, momsavdragsrätt och avskrivningar. Svar har inte lästs/verifierats här.
- **SIE ingår inte** i nästa implementation. Vanliga manuella inköp, rättelser, periodisering, VAT V2 och etablerade moms-/skattekontoflöden ska regressionsskyddas. Fail-closed, användarisolering och ekonomisk korrekthet får inte försvagas för att få det gamla blandade testkontot grönt.
- Jira senast läst: **KAN-97 In Progress, unassigned, High/Bug**. KAN-46/63/66/88 Done; KAN-70 kompletterande fakturatester, KAN-81 feltext och KAN-60 historikfilter är To Do. Se analysen; andra Jira-ärenden är inte automatiskt tilldelade eller godkända för implementation.

## Git-identitet, tillstånd och risker

- **Viktig skillnad:** utvecklingskopian KAN-104-source ärver fortfarande global **nolare <nolare@gmail.com>** och har inget verifierat lokalt identitetsskydd. Inte säker för nästa commit utan separat godkänd identitetskorrigering eller uttrycklig kommandolokal korrekt identitet och faktisk objektkontroll. Ingen global/annan klon-konfiguration har ändrats i handoffen.
- Endast integrationsklonen har lokal **sololedger <sololedger2026@gmail.com>** samt pre-commit/prepare-commit-msg-kontroller. Testade nekanden för fel author, fel committer och --no-verify. commit-tree kräver separat preflight/objektkontroll; hooks är inte en absolut säkerhetsgräns.
- Ursprungliga commits 430842c/504ee839 har nolare som faktisk author/committer; dessa är bevarad historik, inte omskrivna. Första D2 **dpl_EhqAia9ZTJnpcNaK7wVS5d3rNTYV BLOCKED** av Vercels författarbehörighet. Rätt GitHub-konto **sololedger**, e-post **sololedger2026@gmail.com**, är kopplat till teamägaren. Tomma nya 585c894 med rätt båda identiteter löste den aktuella releasevägen utan behörighetsändring. Separata kloner ärver inte huvudkopians lokala identitet/hooks.
- Kvarvarande teknisk skuld: R6 hjälpförklaring och full lint enligt rapporter; äldre get_next_ver_nr PUBLIC/anon-grant var identifierad basrisk och är inte ändrad. Blanda inte ihop detta med verifierad ny KAN-97-regression.
- **Lokalt godkänd handoffcheckpoint:** endast PROJECT_STATE.md, PROJECT_ARCHIVE.md och nya analysrapporten ingår. De 15 äldre untracked filerna lämnas orörda; arbetskopian blir inte ren. Den lokala checkpointen gör fortsatt arbete på samma dator möjligt utan push, men är inte AGENTS fullständigt avslutade/pushade handoff. Kontrollera faktisk commitmetadata och HEAD.
- **Tillåtet i sista checkpointsteget:** exakt en lokal commit av de tre handoffdokumenten med kommandolokal SoloLedger-identitet, sedan stopp. Ingen implementation, ytterligare commit, push, migration, DB-/Auth-skrivning, Edge-/Vercel-deploy, Jira-ändring, Production-åtgärd eller worktree-städning är godkänd.

## Retention

- Upprepad, ersatt tidig verifierings-/releasechronologi är komprimerad i PROJECT_ARCHIVE.md; ursprunglig pre-handoff state finns bevarad i account-handoff-20261020/ ovan. Aktiv KAN-97, kvarstående risker, bevisbegränsning och nästa uppgift är kvar här/analysrapporten. AGENTS.md oförändrad.
