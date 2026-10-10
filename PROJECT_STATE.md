# SoloLedger Project State

Last updated: 2026-10-10

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- GitHub repository: `sololedger/sololedger`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- `origin/main` and local `main` are verified at
  `0f4e316f0db8f94942f229c6665a5875e3451d6b`.
- Production application URL: `https://sololedger.vercel.app`
- Current Production release commit:
  `0f4e316f0db8f94942f229c6665a5875e3451d6b`
  (`docs: update KAN-35 KAN-47 release checkpoint`).
- Current Production Vercel deployment:
  `dpl_7ZbZuwLUavdQJReTvgNWJBzB5WPm`, status `Ready`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `0f4e316`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; current migration head
  remains `20261009220552`.
- Supabase staging/E2E ref: `fzxqiqenqjzhlyxxpvhg` (`sololedger-staging`).
- Push to GitHub `main` auto-deploys Vercel Production. Treat any future push
  to `main` as a production deploy requiring explicit approval.

## Durable Truth

- `AGENTS.md` is the permanent rulebook and controls safety boundaries.
- `PROJECT_STATE.md` is the current handoff/checkpoint.
- `PROJECT_ARCHIVE.md` holds compact completed history/evidence.
- `Architecture.md` is the current technical map.
- Jira is the work queue/status/backlog, not source of truth for code or DB.
- Chat history is not sufficient project truth for a new session.

## External Connections

Verified after the Codex account change on 2026-10-10:

- GitHub read-only Git access to `sololedger/sololedger` worked via remote
  fetch metadata. GitHub CLI was not installed in this local environment, so
  account-level GitHub permission was not verified through `gh`.
- Supabase CLI could list both Production `wbaxmuvudpnkvuliicuy` and Staging
  `fzxqiqenqjzhlyxxpvhg` as `ACTIVE_HEALTHY`.
- Vercel CLI could read team/scope `sololedger1`, project `sololedger`, and
  the Production deployment.
- Atlassian/Jira connection worked for cloud ID
  `42c6216d-73c5-4777-a644-c41ef9bc6a1a`, project `KAN` / `Sololedger`.
- These checks prove read-only access paths. They do not by themselves prove
  write permission, and writes still require Pontus explicit approval.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified on 2026-10-10 after KAN-35/KAN-47 release:

- KAN-35 is `Done`. It was Production-released in `0f4e316` and manually
  accepted by Pontus in Production on 2026-10-10.
- KAN-47 is `Done`. It was Production-released in `0f4e316` and manually
  accepted by Pontus in Production on 2026-10-10.
- KAN-60 is a separate `Bug`, priority `Medium`, status `To Do`: historically
  linked customer invoices are missing from the `Kundfakturor` filter.
- KAN-60 concerns historical links between manual vouchers and customer
  invoices from earlier KAN-51 work. Preserve the distinction from ordinary
  `customer_invoice` transactions. No KAN-60 implementation, source change,
  backfill, new bookkeeping, or data repair is approved in this checkpoint.
- KAN-59, KAN-56, KAN-57, KAN-58, and KAN-55 are `Done`.
- Other open items from the retained snapshot include KAN-9, KAN-11, KAN-24,
  KAN-25, KAN-34, KAN-44, KAN-48, and KAN-53. Do not start them unless Pontus
  selects the work.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- Full repo lint still has older unrelated debt.

## Current Active Work

- No implementation task is active after the account-change handoff.
- Next safe step is to wait for Pontus to select the next Jira/task scope.
- KAN-60 is known future work only; do not begin it without explicit approval.

## Git / Local Files

- This checkpoint updates handoff documentation only.
- After this checkpoint commit, local `main` is expected to be one commit ahead
  of `origin/main` until Pontus explicitly approves a push.
- `audit-packages/` remains untracked and unrelated; do not touch, stage, or
  commit it without explicit approval.
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
- Full Staging-write-E2E is not verified for the KAN-35/KAN-47 release.
- Real browser E2E with over 1000 transactions is not verified.
- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.

## Approval Boundaries

- Pontus approves new tasks and risky actions.
- No push, deploy, live Supabase write, migration, data repair, Jira mutation,
  or Production-authenticated testing without explicit approval for that step.
- Any DB/RPC/schema/RLS/grant/index/Edge change requires fresh source-of-truth
  inspection and explicit approval.
- Local development and test configuration must not be redirected to Production.
- Jira is used for planning, status, and handoff; it is not source of truth for
  code, database implementation, accounting behavior, or live Supabase state.
