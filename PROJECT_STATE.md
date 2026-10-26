# SoloLedger Project State

2026-10-26 – **KAN-117 BLOCKED för Staging efter riktad säkerhetsgranskning.**
Produktmål enligt AGENTS: begriplig/tillförlitlig bokföring för Jessikas enskilda firma år efter år.
KAN-112/KAN-113 Production PASS och Done. KAN-117 separat lokalt godkänt uppdrag.

## Aktuellt KAN-117 – lokal implementation/verifiering

- Granskad produktkandidat ac96638 är oförändrad. Endast granskningsdocs ändras nu.
  Reproducerat: befintlig intern delperiod2026 + profilstart ändrad till2025-01-01
  ger blocked för2026 men tillåter ny helårsperiod2025. Konflikt i annat år förbises.
- Rollback-isolerat syntetiskt prov verifierade fyndet och10 datum-/frekvensfall;
  alla tidigare public/Auth/Storage-avtryck lika efter rollback. Inga hosted-anrop.
- Rapport docs/reviews/KAN-117-SECURITY-REVIEW-20261026.md; tidigare LOCAL PASS
  avsåg testmatrisen och är inte Staging-godkännande. Ingen produkt-/SQL-rättning gjord.
- Minsta föreslagna rättning: serverkontroll av känd första delperiod mot aktuell
  profil även utanför valt år, relevant underlag i planavtrycket och riktad regression.
  Nästa steg: Pontus godkänner/avgränsar lokal rättning; därefter ny kandidat och bedömning.
- Gren codex/KAN-117-vat-period-preview, parent 02af89d, produktbas e992e4f.
  Lokal checkpoint enligt git log. L-origin är lokal kopia; ingen push gjord.
- Jira KAN-117 läst To Do/otilldelad, inga mutationer. KAN-112/113 lämnas Done.
- Ny periodplan för valt år, komplett status utan skapandeknapp, exakta luckdatum,
  native förhandsgranskning/Avbryt och separat bekräftelse. Ingen gissad delperiod.
- Ny migration 20261026210000_kan117_vat_period_preview.sql: tre funktioner,
  uttryckliga API-grants; inga tabeller eller befintliga RPC-definitioner ändras.
  Bekräftelse omkontrollerar ägare/år/Stockholmsdag/profil/perioder/lås under ägarlås.
- Endast lokal DB-kandidat på verifierad sololedger_kan62_disposable_20261021,
  127.0.0.1:5432/PG17/OID57199/unique syntheticOnly-markör. Nya syntetiska
  testkohorter bevarade. Alla tidigare public/Auth/Storage-dataavtryck oförändrade.
- Databas22 kontrollgrupper, faktisk panel/klient på dator1280/mobil390,
  TypeScript/riktad ESLint/laddningsregression/DB-invarianter och lokal build PASS.
  Slutlig säker regression PASS med syntetisk lokal processkonfiguration, inklusive
  nya browserprovet och båda publika smokeproven. Historiska år utan rader kan väljas.
- Rapport docs/reviews/KAN-117-LOCAL-IMPLEMENTATION-20261026.md.
  Tidigare läsande analys VAT-PERIOD-BUTTON-READONLY-20261026.md bevaras och
  checkpointas som underlag. Ingen period saknades i det då granskade scenariot.
- Kod/SQL/tester/docs för detta uppdrag omfattas av lokal checkpoint. Rootens
  orelaterade diff, övriga worktrees, fixtures samt auth/envfiler bevarade.
- ac96638 ska inte publiceras till Staging enligt denna granskningsbedömning.
  Nytt lokalt PASS samt separat Staging-/migrationsbeslut krävs efter eventuell rättning.
  Ingen Staging-/Production-skrivning, fjärrmigration, push, deploy eller Jira-mutation.

## Läs detta först på nästa konto

- Produktkälla L = audit-packages/KAN-100-app-release-20261024 under root
  C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user.
- Läs root/L AGENTS.md, detta STATE, KAN-112-KAN-113-PRODUCTION-RELEASE-20261026.md
  och KAN-112-KAN-113-BACKUP-RECOVERY-20261026.md i L/docs/reviews/.
- Kort startprompt: docs/reviews/KAN-112-KAN-113-NEXT-CHAT-20261026.md.
- Historisk KAN-112/113-gren codex/KAN-113-year-lock-analysis; ren på120fcd8 före release/handoff.
  Efter produktcommit e992e4f finns lokala rapportcommits; aktuell handoff-checkpoint enligt git log.
- L-origin är lokal KAN62-kopia, INTE GitHub. Lokala main/staging-refar är äldre6ad27f1.
  Extern verifierad GitHub https://github.com/sololedger/sololedger.git har båda på e992e4f.
- Root staging är äldre docs/verktygskopia, aldrig produktpushkälla. Alla orelaterade
  M AGENTS/ARCHIVE/STATE och untracked audit-packages/KAN96/KAN110111-rapporter/verktyg bevarade.
- Bevara alla worktrees, fixtures, backuper och ignorerade auth/env/coveragefiler. Ingen rensning.
  Bara genererad .temp/cli-latest (8 byte) i L verifierad via metadata; ingen källkodsavvikelse.

## Faktisk verifierad Production-release

- Exakt produkt **e992e4f97e1d74c91b24947d61f1774596340bc1**, accepterad KAN112-bas1e4a32a ingår.
  GitHub main och staging samma SHA; endast main pushad i detta uppdrag, utan force/history rewrite.
- Vercel Production **dpl_DkAV5rsNfKxtvyijW7jG2QYY6nf9 READY**, main/production/exakt kandidat.
  https://sololedger.vercel.app; projekt prj_chkSdedE06ppK2PlsqdtOhZfAKpT/
  team_0Mrj7LMvSEfpbV8y5juQ5IiL. Alla Production-alias rätt; Staging/övriga alias/envmetadata bevarade.
- Supabase Production wbaxmuvudpnkvuliicuy: **64 ledger-versioner/33 tabeller/106 funktioner**.
  Installerat i ordning SQL20261026092741 →20261026110015 →20261026162305 via officiell CLI.
  Exakta filhashar, tidigare definitioner/preconditions och per-steg dry-run/efterkontroller PASS.
  Två äldre Staging-only KAN62-versioner exkluderade; ingen baseline/replay/repair/seeds/roller.
- delete-user **ACTIVE v17, verify_jwt=true**, hämtad källa exakt kandidat; oinloggad GET401.
- Före/efter varje steg och efter READY: **67 tidigare public/Auth/Storage-tabeller** har
  samma fulla radantal/digester. Tidigare konton/bokföring/moms/årslås/deklarationshistorik bevarade.
  Checklistan tom vid efterkontroll. Befintliga61 ledgerposter och övrigt schema/ACL/RLS bevarade.
- Verklig authenticated READ ONLY checklist-läsning av2025 PASS, ägare/år/formatskydd rätt.
  Kalenderwrapper hash09839e674ce07177d774fe23bfe1608e exakt granskad Stockholmsregel.
  **0 pågående2026-/framtida lås/berörda användare**. Inga Production-testskrivningar eller raderingar.
- Browser Production/Staging HTTP200,9 JS-resurser/rätt Supabase-ref/ingen korskoppling
  eller pageerror; skyddat deklarationsindex401. Inga inloggningar/sparningar i live.
- Staging kvar e992e4f, dpl_3eVEv5x5fxQnHJYztofWZbEePSfn/ledger66. Tidigare teknisk/manuell
  dator-/fysisk mobilacceptans bevarad; inga nya UX-/kosmetikändringar.
- Jira vid releasen båda To Do/otilldelade; färskt återlästa Done 2026-10-26 efter Pontus avslut.
  Ingen Jira-mutation gjord i denna läsande granskning.
- Rapport docs/reviews/KAN-112-KAN-113-PRODUCTION-RELEASE-20261026.md; sanerat kvitto
  docs/testing/kan112113-production-release-20261026/release.json. Råbevis root/audit-packages/KAN112113-release-20261026/.

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
- Backupkravet godkändes för denna genomförda release. Äldre managed-backup/PITR-stopp är historik.
- Prov-DB, äldre backuper/fixtures och nya recovery-tools bredvid backupen bevaras.
  Backupuppdraget var läsande mot hosted miljöer; den därefter godkända releasen redovisas ovan.


## Stopp, begränsningar och handoff

- KAN-112/113-releasen slutförd. KAN-117 är enbart lokal kandidat; inga nya fjärråtgärder godkända.
- Approllback återställer inte DB/Edge/ledger. Ingen automatisk Production-restore/rollback/repair.
  Vid incident: stoppa, verifiera faktiskt läge, begär nytt granskat åtgärdsbeslut och bevara nyare data.
- Retention: avslutad release/ersatta readiness-stopp komprimerade i ARCHIVE; originalrapporter bevarade.
- KAN-117 checkpointar lokal kod/migration/tester/docs efter verifiering. Ingen AGENTS-ändring.
  Äldre handoff och nya kandidaten är **inte pushade**;
  full HANDOFF READY enligt AGENTS kräver separat godkänd push/remoteverifiering. Ingen sådan push ingår.
- Nästa session börjar läsande från aktuell STATE och KAN-117-säkerhetsrapporten;
  nästa beslut gäller minsta lokala rättning, inte publicering.
