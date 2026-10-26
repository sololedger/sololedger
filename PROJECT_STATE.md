# SoloLedger Project State

2026-10-26 – **KAN-112 + KAN-113: BACKUP VERIFIED, READY inför nytt Production-releasebeslut.**
Produktmål enligt AGENTS: begriplig, tillförlitlig bokföring för Jessikas enskilda firma år efter år.
Båda ändringarna tekniskt/manuellt accepterade i Staging. Production ännu inte publicerad.

## Arbetskopia och bevarande

- Produktkälla L = audit-packages/KAN-100-app-release-20261024 under root
  C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user.
- Läs root/L AGENTS.md, detta STATE och senaste backup-/readiness-rapport nedan.
- Gren codex/KAN-113-year-lock-analysis. Lokal HEAD före backupdokumentation
  2b86ddaac44c5aae8ce6d592ec5f47d837733630, ren; ingen produktdiff mot e992e4f.
  Senare rapport/checkpoint-commits är lokala/opushade, aldrig produktpushkälla.
- L-origin är lokal KAN-62-kopia; extern GitHub är https://github.com/sololedger/sololedger.git.
- Root staging är äldre docs/verktygskopia med orelaterad dirty diff, aldrig produktpushkälla.
  Bevara M AGENTS/ARCHIVE/STATE och untracked audit-packages, KAN96/KAN110111-rapporter/verktyg.
- Bevara alla worktrees, fixtures och ignorerade auth-/env-/coveragefiler. Ingen rensning ingår.
  Inga credentials i Git/docs. Worktree-skydd enligt L/AGENTS kvarstår.

## Accepterad kandidat och verkligt publicerat läge

- Exakt gemensam produkt e992e4f97e1d74c91b24947d61f1774596340bc1.
  Accepterad KAN112-bas1e4a32a44fde6173633c2deef92940cc682ced84 ingår.
- GitHub staging=e992e4f; main fortfarande6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e.
  Main kan fast-forwardas; ingen senare docs-HEAD eller root ska publiceras.
- Staging Vercel dpl_3eVEv5x5fxQnHJYztofWZbEePSfn READY, Preview/staging/e992e4f;
  ordinarie alias sololedger-git-staging-sololedger1.vercel.app korrekt vid senaste verifiering.
- Production Vercel dpl_HtjAS5DwW3BK1xetQr4gJEJ7gU6Q READY, main/production/6ad27f1.
  Projekt prj_chkSdedE06ppK2PlsqdtOhZfAKpT/team_0Mrj7LMvSEfpbV8y5juQ5IiL.
  Production-alias/envmetadata oförändrade i ny preflight19:34:56 svensk tid.
- Supabase Production wbaxmuvudpnkvuliicuy ACTIVE_HEALTHY:61 ledger/32 tabeller/103 funktioner.
  Full katalog/RPC-preconditions/grants exakt lika readiness. delete-user ACTIVE v16/verify_jwt=true.
  Aggregerat0 pågående2026-lås/0 framtida/0 berörda användare. Ingen datarättning planeras.
- Staging fzxqiqenqjzhlyxxpvhg:66 ledger/33 tabeller/106 funktioner efter godkända migrationer.
- Jira senast läst: båda To Do/otilldelade, KAN112 Task/KAN113 Bug, Medium; kommentar11687
  dokumenterar KAN112-acceptans. Ledaracceptansen är nyare än Jira-texten. Ingen Jira-mutation/Done.

## Backup och faktisk lokal återställning 2026-10-26

- BACKUP VERIFIED; rapport docs/reviews/KAN-112-KAN-113-BACKUP-RECOVERY-20261026.md.
  Sanerat kvitto docs/testing/kan112113-backup-20261026/verification.json.
- C:/SoloLedger/Backups/KAN112113-20261026/production-20261026T182848Z.zip.dpapi,
  skapad19:28:34–19:28:48 svensk tid. Krypterad storlek1 280 502 byte, pg_dump custom inuti1 272 788 byte.
  SHA2560365cc2b1621e4e9906b00455203bebbd462961a5e6cf6fd9685647480d04620.
- Beprövad KAN97/98-metod: verify-full/READ ONLY, hel DB inklusive Auth/Storage-metadata,
  ägare/ACL och separat rollexport utan rollösenord. DPAPI CurrentUser före disk,
  bara aktuellt konto/SYSTEM. Utanför Git/synkad Desktop, inga reparse-länkar.
- Full pg_restore-avkodning före/efter kryptering och separat process PASS.1220 TOC-poster;
  TABLE DATA public32/auth27/storage8/vault1/realtime2/ledger1. Partitionerad realtime.messages
  har0 partitioner och korrekt ingen egen datafil. Samtliga103 funktionsförbilder finns.
- Ny lokal DB sololedger_kan112113_recovery_20261026,127.0.0.1:5432,PG17.11,OID66958,
  unik markör/identitetsvakt. Verkligt återställd struktur public/Auth/ledger,61 ledgerrader
  och opersonliga tax_rule_parameters.32 tabellkontrakt/103 funktioner/33 policyer matchar.
- Dokumenterade lokala anpassningar: postgres-ägarmappning,37 plattformsgrants utelämnade,
  befintliga extensions och färskt verifierad Auth-schema-USAGE. Inga globala rolländringar.
  Syntetisk Auth-profiltrigger/ägarläsning/isolation PASS; rollback gav0 rest-rader.
- Full återställning av riktiga kund-/Auth-rader eller Supabase-tjänster är INTE provad.
  Storage-filbytes/extern konfiguration/nycklar ingår inte. DPAPI kräver samma Windows-profil;
  ingen portabel/offsite-kopia. Full katastrofåterställning certifieras inte.
- Backupkravet bedöms uppfyllt proportionerligt för just dessa tre migrationer; nytt
  releasebeslut krävs. Äldre managed-backup/PITR-stopp är historik, inte kvarvarande scope-spärr.
- Prov-DB, äldre backuper/fixtures och nya recovery-tools bredvid backupen bevaras.
  Inga Production-/Staging-skrivningar, migrationer, Edge, push, deploy eller Jira-ändringar.

## Nästa säkra steg och tidigare bevis

- Stanna efter backup/verifiering enligt senaste uppdrag. Invänta nytt uttryckligt
  Production-releasebeslut. Återkontrollera backupens aktualitet och live preconditions då.
- Releaseordning kvar: SQL20261026092741 →20261026110015 →20261026162305,
  sedan exakt kandidatens delete-user/verify_jwt=true, sedan main/e992e4f och Vercel Production.
  Endast dessa3 migrationer; förväntad ledger64, inte66. Äldre KAN62-versioner exkluderas.
  Ingen automatisk rollback/Production-restore/history repair. Approllback återställer inte DB.
- Läs docs/reviews/KAN-112-KAN-113-PRODUCTION-READINESS-20261026.md och aktuell backuprapport.
  Tidigare stopp docs/reviews/KAN-112-KAN-113-PRODUCTION-PREFLIGHT-20261026.md bevaras oförändrat.
- KAN112-handoff och slutlig mobile-navigation-rapport bevaras. Pontus accepterade layout,
  sparande/navigation/scroll på fysisk mobil; kosmetisk kortram accepterad, ska inte rättas.
- KAN113-STAGING-20261026.md: verkligt2025-lås med/utan moms,2026/2027 UI/direkt RPC nekat,
  databevarande, efterbokning/moms/inventarier/samtidighet och KAN112-sparande/navigation PASS.
  Fyra nya syntetiska aktörer raderade, tidigare33 tabelldigester/15 checklistor bevarade.
- Lokal KAN113-rapport:14 DB-grupper/årsskifte±1ms/UI/typecheck PASS. Alla breda regressionsdelsteg
  PASS efter begränsat miljöomtest; originalkommandot hade inte grönt slutexit. Nio äldre page-lintfel.
- Nya verktyg/bevis root/audit-packages/KAN112113-backup-20261026/. Endast lokal docs-checkpoint;
  inte full HANDOFF READY. Retention: ersatt backupstopp komprimerat till ARCHIVE, release aktiv.
