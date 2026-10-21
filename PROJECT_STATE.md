# SoloLedger Project State

Avstämt 2026-10-21. **KAN-62 LOCAL PASS accepterat för Staging-förberedelse. Stanna före publicering.**
Arbetsmodell: LOCAL → STAGING → PRODUCTION. Lokal implementation, omkörning och scoped commits
är tillåtna inom godkänt uppdrag. Extern publicering/migration kräver nästa uttryckliga beslut.

## Verifierad Production och Staging

- GitHub main **d4320f5d6524216948904e0e58cae3a30ddd76fa** (KAN-105), färskt läst.
- Production Vercel **dpl_4axRc8RXNvcLoyna8HVbrccA9VFy**, READY / main / production;
  sololedger.vercel.app pekar på exakt detta bygge. Ingen ny deployment gjord.
- Production Supabase **wbaxmuvudpnkvuliicuy**: 52 migrationer, senast **20261020130000**.
- GitHub staging **d57161756fec9999094b1e068db2a1e9cde22b2b**. KAN-105 är redan
  Production-levererad men saknas i staging och ska följa med i nästa lokala integration.
- Staging Supabase **fzxqiqenqjzhlyxxpvhg**: 54 migrationer, samma senaste version.
  Exakt extra versioner mot Production: **20261012123000** och **20261012153000** KAN-62.
  Historiska filer finns i båda Git-träden; återspela dem inte mot Staging.
- Enda funktionella kroppsskillnaden efter CRLF/LF-normalisering: privata inventarie-RPC:n.
  Offentlig wrapper/KAN-54/KAN-75 skydd är lika. Äldre separat get_next_ver_nr-ACL-avvikelse
  (PUBLIC/anon EXECUTE i Staging) kvarstår; ingen behörighetsändring ingår här.
- Databasgranskning utförd med TLS och READ ONLY, endast katalog/ledger, inga användarrader.
- **Vercel staging-byggspärr kvarstår.** Ordinarie staging-alias visar ännu KAN-80,
  **fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0**, inte den aktuella grenen.
  d571617:s integrations-Preview är READY; staging-grenens bygge är CANCELED.

## KAN-62 kandidat och lokal verifiering

- Arbetskopia: **audit-packages/KAN-62-rule-contract-local**, vanlig bevarad lokal klon.
  Origin är lokal KAN-97-kopia, INTE GitHub. Läsreferenser github/main och github/staging
  hämtade direkt från GitHub. Desktop-kod eller dess äldre origin/main är inte releasekälla.
- Kandidatgren: **codex/KAN-62-rule-contract**, bas d4320f5; produktcheckpoint
  **ca42545295baeb0ea461c8e44310a3e8290a5a85**. Separat docscheckpoint innehåller regler/state/plan.
- Lokal Staging-integration: **codex/KAN-62-staging-preparation**, bas github/staging.
  Exakt HEAD verifieras i slutrapport/git; inget har pushats. Produktträd ska matcha kandidaten.
- Regel: strikt gräns under 29 600 exklusive fakturamoms för 2026; ej avdragsgill moms
  ingår i kostnad/tillgång. Beständiga sammaårsgrupper/planer, tre köp, kortliv och exakt
  preview/serverkontrakt. Historiska journaler bevaras; osäkra äldre planer/länkar stoppas.
- Endast ny migration **20261020233000_kan62_rule_contract.sql** för Staging.
  Alla 55 lokala migrationshashar verifierade; inga historiska filer ändrade.
- LOCAL PASS: full SQL/RLS/klientbehörighet, 59 lyckade anrop och 114 exakta negativa prov;
  äldre replay efter uppgradering, journalrader/balanser, stängda/deklarerade perioder.
  **9/9 samtidighetsfall**, även verklig moms- och årsstängning. Bevis i
  **docs/reviews/KAN-62-LOCAL-PASS.md**, tidigare FAIL-bevis bevarade.
- Lokal DB **sololedger_kan62_disposable_20261021**, **127.0.0.1:5432**, PostgreSQL17.11,
  OID **57199**. Exakt unik markör i ignorerat coverage/kan62-local-db/database-identity.json.
  55 installerade migrationer, 19 syntetiska användare; tidigare data/bevis ska bevaras.
  Ingen reset/radering, ingen ny skrivande databastestning under releaseförberedelsen.
- Ny kontroll: standardbygge **Next16.2.6/Turbopack PASS**, inklusive TypeScript och 8/8
  statiska sidor. Publik smoke mot faktiskt byggd app **2/2 PASS**. Endast syntetisk
  localhost-konfiguration/nycklar; ingen appkonfiguration/dependency ändrad.
- Tidigare dev/PostCSS-fel återkom inte i bygget; detta är inte ett generellt dev-fixkvitto.
  Första byggförsöket saknade syntetisk servernyckel för modulstart; korrigerad miljö PASS.
- Riktad lint utan varningar, offline körvakt och DB-invarianter PASS. Domän-/säker regression
  enligt tidigare lokalt PASS; färsk domänomkörning/logg i coverage/kan62-local-db/staging-prep-*.

## Begränsningar och nästa beslut

- Jira återläst: KAN-62 **In Review / Pontus**, KAN-73 och KAN-76 **To Do / High**.
  Inga Jira-ändringar. KAN-73 fixed_asset/2641 i momsrapport/dashboard och KAN-76 köp efter
  avskrivning är olösta och blockerar generell inventarie-/Production-acceptans.
- Ingen ny EU-varuhantering, obetalda fakturor, allmän aktivering, returer eller fleråriga
  avskrivningar. Ingen ändring av Jessikas bokföring; endast syntetiska kommande acceptansprov.
- Nästa godkännande: exakt release-SHA till staging, EN migration 20261020233000,
  återöppning av Vercels staging-byggspärr och avgränsade syntetiska Staging-acceptansprov.
  Migration först, verifiera skydd/ledger, matchande klient därefter; gammal klient ska stoppas.
- Full plan och kompatibilitet: **docs/reviews/KAN-62-STAGING-PREPARATION.md** i kandidaten.
  Hosted build/JWT/HTTP och rapport-/NE/dashboardacceptans återstår. KAN-73 får inte rapporteras PASS.
- Ingen push, hosted migration, deployment eller Jira-mutation utförd. Lokala commits godkända.

## Bevarade arbetskopior och äldre risker

- Root Desktop-gren staging är en äldre separat dokumentationskedja; pusha den aldrig som
  produktrelease. Befintlig personalavgränsning i AGENTS är bevarad men hålls utanför ny docscommit.
  audit-packages/ och scripts/create-kan63-staging-user.mjs är tidigare lokalt material, ej release.
- KAN-97/104/105-kopior, miljöfiler, auth och DB-bevis orörda. Ingen automatisk cleanup.
- Tidigare öppna SIE/flerårsrisker KAN-95/96/83/34 och äldre testkontons årsavvikelser
  är inte lösta av detta uppdrag. Deras status är inte nygranskad; historik i PROJECT_ARCHIVE.md.
  KAN-75 tidigare release är avslutad; kör aldrig dess historiska mutationsverktyg igen.
