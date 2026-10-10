# SoloLedger Project State

Last updated: 2026-10-10

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- GitHub repository: `sololedger/sololedger`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- `origin/main` is verified at
  `0f4e316f0db8f94942f229c6665a5875e3451d6b`.
- Local `main` has unpushed local checkpoint commits above `origin/main`.
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

- Local development safety has been tightened so plain `npm run dev` runs a
  fail-closed preflight before Next.js starts.
- The local dev preflight requires verified Staging Supabase
  `fzxqiqenqjzhlyxxpvhg` and refuses Production
  `wbaxmuvudpnkvuliicuy`.
- A git-ignored `.env.local` supplies local dev Staging Supabase values from
  the approved local E2E configuration. Do not commit env files or credentials.
- Staging/Production live schema, RPC, RLS, and grant parity is not approved:
  drift has been observed and must be resolved or explicitly accepted before
  Production-representative Staging-write-E2E.
- Staging schema drift root cause is verified: Staging was built from the
  active CLI baseline, while Production already had earlier manually applied
  live schema effects before the migration ledger was aligned. Normalized
  relevant RPC and RLS policy definitions matched, but constraints, numeric
  column types, legacy FK cascade behavior, RLS-enable status, the `ensure_rls`
  event trigger, and grants differed.
- Read-only aggregated Staging preflight on 2026-10-10 found zero duplicate
  groups for `closed_years(user_id, year)` and
  `import_batches(user_id, file_hash)`, zero orphan rows for the targeted FK
  rebuilds, zero non-lossless values for the targeted numeric type changes, and
  no dependency rows blocking the targeted missing unique constraints or FK
  replacements.
- Draft-only Staging repair proposal:
  `supabase/repair_scripts/20261010_staging_schema_parity_repair_DRAFT.sql`.
  It is review-only, Staging-only, rollback-by-default, and has not been
  executed. A 2026-10-10 independent review found NO-GO because data preflight
  was not race-safe and postchecks were only comments; the local draft now adds
  deterministic table locks before data checks, schema-qualified constraint
  guards, and a fail-closed target-attestation marker.
- Draft-only read-only postcheck:
  `supabase/repair_scripts/20261010_staging_schema_parity_postcheck_READ_ONLY.sql`.
  It has not been run. It is intended to verify numeric columns, unique/FK
  definitions, RLS, `ensure_rls`, table grants, RPC grants, and data-safety
  counts after a future explicitly approved Staging repair commit.
- Draft-only baseline notes:
  `supabase/repair_scripts/20261010_staging_schema_parity_baseline_notes.md`.
  The active CLI baseline has not been changed.
- Direct Staging DB host `db.fzxqiqenqjzhlyxxpvhg.supabase.co:5432` was blocked
  from this local environment by DNS/direct-host resolution or IPv6/network
  access before authentication. Production was not used as fallback.
- Staging Shared Session Pooler was configured in the local git-ignored
  `PGPASSFILE` `C:\SoloLedger\LocalTest\pgpass_staging_supabase.conf` with
  host `aws-1-eu-central-1.pooler.supabase.com`, port `5432`, database
  `postgres`, and user `postgres.fzxqiqenqjzhlyxxpvhg`. No secret value is in
  Git or this document.
- Read-only `psql` verification through the Session Pooler succeeded with TLS,
  database `postgres`, server port `5432`, and explicit transaction-local
  session state preserved on the same psql connection. The live database role
  resolved to `postgres`; schema/database `CREATE` privileges appeared present,
  but `rolsuper` was `false`.
- Remaining blocker: the current Staging repair draft includes `ensure_rls`
  event trigger DDL. PostgreSQL event trigger creation normally requires
  superuser capability, so the Session Pooler path is not yet proven sufficient
  for the full repair. No repair SQL, migration, DDL, data write, postcheck, or
  write-E2E has been run.
- Read-only metadata inspection on Staging through the verified Session Pooler
  found that the target tables and relevant functions are owned by `postgres`,
  `rls_auto_enable()` exists and returns `event_trigger`, `ensure_rls` is still
  absent, and the active role is not superuser. This supports splitting the
  repair so the other schema/grant changes remain atomic while `ensure_rls`
  stays a separately unresolved parity item.
- Partial draft prepared:
  `supabase/repair_scripts/20261010_staging_schema_parity_repair_without_event_trigger_DRAFT.sql`.
  It keeps the target marker, advisory lock, deterministic table locks,
  race-safe data preflight, numeric changes, unique constraints, FK rebuilds,
  RLS-enable changes for existing drifted tables, and grants from the reviewed
  draft, but intentionally does not create/drop/modify `ensure_rls`. The full
  read-only postcheck must still be run after any future partial repair; a
  missing `ensure_rls` must remain `FAIL` and must not be treated as full
  schema parity.
- Remaining risk: ordinary SQL cannot independently prove the Supabase project
  ref, so any future execution still requires separate explicit target
  verification for Staging `fzxqiqenqjzhlyxxpvhg` before the required session
  marker is set.
- Staging-write-E2E remains paused / NO-GO until Staging schema parity is
  repaired, postchecked, and separately approved.
- KAN-60 is known future work only; do not begin it without explicit approval.

## Git / Local Files

- Local `main` is expected to remain ahead of `origin/main` until Pontus
  explicitly approves a push.
- `audit-packages/` remains untracked and unrelated; do not touch, stage, or
  commit it without explicit approval.
- Local git-ignored files hold staging E2E env/auth state. Do not copy
  credentials into Git, Jira, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`, or chat.
- Local git-ignored `.env.local` now holds safe local dev defaults for Staging
  and placeholder local Stripe values to avoid falling back to Production Stripe
  secrets during ordinary local dev.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are tracked as
  an immutable historical snapshot.

## Local Test Environment

- Use npm.
- Relevant low-risk UI checks: `npm run typecheck`, `npm run test:e2e:smoke`,
  focused component/Playwright checks when useful, and `git diff --check`.
- For complete-safe data loading or security-sensitive changes, add/run focused
  regression tests around fetch completeness, tenant isolation, and no missing
  rows.
- Plain `npm run dev` must pass the local dev preflight before Next.js starts.
  If the effective Supabase URL is missing, unknown, or Production, startup
  must fail closed.
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
- Next safe Staging-repair step, if Pontus approves it later: run the partial
  draft only in a separate explicitly approved Staging-only execution pass, with
  verified Session Pooler session continuity, out-of-band target verification,
  session marker, fresh preflight, `ROLLBACK` replaced by `COMMIT` only in the
  approved execution input, and no automatic retry. Then run the full read-only
  postcheck; all non-event-trigger checks must pass, while `ensure_rls` remains
  a separately tracked blocker until an approved Supabase-supported method is
  used for that event trigger.
- Local development and test configuration must not be redirected to Production.
- Jira is used for planning, status, and handoff; it is not source of truth for
  code, database implementation, accounting behavior, or live Supabase state.
