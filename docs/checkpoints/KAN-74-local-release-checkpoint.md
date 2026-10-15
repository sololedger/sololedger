# KAN-74 – isolerat lokalt releasecheckpoint

2026-10-15. Den commit som innehåller denna rapport är checkpoint **C** enligt ledarchattens uttryckliga godkännande. Endast lokal commit är godkänd. **Redo för separat beslut om Staging-integration/publicering; ingen push eller deploy ingår.** Exakt SHA verifieras efter commit och finns i Git samt den lokala slutevidensen.

- Gren: codex/KAN-74-release-checkpoint.
- Separat ny worktree: C:/Users/Familjedator/.codex/worktrees/kan74-release-checkpoint/sololedger_multi_user.
- Exakt Production-bas/ensam förälder: **1d297c1fd387be2f3f6cd54a780b8c58c2901732**.
- Källa: den färdiggranskade codex/KAN-74-sie-opening-guard vid samma bas. Dess samtliga ocommittade ändringar lämnas orörda; inget flyttas eller rensas.
- Urval: 26 godkända kandidatfiler kopierade byteidentiskt; endast releasegrenens PROJECT_STATE uppdateras för detta checkpoint och denna rapport tillkommer. Git normaliserar text-radslut enligt repositorykonfigurationen; indexets produkt-/SQL-/testblobbar jämförs med källans normaliserade innehåll.

## Exakt filförteckning

```text
PROJECT_STATE.md
docs/checkpoints/KAN-74-local-release-checkpoint.md
docs/reviews/KAN-74-P1-blocker.md
docs/reviews/KAN-74-P2-period-blocker.md
docs/reviews/KAN-74-company-lock-followup.md
docs/reviews/KAN-74-server-import-design.md
docs/reviews/KAN-74-server-import-implementation.md
docs/reviews/KAN-74-sie-opening-guard.md
docs/reviews/KAN-74-single-year-guard.md
docs/reviews/KAN-74-staging-release-plan.md
package.json
scripts/check-db-regression-invariants.mjs
scripts/test-sie-import.mjs
scripts/test-sie-opening-guard.mjs
src/app/api/sie/import/route.ts
src/components/SieImportModal.tsx
src/lib/adminDeleteDryRun.ts
src/lib/sieImport.ts
src/lib/sieImportPayload.ts
src/lib/sieImportServer.ts
src/lib/sieParser.ts
supabase/functions/delete-user/index.ts
supabase/migrations/20261015115900_kan74_sie_verified_inputs.sql
supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql
supabase/migrations/20261015121000_kan74_sie_receipt_deletion.sql
supabase/tests/helpers/kan74_receipt_fixture.sql
supabase/tests/kan74_sie_opening_guard.sql
```

## Avgränsning och migrationsordning

Releasegrenen är skapad direkt från angiven Production-bas, utan merge eller cherry-pick från Staging/KAN-62/KAN-65. Diffen är exakt filförteckningen ovan. Inga nya beroenden; package-lock.json är oförändrad mot basen. Ingen ändring av saldo, NE, SIE-export, årslåsning, fakturering eller inventariekod följer med utöver redan godkänd KAN-74-import-/raderingsyta.

De enda nya migrationsfilerna är, i denna ordning:

1. 20261015115900_kan74_sie_verified_inputs.sql – skyddat kvitto, serverregistrering och periodvalidator.
2. 20261015120000_kan74_sie_opening_balance_guard.sql – obligatoriskt kvitto, atomär import-/flerårsspärr och företagslåsning.
3. 20261015121000_kan74_sie_receipt_deletion.sql – kvitton i atomär användarradering och räkning.

De tre filerna matchar den oberoende granskade och livejämförda kandidatens SHA-256. Äldre 41 migrationsfiler från Production-basen är oförändrade. KAN-62-filerna 20261012123000 och 20261012153000 saknas; inget historiskt migrationsinnehåll skrivs om.

**supabase/functions/delete-user/index.ts ingår uttryckligen**, inklusive kvittoräkning och residualkontroll före Auth-radering. Tillhörande adminräkning, raderings-RPC och tester ingår. Själva Edge-publiceringen är en framtida separat godkänd åtgärd.

## Verifiering av den isolerade kopian

| Kontroll | Resultat |
| --- | --- |
| Fil-/Git-isolering | Exakt godkänt urval; alla produkt-/SQL-/testfiler matchar källan; inga orelaterade filer eller KAN-62/65-ändringar. Ensam förälder är Production-basen. |
| Beroenden | npm ci --offline --ignore-scripts från oförändrat package-lock.json; egen node_modules. Inga env-, Auth-, credential- eller byggfiler kopierade. |
| npm run build | PASS på den nya worktreen med processlokala platshållare; /api/sie/import ingår. Ingen deploy. |
| npm run typecheck | PASS separat efter build. |
| npm test | PASS: hela domänsviten inklusive parser/server/klient, KAN-71-rapportregressioner, admin dry-run och statiska DB-invarianter. |
| Riktad ESLint | PASS för de berörda app-/parser-/server-/testfilerna. Tidigare generell lintskuld, inklusive äldre Edge-diagnostik, är oförändrad och ingår inte som en ny fix. |
| Publik lokal Playwright | PASS 2/2 genom befintlig smoke-runner mot en egen localhost-port; inga formulär skickas och inga testskrivningar utförs hosted. |
| Ny lokal SQL-/samtidighetskörning | Inte omkörd: isoleringen ändrar inga SQL-/testfiler. Tidigare verifierad evidens återanvänds: 66 rollbackfall, 18 tvåsessionsfall, två isoleringsavslag, KAN-71 ×3, manuell bokföring/fakturamoms och fem verkliga serverunderlag genom lokal RPC. |
| Färsk livejämförelse/anslutning | Tidigare samma dag PASS för Production 41/Staging 43 versioner samt Direct/TLS/timeout/reset i psql och CLI 2.120.0. Migrationsfilerna har därefter inte ändrats; ingen hosted SQL körs för checkpointet. |

Verifieringen omfattar också oförändrade HEAD, grenar, status, staged diff och kontrollerade filfingeravtryck för de **14 ursprungliga worktreesen**. Orelaterade untracked-filer/credentialdomäner kopieras inte. Det finns nu en femtonde, separat releaseworktree. main, staging, origin-referenser, KAN-62/65-grenar och dokumentationscommit 11d8306 bevaras. Endast det nya releasecheckpointet skapas.

## Nästa säkra steg

Invänta ledarchattens beslut om separat Staging-integration från då verifierad origin/staging och överför endast checkpoint C:s KAN-74-delta till kandidat S. Ingen direkt publicering av hela Staging till Production. Planen i docs/reviews/KAN-74-staging-release-plan.md behålls: isolerad migrationsrunner, import-/raderingsuppehåll, tre migrationer, uppdaterad delete-user Edge och samordnad route/klient innan godkända acceptanstester.

Den kopierade releaseplanen och analysrapporterna dokumenterar tidigare faser och deras godkännandestatus. **Denna rapport och releasegrenens PROJECT_STATE anger det nu godkända lokala checkpointet.** De icke godkända publicerings-/skrivstegen är fortsatt spärrade.

Evidens: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/checkpoint/. Där sparas före-/efterbevarande, källmanifest, exakta diffen, build/types/lint/npm-test/smoke och slutligt SHA. Föregående lokala DB-resultat finns i company-lock/ och färska livekontroller i home-live/ bredvid.

Ingen Git-push, hosted migration/dataändring, Vercel-/Edge-deploy eller Jira-mutation. Inget annat arbete har arkiverats, raderats, committats eller flyttats. Avvakta godkännande.
