# KAN-112 – UX-uppföljning publicerad och hosted omtest

2026-10-26. **PASS för Pontus manuella acceptans, med uttrycklig testbegränsning:**
automatiseringen kunde inte intyga fysiska OS-flik-/fönsterbyten. Dessa behöver
provas manuellt. Hosted återkomst via verkliga Auth-SDK:ns visibility- och
fokusvägar samt övriga nedanstående kontroller passerar.

## Exakt publicerat

- Produkt: `667303026ecf41b75e31c3f69e292a1c1aabbfd0`.
- Tidigare lokal dokumentationscheckpoint: `3316c8988e5675fd610e6e452be3ce85fecf9c16`.
  Den följde inte med till Staging; endast exakt produktcommit pushades.
- GitHub `staging`: bf845c21955552a4bfb26e67cd45c189064663fa → 6673030.
- Vercel: `dpl_A1o8HmvWaxv9BqZJHRn3T97jVFtN`, READY, Preview/staging, exakt 6673030.
- Deployment: https://sololedger-hp3yz56zp-sololedger1.vercel.app
- Ordinarie Staging: https://sololedger-git-staging-sololedger1.vercel.app
- Projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`.
- Supabase Staging `fzxqiqenqjzhlyxxpvhg`.
- GitHub main kvar `6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`.

Ingen migration, Edge-publicering, miljöändring eller Production-ändring.
Jira KAN-112 återläst Task/To Do/otilldelad, ingen mutation och inte Done.
KAN-113 och äldre SQL-testfelet har inte hanterats.

## Förkontroll och alias

AGENTS, root/L PROJECT_STATE och UX-rapporten lästes. L var ren på 3316c89.
Fullständiga SHA verifierades; produkt/test/schema/lockfil i arbetskopian var
identiska med kandidaten. De tio produkt-/testfilerna överensstämde med godkänd
fillista. Kandidaten är fast-forward från publicerad bf845c2. Ingen ny produktkod
eller teständring behövdes. Äldre mellanliggande dokumentationscommits är kända.
Rootens orelaterade ändringar bevarades och användes inte som pushkälla.

Live Staging-katalogen jämfördes exakt med tidigare KAN-112-acceptans: samma
tabeller, funktioner, ACL, RLS och migrationsledger, inklusive 20261026092741
och 20261026110015. Aktuella checklist-RPC-definitioner lästes med pg_get_functiondef.
PostgreSQL-läsning använde etablerad Session Pooler, verifierad TLS och samma
backend-session inom READ ONLY-transaktion. Inga migrationsverktyg kördes.

READY-kandidatens projekt/team/branch/SHA/Preview verifierades. Ordinarie alias
låg kvar på `dpl_ACc218U3uJ8U5Jp393GhfKY3UfYw`/bf845c2 och kopplades inom
stående aliasbehörighet till `dpl_A1o8HmvWaxv9BqZJHRn3T97jVFtN`/6673030.
Samtliga andra alias, inklusive Production, och envmetadata är oförändrade.
Verklig browsertrafik använde rätt Staging-ref och nya guidens beteende/text.

## Hosted omtest

Syntetiska A/B:s befintliga kohortmarkörer och identiteter verifierades.
Appen kördes på ordinarie Staging-alias, med verklig Auth och verkliga RPC:er.
Browsergränsen nekade annan Supabase-origin och kontrollerade ägare på REST-anrop.

| Kontroll | Resultat |
| --- | --- |
| Fem hidden → visible-återkomster via verklig hosted Auth-SDK | PASS på 1440/390 |
| Tre blur/focus-cykler vid växling mellan browserkontexter | PASS på 1440/390 |
| Fysiska/native OS-flik-/fönsterhändelser | Ej verifierade, manuell kontroll återstår |
| Ingen falsk röd varning; öppnad punkt/kryss bevaras efter återkomst | PASS |
| Faktiskt autospara, avmarkera, återkomst och sidomladdning | PASS |
| Sparning når Staging men HTTP-svaret fördröjs över Auth-förnyelse | PASS |
| Osäkert försök finns kvar, ingen falsk Sparat, samma begäran kan återförsökas | PASS |
| Replay av samma begäran ger exakt en ny revision, inte en extra sparning | PASS |
| Nätverksavbrott för checklistläsning och separat HTTP503-läsfel | PASS |
| Tydligt läsfel, manuell omläsning återställer aktuell verklig checklista | PASS |
| Retur från Profil, Fakturor, Bokslutsskulder, Inventarier, Moms och NE | PASS |
| Ändrat år i destinationen återställs till 2025, rätt huvuddel/punkt och scroll/fokus | PASS |
| Bock och befintlig omkontrollvarning, kryss och originaldatum bibehålls | PASS |
| Generell momsinstruktion utan leverantörs-/räkneexempel | PASS |
| Stängd/öppen systemstatus och tydlig skillnad mellan sparat och inlämnat | PASS |
| B kan inte läsa A:s checklistor | PASS |
| Dator/mobil, inget horisontellt överflöde eller pageerror | PASS |

Underlag med befintlig kundfakturavarning användes utan att ändras. Dess hela
checklistrad och bekräftelsedatum är identiska före/efter. Konto A:s systemstatus
för 2025 hade noll momsperioder och deklarationsversioner: det visades korrekt,
med varning att antalet inte bevisar fullständig periodtäckning/inlämning.
Den befolkade period-/deklarationsgrenen är fortsatt täckt av lokal syntetisk
regression; nya sådana fixtures skapades inte enbart för detta UX-omtest.

Efter publicering: `npm run test:year-end-guide` och `npm run test:e2e:safety`
**PASS**. Den riktade regressionen innefattar verklig Auth/klient/store/guide,
35 min simulerad inaktivitet/tokenförnyelse, ägarbyte, StrictMode, säkert replay,
ändringsvarningar och Home/Layout-navigation på dator/mobil. Hela säkra lokala
regressionens tidigare resultat för exakt produktkandidat finns i UX-rapporten;
den kördes inte om i sin helhet efter denna oförändrade publicering.

## Databevarande och avvikelser

Före/efter publicering, före tester: **hela databaskatalogen, samtliga publika
datakontrollsummor och alla checklistor identiska**.

Efter tester: samma schema/ACL/RLS/migrationsledger och samma kontrollsummor för
alla andra publika tabeller. Checklistan hade 14 rader före och 14 efter.
**Endast syntetiska A:s bankkontroll för 2025 ändrades av markera/avmarkera/replay.**
Dess ursprungliga bekräftelseflagga återställdes. Revision/datum speglar de riktiga
testsparningarna. Alla övriga checklistrader, inklusive andra användares, identiska.
Inga ekonomiska transaktioner, fakturor, profiler, årslås eller deklarationer ändrades.

Ingen produktavvikelse upptäcktes. Testverktyget behövde normalisera tomma
metadatafält (`undefined` kontra utelämnat JSON-fält) före aliasjämförelsen;
det var ingen miljöförändring. Medföljande headed Chromium startade inte.
Installerad Chrome startade, men automatiseringsmiljön rapporterade fortsatt
visible efter aktivering av en annan sida även med fokusemulering avstängd.
Den avgränsade diagnosen avslutades. Resterande tester använde uttryckliga
visibility-/fokushändelser mot verklig hosted SDK, utan påstående om native-händelser.

## Bevis och nästa steg

Root/audit-packages/KAN-112-ux-hosted-20261026: preflight, before/after-catalogue,
before/after-data, before/after-checklists, before-definitions, deployment,
alias-before/after/correction, after-release-preservation, browser-results,
final-verification samt status-/varnings-/helbild på 1440/390. Inga credentials i rapport/Git.
Testbrowserar avslutade. A/B/C och övriga fixtures bevaras.

**Nästa steg är Pontus manuella acceptans på ordinarie Staging-adress.**
Öppna Årsavslut 2025, växla riktiga flikar och fönster flera gånger, återkom efter
inaktivitet och prova retur från Moms/NE. Bekräfta att ingen falsk röd text uppstår
och att rätt punkt/år återställs. Denna fysiska växling är den uttryckliga luckan i
automatiseringen. Inget nytt release-/Production-beslut är godkänt.
Ny rapport/STATE checkpointas endast lokalt; ingen ytterligare push ingår.
