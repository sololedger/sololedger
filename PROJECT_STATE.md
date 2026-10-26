# SoloLedger Project State

2026-10-26 – **KAN-112 tekniskt och manuellt accepterad i Staging, inkl fysisk mobil. Production återstår.**
Produktmål/prioriteringar enligt AGENTS: begriplig, tillförlitlig bokföring för Jessikas
enskilda firma år efter år. KAN-113 lokalt rättad/verifierad; invänta Staging-beslut.

## Läs detta först efter Codex-kontobyte

- Aktuell produktkopia L = audit-packages/KAN-100-app-release-20261024 under root
  C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user.
- Läs rootens och L:s AGENTS.md, detta STATE och docs/reviews/KAN-112-HANDOFF-20261026.md.
- L-gren nu codex/KAN-113-year-lock-analysis, från KAN-112-handoff f352355;
  origin är lokal KAN-62-kopia, inte GitHub. KAN-112-grenen bevarad.
- Root staging är äldre docs/verktygskopia med orelaterad dirty diff, aldrig produktpushkälla.
- Inga worktrees/fixtures/ignorerade miljöer får tas bort; se worktree-regler i L/AGENTS.

## KAN-112 – slutstatus och exakta versioner

- Produktcommit/GitHub staging 1e4a32a44fde6173633c2deef92940cc682ced84, återverifierad.
- Vercel dpl_58afdvJM1RQ7hpSoiYnWAgGsw5Bh READY, Preview/staging, rätt SHA/projekt/team/alias.
  https://sololedger-git-staging-sololedger1.vercel.app
- Supabase Staging fzxqiqenqjzhlyxxpvhg: 65 ledger-versioner; schema/ledger återlästa och
  identiska med senaste release. KAN-112-versioner 20261026092741/20261026110015.
- GitHub main återverifierad kvar 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e. Ingen Production-åtgärd.
- L var ren på 3640141c0e324a9b8f2468094e52766ef5bc8f8a före denna docs-checkpoint.
- Efter produkten finns lokala docs b57e16c och 3640141 samt aktuell handoff-checkpoint enligt git log.
  Alla rapporter/produktändringar ligger i lokala commits. Senare docs är inte pushade.
- Teknisk testhistorik: fokuserad checklist/Auth/guide-regression, fem bredder, typecheck/lint PASS.
  Hosted 1440/390 + begränsat 320-omtest PASS. Senaste test bevarade alla 15 checklistrader/övriga appdata, 0 appdataskrivningar.
- Pontus har nu uttryckligen accepterat layout, checklista, sparande, navigation och mobilscroll på dator/fysisk mobil.
- Liten kosmetisk önskan om synlig övre kortram är accepterad, blockerar inte release och ska INTE rättas.
  Tidigare 320-observation är inte längre en öppen manuell acceptansspärr. Inga fler KAN-112-UX-ändringar.
- Production-release återstår. Hela leveransen omfattar också två KAN-112-migrationer och delete-user-stöd.
  En framtida release behöver läsande Production-förkontroll och separata exakta godkännanden; anta inte app-only release.
- Jira KAN-112 Task/Medium/To Do/otilldelad, acceptanskommentar 11687 tillagd och återläst.
  Status/assignee oförändrade, inte Done. KAN-113 Bug/Medium/To Do/otilldelad, oförändrad.

## KAN-113 – lokal implementation/verifiering klar 2026-10-26

- Lokal implementation godkänd av Pontus efter analys ded55d7. Gren oförändrad
  codex/KAN-113-year-lock-analysis; lokal fixcheckpoint enligt git log. Ingen push.
- Rapport: docs/reviews/KAN-113-LOCAL-IMPLEMENTATION-20261026.md; exakt filförteckning,
  avgränsningar, tidigare verktygsavbrott och Staging-plan finns där. Analysrapporten bevarad.
- Ny migration 20261026162305_kan113_calendar_year_close_guard.sql: årtal måste ha
  passerat helt i Europe/Stockholm enligt serverklocka efter exklusiv ägargräns.
  Befintliga efterföljande skydd, ACL och signatur identiska. Ingen ny tabell/datareparation.
- src/lib/yearCloseDate.ts + page.tsx visar begriplig spärr före bekräftelse/anrop.
  Ingen ombyggnad för brutna/förlängda år eller andra KAN-112-UX-ändringar.
- Verifierad befintlig lokal DB 127.0.0.1:5432, sololedger_kan62_disposable_20261021,
  PG17/OID57199/marker matchade. Inga nya databaser/reset eller fjärrinstallationer.
- DB 14 grupper PASS: riktiga journal-/momssaldon, föregående/pågående/framtida,
  båda momsprofiler, Stockholm ±1ms, samtidighet/replay/isolering/befintliga spärrar.
  Syntetiska konton borttagna via auktoritativ RPC; alla publika data/schema/auth-antal
  återställda. Ursprunglig lokalfunktion återställd; inga nya testkonton kvar.
- Datumdomän, faktisk Home/NE på 1280/390 och typecheck PASS. Lint inga nya fel;
  page.tsx har samma nio äldre fel. Fokuserade nya/ändrade testfiler lint PASS.
- Säker regression: alla delsteg PASS, men ursprungskommandot stoppades vid saknad
  lokal Supabase-konfiguration. En syntetisk processlokal smoke-omkörning 2/2 PASS;
  återstående delsteg separat PASS. Ingen miljöfil ändrad. Se exakt begränsning i rapporten.
- Production READ ONLY 2026-10-26 Stockholm: 0 pågående lås, 0 framtida lås,
  0 berörda användare. Endast aggregat hämtade. Ingen Production-ändring.
- Testkvitto docs/testing/kan113-local-20261026; råa lokala coverage-loggar bevarade.
- Jira återläst To Do/otilldelad, inga mutationer. Rootens samtliga orelaterade
  ändringar bevarade. Ingen Staging-/Production-migration, push/deploy eller Edge.
- Nästa steg: Pontus godkänner exakt kandidat och KAN-113-migration för Staging,
  därefter verklig publicerad klient → RPC-verifiering. Stanna före publicering nu.

## Sparade bevis och bevarande

- Handoff: docs/reviews/KAN-112-HANDOFF-20261026.md, färskt sanerat versionskvitto
  docs/testing/kan112-handoff-20261026/verified-environments.json.
- Senaste rapporter KAN-112-MOBILE-NAVIGATION-LOCAL/STAGING-20261026.md; äldre SCROLL-FIX, MODERN-LAYOUT och UX-rapporter behålls.
- Versionshanterade före-/efterbilder docs/testing/kan112-modern-layout/. Ignorerade loggar/bilder coverage/kan112-modern/ och kan112-auth/.
- Hosted verktyg/bevis bevarade i root/audit-packages/KAN-112-*-20261026/. Inget av detta ska rensas vid kontobyte.
- Syntetiska konton/fixtures och lokala auth-/envfiler bevarade. Endast filmetadata inspekterade i handoff; inga hemligheter i Git/docs.
- Jira/GitHub/Vercel/Supabase kan behöva återanslutas för nya kontot; be aldrig om hemligheter i chatten.
- Rootens orelaterade M AGENTS/ARCHIVE/STATE och untracked rapporter/verktyg bevaras, se exakt lista i handoffrapporten.
  Bara KAN-112-navigeringsnotisen indexeras separat i root; root förblir därför dirty.
- Retention genomgången: STATE komprimerat, KAN-112 fortfarande aktiv inför Production; inte arkiverad som Production-klar.
  Inga AGENTS-/ARCHIVE-ändringar i detta uppdrag. KAN-114 framtida Task/Medium för generell design, orörd.

## Stopp och kvarvarande publicering

- KAN-112-handoff är lokal/opushad. KAN-113 har nu godkänd lokal implementation
  och återställda syntetiska lokala DB-tester; inga fjärrskrivningar/publiceringar.
- AGENTS fulla publicerade handoff kräver push och ren verifiering. Push förbjuden enligt aktuellt beslut:
  lokal checkpoint, ej pushad, inte HANDOFF READY. L ren efter checkpoint; root avsiktligt dirty av separat arbete.
- Nästa steg är ledarbeslut om KAN-113 Staging-kandidat enligt rapporten ovan.
  KAN-112 ska inte Done-sättas före Production-beslut. Ingen ytterligare implementation nu.
