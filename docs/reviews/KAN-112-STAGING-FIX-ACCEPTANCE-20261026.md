# KAN-112 – rättningskandidat, hosted acceptans och lokal handoff

2026-10-26. **PASS för Pontus manuella acceptans.** Alla planerade testmoment i
detta Staging-omtest är avslutade. Ingen testprocess eller publicering återstår.
Ingen Production-release är godkänd. Inga nya produktavvikelser observerades.

## Exakt publicerat

- Produktcommit: `bf845c21955552a4bfb26e67cd45c189064663fa`.
- GitHub: endast `refs/heads/staging` uppdaterades från 91233be till bf845c2.
- Vercel: `dpl_ACc218U3uJ8U5Jp393GhfKY3UfYw`, READY, Preview/staging.
- Deployment: https://sololedger-7mtxmz31g-sololedger1.vercel.app
- Staging: https://sololedger-git-staging-sololedger1.vercel.app
- Projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`.
- Supabase: `sololedger-staging`, `fzxqiqenqjzhlyxxpvhg`.
- Enda nya migration: `20261026110015_kan112_conflict_and_profile_scope.sql`.
- Installerad ledger-version: `20261026110015`, namn `kan112_conflict_and_profile_scope`.
- SHA256: `4d65559fe06bca24ce57cdbb65c8c6c2380c857598f1672d6b6abbb3f0fcaef1`.
- Föregående migration `20261026092741_kan112_year_end_checklist.sql` finns kvar;
  tidigare ledger inklusive statements-avtryck är oförändrad.
- delete-user: **ACTIVE version 9**, verify_jwt=true, återanvänd och inte deployad igen.
  Id `d95e3f13-e71a-4724-9a3f-9fe9fff91890`, bundle SHA256
  `da770355ccbbeb53f9454a8f277f98ee6974d39a6f2777a8fafbf2e5f611963f`.

GitHub main är fortsatt `6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`.
Production/övriga alias och miljövariablernas metadata är oförändrade. Ingen
Production-databas anslöts för ändring och ingen Production-push/deployment utfördes.

Ordinarie Staging-alias låg kvar på `dpl_B57GSjy4zNjp3xTfdu9rJ27AHo4P`/91233be
efter bygget. Det korrigerades, inom stående aliasgodkännande, till nya deploymenten
ovan. Före/efter visade att endast detta alias ändrades. Verklig browsertrafik
använde rätt Staging-ref och den nya klientens konflikttext verifierades.

## Installation och bevarade uppgifter

Godkänd commit, exakt migrationshash och den rena produktarbetskopian verifierades.
Senare lokal docs-commit 7da5efa följde inte med. Kopians origin är lokal KAN-62-kopia;
push använde uttrycklig GitHub-URL och exakt SHA:refs/heads/staging. Root-kopians
äldre lokala staging-gren och andra arbetskopior användes inte som publiceringskälla.

Före skrivning: rätt Staging-projekt, tidigare migration, funktionsdefinitioner,
preimage, constraints/index, RLS/grants, schema och datadigester verifierades.
Officiell Supabase CLI med isolerad migrationskatalog, TLS och verifierad
sessionskontinuitet föreslog och installerade endast den nya migrationen; inga seeds/roller.

Efteråt: endast två publika funktioner ändrade, med exakt lokalt testade MD5:

- kan112_checklist_basis(integer): `e755c0fb0b42e3db43d06aac72f17d92`.
- save_year_end_checklist(integer,text,boolean,integer,text,uuid):
  `f2fc69c9cfe6d086ba1529c1bc0725a5`.

Tabeller, RLS, grants, övriga funktioner, defaults, Auth-bootstrap, roller och
Storage-inställningar bevarade. Övriga tabellers data oförändrade vid installation.
Checklistans kryss, datum och begäran-id bevarades; **0 befintliga aktuella
ekonomiska bekräftelser behövde översättas** i denna Staging-datamängd. Lokal
uppgraderingsregression hade separat verifierat även den översättningsgrenen.

Efter syntetiska tester har tidigare publika data utanför den uttryckliga
KAN-112-kohorten samma avtryck som före ursprungliga testen. Checklistor utanför
kohorten är också oförändrade. Inga verkliga användaruppgifter användes som fixtures.

## Faktiskt avslutade hosted omtest

| Test | Resultat |
| --- | --- |
| Två separata Auth-sessioner, olika session_id, samma punkt/revision samtidigt | PASS |
| API: exakt en lyckad sparning, en HTTP409/PT409, en ny revision | PASS, 235 ms |
| Två separat inloggade browserkontexter med samtidiga begäran | PASS, 83 ms |
| Begriplig konflikttext, ingen falsk Sparat eller tyst överskrivning | PASS |
| Läs om checklistan ger samma aktuella läge, därefter fortsatt sparning | PASS |
| Förlorat sparsvar och replay med samma begäran, ingen extra revision | PASS |
| Faktiskt företagsnamnbyte ger bara dokument-/företagsuppgiftsvarning | PASS API + UI |
| Ingen ekonomisk omkontrollvarning för enbart namnbyte | PASS UI |
| Ändrad relevant momsuppgift varnar för moms/resultat/skatteunderlag | PASS API + UI |
| Verklig syntetisk bokning med moms ändrar relevanta kontrollvärden | PASS API + UI |
| Ny obokförd kundfaktura påverkar customers/next_year, inte bank/moms/resultat/skatt | PASS API + UI |
| Kryss och fullständiga tidsstämplar bevaras vid underlags-/profiländring | PASS |
| Markera, avmarkera, autospara, omladdning och ny inloggning | PASS |
| Dator 1440 och mobil 390, navigation till Bokföring/Moms/NE och tillbaka | PASS |
| Två ägare/år och historiskt låst års status | PASS |
| RLS, anon-denial, direkt skrivning nekad och privat hjälpfunktion nekad | PASS |
| Vanlig användares delete-RPC och service-rollens användar-RPC nekas | PASS |
| Verklig app-server läser deklarationsindex med Staging-session och rätt ägare | PASS, HTTP200 |
| Befintliga schema-/säkerhetsgränser och tidigare data bevarade | PASS |

Inga pageerror i genomförda browserfall. Dator-/mobilskärmbilder och konfliktvyn
inspekterade. Framsteg visas som egna bekräftelser, inte ett godkänt bokslut.

Efter publicering kördes också test:year-end-checklist och test:e2e:safety: PASS.
Hela säkra lokala regressionen och 19 rollback-DB-grupper var redan PASS för exakt
denna produktkandidat före publicering; de kördes inte om i sin helhet hosted.
Tidigare delete-user v9-verifiering innefattade faktisk radering av syntetiskt D.
Ingen ny användarradering eller ny Edge-deployment behövdes i detta omtest.

## Avvikelser, gränser och nästa steg

De två tidigare produktavvikelserna är godkända i detta tekniska omtest. **Inga nya
produktavvikelser observerades.** Aliaset behövde korrigeras enligt ovan.
En lokal kopieringsrad för testverktyget hade ett citeringsfel före några testanrop;
den korrigerades. Ingen produktkod behövde ändras efter godkännandet.

Det äldre SQL-testfelet Unexpected close-year delegate transformation är fortsatt
separat och har inte rättats/dolts. KAN-113 och pågående/framtida årslås har inte
reproducerats eller rättats. KAN-112 Jira återläst To Do/otilldelad; ingen mutation,
ingen Done. Användarens aktuella instruktion tillåter inga ytterligare tester/arbetsmoment.

**Återstår endast Pontus manuella acceptans och nästa releasebeslut.** Det finns
inga pågående tester och inga planerade tekniska omtest kvar för denna kandidat.
Ingen Production-release, ny deployment eller ytterligare push är godkänd.

Manuell granskning: öppna Staging, välj 2025 och Årsavslut, prova markera/avmarkera,
ladda om och välj åter 2025. Befintlig lokal startfil
root/audit-packages/KAN-112-staging-20261026/open-staging-review.ps1 öppnar syntetiskt
A utan att visa lösenord. A/B/C behålls; D är tidigare raderat. Credentials ligger
endast i ignorerade lokala filer, inte i Git eller denna rapport.

## Handoff och bevis

Produktarbetskopia: C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user/audit-packages/KAN-100-app-release-20261024.
Nyckelfiler: AGENTS.md, PROJECT_STATE.md, denna rapport och KAN-112-LOCAL-FIXES-20261026.md.

Bevis i root/audit-packages/KAN-112-fix-staging-20261026/: preflight-pass,
before/after-catalogue, data/checklist snapshots, CLI-plan/loggar, migration-pass,
deployment/alias, fix-browser-results, browser-results, security-results,
final-verification och PNG-bilder. API-omtestets resultat finns i
root/audit-packages/KAN-112-staging-20261026/fix-hosted-results.json.

Det slutliga dokumentcheckpointet innehåller bara denna rapport och L/PROJECT_STATE.
Det är lokalt och **inte pushat**; publicerad produkt ligger fortsatt exakt på bf845c2.
Root-kopians tidigare dirty docs och untracked-verktyg bevaras. Där läggs en kort
KAN-112-navigeringsnotis i den redan dirty PROJECT_STATE, utan att committa andras diff.
Alla andra arbetskopior/grenar/fixtures bevaras. Ingen arkivering/rensning behövs;
denna acceptans är aktiv tills Pontus fattat beslut. Formell publicerad handoff
enligt AGENTS kräver push; här levereras uttryckligen lokal handoff utan push.
