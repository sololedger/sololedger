# SoloLedger Project State

Last updated: 2026-10-14. KAN-71 independent after-review PASS reported by Pontus. Local Staging release candidate only.

## Start Here / Exact Git Identity

- Implementation checkpoint: 1d297c1fd387be2f3f6cd54a780b8c58c2901732, branch codex/KAN-71-sie-vat-periods, worktree C:/Users/Familjedator/.codex/worktrees/kan71-sie-vat-periods/sololedger_multi_user. Exactly 23 KAN-71 files; base d67db203c0d270aadbaa276c03eaa23ea48838bc.
- Release branch: codex/KAN-71-staging-release, worktree C:/Users/Familjedator/.codex/worktrees/kan71-staging-release/sololedger_multi_user. The containing integration commit is the release candidate; obtain its exact hash with git rev-parse HEAD. The implementation worktree's final handoff and external release-handoff.json record that exact hash after creation.
- Release parent/base: 9ff22b45cc7b72e14d26a3d13a97219476965097, freshly fetched origin/staging. origin/main remains d67db203c0d270aadbaa276c03eaa23ea48838bc. Do not use canonical local staging e639347e7d691ffba6fa3952d92566b28ac0cc05 as release base.
- Integration is the checkpoint's complete code/tests/migrations, identical to the source checkpoint. Only PROJECT_STATE.md conflicted; resolved as this release handoff. No code/package/migration conflict, dependency install/change or further review loop.
- KAN-62/65 remain ON HOLD. ALL existing Staging-only product/test files and ALL 40 old migrations were compared against the base and are unchanged. Do not transfer this entire candidate to Production.
- Read AGENTS.md, this state and supabase/tests/KAN71_SIE_VAT_PERIODS.md. Durable hosted-connection details are in canonical Architecture.md, section Verifierade Hosted-anslutningar Och Migrationsförfarande. Independent review is complete; no new code review absent concrete new findings.

## Exact Migration Order / Shared State

- Read-only Staging ref fzxqiqenqjzhlyxxpvhg ledger: 40 versions/names exactly match origin/staging; last 20261014123000_kan72_journal_user_ver_index.sql.
- Add ONLY these files, in order:
  1. 20261014162850_kan71_sie_undo_vat_period_guard.sql (version 41).
  2. 20261014171038_kan71_sie_correction_period_guard.sql (version 42).
  3. 20261014174218_kan71_legacy_sie_correction_history_guard.sql (version 43).
- The first 40 files are byte-equivalent Git content to the fetched base. No old migration, KAN-62/65 migration, migration identity or historical bookkeeping/closing/declaration data is changed.
- New authenticated get_sie_vat_history_review is mandatory: migrate BEFORE publishing application code. Missing/failed RPC intentionally blocks VAT/safe-withdrawal calculations.
- No new table/domain; no table/RLS/deletion-lifecycle changes. Existing identity/ACL boundaries retained. Private lineage helpers unavailable to anon/authenticated.
- Generic SIE corrections/undo require one verified open VAT period after atomic month locks. Legacy manual/no-batch descendants are identified by tenant-scoped corrects_ver_nr -> journal ver_nr -> actual SIE source.
- Unsafe cross-period/year, missing/overlapping/imported period or uncertain reverse VAT history blocks NEW close RPC calls and safe withdrawal. Closed/declared stored state remains unchanged. Valid ordinary manual and same-period SIE corrections remain supported.
- Broken VAT provenance fails closed without inventing an SIE origin; completely erased source/link metadata cannot be reconstructed. Complete historic submitted-return snapshots were not stored. No repair/backfill is included.

## Release Verification / Exact Limits

- Complete 43-migration repository chain applied with official Supabase CLI 2.120.0 to NEW local database sololedger_kan71_staging_release_20261014 / localhost:5432 / ::1. Exact ordered 43-version ledger PASS. Only existing minimal local auth/storage schema scaffolding; no hosted data copied or old local DB repaired.
- Complete KAN-71 DB runner PASS on that 43-file Staging schema: 15 original + 20 generic correction + 16 legacy-chain scenarios; 13 + 19 actual DB/report assertions; seven two-session races with observed advisory waits and atomic outcomes.
- Q2/Q3 closed/declared originals, legacy manual no-batch and multihop, ordinary manual, same open/closed period, year crossing, reverse VAT, direct authenticated new-close RPC, auth/tenant/ACL and unchanged history PASS. Full domain suite covers report/dashboard/safe withdrawal/SIE/NE.
- npm run test:domain, typecheck, test:db-invariants and test:e2e:safety PASS on release candidate. Targeted changed calculation/test lint and diff check PASS. Pre-existing full-lint debt is not repaired.
- npm run build -- --webpack PASS (Next 16.2.6, all pages/routes compiled). Process-only loopback/fake-key placeholders, no secret files or shared writes. This local output is NOT a deploy artifact; Vercel must rebuild with verified Staging environment.
- Public Chromium Playwright smoke 2/2 PASS with established process-only Webpack fallback and loopback placeholders, no login or shared DB writes. Literal default Turbopack test:regression is NOT claimed green: known node_modules junction/outside-root restriction. No config/dependency workaround committed.
- Eight additional existing Staging SQL fixtures: 6 PASS, 2 FAIL. KAN-72 fails its anon-denial assertion on known fresh-chain PUBLIC EXECUTE discrepancy for book_transaction_atomic/book_periodized_transaction_atomic. Not introduced/repaired by KAN-71. Hosted Staging read-only ACL check confirms anon_execute=false and authenticated_execute=true for BOTH RPCs.
- KAN-46 old fixture fails because it supplies no company profile required by existing KAN-63 VAT validation. Fixture/product unchanged. KAN-63, KAN-36, KAN-54, KAN-55, KAN-30 and KAN-56/57 fixtures PASS. These failures are not hidden or labelled a green complete broad DB regression.
- Additional fixtures preserve candidate function definitions, all 43 ledger rows and existing synthetic accounting exactly. Seven NEW synthetic concurrency users remain only in the new release-test DB. All earlier local DBs and historical fixtures preserved.
- Not run/approved: authenticated Staging write/browser acceptance, hosted build/deploy or shared migrations. No full hosted Auth/Storage/schema parity claim.
- Evidence root: C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13b30-3ccb-7de2-9f6b-a07a4c753484/kan71/. release-*.log/json and local full-chain/scoped-check scripts. KAN-71 runner evidence C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-pLzEGO/. Reproducible committed tests/runbook are authoritative; optional logs are not required to understand next steps.

## Next Safe Step / Separate Approvals

- STOP for leader decision. No further implementation/review without a concrete finding. Local checkpoint/release/handoff commits authorized; NO push, hosted migration/write, deploy or Jira mutation authorized.
- Approval 1: exactly Staging fzxqiqenqjzhlyxxpvhg and the THREE versions above, official CLI preserving timestamps. Recheck current ledger/definitions/data and candidate HEAD before writing; if origin/staging advanced or dry-run lists anything else, stop/reconcile.
- Use explicit Staging Direct host db.fzxqiqenqjzhlyxxpvhg.supabase.co:5432 over verified IPv6/TLS, process-local existing credentials (never display/copy/hash), connect timeout 10s. Verify session continuity and actual startup/reset lock_timeout=5000ms, statement_timeout=120000ms for CLI as well as psql. No Production fallback, transaction pooler, role defaults, --include-all or ledger repair.
- Approved execution should use isolated unchanged candidate CLI files, dry-run --skip-vault listing only the three files, then apply in order and read-only verify exact versions, RPC/ACL and unchanged bookkeeping after each step. Do not replay the baseline/old 40 on hosted Staging. No migration was executed there in this task.
- Approval 2: publish the EXACT approved candidate commit to origin/staging only (normal fast-forward), triggering Vercel Preview; no main push. Reverify Stage URL/Supabase binding, build commit and deployment status. Rebuild, do not deploy local loopback-placeholder .next output.
- Approval 3: dedicated Staging test-user writes/E2E and manual acceptance. Follow runbook journal/VAT report/closing/dashboard/safe withdrawal/SIE/NE checklist, including unsafe closed/declared/year-cross/reverse cases. No real-user history repair.
- Jira KAN-71 last read Bug / High / To Do / unassigned; unchanged. Any Jira action, Production release or historical repair needs its own authorization.

## Preserve / Account Handoff

- Source and release worktrees are retained; source checkpoint and candidate are local only. All other worktrees, their dirty/untracked/generated/ignored files, credentials and evidence are preserved.
- Canonical checkout keeps its existing dirty PROJECT_STATE.md pointer, untracked audit-packages/ and scripts/create-kan63-staging-user.mjs. KAN-72 staging-integration dirty state and KAN-63 migration-prep's two untracked KAN-62 files remain untouched.
- node_modules is a local junction to canonical installed dependencies, not portable code. npm/package-lock unchanged. New account on another host must install from package-lock and obtain its own approved credentials/session; never copy env/auth/passfiles into Git or handoff bundle.
- Final implementation handoff commit and portable Git bundle/manifest preserve local branch identities for account transfer without Git push. The bundle contains Git-tracked branch history only; ignored credentials/local DB data are excluded. See the implementation PROJECT_STATE.md for final exact paths/hashes.
- Retention: KAN-71 remains active through Staging acceptance. PROJECT_ARCHIVE.md is unchanged; earlier completed KAN-72 history remains there. No active KAN-71 evidence was prematurely archived.
