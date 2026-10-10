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
- KAN-35 and KAN-47 are the next selected work areas. Start KAN-35 first, then
  KAN-47.
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

- No implementation is active after KAN-59 closeout.
- Next safe implementation focus after account handoff:
  1. KAN-35: complete-safe transaction-history loading.
  2. KAN-47: search, filtering, and sorting in `TransactionTable`.
  3. Keep KAN-10 separate unless explicitly approved.

## KAN-35 / KAN-47 Handoff

- Start read-only: read `AGENTS.md`, `PROJECT_STATE.md`,
  `PROJECT_ARCHIVE.md`, `Architecture.md`, current Jira issues KAN-35,
  KAN-47, and KAN-10, then verify Git status and relevant code.
- Relevant files likely include:
  `src/components/TransactionTable.tsx`, `src/app/page.tsx`,
  `src/hooks/useAccountingData.ts`, `src/lib/accountingService.ts`,
  `src/lib/supabaseClient.ts`, and `src/lib/supabaseFetchAll.ts`.
- KAN-35 risk: transaction history must not silently truncate at PostgREST or
  Supabase row limits. Preserve tenant isolation and do not rely on UI-only
  assumptions for completeness. Compare with KAN-33 fetch-all patterns.
- KAN-47 risk: search/filter/sort must be presentation/read behavior only.
  Do not mutate bookkeeping data. Preserve correction/original relations,
  invoice/payment chains, system transaction protections, and user isolation.
- KAN-10 is related enough to be noticed during TransactionTable/history work,
  but it is not part of KAN-35/KAN-47 unless Pontus explicitly adds it.

## Git / Local Files

- Production `main` and `origin/main` were verified at `dc9efae` after KAN-59
  release. This handoff documentation commit is local-only unless Pontus later
  approves a push.
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
