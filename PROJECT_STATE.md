# SoloLedger Project State

Last updated: 2026-10-10

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Production application URL: `https://sololedger.vercel.app`
- Current Production release commit: `dc9efae6e288cbc6085b09b6a5dfc60fc4cc1ca7`
  (`KAN-59 make header navigation adaptive`).
- Current Production Vercel deployment:
  `dpl_7QN9QZbudAtKVvJUUPUC6TEroDt7`,
  `sololedger-1z3ya3l3q-sololedger1.vercel.app`, status `Ready`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `dc9efae`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; current migration head
  remains `20261009220552`.
- Supabase staging/E2E ref: `fzxqiqenqjzhlyxxpvhg` (`sololedger-staging`).
- Push to GitHub `main` auto-deploys Vercel Production. Treat any future push
  to `main` as a production deploy requiring explicit approval.

## Durable Truth

- `AGENTS.md` is the permanent rulebook.
- `PROJECT_STATE.md` is the current handoff/checkpoint.
- `PROJECT_ARCHIVE.md` holds compact completed history/evidence.
- `Architecture.md` is the current technical map.
- Jira is the work queue/status/backlog, not source of truth for code or DB.
- Chat history is not sufficient project truth for a new session.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Vercel fast path: team `sololedger1`, project `sololedger`, Production alias
  `sololedger.vercel.app`.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified on 2026-10-10:

- KAN-59 is `Done`, assigned to Pontus. Production release and Pontus manual
  Production acceptance are complete. Evidence is archived in
  `PROJECT_ARCHIVE.md`.
- KAN-56, KAN-57, KAN-58, and KAN-55 are `Done`.
- KAN-35 and KAN-47 are locally implemented and manually accepted by Pontus.
  They await a shared release review and explicit Production approval.
- KAN-10 is a separate nearby correction bug. Do not fix, refactor into, or
  silently change KAN-10 behavior while working on KAN-35/KAN-47 unless Pontus
  explicitly selects that scope.
- Other open items from the retained snapshot include KAN-9, KAN-11, KAN-24,
  KAN-25, KAN-34, KAN-44, KAN-48, and KAN-53. Do not start them unless Pontus
  selects the work.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- Full repo lint still has older unrelated debt.

## Current Active Work

- KAN-35 is locally committed in `48eab9e` and manually verified by Pontus.
  Production does not contain KAN-35 yet.
- KAN-35 implementation summary: transaction history now loads through
  complete-safe `fetchAllRows`/chunked journal-row loading, verifies exact
  counts, preserves user/year scope, fails closed on incomplete history, and
  only shows history after a verified complete status for the currently selected
  year. Older overlapping loads and refreshes cannot overwrite newer history.
- KAN-47 is locally committed in `dd5dd4c` and manually accepted by Pontus.
  Transaction history now has compact search, filter chips, sorting, show-more
  behavior, category/source regression coverage, and amount/date search.
- Latest KAN-47 local verification on 2026-10-10:
  `node scripts/test-transaction-history-filters.ts`, `npm run typecheck`,
  `npm run test`, `npm run test:e2e:smoke`, and `git diff --check` passed.
- Full staging/write E2E is not verified for this release candidate; previous
  full E2E attempts stopped fail-closed when staging credentials/env were not
  loaded.
- KAN-35 and KAN-47 await a shared release review and an explicit Production
  approval before any GitHub `main` push. A push to GitHub `main` auto-deploys
  Vercel Production.
- KAN-10 remains separate unless explicitly approved.

## KAN-35 / KAN-47 Handoff

- KAN-35 local checkpoint includes:
  `src/lib/transactionHistoryLoader.ts`, `src/lib/transactionHistoryState.ts`,
  `src/hooks/useAccountingData.ts`, `src/app/page.tsx`,
  `scripts/test-transaction-history-loader.ts`,
  `scripts/test-transaction-history-state.ts`, and `package.json`.
- KAN-47 local checkpoint includes:
  `src/components/TransactionTable.tsx`,
  `src/lib/transactionHistoryFilters.ts`,
  `scripts/test-transaction-history-filters.ts`, and `package.json`.
- KAN-47 remains presentation/read behavior only. It does not mutate
  bookkeeping data. Preserve correction/original relations, invoice/payment
  chains, system transaction protections, and user isolation in any follow-up.
- KAN-10 is related enough to be noticed during TransactionTable/history work,
  but it is not part of KAN-35/KAN-47 unless Pontus explicitly adds it.

## Git / Local Files

- Production `main` and `origin/main` were verified at `dc9efae` after KAN-59
  release. Local `main` now has KAN-35 and KAN-47 checkpoint commits plus this
  project-state checkpoint; they are local-only unless Pontus later approves a
  push.
- `audit-packages/` remains untracked and unrelated; do not touch or commit it.
- Local git-ignored files hold staging E2E env/auth state. Do not copy
  credentials into Git, Jira, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`, or chat.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are tracked as
  an immutable historical snapshot.

## Local Test Environment

- Use npm.
- Relevant low-risk UI checks: `npm run typecheck`, `npm run test:e2e:smoke`,
  focused component/Playwright checks when useful, and `git diff --check`.
- For complete-safe data loading or security-sensitive changes, add/run focused
  regression tests around fetch completeness, tenant isolation, and no missing
  rows.
- Staging/write E2E may run only against verified staging
  `fzxqiqenqjzhlyxxpvhg` with the dedicated Playwright user and local
  git-ignored credentials. Never run destructive/write E2E against Production.
- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.

## Approval Boundaries

- No push, deploy, live Supabase write, migration, data repair, Jira mutation,
  or Production-authenticated testing without explicit approval for that step.
- Any DB/RPC/schema/RLS/grant/index/Edge change requires fresh source-of-truth
  inspection and explicit approval.
- Any KAN-10 change requires explicit scope approval.
