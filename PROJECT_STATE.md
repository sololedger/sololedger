# SoloLedger Project State

Last updated: 2026-10-11

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- GitHub repository: `sololedger/sololedger`
- Current local branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- `main` = Production.
- `staging` = permanent Staging/Preview test branch.
- `origin/main`, `origin/staging`, and local `main` are currently verified at:
  `609b902756046a467a241f497b38feb4339ac1a9`
  (`KAN-48 fix invoice filter search`).
- Production application URL: `https://sololedger.vercel.app`
- Current Production Vercel deployment:
  `dpl_BgMR9sNoQCrRqbJmd5qgthRhhpL9`,
  `https://sololedger-17gsffhcj-sololedger1.vercel.app`, status `Ready`,
  aliased to `https://sololedger.vercel.app`; build verified branch `main`,
  commit `609b902`.
- Permanent Staging URL:
  `https://sololedger-git-staging-sololedger1.vercel.app`
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; migration head remains
  `20261009220552`.
- Supabase Staging/E2E ref: `fzxqiqenqjzhlyxxpvhg` (`sololedger-staging`).

## Durable Truth

- `AGENTS.md` is the permanent rulebook and controls safety boundaries.
- `PROJECT_STATE.md` is the current handoff/checkpoint.
- `PROJECT_ARCHIVE.md` holds compact completed history/evidence.
- `Architecture.md` is the current technical map.
- Jira is the work queue/status/backlog, not source of truth for code or DB.
- Chat history is not sufficient project truth for a new session.

## Permanent Daily Workflow

- Develop new Jira/product work on a short work branch, normally
  `codex/KAN-xx-short-name`, not directly on `main`.
- Keep one Jira scope per branch unless Pontus explicitly approves batching.
- When local checks pass and Pontus approves Staging publication, integrate the
  exact branch/commit set into `staging` and push only `staging`.
- Pontus tests in Staging. Underkända or unfinished changes must be fixed on
  the work branch or removed/reverted from `staging`; they must not ride along
  to Production.
- Production release requires explicit Pontus approval for the exact commit or
  commit set. Push only `main`, verify Vercel Production, then keep `staging`
  and `main` synchronized again unless new work is intentionally staged.
- For parallel Jira issues, keep separate branches and integrate only the
  selected acceptance candidate into `staging`.

## Routine Staging Push

Use this when the environment/configuration has not changed:

1. Check `git status`, current branch, commit relation to `origin/staging`,
   and which tracked files/commits will publish.
2. Confirm `audit-packages/`, env files, auth storage, and unrelated work are
   not included.
3. Push only `staging`, never `main`.
4. Do one quick Vercel metadata check for branch/commit/status. Report
   `Ready`, `Building/Pending`, or failure. Do not repeat Vercel env review,
   URL fetches, or long polling unless something has changed or failed.

## Production Release Routine

1. Require explicit Pontus approval for the exact commit or commit set.
2. Verify `origin/main` can fast-forward and list what will be released.
3. Confirm untested/underkända Staging changes are excluded.
4. Push only `main`, never force-push or rewrite history.
5. Verify Vercel Production built from `main` at the approved commit and do a
   brief non-destructive smoke check.
6. Database writes, migrations, Vercel environment changes, Jira mutations, and
   write-E2E remain separate explicit approvals.

## Current Status

- KAN-48 has been released to Production in `609b902`.
- KAN-48 introduced display-only Fakturor search/filter/sort improvements:
  invoice number, customer, invoice-date prefixes, robust amount search, paid/
  unpaid buttons, year-end status buttons, compact filter UI, reset, empty
  state, and focused regression tests.
- KAN-48 did not change bookkeeping, VAT, year-end, invoice data mutation, DB,
  Supabase, or Jira logic.
- Stripe checkout/portal/webhook now initialize Stripe lazily and return a
  controlled 503 if required Stripe configuration is absent. Production Stripe
  env metadata was verified present after release without exposing values or
  initiating payment/subscription actions.
- Local `npm run dev` has a fail-closed preflight against accidental Production
  Supabase use. It requires verified Staging Supabase
  `fzxqiqenqjzhlyxxpvhg` for ordinary local dev.
- Staging schema parity repair was completed on Staging on 2026-10-10. The
  active migration ledger and baseline files were not changed. Repair scripts
  under `supabase/repair_scripts/` are manual/reference artifacts, not active
  migrations.
- KAN-40 remains parked and not Staging-verified. Known uncorrected Staging
  test booking: `VER-159`. Do not debug or clean it up unless Pontus explicitly
  reopens KAN-40.
- KAN-60 remains future work: historically linked customer invoices are missing
  from the `Kundfakturor` filter. Do not start it without explicit approval.

## Verified Connections

- GitHub read/write Git path worked for `staging` and `main` pushes.
- Vercel CLI can inspect project `sololedger` in scope `sololedger1`.
- Supabase CLI previously listed Production `wbaxmuvudpnkvuliicuy` and Staging
  `fzxqiqenqjzhlyxxpvhg` as `ACTIVE_HEALTHY`.
- Atlassian/Jira connection previously worked for project `KAN` / `Sololedger`.
- Write actions still require explicit Pontus approval.

## Git / Local Files

- Current working tree is clean except for untracked `audit-packages/`.
- `audit-packages/` is unrelated and must not be touched, staged, committed, or
  pushed without explicit approval.
- Git-ignored `.env.local`, E2E credentials, and Playwright auth state are
  local only. Never copy credentials into Git, Jira, docs, or chat.
- `supabase/.temp/` may exist as generated Supabase CLI state. Do not commit it
  merely to make Git clean.

## Local Test Guidance

- Use npm.
- Low-risk UI/read-only work: focused script/tests, `npm run typecheck`,
  `npm run build` when relevant, `git diff --check`, and human visual
  acceptance when appropriate.
- `npm run test:e2e` is not the default Staging-write safety check.
- Staging/write E2E may run only against verified Staging
  `fzxqiqenqjzhlyxxpvhg` with the dedicated test user/configuration and
  explicit approval. Never run write E2E against Production.
- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.

## Approval Boundaries

- No push, deploy, live Supabase write, migration, data repair, Vercel env
  change, Jira mutation, or Production-authenticated testing without explicit
  approval for that step.
- Any DB/RPC/schema/RLS/grant/index/Edge change requires fresh source-of-truth
  inspection and explicit approval.
- Production data must never be used as fallback for Staging/local problems.
- Jira is used for planning, status, and handoff; it is not source of truth for
  code, database implementation, accounting behavior, or live Supabase state.

## Next Safe Step

- Start the next Pontus-selected Jira/product task on a new work branch from
  current `main`/`origin/main` (`609b902`), then follow the permanent workflow:
  local verification -> approved Staging push -> Pontus acceptance -> approved
  Production release.
