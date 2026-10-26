# SoloLedger Project State

2026-10-26 – **KAN-112 + KAN-113 Production-release BLOCKED i obligatorisk backup-preflight.**
Produktmål/prioriteringar enligt AGENTS: begriplig, tillförlitlig bokföring för Jessikas
enskilda firma år efter år. Exakt release godkänd, men stoppad före första migrationen.

## Läs detta först efter Codex-kontobyte

- Aktuell produktkopia L = audit-packages/KAN-100-app-release-20261024 under root
  C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user.
- Läs rootens och L:s AGENTS.md, detta STATE och docs/reviews/KAN-112-HANDOFF-20261026.md.
- L-gren nu codex/KAN-113-year-lock-analysis, från KAN-112-handoff f352355;
  origin är lokal KAN-62-kopia, inte GitHub. KAN-112-grenen bevarad.
- Root staging är äldre docs/verktygskopia med orelaterad dirty diff, aldrig produktpushkälla.
- Inga worktrees/fixtures/ignorerade miljöer får tas bort; se worktree-regler i L/AGENTS.

## KAN-112 – slutstatus och exakta versioner

- KAN-112:s accepterade basprodukt 1e4a32a44fde6173633c2deef92940cc682ced84.
  Staging ligger nu på KAN-113 e992e4f enligt nästa avsnitt.
- KAN-112:s acceptansdeployment dpl_58afdvJM1RQ7hpSoiYnWAgGsw5Bh var READY,
  Preview/staging med rätt SHA/projekt/team/alias; ersatt av KAN-113 enligt nedan.
  https://sololedger-git-staging-sololedger1.vercel.app
- Vid KAN-112-acceptans hade Staging fzxqiqenqjzhlyxxpvhg 65 ledger-versioner,
  inklusive 20261026092741/20261026110015. Nu66 efter KAN-113 enligt nedan.
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

## KAN-113 – Staging PASS, manuellt accepterad enligt Pontus 2026-10-26

- Exakt godkänd/publicerad produkt: e992e4f97e1d74c91b24947d61f1774596340bc1,
  med accepterad KAN-112-bas 1e4a32a. GitHub staging=e992e4f; main kvar6ad27f1.
- Rapport: docs/reviews/KAN-113-STAGING-20261026.md. Full lokalanalys/verifiering
  i tidigare KAN-113-rapporter bevarad. Branch codex/KAN-113-year-lock-analysis.
- Endast migration 20261026162305_kan113_calendar_year_close_guard.sql applicerad
  via officiell CLI på Staging fzxqiqenqjzhlyxxpvhg: 65→66 ledger-versioner.
  Tidigare definition/ACL verifierad; ny hash09839e674ce07177d774fe23bfe1608e.
  Alla övriga funktioner, schema/grants/RLS/Storage och befintliga data oförändrade.
- Vercel dpl_3eVEv5x5fxQnHJYztofWZbEePSfn READY, Preview/staging, rätt SHA/projekt/team.
  Ordinarie Staging-alias korrigerat från dpl_58afdvJM1RQ7hpSoiYnWAgGsw5Bh/1e4a32a
  till dpl_3eVEv5x5fxQnHJYztofWZbEePSfn/e992e4f. Övriga alias/envmetadata oförändrade.
- Hosted 1440/390: verklig UI→RPC→DB låser2025, båda momsprofiler;2026/2027 nekas
  även via direkt webbläsar-/HTTPS-RPC utan dataändring. Efterbokningsspärr,
  saknad/öppen moms och verklig inventarieavskrivningsspärr PASS.
- Fyra hosted samtidighetsgrupper PASS (TLS/distinkta backend-PID och HTTPS),
  replay bevarad. Riktig KAN-112 checklistesparning/omladdning/navigation PASS på dator/mobil.
- Fyra nya syntetiska N/V/I/R borttagna via auktoritativ raderings-RPC + Auth.
  Residual0; samtliga33 publika tabelldigester/antal inkl befintliga checklistor
  exakt som före release. Alla tidigare fixtures bevarade; inget reset.
- Sanerade kvitton/bilder docs/testing/kan113-staging-20261026; råa releaseverktyg/
  bevis root/audit-packages/KAN-113-staging-20261026, auth endast ignorerad sökväg.
- Lokalt tidigare14 DB-grupper, datumgräns±1ms, UI/typecheck och regressionens
  alla delsteg PASS efter begränsat smoke-miljöomtest. Nio äldre page-lintfel kvar;
  inga nya. Detaljer och exakt avgränsning finns i lokalrapporten.
- Tidigare Production READ ONLY26/10:0 pågående/framtida lås/berörda användare.
  Ingen Production-migration/-deployment/main-push eller Edge-ändring i detta uppdrag.
- Inga Jira-mutationer. Rootens samtliga orelaterade dirty ändringar bevarade.
  Nuvarande rapport/STATE/Architecture-checkpoint är lokal efter produkten, inte pushad.
- Pontus har nu accepterat även KAN-113 manuellt; nästa steg är gemensamt releasebeslut enligt nedan.

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

- KAN-113 godkänd Staging-migration/publicering klar; produktcommit e992e4f pushad
  endast till staging. Efterföljande rapportcheckpoint är lokal/opushad, inte full HANDOFF READY.
- L ren efter rapportcheckpoint; root avsiktligt dirty av separat tidigare arbete.
- Båda ärendena accepterade; exakt Production-release nu godkänd, men BLOCKED enligt ny preflight nedan.
  Ingen publicering påbörjad. Ingen Jira Done är godkänd.

## KAN-112 + KAN-113 – Production readiness 2026-10-26

- Readiness var READY före releasepreflight; aktuell BLOCKED-status enligt nedan.
  Rapport docs/reviews/KAN-112-KAN-113-PRODUCTION-READINESS-20261026.md.
- Exakt kandidat e992e4f97e1d74c91b24947d61f1774596340bc1; inte senare lokal docs-HEAD.
  GitHub staging=e992e4f, main=6ad27f1; main kan fast-forwardas. Aktuell L-HEAD före rapport4b2332a.
- Färska Vercel-alias/READY/SHA och levererade klienter återverifierade: Staging dpl_3eVEv5x5fxQnHJYztofWZbEePSfn,
  Production dpl_HtjAS5DwW3BK1xetQr4gJEJ7gU6Q. Rätt projekt/team och respektive Supabase-ref.
- Production-katalog exakt som senaste release:61 ledger/32 tabeller/103 funktioner; Staging66/33/106.
  Läsande Production0 pågående2026-lås/0 framtida/0 berörda användare. Ingen datarättning planeras.
- Plan: SQL20261026092741 →20261026110015 →20261026162305, sedan kandidatens delete-user
  verify_jwt=true, sedan exakt kandidat till main/Vercel Production och läsande smoke/integritet.
- Officiell CLI dry-run under tvingad READ ONLY planerade exakt dessa3, inga seeds/roller.
  Production-ledger efter framtida release ska vara64; två äldre Staging-only KAN62-versioner exkluderas.
  Äldre ledger/formatering/anon-grantskillnader utredda; ingen replay/repair eller rättighetskopiering.
- Båda befintliga RPC-preimages matchar; övriga tabell-/moms-/inventarie-/låskontrakt bevaras.
  DB-migrationer saknar automatisk rollback; behåll additiv DB/Edge vid approllback. Se rapportens stoppvillkor.
- Jira båda fortfarande To Do/otilldelade, återlästa utan mutation. Ledaracceptans är nyare än Jira-texten.
- Endast lokal rapport/STATE/sanerat kvitto ändras. Inga externa skrivningar, migrationsapply, pushar,
  deployments, aliasändringar eller testdata. Rootens orelaterade dirty ändringar helt orörda.
- Godkännande av exakt3 migrationer, delete-user och main/e992e4f/Production har därefter givits.
  Ingen åtgärd får fortsätta förbi backupblockeringen nedan. Jira-avslut kräver eget godkännande.

## KAN-112 + KAN-113 – godkänd release, BLOCKED före ändring

- Rapport docs/reviews/KAN-112-KAN-113-PRODUCTION-PREFLIGHT-20261026.md; sanerat kvitto
  docs/testing/kan112113-production-preflight-20261026/preflight.json. Lokal L-HEAD före rapport8de0944, ren.
- Obligatorisk backupkontroll via officiell CLI2.122.0 lyckades men gav backups=[],
  physical_backup_data={} och pitr_enabled=false (walg_enabled=true). Ingen användbar
  DB-backup/återställningstidpunkt kunde verifieras. Approllback ensam återställer inte DB.
- Stopp före SQL1. Ingen av3 migrationer applicerad; Production-ledger fortsatt61,
  katalog32 tabeller/103 funktioner exakt lika readiness. RPC-preimages/ACL matchar.
- GitHub main fortsatt6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e; staging=e992e4f.
  Vercel Production dpl_HtjAS5DwW3BK1xetQr4gJEJ7gU6Q READY på gamla main; alias/env oförändrade.
- Supabase Production ACTIVE_HEALTHY;0 pågående2026-/0 framtida lås/0 berörda användare.
  delete-user fortfarande ACTIVE v16/verify_jwt=true. Ingen publicering eller användardataskrivning utförd.
- Nästa steg: verifiera tillgänglig aktuell backup/återhämtningsväg eller separat granskat
  ledarbeslut om alternativ återhämtningsplan; därefter ny preflight före någon migration.
- Ingen automatisk retry, backup/PITR-konfigurationsändring, rollback, Edge/main/deploy eller Jira-ändring.
  Endast lokal docs-checkpoint; rootens orelaterade diff bevarad. Aktiv release arkiveras inte som klar.
