# SoloLedger Project State

Uppdaterad 2026-10-17 för KAN-80:s färdiga lokala kandidat. Inte committad eller publicerad.

## Produktmål och mandat

- Enkel, tillförlitlig årsvis bokföring för Jessikas enskilda firma. Bokföring, auditbarhet och användarisolering går först.
- Aktiv uppgift: **KAN-80 – beständig idempotens för vanlig och periodiserad bokning**. Lokalt implementerad och verifierad. Jira läst: Bug, To Do, otilldelad. Ingen Jira-mutation utförd eller antagen som godkänd.
- Endast lokal implementation och isolerade tester är utförda. Ingen commit/push, hosted migration, databasskrivning, konfigurationsändring eller deployment godkänd/utförd.

## Arbetskopia och bas

- Separat unmanaged klon: `C:/Users/Familjedator/.codex/visualizations/2026/10/17/01a14b46-6bdd-7b70-9ad7-c3899ea9c943/kan80-source`.
- Gren: `codex/KAN-80-booking-idempotency`. HEAD och Production-bas: **af0378ae0935518346360e3492c38175e2c270d2**, verifierad mot GitHub main både före arbete och vid avslutet.
- Alla KAN-80-ändringar är lokala, unstaged och ocommittade. Exakt fillista och SHA-256 (exklusive manifestets egen hash): `docs/reviews/KAN-80-candidate-files.json`.
- Genererade `node_modules`, `.next`, TypeScript-state och testutdata är ignorerade; inga env/auth/pgpassfiler kopierades. `package-lock.json` är oförändrad.
- Startkatalogen på Desktop är en äldre produktkopia och används inte som produktbas. Befintliga arbetskopior, opushade commits, orelaterade ändringar och ignorerat material är bevarade. Inget managed-worktree-/cleanup-/archive-/remove-anrop utfört.

## Implementation och verifiering

- Ägarbundet sparat försök med UUID, oförändrat underlag och uppladdad bilagereferens före boknings-RPC. Osäkert försök återupptas efter omladdning; får inte ersättas av ändrat formulär. Web Locks skyddar flikar.
- Ny migration **20261017190000_kan80_standard_booking_idempotency.sql**: privat RLS/ACL-tabell med unik ägare/nyckel; lås, exact replay före föränderliga spärrar, atomiskt kvitto/resultat, tydlig bekräftad avvisning efter rollback. Äldre nyckellösa RPC-anrop stoppas. Ny klient kräver protokoll 1 före dispatch mot DB.
- Befintlig bokföringskärna i båda RPC:erna är bytejämförd med live-definitionerna och oförändrad. Ingen ny transaktionskälla. Användarradering, admin dry-run och Edge-residualkontroll omfattar kvittona.
- PASS: full `npm run test:regression` inklusive domän, historik/UI, kategori och KAN-80-browserprov samt publik Playwright smoke 2/2; typkontroll; build med syntetiska miljövärden; admin delete-kontrakt; `git diff --check`.
- PASS: isolerad lokal PostgreSQL, schema-only utan verkliga användare; exakt live-match för tre RPC:er före migration; 20 gamla/nya bokföringsjämförelser; commit+tappat svar/retry; samtidighet; nyckelkonflikt; två ägare; verklig journal-/vändningsrollback; förändrade spärrar; rättelser; momsavslut; RLS/ACL/radering; adversarial gammal snapshot. Testfixturer rensade.
- PASS: riktiga Home/TransactionForm vid 1280/390 px med syntetiska transportgränser och blockerad extern nättrafik; verklig omladdning/localStorage/Web Locks/två flikar; en bilageuppladdning. Skärmbilder granskade.
- Full repo lint har befintlig skuld (86 fel/7 varningar); ändrad produktkod har inga nya diagnoser, page 13 -> 11 fel. Ingen oberoende agentgranskning; egen adversarial granskning och tester genomförda.
- Detaljer, begränsningar, säkerhetskonsekvenser och releasechecklista: `docs/reviews/KAN-80-local-verification.md`. Genererade resultat i `test-results/kan80`; råloggar/schemaevidens ligger i klonens föräldrakatalog. Inga credentials eller verkliga användardata finns i evidensen.

## Extern status och gränser

- Production Supabase **wbaxmuvudpnkvuliicuy** har endast inspekterats skrivskyddat (definitioner, constraints, index, RLS, triggers, grants och interna anrop). Ingen användarbokföring läst eller ändrad i uppdraget.
- Staging **fzxqiqenqjzhlyxxpvhg** är inte ändrad. Hosted autentiserad/write E2E och Pontus acceptans återstår och kräver godkänd Staging-publicering/testning.
- Held `staging`/KAN-62/65 är inte kandidatbas eller del av ändringen. KAN-89 är tidigare Production-levererad enligt gemensam handoff i Desktop-repot; äldre arkitekturstatus i denna produktbas ska inte ersätta verifierad kod/live-RPC.
- Känd historisk ledgeravvikelse (KAN-84-version saknas i produktrepot) och extra held Staging-versioner ska hanteras genom etablerad isolerad CLI-runner från faktisk målledger. Ingen replay/baseline/include-all/repair är godkänd.
- Återhämtning kräver samma webbläsarprofil och ägare, bevarad localStorage och Web Locks. Rensad/korrupt lagring eller byte av enhet kan inte automatiskt återställa en förlorad klientnyckel. Omladdning innan bilageuppladdningen är klar kan kräva nytt filval; då har ingen boknings-RPC skickats.

## Nästa säkra steg

1. Pontus granskar lokal kandidat och ger separat uttryckligt beslut om lokal commit. Föreslaget meddelande: `KAN-80: make ordinary and periodized booking attempts durable and idempotent`.
2. Efter separat Staging-godkännande: exakt kandidat, ny ledger-/definitionskontroll, officiell CLI dry-run med endast KAN-80-migration. Migration först, verifiera protokoll/ACL/ledger, därefter matchande delete-user Edge och app. Ingen publicering av held staging-innehåll.
3. Kör dokumenterad syntetisk Staging-checklista och Pontus acceptans före något Production-beslut. Produktionscommit, migration och deploy kräver egna exakta godkännanden.
