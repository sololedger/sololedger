# SoloLedger Project State

Updated 2026-10-16: Pontus reports manual core acceptance PASS in isolated Preview (VER-90/91/92, full originals/journal and private PDF). Follow-up UI improvements implemented locally on the same isolated branch: accessible On/Off switch, group summary and jump to first group. Await new commit/Preview approval. Existing Preview unchanged; no hosted write or Production action.

## Current objective / next safe step

- KAN-86: optional exact-shared-attachment groups in transaction history. Default off. Neutral title, true date interval/count, full original details and one private attachment link; no semantic correction inference or custom labels.
- Next: Pontus reviews the local UI update and separately approves its six-file local commit plus a new isolated Staging Preview. Exact plan: docs/reviews/KAN-86-isolated-preview-plan.md. Existing accepted core Preview remains https://sololedger-8wtmqo7bh-sololedger1.vercel.app (dpl_3fZtvFLTCCAC6oqfg2yF1UNMcrNU). No commit/push/merge/deploy in this follow-up; no Production release or Jira Done.
- Pre-publication effective Preview build/runtime URL and public Auth-settings read verified against fzxqiqenqjzhlyxxpvhg. Existing sensitive server variable is configured/protected; its actual value was not validated or changed. Standalone deployment env read after build was unavailable; do not claim it passed. Exact source archive, explicit Preview command and preflight establish the publication target.
- Read-only before/after Staging verification PASS: VER-90/91/92, transaction/journal digest and same single owner-folder private attachment reference unchanged; existing PDF still present. No authenticated app login/private-document opening by Codex. Browser login page load PASS; anonymous HTTP redirects to Vercel SSO as expected.
- Jira KAN-86 re-read 2026-10-16: In Review / Pontus; earlier implementation comment 11626 retained. No Jira mutation in this local-only follow-up. Manual core PASS is leader-reported; final switch/summary/jump acceptance remains.

## Git / workspace

- Active managed worktree: C:/Users/Familjedator/.codex/worktrees/kan86-shared-attachments/sololedger_multi_user.
- Branch codex/KAN-86-shared-attachments, HEAD 6b72492a9ac07237ffaa7920e0353552bc79d1af, sole parent/base 8692f0566feab0978976143d51fd5d1ed91daa19. Exactly ten files committed. Remote main/staging last verified at first publication as 8692f05/5809094; not refreshed in this local UI follow-up. No push or merge.
- Committed scope: Architecture.md, PROJECT_STATE.md, package.json, src/components/TransactionTable.tsx, src/lib/transactionAttachmentGroups.ts, src/components/AttachmentTransactionGroup.tsx, scripts/test-transaction-attachment-groups.ts, scripts/test-transaction-attachment-ui.mjs, docs/reviews/KAN-86-local-verification.md, docs/reviews/KAN-86-isolated-preview-plan.md.
- Before this follow-up only PROJECT_STATE.md was dirty, containing the preserved publication result. Six current modified paths: PROJECT_STATE.md, src/components/TransactionTable.tsx, src/components/AttachmentTransactionGroup.tsx, scripts/test-transaction-attachment-ui.mjs, docs/reviews/KAN-86-local-verification.md, docs/reviews/KAN-86-isolated-preview-plan.md. Nothing staged; no new commit. First-publication receipts remain outside Git at C:/Users/Familjedator/.codex/visualizations/2026/10/16/01a14537-423f-7941-aded-acd29c8f9bad/kan86-preview-release.
- package-lock.json, accounting/RPC/loaders/reports/export, migrations and permanent AGENTS.md unchanged. No real env/Auth/credential files copied.
- Canonical Desktop checkout stays on local staging 11d8306 with its existing modified PROJECT_STATE.md and untracked audit-packages/ and scripts/create-kan63-staging-user.mjs. This follow-up changes only the isolated KAN-86 worktree; preserve canonical files, all ignored files and all other worktrees.

## Local UI follow-up verification (2026-10-16)

- PASS typecheck and test:history-groups. Expanded existing test:history-ui PASS in all eight synthetic scenarios (default, multiple, none, empty at 1440/390 px). No real env/Auth/DB or remote requests.
- Keyboard Space/Enter switch, default off, accessible name/description and 44 px touch target; one/multiple/zero group summaries; first group beyond two page boundaries; correct visible-layout focus/scroll, repeated jumps and both date orders. Show-more keeps every earlier row and SIE undo position. Existing originals, journals, private signing call, actions, search/category/sort pause, SIE undo and mobile overflow checks retained.
- PASS focused lint: group component/UI script clean; TransactionTable exactly the same 13 pre-existing errors and one warning as HEAD after normalizing diagnostic line numbers. No new findings; full lint is not green.
- Desktop/mobile control and mobile jump screenshots visually reviewed. No broad accounting/write E2E, full regression rerun, build or deployment for this UI-only follow-up. Earlier full safe regression below belongs to 6b72492.
- Accounting integration: only display controls, counts and DOM focus/scroll changed. No transaction sources, journals/RPCs, loaders, VAT/NE/dashboard/balances, payments/corrections/year-end or SIE import/export changes. Accounting write-E2E checklist is not applicable.

## Earlier implementation verification (6b72492)

- PASS npm run typecheck.
- PASS focused ESLint on both new product files and both new test scripts. Existing TransactionTable: baseline/current both 13 errors and one warning, identical normalized diagnostics; zero new findings. Do not claim full repo lint is green.
- PASS final npm run test:regression (exit 0): existing pure domain/SIE tests, new test:history-groups, new test:history-ui, public localhost smoke 2/2. Synthetic/dummy process configuration only, no login or data write.
- Playwright real component + real Tailwind at 1440/390 px: opt-in, full originals, journal amounts, exact signed-link call, individual action identity, SIE undo expansion, search/count/category, sorting, pagination and no mobile horizontal overflow. Both screenshots visually inspected.
- Initial public smoke runner stalled; its identified process tree was stopped. Bounded isolated retry passed, then final combined regression passed. An added SIE assertion initially matched the header range too; selector made exact and final suite passed.
- PASS git diff --check. No build, full-lint cleanup or broad accounting/write E2E run; UI-only scope does not change accounting paths.

## Boundaries / limitations

- Grouping only within loaded selected year. Search/category and amount/VER sort pause the new grouping with an explanation. Existing SIE undo remains its established separate behavior.
- Exact user ID + attachments bucket + raw nonblank reference; no description/batch/filename matching. Missing ownership never groups. Singleton rows unchanged.
- No group economic sums and no source/booked/correction/journal mutations. Common attachment uses existing Storage signing/RLS; no files moved, duplicated or deleted.
- No live DB/Storage write in implementation or Preview preparation. Read-only Staging inventory found existing dedicated E2E group VER-90/91/92 in 2026, dated 2026-10-17–12-31, with one existing owner-folder private PDF; ordinary rows exist. File content/authenticated opening not checked. Do not use Jessika/Production documents. SIE-undo VER-182 exists only in 2091, impractical for short manual acceptance; no new fixtures created. Main/staging remote heads verified unchanged at 8692f05/5809094. No new broad tests in preparation.
- Superseding manual evidence: Pontus reports core private-PDF/full-original acceptance PASS in the isolated Preview. The new local UI controls await a separately approved Preview and acceptance. Only the initial isolated Preview was published; no Production publication. No new broad test suite. Initial CLI --skip-domain flag was rejected locally (Preview does not support it); no deployment existed, flag alone removed, then one successful Preview submitted. All attempt receipts retained.

## Preserve other work

- KAN-84 Production correction accepted PASS by leader; no further bookkeeping authorized. Evidence remains in its separate kan84-adobe-oneoff worktree/state. Do not rerun it or alter its original 18 work files.
- KAN-74 implementation/checkpoint/release worktrees and all KAN-71/72/63 work remain untouched. This worktree inherited older KAN-74 checkpoint documentation from main; that inherited task state is superseded here, while its detailed docs remain unchanged.
- KAN-62/65 holds and older database reconstruction/grant concerns are outside this task. Never integrate all local staging into Production or infer that old canonical connection/status claims were refreshed here.
