# SoloLedger Project State

Last updated: 2026-10-14

## Current local objective: KAN-72 Staging integration

- Local integration branch: codex/KAN-72-staging-integration.
- Worktree: C:/Users/Familjedator/.codex/worktrees/kan72-staging-integration/sololedger_multi_user.
- Base: remote Staging 30e82adf9d2868e0e1f1c028b433bc11aa9a7ff7, reverified before integration.
- Production remains 357c980fba8a343ec7330b26b6268e6525cd49d4.
- Applied only approved KAN-72 commit 5ae670c326932abb44a360c10308db3de8c6a371 with cherry-pick --no-commit. No integration commit is approved.
- PROJECT_STATE.md was the sole text conflict. The published Staging handoff is retained below.
- KAN-62/KAN-65 remain paused pending Skatteverket. Their product code and migrations must remain unchanged.
- Original staging checkout at ef498b9, its two documentation commits, audit-packages/ and scripts/create-kan63-staging-user.mjs are preserved.
- Original KAN-72 worktree/commit remains unchanged; Production release must use that Production-based candidate, not this Staging history.

## KAN-72 scope and earlier evidence

- Exact decimal/exponent normalization preserves .50, .01, 1e2 and 1E-2 while rejecting nonpositive, nonfinite, sub-cent, overflow and hidden precision.
- Shared validation covers TransactionForm, page submit before upload and both standard service entry points. Booked metadata edits remain supported.
- New migration 20261014100000 replaces only book_transaction_atomic(jsonb) and book_periodized_transaction_atomic(jsonb).
- Validation precedes number allocation; each full user/verification journal plus all transaction-linked rows is checked for identities, valid rows, expected count and exact balance. Periodization checks both verifications separately.
- Existing KAN-55 guards, VAT/number lock order and controlled corrections are preserved. No new source, report policy, RLS/grant change, global journal trigger, refund logic or index.
- Accounting integration surface: journal -> VAT report -> dashboard/result/NE/balances; periodization/correction/year-boundary effects require Staging acceptance. Invoice/payment/receivable logic is unchanged.
- Independent re-review of original KAN-72: PASS MED ANMARKNINGAR. All three findings fixed; 25,000 parser cases, journal fault/rollback/numbering and concurrency verified.
- Earlier Production-based checks: npm test, test:regression (38 domain scripts + smoke 2/2), local DB regression (8 fixtures), types, DB invariants and E2E safety PASS. Full lint had 86 inherited errors/6 warnings; zero new diagnostics.
- These are earlier original-candidate results, not results for the combined Staging candidate.
- P3: no composite journal index on user_id/ver_nr in either live environment. Measure query plans, booking duration and contention with synthetic local histories before any separately approved index change.

## Integration verification and next step

- Combined candidate npm run test: PASS (38 domain scripts, admin-delete dry-run and DB invariants).
- npm run test:regression: PASS (38 domain scripts, public Chromium smoke 2/2). First attempt failed on Turbopack's external node_modules junction; one bounded rerun used an external process-only --webpack preload. No repo/build config changed.
- Types (--incremental false), E2E safety and DB invariants: PASS.
- Full local DB regression: 8/8 rollback fixtures PASS on sololedger_kan72_staging_test, localhost (::1):5432; no users, accounts, transactions, journals or number rows remain.
- Fresh original Production-based npm test, types and local DB regression: PASS separately; original worktree/commit untouched.
- Full lint: FAIL on both exact Staging base and candidate, 85 existing errors/6 warnings. Normalized per-file/rule/message multiset lintdiff: zero new diagnostics.
- KAN-36/54 old payload failures reproduced before adaptation. Helpers now select an allowed rate that reproduces existing rounded net/VAT exactly. No-deduction small-value input adjusted to gross 29,599.99; old gross 36,999.99 retained as an explicit rejected useful-life case, matching existing KAN-62 domain tests. No accounting policy or KAN-62/65 product change.
- Relevant local/live Staging schema matches: 33 constraints, 16 indexes, 13 policies and RLS flags for seven affected tables. All eight RPC ACL sets match; six unchanged helper/correction/inventory definitions match exactly. Only the two KAN-72 RPC definitions differ.
- Six synthetic performance databases: 1,000/10,000/100,000 journal rows per owner + 1,000 other-user rows; 80 standard, 40 periodized and 100 four-client mixed bookings per variant. All 1,320 benchmark transactions succeeded; complete journals, contiguous numbers and other-user counter unchanged.
- Average ordinary booking ms, base -> candidate: 1.684 -> 1.929 (1k), 1.791 -> 3.215 (10k), 1.809 -> 18.117 (100k).
- Average periodized booking ms: 2.172 -> 2.847 / 2.435 -> 5.095 / 2.254 -> 32.216. Four-client p95 at 100k: 17.167 -> 238.844 ms; up to three transaction-ID lock waiters observed.
- Integrity query at 100k: sequential scan, 14.765 ms, 1,554 shared buffers. Local rollback-only (user_id, ver_nr) index probe: BitmapOr, 0.145 ms, four buffers. Index absent and data/counters unchanged after every ROLLBACK. No index migration created.
- Recommendation: separately approve/index-review before Production at large-history scale. This is synthetic warm-cache evidence, not a hosted latency guarantee; no concurrent indexed benchmark or hosted write acceptance run.
- Reproducible harnesses/raw plans/logs: C:/SoloLedger/LocalTest/kan72-integration-evidence/ (outside Git). Disposable synthetic performance DBs, including setup attempts, are retained.
- Final git diff --check: PASS. Exactly 14 approved files; ten unchanged blobs equal original KAN-72, service patch contains only the two amount guards, published Staging handoff retained. No secrets/generated artifacts or new commits. All candidate files staged locally for review (git diff HEAD / --cached).

- KAN-36/54 SQL fixtures still use the pre-KAN-62 payload. Only test-contract adaptations are approved; a real product defect or bookkeeping change requires stopping and reporting.
- Supabase Production: wbaxmuvudpnkvuliicuy; Staging: fzxqiqenqjzhlyxxpvhg. Write-capable DB regressions must remain localhost-only.
- Read-only analysis found Staging get_next_ver_nr has broader PUBLIC/anon execute grants than Production; the identity guard remains. KAN-72 does not modify that inherited difference.
- Staging public URL requires Vercel login. Hosted acceptance must verify its actual Supabase connection before writes.
- KAN-72 migration is not hosted. Staging migration identity must later be preserved through official CLI; only version 20261014100000 may be pending.
- Jira KAN-72 read-only verified In Progress. No Jira mutation is authorized.
- Current approval: local integration, test fixtures and synthetic local DB/performance tests only.
- No new commit, push, hosted migration/write, deploy or change to KAN-62/65 product behavior.
- Next step: independent review of this uncommitted local candidate, with measured performance risk and separate index decision before Production.

## Retained published Staging handoff (before KAN-72 integration)

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
