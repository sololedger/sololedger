# SoloLedger Project State

2026-10-26 – **KAN-112 UX-uppföljning publicerad, PASS för manuell acceptans.**
Begränsning: native OS-flik-/fönsterbyte kan inte intygas av testmiljön; prova manuellt.
Endast godkänd Staging-push/publicering. Ingen migration/Edge/Production/Jira-ändring.

## Aktuell arbetskopia och kandidat

- L = audit-packages/KAN-100-app-release-20261024.
- Gren codex/KAN-112-year-end-checklist. Origin är lokal KAN-62-kopia, inte GitHub.
- Produktcheckpoint 667303026ecf41b75e31c3f69e292a1c1aabbfd0.
- Tidigare lokal docs-checkpoint 3316c8988e5675fd610e6e452be3ce85fecf9c16 inte pushad.
- Ny lokal hosted-rapport/STATE-checkpoint enligt git log; inte pushad.
- Root hade redan orelaterade dirty docs/AGENTS/verktyg. Allt bevarat; root används
  inte som produktpushkälla. Endast KAN-112-navigeringsnotisen uppdateras där.

## Vad ändrades

- Flikbytesfelet reproducerat 5/5 i publicerad Staging: Auth förnyade profilens
  generation och checklistan försökte läsa före verifieringen, utan nytt RPC.
- Guiden behåller samma ägares/års tillstånd och väntar på verifierad generation.
  Separat fokusläsning borttagen. Verkliga läsfel syns fortfarande.
- Pågående osäkra sparförsök bevaras med samma idempotenta begäran vid Auth-förnyelse.
- Retur till guidens ursprungsår, öppna huvuddel/kontroll och rubrikens scroll/fokus.
- Generell momstext utan leverantörs-/räkneexempel; bock och tydlig omkontrollvarning.
- Stängd systemstatus har sammanfattning. Befintliga momsperioders datum/status visas;
  inlämningsregistrering märks användarregistrerad, inte myndighetsverifierad.
- Inga ekonomiska beräkningar, bokningsvägar, DB/RLS/RPC eller migrationsfiler ändrade.

## Verifierat

- Hosted 6673030: verklig Auth/RPC, fem visibility-återkomster och tre fokuscykler
  på dator 1440/mobil 390 PASS. Native headed-test kunde inte intyga hidden;
  explicit händelsedrivning användes mot verklig SDK. Fysisk växling återstår manuellt.
- Verkligt autospara/avmarkera/omladda och fördröjt sparsvar över Auth-förnyelse PASS;
  samma begäran/replay ger bara en ny revision. Nätavbrott/HTTP503 och återhämtning PASS.
- Retur från sex riktiga funktioner, ändrat destinationsår, rubrikens fokus/scroll PASS.
- Befintlig omkontrollvarning och fullständig checklistrad/datum bevarade. Status/text PASS.
- Före/efter publicering alla publika data/checklistor identiska. Efter syntetiska tester
  endast A:s bankkontroll 2025 ändrad, ursprunglig kryssflagga återställd. Alla övriga
  13 checklistrader och andra publika data identiska; schema/ledger/ACL/RLS oförändrade.
- Efter publicering test:year-end-guide och test:e2e:safety PASS. Nedan lokala resultat
  gäller samma oförändrade produktkandidat och kördes inte alla om hosted.
- Ny permanent regression: verklig useAuth/profilskydd/klient/store/guide och
  installerad Auth-SDK:s visibility recovery; nätverk syntetiskt. Före reproducerat,
  efter PASS på 1440/390. StrictMode, fem återkomster, 35 min simulerad inaktivitet,
  tokenförnyelse, osäker sparning/replay, nätverksfel, ägarbyte och misslyckad profil.
- Home/Layout/guide: autospara, avmarkera, ändringsvarningar, två ägare/år,
  sex destinationer och ändrat destinationsår, rätt returscroll/fokus PASS dator/mobil.
- Lokal Next-app + verklig Staging Auth/RPC med verifierat syntetiskt A: PASS 1440/390.
  Markera/avmarkera, fem återkomster, omladdning, returscroll, läsfel/återhämtning.
- Staging B nekad läsning av A:s checklistrader. A:s ursprungliga flaggor återställda,
  ekonomiska underlagsvärden oförändrade. Bara syntetiska checklistrader ändrade.
- Alla säkra regressionsdelar PASS. Första helkommandot nådde smoke-serverns
  starttidsgräns; ett avgränsat omtest gav publik smoke 2/2 PASS. Resterande
  kategori-/standardbokningsbrowsersteg kördes separat och passerade.
- Typecheck efter dev, riktad ESLint, guide-lint utan nya fel, E2E-säkerhet PASS.
- Dator-/mobilbilder inspekterade. Inget horisontellt överflöde/pageerror i acceptansen.
- Ingen ny DB-/raderings-/årslåsregression eller separat lokal optimerad build; Vercel-bygget READY.
  Verklig manuell OS-flik-/fönsterväxling återstår; browserhändelser kördes automatiskt.

## Aktuellt publicerat läge, verifierat efter omtest

- Staging 667303026ecf41b75e31c3f69e292a1c1aabbfd0, endast exakt produktcommit pushad.
- Vercel dpl_A1o8HmvWaxv9BqZJHRn3T97jVFtN READY, Preview/staging, rätt projekt/team,
  ordinarie alias sololedger-git-staging-sololedger1.vercel.app till rätt deployment.
- Supabase Staging fzxqiqenqjzhlyxxpvhg. Ingen ny migration/config/Edge-publicering.
- Staging-alias korrigerat från dpl_ACc218U3uJ8U5Jp393GhfKY3UfYw/bf845c2 till
  ovanstående deployment/6673030. Övriga alias och envmetadata identiska.
- GitHub main kvar 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e; Production orörd.
- Tidigare installerat 20261026092741 + 20261026110015 och delete-user v9 enligt
  föregående acceptansrapport; ingen ny Edge-versionkontroll behövdes för UX-arbetet.
- Jira KAN-112 läst Task/To Do/otilldelad; ingen mutation eller Done.
- KAN-113 och äldre SQL-testfelet fortsatt utanför uppdraget. Production orörd.

## Rapport, bevis och nästa säkra steg

- docs/reviews/KAN-112-UX-STAGING-ACCEPTANCE-20261026.md: publicering, hosted test och luckor.
- docs/reviews/KAN-112-UX-FOLLOWUP-20261026.md: lokal grundorsak, fillista och testgränser.
- Tidigare docs/reviews/KAN-112-STAGING-FIX-ACCEPTANCE-20261026.md är historisk bas.
- L/coverage/kan112-auth, kan112-browser, kan112-ux-regression.log,
  kan112-ux-smoke-retry.log, kan99-evidence/lint-comparison.json.
- Root/audit-packages/KAN-112-ux-20261026: reproduktion och verklig lokal Staging-acceptans.
- Root/audit-packages/KAN-112-ux-hosted-20261026: nya före/efter-, alias-, browser- och slutbevis.
- Inga pågående testservrar. Syntetiska A/B/C och övriga fixtures bevaras.
- Retention genomgången: aktiva KAN-112 behålls; tidigare rapporter räcker som historik.
- Nästa steg: Pontus manuella acceptans, särskilt riktiga OS-flik-/fönsterbyten och
  retur från Moms/NE. Stoppa efter rapporten; ingen ytterligare push eller Production godkänd.
