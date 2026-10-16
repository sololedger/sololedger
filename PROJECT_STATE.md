# SoloLedger Project State

Updated 2026-10-17: Pontus approved a local synthetic demonstration, the isolated local commit (twelve reviewed files plus necessary demo code), and one separate Vercel Preview against Staging. Local demo PASS at desktop/mobile. Publishing this exact thirteen-file candidate; no push/merge, Production action or hosted data/configuration write approved.

## Current objective / next safe step

- KAN-87: readable KAN-84 Adobe presentation, positive refunds, neutral reclassifications, searchable aliases and preserved originals. Implementation/evidence: docs/reviews/KAN-87-local-verification.md.
- NEXT: Execute approved local commit and isolated Preview, verify exact source/Ready/safe Staging binding, then check the existing E2E VER-90–92 group/private PDF without bookkeeping writes. Stop for Pontus manual acceptance afterwards. Local synthetic demo at http://127.0.0.1:3097 covers the positive KAN-87 case; no new hosted fixture is approved or needed for the accepted split plan.
- GitHub main verified read-only this session at 7467143e3221b012b3d0e49397e2b0c8d3b6f445; remote staging 5809094dd3ce808dba35986c65e772b842f0d0e1. KAN-86 Production PASS is leader-reported; no deployment re-audit performed.
- The inherited KAN-86 state was stale relative to current main. Its detailed evidence remains in docs/reviews/KAN-86-*.md, Git history and the preserved KAN-86 worktree; this file now describes this isolated KAN-87 scope.

## Workspace / uncommitted scope

- Worktree: C:/Users/Familjedator/.codex/worktrees/kan87-history-presentation/sololedger_multi_user.
- Branch codex/KAN-87-history-presentation. HEAD/base 7467143. No new commits, nothing staged.
- Product: new src/lib/transactionHistoryPresentation.ts and src/components/TransactionPresentation.tsx; changed TransactionTable.tsx, AttachmentTransactionGroup.tsx and transactionHistoryFilters.ts.
- Verification: new scripts/fixtures/kan84-presentation.ts, scripts/test-transaction-history-presentation.ts and scripts/test-transaction-presentation-ui.mjs; package.json adds both tests to safe regression.
- Documentation: Architecture.md, PROJECT_STATE.md and docs/reviews/KAN-87-local-verification.md. These twelve reviewed files plus new scripts/kan87-demo.mjs are the complete approved thirteen-file commit scope. Demo script reuses the tested synthetic entry point; no src/route/import/product-build entry is added.
- AGENTS.md, PROJECT_ARCHIVE.md, package-lock.json, environment/auth files, database/migrations, accounting/report engines, loaders, bank history and export unchanged. Synthetic screenshots live only in ignored test-results/history-presentation/.
- Existing installed dependencies reused via local node_modules junction to the KAN-86 worktree. No installation or lockfile change.

## Result / limits

- Four verified reclassifications: short title, amber Bokföringsrättelse, neutral Omfört 285 kr, Ingen ny bankbetalning and original VER reference. Not treated as full KORRVER reversals.
- Five verified refunds: +57 kr green and Inbetalning till bank. isIncome and all accounting data unchanged.
- Verified October payment and five EU service-month labels. Adobe search finds all 19 relevant entries in the synthetic full-year/all-category fixture, retaining original text/VER/accounts.
- Full original description in native disclosure; same metadata/component for desktop, mobile and expanded groups. Existing action identities, signed attachments, grouping/search pause and originals preserved.
- Narrow fail-closed 2026 KAN-84 contract requires complete 15-member batch plus four originals, same explicit owner/private PDF, technical categories/source, exact journal structure/VER/dates/amounts/rates and corroborated generator format. No real identifiers in code/fixtures. Unknown/incomplete/corrected packages retain original display.
- Earlier analysis verified live journal/account/report behavior read-only. This implementation reused the saved snapshot locally and matched exactly 15 entries; no fresh live DB/Storage call.

## Verification

- PASS typecheck and focused lint on all changed/new files except TransactionTable, which has identical normalized baseline/current 13 errors + one warning. Full lint is not green; no new diagnostic.
- PASS new pure presentation/search/provenance/immutability/economic checks; actual desktop/mobile/group component tests at 1440/390, including signs/classes/originals/private signing/actions/no mutation/no remote calls/no mobile overflow. Screenshots visually reviewed.
- PASS existing domain, attachment-group and all eight attachment-UI scenarios during safe regression.
- Standard npm run test:regression exited 1 only at public-smoke startup because Turbopack rejects the external dependency junction. One bounded retry on local next dev --webpack ran the same public-auth Chromium tests: 2/2 PASS. All test components pass; initial wrapper exit must not be reported as zero. No configuration/source change for that environment workaround.
- No build, full-lint cleanup or broad accounting/write E2E. Display-only integration map and accounting-checklist non-applicability documented in review report.
- Jira handoff verified: KAN-87 In Review (transition 31), assigned to Pontus using Jira-verified account ID. Description updated and acceptance/limitation comment 11627 added. Not Done.

## Isolated Preview preparation (no publication)

- Current GitHub main still 7467143; no additional commits/staging merge. Exact twelve-path scope reviewed; product/test fingerprint unchanged: 4963de36e2eb8f7d54abbc3ba23da2c5213e19027d4e0fb236da5e407fd3bb49. Preparation edits only this state and the existing review report; no thirteenth delivery file.
- Existing Vercel project/scope verified read-only, Next.js/Node 24/default build and install, existing SSO protection. Individually allowlisted Preview public URL/key verify Staging fzxqiqenqjzhlyxxpvhg and Auth settings 200. Server-key value/binding not inspected. Automatic review rejected a full env pull; safe metadata/public-only alternative succeeded. No configuration change.
- Read-only Staging over TLS/session-continuous pooler: two synthetic KAN-84 owners (20/21 transactions) both give zero helper matches because VER/date/original category differ. Existing dedicated E2E VER-90/91/92/private test file still available for grouping/auth regression, not positive KAN-87 display acceptance. No Production read/copy or hosted write in preparation.
- Clean source candidate/manifest and dry upload inventory live outside Git in C:/Users/Familjedator/.codex/visualizations/2026/10/16/01a146e5-91e8-7401-839c-6aa74b5355ef/kan87-preview-preparation. Excludes all env/auth/audit/ignored state and dependency links. Not a commit/deployment. Fresh archive must be made from future approved commit.
- Local dependency-junction cause is excluded from source delivery; use cloud install from unchanged lockfile, no prebuilt local output. Actual Preview build/runtime still unverified. No broad tests rerun. Jira re-read In Review / Pontus, unchanged.

## Preserve other work / retention

- Canonical Desktop checkout unchanged: local staging 11d8306, modified PROJECT_STATE.md, untracked audit-packages/ and scripts/create-kan63-staging-user.mjs.
- KAN-86 worktree unchanged at 7467143 with its existing modified PROJECT_STATE.md.
- KAN-84 worktree unchanged at 9756abc with pre-existing package.json and untracked implementation/SQL/review files. Do not rerun its accepted Production bookkeeping.
- All older worktrees, credentials, fixtures and evidence preserved. KAN-62/65 holds and Staging-only history stay outside KAN-87.
- Retention: replace inherited stale task state here with this active scope; no unrelated archive rewrite or cleanup. No permanent rule change.
