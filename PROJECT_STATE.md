# SoloLedger Project State

Last updated: 2026-10-13

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Active isolated worktree:
  `C:\Users\Familjedator\.codex\worktrees\kan48-invoice-search\sololedger_multi_user`
- Current local branch for this publication step:
  `codex/KAN-48-staging-publish`
- Base for publication: `origin/staging` at
  `a2ef958d9caf3b6b46b1e542852b90f5ab21275b`
  (`KAN-65 trace fixed asset reclassifications`).
- `main` = Production. `staging` = permanent Staging/Preview.
- Production application URL: `https://sololedger.vercel.app`
- Permanent Staging URL:
  `https://sololedger-git-staging-sololedger1.vercel.app`
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`.
- Supabase Staging/E2E ref: `fzxqiqenqjzhlyxxpvhg`.

## Durable Truth

- `AGENTS.md` is the permanent rulebook.
- `PROJECT_STATE.md` is the active handoff/checkpoint.
- `PROJECT_ARCHIVE.md` holds completed history only.
- Jira is the work queue/status/backlog, not source of truth for code or DB.
- Live Supabase is source of truth for deployed DB state. Local repo is source
  of truth for application code.

## Current Status

- KAN-48 follow-up fix is being published to Staging only.
- The fix is display/filter-only for the Fakturor page: numeric invoice
  numbers, for example `1001`, now match `invoiceNumber` before numeric search
  falls back to amount matching.
- Date-prefix search for `YYYY`, `YYYY-MM`, and `YYYY-MM-DD` remains first.
- Existing customer, amount, payment, year-end, and sort behavior is preserved.
- KAN-62 and KAN-65 commits are already on `origin/staging` and remain paused
  for Pontus; this KAN-48 publication does not modify their code.
- KAN-60 remains separate future work for transaction-history
  `Kundfakturor` filtering of historically linked manual transactions.

## Verification

- Passed before Staging publication:
  `node scripts/test-customer-invoice-filters.ts`
- Passed before Staging publication:
  `npm run typecheck -- --incremental false`
- Passed before Staging publication:
  `git diff --check HEAD`
- Typecheck used a local ignored `node_modules/` junction to reuse existing
  dependencies from the main checkout. No package install was performed.
- Not run: broad E2E, write E2E, Supabase checks, migrations, Production
  checks, or database writes.

## Jira

- KAN-48 remains `In Review` for Pontus manual Staging acceptance.
- Jira KAN-48 has comments with the local commit, verification, and Staging
  publication context.
- No Jira status transition to `Done` has been performed.

## Worktree / Local Files

- Staging publication branch should be clean after commit.
- A temporary ignored `node_modules/` junction may exist in this isolated
  worktree only.
- The original checkout had pre-existing local changes in `PROJECT_STATE.md`,
  `PROJECT_ARCHIVE.md`, and untracked `audit-packages/`; this isolated
  worktree intentionally did not touch them.

## Approval Boundaries

- Current approval covers only merge/publication of KAN-48 commit
  `8f910dfbef0c53d99150b5337284405fc8c546a9` to Staging.
- No Production deploy.
- No Supabase changes, migrations, new bookkeeping, or test data.
- Any later Production release requires separate explicit approval.

## Next Safe Step

- After Staging deployment is ready, Pontus should manually test the Fakturor
  search in Staging:
  - search by numeric invoice number such as `1001`
  - confirm customer, amount, and reset behavior still work
  - leave KAN-62 and KAN-65 paused unless Pontus explicitly resumes them
