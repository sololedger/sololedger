# SoloLedger Project State

Last updated: 2026-10-13

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Active isolated worktree:
  `C:\Users\Familjedator\.codex\worktrees\kan48-invoice-search\sololedger_multi_user`
- Current local branch for this release step:
  `codex/KAN-48-production-publish`
- Production release base: `origin/main` at
  `0bc166de68f7989f6a3d1483c062f4b4b1570629`
  (`KAN-61 bank account statement history`).
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

- KAN-48 follow-up fix is approved for Production publication.
- The released fix is display/filter-only for the Fakturor page: numeric
  invoice numbers, for example `1001`, match `invoiceNumber` before numeric
  search falls back to amount matching.
- Date-prefix search for `YYYY`, `YYYY-MM`, and `YYYY-MM-DD` remains first.
- Existing customer, amount, payment, year-end, and sort behavior is preserved.
- The Production release uses the verified KAN-48 feature commit
  `8f910dfbef0c53d99150b5337284405fc8c546a9` as source, with this handoff
  updated for Production state.
- KAN-62 and KAN-65 are not included in Production. They remain only on
  Staging and paused unless Pontus explicitly resumes them.
- KAN-60 remains separate future work for transaction-history
  `Kundfakturor` filtering of historically linked manual transactions.

## Verification

- Passed before Production push:
  `node scripts/test-customer-invoice-filters.ts`
- Passed before Production push:
  `npm run typecheck -- --incremental false`
- Passed before Production push:
  `git diff --check --cached`
- Typecheck used a local ignored `node_modules/` junction to reuse existing
  dependencies from the main checkout. No package install was performed.
- Not run: broad E2E, write E2E, Supabase checks, migrations, or database
  writes.

## Jira

- KAN-48 remains `In Review` for Pontus manual Production acceptance.
- Jira KAN-48 has comments with Staging publication, verification, and
  Production publication context.
- No Jira status transition to `Done` has been performed.

## Worktree / Local Files

- Production publication branch should be clean after commit/push.
- A temporary ignored `node_modules/` junction may exist in this isolated
  worktree only.
- The original checkout had pre-existing local changes in `PROJECT_STATE.md`,
  `PROJECT_ARCHIVE.md`, and untracked `audit-packages/`; this isolated
  worktree intentionally did not touch them.

## Approval Boundaries

- Current approval covers only Production publication of the isolated KAN-48
  numeric invoice-number search fix.
- No Supabase changes, migrations, new bookkeeping, or test data.
- No KAN-62/KAN-65 Production publication.
- Any later Production release requires separate explicit approval.

## Next Safe Step

- After Production deployment is ready, Pontus should manually test the real
  Production account that has invoice `1001`:
  - search by invoice number `1001`
  - confirm customer-name search, amount search, and reset still work
  - leave KAN-48 in Jira `In Review` until Pontus accepts the result
