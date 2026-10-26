# KAN-112 + KAN-113 – Production readiness 2026-10-26

**READY för separat releasebeslut. Ingen publicering utförd eller godkänd här.**
Pontus har accepterat båda ärendena tekniskt/manuellt i Staging enligt aktuellt
ledarbeslut. Läsande kontroller, inklusive officiell CLI dry-run, passerade.

## Verifierad kandidat och verkliga miljöer

- Releasecommit: **e992e4f97e1d74c91b24947d61f1774596340bc1**.
  Accepterad KAN-112-bas 1e4a32a44fde6173633c2deef92940cc682ced84 ingår.
- GitHub main: 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e; staging: e992e4f ovan.
  Main är ancestor; vanlig fast-forward är möjlig. Ingen force-push behövs.
- Produktkopia L: codex/KAN-113-year-lock-analysis, HEAD före denna rapport
  4b2332a13c036c0a17b46edfaafa29d125ce733d, ren. Efter e992e4f finns endast
  lokala rapporter/bevis/Architecture/STATE. Publicera exakt e992e4f, aldrig lokal HEAD.
  Origin är lokal; extern källa är https://github.com/sololedger/sololedger.git.
- Vercel Staging: dpl_3eVEv5x5fxQnHJYztofWZbEePSfn READY, Preview/staging/e992e4f.
  Alias sololedger-git-staging-sololedger1.vercel.app pekar rätt.
- Vercel Production: dpl_HtjAS5DwW3BK1xetQr4gJEJ7gU6Q READY, production/main/6ad27f1.
  Production-alias, inklusive sololedger.vercel.app, pekar på denna deployment.
  Båda tillhör prj_chkSdedE06ppK2PlsqdtOhZfAKpT/team_0Mrj7LMvSEfpbV8y5juQ5IiL.
- Levererad JS färskt läst på båda alias: rätt Supabase-ref, ingen korskoppling;
  9 JS-resurser/miljö, HTTP200, inga pageerror. Oinloggat deklarationsindex401.
- Supabase Production wbaxmuvudpnkvuliicuy:61 migrationer/32 tabeller/103 funktioner.
  Komplett katalog exakt lika senaste Production-releasebeviset, även efter dry-run.
  Staging fzxqiqenqjzhlyxxpvhg:66/33/106. Identitet/TLS/read-only verifierade.
- Jira återläst: KAN-112 Task/Medium och KAN-113 Bug/Medium, båda To Do/otilldelade.
  KAN-112 acceptanskommentar11687; KAN-113-texten är äldre än ledarbeslutet.
  Jira är oförändrad; detta är dokumentationsskuld, ingen teknisk releaseblockerare.

## Exakta releaseberoenden

Applicera endast följande, i denna ordning, från releasecommitens oförändrade SQL:

| Migration | SHA256 |
|---|---|
| 20261026092741_kan112_year_end_checklist.sql | 4ee37317959b7b68758f98776c347a646c62ca43e7ce5ac84c18c7e3fa4c64a5 |
| 20261026110015_kan112_conflict_and_profile_scope.sql | 4d65559fe06bca24ce57cdbb65c8c6c2380c857598f1672d6b6abbb3f0fcaef1 |
| 20261026162305_kan113_calendar_year_close_guard.sql | 1b5214198bb86142b6fe3847d967d76f9e4d90ba45020054b0eac6b7e70bcda6 |

Första migrationen skapar year_end_checklist och get_year_end_checklist(integer),
save_year_end_checklist(integer,text,boolean,integer,text,uuid), privat
kan112_checklist_basis(integer), samt utökar delete_user_data_atomic(uuid).
Tabellen har FK profiles ON DELETE CASCADE, sammansatt PK och uttryckliga CHECK.
RLS ger authenticated egen SELECT; service_role SELECT för adminräkning; inga
direkta klient-/service-skrivgrants. Endast authenticated får checkliste-RPC:erna;
privat helper saknar API-exekvering. Ägarskap ska vara postgres som i Staging.
Raderings-RPC förblir service-only och delegerad befintlig säkerhetskärna bevaras.

Andra migrationen kräver den första och ändrar konfliktkod till PT409 samt
profilavtryck. Dess avgränsade UPDATE gäller endast redan aktuella ekonomiska
checklistesvar. Production saknar tabellen nu; med tom tabell mellan stegen blir
0 befintliga svar ändrade. Kontrollera detta före steg2; stoppa vid oväntade rader.

Tredje migrationen ändrar bara close_year_atomic(integer): kalenderstopp efter
ägarlås, med serverklocka/Europe/Stockholm, före befintlig moms-/inventarie-/låskärna.
Inga befintliga årslås eller bokföringsposter uppdateras. Brutna/förlängda år byggs inte om.

Edge: publicera endast supabase/functions/delete-user/index.ts från e992e4f,
efter DB och före app. Produktionskod v16 matchar nuvarande main; Staging v9
matchar kandidaten. Enda källkodsskillnaden är year_end_checklist i TABLES för
dry-run/räkning/residualkontroll. Bevara verify_jwt=true och befintliga secrets.
Kandidatens käll-SHA256:5c749cf1bb36e94fefebcb5e816dde0965ed18b0a7b299275454b601f3e9542f.
Ny Production-version tilldelas vid publicering; anta inte att den blir Staging v9.

Klient: page.tsx, YearEndGuide, YearEndChecklistControls, useAuth, profileContext,
yearEndChecklist/Client, yearCloseDate och adminDeleteDryRun. Övrig diff är
ärendenas tester/scripts, package.json-testscripts och dokumentation/bevis.
Inga ändrade app-API-routes, rapportmotorer, dependencies/lockfil, nya miljönycklar
eller konfigurationsändringar. Befintliga Production/Preview-envscope kvar;
serverhemligheter har inte lästs ut. Ingen orelaterad produktändring identifierad.

## Verifierade förutsättningar och miljöskillnader

- Production delete_user_data_atomic normaliserad MD5:057f055f97fba9da12ceaea482be924e;
  close_year_atomic:9a93f74704913fc47ed5fff93223e236. Båda matchar SQL-preconditions.
- Efter första migrationen måste steg2:s **råa** pg_get_functiondef-MD5 vara
  basis:0bf62069b71769697e267cb36f300df4 och save:72b62cca232695077528cc7697d7fccb.
  Använd exakt Git-SQL/LF via etablerad CLI; anpassa aldrig preconditions tyst.
- Förväntade slut-MD5: close09839e674ce07177d774fe23bfe1608e,
  deletef5f30e0a29e2d5f927d016890fc3f1f9, basis e755c0fb0b42e3db43d06aac72f17d92,
  get1a3d8a16c516c5b744bbe2de2e9e65f4, savef2fc69c9cfe6d086ba1529c1bc0725a5.
- Befintliga 32 tabellkontrakt, auth/bootstrap, standardprivilegier, roller och Storage
  matchar miljöerna. Moms-/inventariekärna och ägarlås har identiska definitioner/ACL.
- Två äldre KAN-62-ledgerrader finns bara i Staging:20261012123000/20261012153000.
  De ingår inte i denna release och får inte köras mot Production. Officiell CLI
  read-only dry-run med 61 befintliga +3 utvalda Git-filer planerade exakt de tre
  migrationerna ovan, inga seeds/roller. Förväntad Production-ledger efteråt:64, inte66.
- Fyra äldre gemensamma ledgerposter har olika statements-avtryck:20260925050113,
  20260925070346,20261008170000,20261020130000. Lästa SQL visar uppdelning/semikolon/
  radslut och i KAN54 en extra historisk service-role REVOKE i Production.
  Nuvarande KAN54-kärna/effektiva grants är lika och service_role nekas i båda.
  Ingen history repair/replay ska göras. get_withdrawal_context och rls_auto_enable
  skiljer bara CRLF/LF. get_next_ver_nr har äldre anon EXECUTE i Staging men inte
  Production; bevara den striktare Production-rätten. Skillnaderna föregår KAN-112.
- Production aggregerat, 2026-10-26 18:18 svensk tid: pågående2026=0, framtida=0,
  berörda användare=0. Ingen datarättning behövs utifrån denna kontroll.

## Publiceringsplan efter separat uttryckligt godkännande

1. Återläs main/staging/SHA, alias/projekt/team/envmetadata, full Production-katalog,
   ledger, relevanta definitioner/ACL och aggregerade lås. Ta läsande förebevis av
   journal/transaktioner/moms/årslås/deklarationer och relevanta övriga data. Verifiera
   tillgänglig backup/återhämtningsväg; återställningsbarhet har inte provats här.
   STOPP vid drift, fel miljö, oväntad data/tabell, checksumme- eller planavvikelse.
2. Officiell CLI med samma timestamp-identitet och isolerad migrationskatalog som
   dry-run. Applicera de tre SQL-filerna i ordning, med återläsning efter varje steg.
   Bevara historiska ledgerposter exakt. Inga --include-all, repair, baseline eller
   roller/seeds. Stoppa direkt vid fel; fastställ faktisk ledger innan eventuell retry.
3. Verifiera ledger61→64, postgres-ägare, nya funktionshashar, RLS/effektiva grants,
   oförändrade övriga funktioner/tabeller och befintliga data. Oväntad skillnad kräver
   utredning; samtidiga legitima användarskrivningar får inte misstas för migrationsfel.
4. Publicera endast kandidatens delete-user till Production, verify_jwt=true.
   Återhämta källa och verifiera hash/status; inga faktiska raderingar som smoke.
5. Fast-forward/pusha endast exakt e992e4f till GitHub main, efter nytt godkännande.
   staging ligger redan där. Använd rätt produktkopia/extern GitHub-URL, inte root
   eller lokal origin. Inkludera inga efterföljande docs-checkpoints.
6. Låt Vercel bygga Production från main/e992e4f. Verifiera READY/deployment-ID,
   production-target/team/projekt och samtliga Production-alias; Staging oförändrat.
   Kontrollera levererad Production-ref, publika authvyer och401 för skyddat API.
   Läsande datakontroll efteråt, ingen sparning/bokning/moms-/årslås-/raderings-smoke
   mot riktiga användare. Eventuell autentiserad skrivacceptans kräver separat scope.
7. Efter lyckad release och Pontus beslut: uppdatera STATE/Architecture/releaserapport,
   verifiera main/staging lika. Jira-status/assignee/kommentar eller Done kräver
   uttryckligt godkännande och återlästa transitions; Pontus avgör slutligt avslut.

## Risk, återhämtning och testbevis

Migrationerna bokför inget och ändrar inte befintliga momsperioder, deklarationer
eller årslås. Checklistan är användarens bekräftelser, inte ett bokslutsintyg.
Kort DDL-/ägarlåsväntan och ett delvis färdigt DB-läge mellan migrationer är de
primära publiceringsriskerna. DB/Edge ska därför bli klara innan appen exponeras.

CLI-steg ska vara transaktionella; ett misslyckat steg måste återläsas. Tidigare
**committade migrationer rullas inte tillbaka automatiskt**, och en approllback
återställer inte DB/Edge/ledger. Vid Edge/build-fel: stoppa apppublicering, behåll
nytt additivt DB-schema och retry först efter diagnos. Vid appfel kan föregående
Production-deployment6ad27f1 återställas efter godkännande; behåll nya DB/Edge och
checklistesvar. Ta inte bort tabellen och återinför inte det osäkra årslåset.
Ändring av DB eller full backuprestore kräver separat granskad/godkänd åtgärd;
full restore kan förlora legitima efterföljande användarskrivningar. Ingen automatisk
git-reset/force-push eller kompenserande dataradering ingår.

Tidigare lokala/hosted och manuella bevis återgranskade: isolering/grants, checklistans
konflikt/replay/omladdning, verkligt2025-lås med/utan moms,2026/2027 nekade även via
direkt RPC, ingen oönskad dataskrivning, efterbokning/moms/inventarier/samtidighet,
KAN-112-navigation och dator/mobil. Årsskiftesgräns±1ms prövades lokalt, inte genom
ändrad hosted serverklocka. Ursprunglig bred regression hade smoke-miljöfel; alla
delsteg passerade efter dokumenterat begränsat omtest, inte ett grönt original-exit.
Nio äldre page-lintfel kvar, inga nya. Ingen produktkod ändrad och inga skrivtester
körda i denna läsande readiness-granskning. Inga nya fixtures eller datarester.

Spårbarhet: docs/testing/kan112113-readiness-20261026/readiness.json; full läsande
katalog/definitioner/CLI-plan under root/audit-packages/KAN112113-readiness-20261026/.
Relaterat: KAN-112-HANDOFF, KAN-112-LOCAL-FIXES, KAN-113-LOCAL-IMPLEMENTATION och
KAN-113-STAGING-20261026.md. Rootens samtliga orelaterade ändringar bevarade.
Endast denna rapport/STATE/sanerat kvitto sparas i L. Inga Production-ändringar,
migrationer, pushar, deployments, aliasändringar eller Jira-mutationer utförda.
