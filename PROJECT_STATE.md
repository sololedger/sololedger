# SoloLedger Project State

2026-10-26 – **KAN-112 tekniskt och manuellt accepterad i Staging, inkl fysisk mobil. Production återstår.**
Produktmål/prioriteringar enligt AGENTS: begriplig, tillförlitlig bokföring för Jessikas
enskilda firma år efter år. Nästa arbetsområde är KAN-113, börja läsande; ingen implementation nu.

## Läs detta först efter Codex-kontobyte

- Aktuell produktkopia L = audit-packages/KAN-100-app-release-20261024 under root
  C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user.
- Läs rootens och L:s AGENTS.md, detta STATE och docs/reviews/KAN-112-HANDOFF-20261026.md.
- L-gren codex/KAN-112-year-end-checklist; origin är lokal KAN-62-kopia, inte GitHub.
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

## KAN-113 – nästa säkra steg, ännu ingen reproducerad defekt

- Misstänkt saknat generellt kalenderstopp mot låsning av pågående/framtida bokföringsår.
- Läs Jira KAN-113, handoffrapporten och relevant tidigare KAN-112-/KAN-110/111-underlag.
- Orientera läsande i page.tsx handleLockYear → accountingService.closeYear → live close_year_atomic/kedjan.
  Läs aktuell pg_get_functiondef och relevanta constraints/grants/RLS före slutsatser. Gissa inte utifrån migrationer.
- Börja med riktad reproduktion i verifierad säker testmiljö, inte implementation. Gamla tester för 2026/2027 är inte aktuell KAN-113-reproduktion.
- Tidigare lokal miljö: sololedger_kan62_disposable_20261021, 127.0.0.1:5432, PG17/OID57199.
  Verifiera faktiskt mål, manifest/markör och aktuellt schema först; detta är historisk identifiering, inte dagens DB-verifiering.
- Inga nya DB:er, migrationsinstallationer, reset, rensning eller Production-fallback ingår. Bevara tidigare fixtures.
- Skilj avslutat/pågående/framtida år och Europe/Stockholm-gräns med övriga årslåsvillkor uppfyllda.
  Dokumentera evidens, bevarande och minsta eventuella rättningsplan innan implementation.

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

- Lokal handoff sparas i docs-commits, ingen push/deploy/migration/Edge/DB-skrivning eller ny implementation.
- AGENTS fulla publicerade handoff kräver push och ren verifiering. Push förbjuden enligt aktuellt beslut:
  lokal checkpoint, ej pushad, inte HANDOFF READY. L ren efter checkpoint; root avsiktligt dirty av separat arbete.
- Nästa chatt börjar med KAN-113 läsande orientering och säker reproduktion. KAN-112 ska inte Done-sättas före Production-beslut.
