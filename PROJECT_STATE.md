# SoloLedger Project State

Last updated: 2026-10-14

## Current objective: KAN-72 Staging journal index integration

- Branch: codex/KAN-72-staging-integration.
- Worktree: C:/Users/Familjedator/.codex/worktrees/kan72-staging-integration/sololedger_multi_user.
- HEAD/base: 920c50ee3ef575877d47872adec5bb9a7fe98ebc (approved original Staging integration). No new commit is approved or created.
- Approved index source: d67db203c0d270aadbaa276c03eaa23ea48838bc on codex/KAN-72-journal-user-ver-index; independent Granska KAN-72 journalindex PASS. Both directive/test findings independently verified fixed.
- Only index scope transferred: portable four-file patch from that commit; PROJECT_STATE.md separately preserves Staging context. No cherry-pick/merge sequencer, no automatic commit, no text conflict.
- KAN-62 / KAN-65: ON HOLD pending Skatteverket. Existing product code and two KAN-62 migrations are preserved; never transfer this Staging history wholesale to Production.
- Original staging checkout ef498b9 and all its existing untracked files are preserved. Production-based index/standard-booking worktrees remain unchanged.
- Previously recorded remote refs: Production 357c980, Staging 30e82ad; not changed or refreshed in this local integration.

## Candidate and preserved boundaries

- Five local candidate files: PROJECT_STATE.md, package.json, scripts/test-kan72-journal-index.mjs, supabase/migrations/20261014123000_kan72_journal_user_ver_index.sql, supabase/tests/KAN72_JOURNAL_INDEX.md. Changes remain UNCOMMITTED and UNSTAGED.
- Index SQL/version 20261014123000, test script and runbook match the approved index commit exactly. transaction=false is the absolute first line.
- Original KAN-72 migration stays 20261014100000; unchanged and identical between tracks. Staging KAN-36/54 gross/rate fixture adaptations stay byte-identical to 920c50e.
- package.json adds only test:db-index. Existing domain tests/scripts and package-lock unchanged.
- No app/product/RPC/RLS/grant/trigger/accounting/source/VAT/NE/report/correction/SIE/year-end logic change. Existing indexes are preserved. Only physical journal access path is added.
- Earlier 920c50e integration verification and performance evidence remain in that committed PROJECT_STATE.md and C:/SoloLedger/LocalTest/kan72-integration-evidence/. Copied index runbook contains historical Production-based evidence; current Staging results belong below.

## Current verification

- npm run test PASS (38 domain scripts + admin-delete dry-run + DB invariants); typecheck --incremental false PASS; E2E safety PASS.
- Full npm run test:db-index PASS: six pinned CLI 2.120.0 transaction/negative-control cases, creation/idempotency/eight collisions/invalid-build/recovery/ledger checks, twelve ABBA trials and 12,600 synthetic bookings. Journal balance/numbering/isolation and previous index/RPC/security/constraint invariants PASS.
- Local Staging DB regression PASS, 8/8 fixtures, s72idx_stageverified_mv814n9p (::1:5432), data-empty clone of established sololedger_kan72_staging_test. CLI applied 20261014100000 then 20261014123000; zero residual user/accounting rows. KAN-36/54 adapted fixtures and KAN-55 all PASS.
- Additional fresh reconstruction: all 40 exact Staging repo migrations applied/recorded through pinned CLI, including both KAN-62 versions. Repo/local ledger identity and order match. Repeated migration up preserves index; all user/accounting tables remain empty.
- IMPORTANT discrepancy: DB regression on that fresh chain FAILS at the KAN-72 anon privilege assertion. Both standard RPCs inherit PUBLIC execute (proacl NULL), unlike the established local Staging template's explicit authenticated/service_role-only ACLs. Index create/drop does not alter ACLs/RPCs; no product/ACL/migration repair made. Fresh bootstrap uses local schema-only Auth and minimal Storage scaffolding, not a hosted Supabase emulator. This is a separate reconstruction/privilege finding; do not describe fresh-chain regression as green or infer current hosted ACL state from it.
- Public Chromium browser-smoke PASS 2/2, local app only; process-only established webpack preload and synthetic loopback Supabase values. No env/source change or hosted request.
- Lintdiff PASS, zero new diagnostics; new script zero errors/warnings. Full Staging lint remains 85 existing errors/6 warnings, identical to baseline. git diff --check PASS.
- Exact index migration/version and standard KAN-72 migration match both tracks; test script/runbook match approved index commit. Staging KAN-36/54 fixture blobs, product/RPC/RLS/grant/old migration/lockfile files unchanged from 920c50e. All other worktrees/refs preserved.
- Not run: hosted/write browser E2E, hosted migration/acceptance, Production build, hosted/cold-cache load tests. Existing-source full checks are historical, not substituted for these fresh combined tests.
- Evidence outside Git: C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13a0a-f224-70a2-8949-b549ce26f191/staging-index-integration/; index-suite/run-1791977173575, established-staging-db-result.json, fresh-chain-permission-discrepancy.json, lintdiff-result.json and browser-smoke.log. Separate databases retained; no template/user data changed.
- Ready for independent review of this exact local index integration WITH the above fresh-chain regression discrepancy explicitly disclosed. No new commit/approval for publication. Separate diagnosis is required before claiming fresh reconstruction is verified.

## Approval boundaries and next safe step

- Local integration and isolated LOCAL database/test writes only. No new commit, push, merge to staging/main, cherry-pick commit, deploy, hosted migration/write or Jira mutation approved/performed.
- Supabase Production wbaxmuvudpnkvuliicuy; Staging fzxqiqenqjzhlyxxpvhg. These are never write-test targets in this task. All write-capable regression targets must be independently verified loopback databases.
- Hosted migration order after separate approval: 20261014100000 then 20261014123000. Preserve repo/live migration identity; no history repair or pre-registration.
- One migration operator; no simultaneous privileged index/schema changes. Postcheck exact definition and valid/ready/live flags. Invalid index after interruption requires separately approved recovery.
- Hosted connection/session/TLS/timeouts and representative journal -> VAT -> dashboard -> NE, periodization/correction acceptance remain separate future Staging work.
- Next safe step: finish local combined tests, then independent review of the uncommitted five-file index integration. Stop after report; no publication authorized.

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
