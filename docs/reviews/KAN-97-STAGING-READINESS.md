# KAN-97 – Staging-readiness

Verifierat läsande 2026-10-20. **BLOCKED för att begära själva Staging-publiceringen.** Redo för separat beslut om nedanstående checkpoint-/integrationsplan. Lokala DB-/UX-resultat är accepterade; inget publiceringsgodkännande antas.

## Status och verifierad releasekedja

| Område | Status | Faktiskt verifierat / kvarstår |
| --- | --- | --- |
| Lokal kandidat och filurval | PASS | Befintlig `audit-packages/KAN-104-source`, gren `codex/KAN-97-withdrawal-space`, HEAD `984405a6ddf83cd125f5b9d0a02b632c1e2e09c3`. Ingen annan worktree för grenen. Före rapport: 16 ändrade tracked + 36 untracked, inget staged. |
| Origin | PASS, lokal begränsning | Fetch/push pekar på den lokala `audit-packages/KAN-78-source`, inte GitHub. Ingen upstream. Inga remotes ändrade, ingen fetch/push. |
| GitHub main / Production | PASS | Live GitHub main = kandidatens HEAD. `https://sololedger.vercel.app/` pekar på Vercel `dpl_2fPXCfpDijAV8JWhH1YbwbUvsetb`, READY, production/main, samma fulla SHA. KAN-78/104 är redan Production-bas; inga extra KAN-104-filer ska plockas in. |
| GitHub staging | BLOCKED för direkt integration | `5809094dd3ce808dba35986c65e772b842f0d0e1`. GitHub compare mot main: divergerat, main 32 commits framåt och staging 12 egna; merge-base `0bc166de68f7989f6a3d1483c062f4b4b1570629`. Varken vanlig fast-forward till kandidaten eller blind merge/cherry-pick på gamla staging ger ett granskat kodurval. |
| Vercel Staging | BLOCKED för entydig acceptansadress | Senaste branchdeploy för `staging`: `dpl_E645mVpWGtY6zfKnuzkkwXFmJDxU`, READY, SHA `5809094…`. Men `sololedger-git-staging-sololedger1.vercel.app` slår upp CLI-preview `dpl_9nEEL8RQkRqWumceFbB6FavB4FZF`, SHA `fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0`, KAN-80. Ingen av dem är KAN-97 eller aktuell main. |
| Projektets Preview-DB-mål | PASS för aktuell projektinställning | Vercel-projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`. Endast publik URL läst: Preview `NEXT_PUBLIC_SUPABASE_URL` = `https://fzxqiqenqjzhlyxxpvhg.supabase.co`. Ingen branchspecifik staging-override returnerades. Äldre deployments byggda miljö och servernycklars sammanhörighet är EJ VERIFIERAT. Inga hemlighetsvärden lästa. |
| Staging DB och migrationer | PASS för granskad bas | Projekt `sololedger-staging` / `fzxqiqenqjzhlyxxpvhg`, ACTIVE_HEALTHY, PostgreSQL 17.11. Live ledger har 52 versioner, exakt samma versionsmängd som repots 52 basfiler före KAN-97. Senast `20261019120000`. Inga mellanliggande migrationer behövs. Detta är versionsparitet och granskad beroendeyta, inte påstådd byteparitet för all historisk ledger-SQL. |
| KAN-75 | PASS | Alla 25 ingångar har rätt gate. Efter att exakt KAN-75-tillägg räknats bort matchar samtliga de granskade preimages; de två särskilda fakturaskydden kontrollerade separat. Helperns kropp matchar repot exakt och EXECUTE är endast postgres. |
| KAN-80 / KAN-93 | PASS | Standardbokningsprotokoll 1; idempotensbordets RLS och `(user_id,idempotency_key)`-PK/FK finns. Boknings-/raderingsdefinitioner bevarar beroendet. `close_year_atomic(integer)` MD5 `02476a94ba4eb7daf34a694c934ffb85`; borttagen KAN-75-gate ger granskad KAN-93-preimage `22ad704b7acfdf389e4aa89a04088a13`. |
| Delete-preimage | PASS | Live `delete_user_data_atomic(uuid)` MD5 **`38dfeadd82b8e20179829ea465c9a1b0`**, exakt kandidatens guard; SECURITY DEFINER, search_path public, EXECUTE postgres/service_role. Definitionen är läst, inte anropad. |
| KAN-62 och säkerhetsavvikelse | PASS som identifierade begränsningar | Båda versionerna `20261012123000` och `20261012153000` finns i Staging **och** testad repobas. Ingen extra replay krävs. KAN-62/65:s tidigare inventarie-hold kvarstår; ingen inventarieacceptans ingår. Separat äldre PUBLIC/anon EXECUTE på `get_next_ver_nr(uuid)` finns fortfarande; ingen ny KAN-97-regression eller rättning. |
| KAN-97 DB / Edge före release | PASS som ej installerat | Nya tabeller/RPC:er och migrationsversion saknas i Staging. `delete-user` v5 ACTIVE/verify_jwt=true matchar HEAD-källan och saknar de två nya borden. Kandidatens Edge-diff lägger endast till dessa två inventeringsposter. Edge-publicering krävs separat; en Vercel-deploy installerar inte den. |
| Lokal verifiering | PASS / FAIL enligt accepterat underlag | Senaste UX-slutkörning: full säker regression, domän/P1, TypeScript, riktad lint PASS. Tidigare isolerade DB-prov PASS; ingen omkörning här. Full lint fortfarande FAIL: 74 befintliga fel/6 varningar, inga nya. Äldre SQL-fixtur FAIL/25001 och undantas från urvalet. |
| Ny checkpoint / integration / Staging-prov | EJ KÖRT | Ingen staging i Git, commit, merge, migration, Edge/Vercel-deploy eller skrivande Staging-test. Nytt optimerat bygge för slutlig UX-kod återstår. CLI-dry-run/länkning och aktuell automatisk deploy-/byggspärr är EJ VERIFIERAT; klonen har ingen `supabase/config.toml`. |

## Exakt föreslaget checkpointurval: 37 filer

**Produktkod, 17 filer (inklusive Edge):**

```text
src/app/page.tsx
src/components/DashboardOverview.tsx
src/components/FAQ.tsx
src/components/OverviewCards.tsx
src/components/WithdrawalCard.tsx
src/components/WithdrawalSummary.tsx
src/hooks/useAuth.ts
src/hooks/useWithdrawal.ts
src/lib/adminDeleteDryRun.ts
src/lib/calculations.ts
src/lib/dashboardVat.ts
src/lib/sieVatHistory.ts
src/lib/vatReportService.ts
src/lib/withdrawalAssessment.ts
src/lib/withdrawalModel.ts
src/lib/withdrawalService.ts
supabase/functions/delete-user/index.ts
```

**Migration, paketkoppling och permanenta regressioner, 19 filer:**

```text
package.json
supabase/migrations/20261019200000_kan97_withdrawal_assessments.sql
scripts/check-db-regression-invariants.mjs
scripts/check-withdrawal-migration.mjs
scripts/test-accounting-load-ui.mjs
scripts/test-annual-tax.mjs
scripts/test-safe-withdrawal-presentation.tsx
scripts/test-standard-booking-browser.mjs
scripts/test-withdrawal-browser.mjs
scripts/test-withdrawal-conflicts.mjs
scripts/test-withdrawal-regressions.ts
scripts/test-withdrawal-transport.mjs
scripts/test-withdrawal.ts
tests/fixtures/annualTaxHarness.tsx
tests/fixtures/withdrawalConflictHarness.tsx
tests/fixtures/withdrawalFixtures.ts
tests/fixtures/withdrawalHarness.tsx
tests/fixtures/withdrawalMath.json
tests/fixtures/withdrawalMocks.ts
```

**Dokumentation, 1 fil:** `docs/reviews/KAN-97-STAGING-READINESS.md` (denna rapport, utan lokala DB-anslutningsuppgifter).

Migrationens oförändrade SHA-256: `d7e8065b8746d5a71a869738910cfc74d8f14bac64f7ac7511c26eb0ae56c619`.

## Inventerat men utanför checkpointet: 16 befintliga poster

**Dokumentation/state/handoff, 7:** `PROJECT_STATE.md`; `docs/reviews/KAN-97-HANDOFF.md`; `docs/reviews/KAN-97-critical-review.md`; `docs/reviews/KAN-97-local-verification.md`; `docs/reviews/KAN-97-P1-VERIFICATION.md`; `docs/reviews/KAN-97-DB-VERIFICATION.md`; `docs/reviews/KAN-97-UX-VERIFICATION.md`. De bevaras lokalt som underlag. Flera innehåller lokala DB-/maskinuppgifter och ska inte följa med oförändrade. Ett eventuellt publicerbart evidenssammandrag kräver separat urval/sanering; ingen sådan redigering gjord.

**Tillfälliga, maskinbundna verifieringsskript och gammal fixtur, 9:**

```text
scripts/diagnose-kan97-smoke.mjs
scripts/test-kan97-db-browser.mjs
scripts/test-kan97-db-concurrency.mjs
scripts/test-kan97-db-edges.mjs
scripts/test-kan97-db-functional.mjs
scripts/test-kan97-db-lifecycle.mjs
scripts/verify-kan97-lint.mjs
scripts/verify-kan97-local-db.mjs
tests/fixtures/withdrawal-local-db.sql
```

Inga av de nio krävs av produktimporter eller de tillagda paketkommandona. Den gamla SQL-fixturen är inte ett fungerande acceptansprov. Lokala bevis/testkopior, `coverage/`, `test-results/`, `.env*`, auth-state, credentials och genererad CLI-state är också utanför urvalet. Metadata/filnamn räcker för credentialfiler; deras innehåll har inte lästs eller hashats.

Ingen orelaterad kod-diff identifierad. Ändringarna i moms-/SIE-hjälpfiler är enbart ordval för uttagskortet, inte ny SIE-/momslogik. `useAuth` tar endast bort gamla procentnyckelns rensning. KAN-104:s profilgräns, KAN-78:s laddningsskydd och övriga domänmotorer är redan tracked i exakt samma Production-bas. Paketlås/AGENTS/NE-kod är oförändrade. Releaseurvalet kontrollerat för privata nycklar, JWT-liknande credentialvärden, DB-anslutningssträngar, lokala DB-uppgifter och live-hemlighetsvärden: inga träffar. Nya ekonomiska fixtures är syntetiska; inget importerat kundunderlag.

## Föreslagen ordning – varje godkännande är separat

1. **Godkännande A: exakt checkpointurval ovan och efterföljande lokal verifiering.** Kontrollera oförändrade källfingeravtryck, beroenden, riktade tester/säker regression och nytt optimerat bygge. Lägg endast de 37 namngivna filerna i ett granskat checkpoint; föreslagen committext `feat(KAN-97): add audited withdrawal assessments and shared annual tax estimate`. Ingen commit nu. Övriga 16 lokala poster lämnas kvar. Detta ger ett rent commiturval, **inte** en ren arbetskopia; ingen reset/radering eller hemlig ignore-förändring för att göra status grön.
2. **Godkännande B: integrationsmetod och exakt Staging-kod.** Rekommendation: Stagings slutliga kodträd ska vara byte-identiskt med checkpointet ovanpå verifierad Production-bas. Eftersom staging divergerat behövs en särskilt granskad integrationscommit med staging-HEAD och checkpoint som föräldrar, där slutträdet jämförs exakt med checkpointet. Då kan staging uppdateras utan force-push och gamla staging-experiment återinförs inte i kodträdet. Ingen blind merge; välj inte den smutsiga Desktop-kopian som releasekälla. Välj/motivera säker integrationsplats innan något checkout-/klonsteg. Redovisa slut-SHA/träd, eventuell borttagen staging-kod och diff före godkännande. Ingen ny gren/arbetskopia skapad här.
3. **Godkännande C: endast Staging-migrationen.** Återläs projektidentitet, ledger, funktioner/ACL och exakt delete-preimage omedelbart före körning; avbryt vid drift. Ordna kontrollerat testfönster utan samtidiga testskrivningar. Förbered etablerad officiell CLI-väg och dry-run som visar **endast** version `20261019200000`. Ingen baseline, include-all, history-repair eller omkörning av KAN-62/75/80/93. Verifiera exakt version, SQL, nya tabeller/FK/index/RLS/grants, RPC-signaturer och bevarad KAN-75-gate efteråt.
4. **Godkännande D: Staging `delete-user` Edge och apppublicering.** Publicera den granskade Edge-koden och verifiera version/källa/verify_jwt, dry-run-/count-/residualparitet. Publicera därefter endast godkänd Staging-commit. Bekräfta Preview-miljö och server/Auth-sammanhörighet utan att exponera nycklar, faktisk Vercel-SHA och beslutad acceptansadress. Ingen Production-aliasändring. Byggspärr/alias får inte kringgås eller ändras utan uttryckligt beslut.
5. **Godkännande E: skrivande, isolerad Staging-verifiering.** Förbered/granska Staging-begränsad harness med två dedikerade syntetiska Auth-användare; lokal-only DB-skript får inte bara pekas om. Prova riktig Auth→PostgREST→RPC→RLS: ägarisolering, nekade direkta/främmande skrivningar, grants, revisioner/CAS/40001, felindata/rollback och separata sessioner för spara/boka/läsa/årslås/radering. Kontrollera radering A via verklig Edge/Auth/Storage-kedja, nya bord/residualer noll och B bevarad; inga vanliga användare. Lokala DB-prov ersätter inte dessa hostade prov.
6. **Staging-ekonomi och UI:** flera års manuella försäljningar/kostnader, journal/resultat/NE, moms månad/kvartal/år med luckor, matchad/delmatchad 2650, skattekonto/betalningar/rättelser och noll dubbelräkning. Års-/kontobyte, två klienter, osparat/sparat reglage, preliminär/slutlig skatt, konflikt/läsfel utan gammalt positivt uttag. Ingen procentkontroll på NE; NE-rutor/årslås oförändrade. Kör tidigare boknings-/idempotens-/laddningsregressioner och säker smoke. KAN-62/65-inventarieflödet förblir utanför acceptansen/hold.
7. **Pontus manuell acceptans:** pröva språk, årsval, skattebeslut och flerårigt uttagsunderlag på exakt verifierad Staging-SHA. Dokumentera kvarvarande R6-hjälpbegränsning, lintskuld och eventuella fynd. Production övervägs först efter nytt separat godkännande av exakt commitset och separat DB-/Edge-plan.

## Säkert stopp och återgång

Avvikande identitet/guard/ledger/byggd SHA eller ägarisolering stoppar nästa steg. Misslyckad atomisk migration får inte antas ha gjort något: kontrollera rollback/ledger/schema. Efter **committad** migration är gammal app/alias inte en DB-rollback. Bevara revisioner och testbevis, stoppa användning av det nya flödet, återställ endast en uttryckligen godkänd Staging-app/Edge-version om den är kompatibel, och förbered vid behov en ny granskad framåtriktad reparationsmigration. Ingen DROP av bedömningshistorik, blind down-migration, historikreparation, force-push eller Production-fallback.

**Slutbeslut: BLOCKED för Staging-publiceringsgodkännande tills checkpointets exakta SHA, integrations-/aliasbeslut och körbar CLI-/deployplan har granskats.** DB-bas och filurval är verifierade; inget nytt P0/P1-produktfel konstaterat. Rapport/state är de enda ändringarna i detta steg. Efter rapport: 53 Git-poster (16 tracked/37 untracked), inget staged; gren/HEAD/origin oförändrade. Stanna och invänta ledarbeslut.
