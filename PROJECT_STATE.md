# SoloLedger Project State

Updated 2026-10-16: Pontus explicitly approved the exact ten-file local KAN-86 commit and separate Vercel Preview against Staging, without push/merge. Publication execution in progress; no Production or hosted data writes authorized.

## Current objective / next safe step

- KAN-86: optional exact-shared-attachment groups in transaction history. Default off. Neutral title, true date interval/count, full original details and one private attachment link; no semantic correction inference or custom labels.
- Authorized next: execute docs/reviews/KAN-86-isolated-preview-plan.md. Exact ten-file commit on 8692f05, then a clean source copy and separate Vercel Preview. Pre-publication default Preview build/runtime URL and public-key read verified against Staging fzxqiqenqjzhlyxxpvhg; existing sensitive server key remains protected/configured. No push/merge or moving main/staging; no data writes. Record final commit/deployment result after execution; no Production release.
- Jira KAN-86 verified In Review, assigned to Pontus; implementation/verification/acceptance comment 11626 added. Pontus acceptance remains; do not set Done automatically.

## Git / workspace

- Active managed worktree: C:/Users/Familjedator/.codex/worktrees/kan86-shared-attachments/sololedger_multi_user.
- Branch codex/KAN-86-shared-attachments, HEAD/base 8692f0566feab0978976143d51fd5d1ed91daa19 (origin/main verified in the preceding read-only analysis). No new commit.
- Modified tracked: Architecture.md, PROJECT_STATE.md, package.json, src/components/TransactionTable.tsx.
- New: src/lib/transactionAttachmentGroups.ts, src/components/AttachmentTransactionGroup.tsx, scripts/test-transaction-attachment-groups.ts, scripts/test-transaction-attachment-ui.mjs, docs/reviews/KAN-86-local-verification.md, docs/reviews/KAN-86-isolated-preview-plan.md.
- package-lock.json, accounting/RPC/loaders/reports/export, migrations and permanent AGENTS.md unchanged. No real env/Auth/credential files copied.
- Canonical Desktop checkout stays on local staging 11d8306. Its PROJECT_STATE.md receives a KAN-86 navigation update only. Preserve pre-existing untracked audit-packages/ and scripts/create-kan63-staging-user.mjs, all ignored files and all other worktrees.

## Verification

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
- Real authenticated private-PDF and full application acceptance remain Pontus's step; no Staging/Production publication occurred.

## Preserve other work

- KAN-84 Production correction accepted PASS by leader; no further bookkeeping authorized. Evidence remains in its separate kan84-adobe-oneoff worktree/state. Do not rerun it or alter its original 18 work files.
- KAN-74 implementation/checkpoint/release worktrees and all KAN-71/72/63 work remain untouched. This worktree inherited older KAN-74 checkpoint documentation from main; that inherited task state is superseded here, while its detailed docs remain unchanged.
- KAN-62/65 holds and older database reconstruction/grant concerns are outside this task. Never integrate all local staging into Production or infer that old canonical connection/status claims were refreshed here.
