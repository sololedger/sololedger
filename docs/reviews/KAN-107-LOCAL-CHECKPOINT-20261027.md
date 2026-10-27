# KAN-107 – avgränsad lokal checkpoint

2026-10-27. Pontus uttryckliga GO: lokal checkpoint på `codex/KAN-107-withdrawal-guidance`, därefter endast läsande kontroll av GitHub main/staging och Vercels Staging-bas. Ingen push, merge, deployment, databas- eller Jira-ändring.

## Kandidat

Produktkälla är denna kopia, lokalt benämnd L (`audit-packages/KAN-100-app-release-20261024`). Förälder: `e4f35502724c83c6e8493fadb61dc8a09035e3d1`, KAN-102:s publicerade kodbas. En enda avgränsad KAN-107-commit avses med meddelandet `feat(KAN-107): simplify withdrawal controls and contextual help`.

Produkt- och testfilerna är samma lokalt godkända kandidat som i [implementationsrapporten](KAN-107-LOCAL-IMPLEMENTATION-20261027.md) och [kompletterande verifieringen](KAN-107-LOCAL-VERIFICATION-20261027.md). Auth-smoke 3/3 PASS separat och i hela sammanhängande `npm run test:regression`, exit 0. Riktade prov, lint, typecheck och syntetiskt produktbygge PASS. Inga nya produktändringar efter denna verifiering. Full regression behöver inte upprepas för checkpointens rena dokumentationsändring.

Indexkontrollen hittade extra tomrader sist i nya `WithdrawalPanel.tsx`; endast dessa togs bort. Ingen körbar kod ändrad. Typkontroll körs igen inför commit. Index ska kontrolleras för exakt fillista, otillåtna genererade/säkerhetskänsliga sökvägar och vanliga hemlighetsformat.

## Exakt scope: 19 filer

```text
src/components/WithdrawalCard.tsx
src/components/WithdrawalPanel.tsx
src/components/WithdrawalSummary.tsx
src/lib/withdrawalPresentation.ts
src/lib/withdrawalHelp.ts
src/lib/helpContent.ts
scripts/test-annual-tax.mjs
scripts/test-auth-focus.mjs
scripts/test-help-center.ts
scripts/test-withdrawal-browser.mjs
scripts/test-withdrawal-conflicts.mjs
scripts/test-withdrawal-guidance.mjs
scripts/test-withdrawal-presentation.ts
tests/fixtures/withdrawalMocks.ts
package.json
docs/HELP-CONTENT.md
docs/reviews/KAN-107-LOCAL-IMPLEMENTATION-20261027.md
docs/reviews/KAN-107-LOCAL-VERIFICATION-20261027.md
docs/reviews/KAN-107-LOCAL-CHECKPOINT-20261027.md
```

Oförändrad uttagsmodell, bedömning, hook, service och databas. Samma sparväg, revisions-/signaturkonflikter och användargränser. `package.json` kopplar bara in två nya prov; inga beroenden/lockfiler ändras.

## Utanför commit, bevarat

`PROJECT_STATE.md` och `PROJECT_ARCHIVE.md` har blandade äldre lokala ändringar och ingår inte. Aktuell STATE uppdateras endast lokalt efter checkpointen. Ingen historik flyttas/rensas: äldre KAN-102/KAN-117-material och den aktiva KAN-107-granskningen behövs fortsatt. `AGENTS.md`, rootens filer, alla gamla rapporter/fixturer samt `docs/reviews/kan107-20261027/` med prototyper och granskningsbilder lämnas kvar utanför index. Inga env-/authfiler, nycklar, `.next`, `coverage`, `test-results`, `node_modules`, migrationsfiler eller andra genererade resultat ska ingå.

Arbetskopians origin pekar på en lokal äldre checkout, inte GitHub. Den ska inte användas för publicering. Ingen remote ändras i detta steg. Full repo-status blir avsiktligt inte ren eftersom äldre material ska bevaras. KAN-107:s avsedda produktdiff ska däremot vara committad och index tomt efter commit.

## Nästa säkra steg

Efter commit: rapportera faktisk SHA och 19 ingående filer, kontrollera GitHub main/staging samt faktiskt Staging-alias/deployment läsande. Dokumentera resultatet separat innan Pontus beslutar om exakt Staging-GO. Ingen fjärrskrivning ingår i checkpointen.
