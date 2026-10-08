# SoloLedger Project State

Last updated: 2026-10-08

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Origin/Production `main`: `5716576ffa35cb4f03643d1a7f3927f67797cb61`
  (`docs: record KAN-36 production release`) before the pending KAN-54
  frontend release commit.
- Production is verified on the accumulated KAN-46 + KAN-14 + KAN-49 + KAN-50
  + KAN-51 + KAN-52 + KAN-41 + KAN-22 + KAN-23 + KAN-36 release.
- Vercel Production deployment:
  `dpl_EEy4gDWNq9Ag99LeDtSrY1CdDdg1`
  (`sololedger-g9b8euw3k-sololedger1.vercel.app`) is `Ready`, built from
  `3868ef1`, and aliased to `https://sololedger.vercel.app`; HTTP check
  returned `200`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; migration head:
  `20261008173000` after KAN-54 Production DB release. The KAN-54 frontend
  commit/deploy is still pending in this checkpoint.
- Supabase staging/E2E ref: `fzxqiqenqjzhlyxxpvhg`; migration ledger includes
  `20261007160000` (`kan36_fixed_assets`) and `20261008110000`
  (`kan36_redirect_manual_equipment_purchases`) after bounded KAN-36 staging
  acceptance. KAN-51 `20261007110000` and KAN-22 `20261007130000` are still not
  in the staging migration ledger; KAN-36 staging migrations were applied
  through isolated CLI migration chains to avoid unrelated pending migrations.
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
- Supabase Production project ref: `wbaxmuvudpnkvuliicuy`
- Supabase staging/E2E project ref: `fzxqiqenqjzhlyxxpvhg`
  (`sololedger-staging`). It is isolated from Production and contains schema
  from the repo migration chain only; no Production data was copied.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- Vercel fast path: team `sololedger1`, project `sololedger`, Production alias
  `sololedger.vercel.app`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified on 2026-10-07:

- Done includes KAN-14, KAN-46, KAN-49, KAN-50, KAN-51, KAN-52, KAN-41,
  KAN-22, and KAN-23 after Pontus acceptance and Production release.
- KAN-53 was created as the future VAT V2 EU-goods support issue. Do not
  implement EU-goods accounting inside KAN-23.
- KAN-47/KAN-48 remain future work and must not be started unless Pontus
  selects them.
- KAN-36 is released to Production and remains `In Review`, assigned to Pontus.
  Pontus final product-owner review remains before `Done`.

## Current Active Work

- KAN-54 Production DB release is live and verified; frontend commit/deploy is
  pending. Scope:
  Inventarier now restricts UI momsavdrag choices from the company profile's
  `default_deduction_entitlement`, and new migration
  `20261008170000_kan54_fixed_asset_vat_deduction_guard.sql` wraps
  `book_fixed_asset_acquisition_atomic` with a server-side guard so `full`
  VAT deduction is allowed only when the profile explicitly says `full`.
  Profile `none`, `unknown`, missing profile, and unsupported values cannot
  create a new fixed-asset `2641` deduction through the public RPC; `none`
  remains allowed. The original KAN-36 implementation is retained as an
  internal unchecked delegate with authenticated and service-role execution
  revoked.
- KAN-54 Production DB release on 2026-10-08: Production Supabase ref
  `wbaxmuvudpnkvuliicuy` received only
  `20261008170000_kan54_fixed_asset_vat_deduction_guard.sql` and
  `20261008173000_kan54_revoke_internal_delegate_service_role.sql` through an
  isolated CLI migration chain after dry-run confirmed exactly those two
  migrations. Ledger and effective privileges were verified: internal delegate
  is executable by `postgres` only, wrapper remains executable by
  `authenticated` and `service_role`, all KAN-54 functions are owned by
  `postgres`, `SECURITY DEFINER`, with `search_path=public`, and no KAN-54/KAN-36
  test transactions, journal rows, or fixed assets exist in Production.
- KAN-54 verification on 2026-10-08: live Production RPC definition and
  relevant Production constraints/grants were inspected read-only before DB
  release. Staging acceptance passed after the forward privilege correction.
  Local checks passed:
  `npm run typecheck`, focused `npx eslint src/components/FixedAssetsPanel.tsx`,
  `node scripts/test-fixed-assets.ts`, `git diff --check`, local
  `supabase/tests/kan54_fixed_asset_vat_deduction_guard_candidate.sql`, and
  local `supabase/tests/kan36_fixed_assets_candidate.sql`. The isolated local
  DB `sololedger_kan17c_test` needed the already-existing profile runtime
  fields migration applied locally as a test prerequisite before KAN-54 tests.
- KAN-54 separate follow-up finding: ordinary Bokföring/V1 may still allow
  `2641` based on VAT rate without checking actual deduction entitlement.
  Jira search found no exact existing issue; KAN-14/KAN-22/KAN-34/KAN-53 are
  related but not the same scope. Do not implement this inside KAN-54.
- KAN-36 local implementation adds K1 fixed-asset support for Swedish K1 sole
  proprietors: internal year-keyed tax parameters, fixed-asset registry,
  acquisition RPC, connected-acquisition grouping, acquisition idempotency,
  direct-expense-to-asset reclassification, collective K1 depreciation,
  year-close depreciation guard, transaction-history source protection, and
  delete-user lifecycle coverage.
- Approved blocker fixes are included locally: fixed-asset acquisition replay
  returns the original result; connected acquisitions use explicit
  standalone/connected/uncertain assessment; server computes group basis from
  linked recorded purchases; uncertain fails closed; prior direct-expensed
  connected purchases are reclassified by auditable system transaction when the
  year is open and short-life does not apply.
- KAN-36 verification on 2026-10-08: `npm run typecheck` PASS,
  `npm run test:domain` PASS, `npm run test:admin-delete-dry-run` PASS,
  `npm run build` PASS after approved network access for Next/Google Fonts,
  focused KAN-36 local DB rollback test PASS against
  `sololedger_kan17c_test`, `git diff --check` PASS with CRLF warnings only.
- KAN-36 bounded staging acceptance on 2026-10-08: staging project verified as
  `sololedger-staging` / `fzxqiqenqjzhlyxxpvhg`; normal `db push --dry-run`
  would have applied unrelated KAN-51/KAN-22/KAN-36 migrations, so KAN-36 was
  applied by an isolated official CLI chain containing existing staging history
  plus only `20261007160000_kan36_fixed_assets.sql`. Staging SQL/RPC rollback
  acceptance passed for small-value purchase, capitalization, VAT full/none,
  connected acquisitions, idempotency/tampering, depreciation/year-end guards,
  unsupported cases, and cleanup. Pontus reported bounded KAN-36 staging
  acceptance and manual UI tests passed before the final UX completion below;
  no persistent KAN-36 staging test data remained.
- KAN-36 final UX completion on 2026-10-08: ordinary manual purchases using
  `Förbrukningsinventarier (5410)` stay visible but are redirected to
  `Inventarier`; the submit path blocks the ordinary manual purchase before
  upload/RPC; a focused DB trigger blocks only ordinary manual 5410 transaction
  rows while leaving non-manual KAN-36 postings, corrections, and imports
  available; the inventory register labels acquisition value separately from
  loaded collective book value; the initial purchase assessment is neutral until
  a valid amount exists.
- KAN-36 final UX verification on 2026-10-08: `npm run typecheck` PASS,
  `npm run test:domain` PASS, focused KAN-36 UI/domain script checks PASS,
  focused ESLint for changed KAN-36 files PASS, `npm run build` PASS after
  approved network access for Next/Google Fonts, local SQL rollback guard test
  PASS against `sololedger_kan17c_test`, and `git diff --check` PASS with CRLF
  warnings only. Full repo lint still fails on older unrelated debt.
- KAN-36 final staging guard verification on 2026-10-08: staging identity
  verified as `sololedger-staging` / `fzxqiqenqjzhlyxxpvhg`; normal repo
  `db push --dry-run` would still include unrelated KAN-51/KAN-22 migrations,
  so only `20261008110000_kan36_redirect_manual_equipment_purchases.sql` was
  applied through an isolated CLI migration chain. Staging ledger now includes
  `20261008110000`; KAN-51/KAN-22 remain absent from staging. Rollback-safe
  staging SQL/RPC guard acceptance PASS, cleanup verification found zero KAN-36
  final-guard test transactions, journal rows, or fixed assets left behind, and
  focused UI script checks PASS. No Production migration, Production data
  change, push, or deploy was performed.
- KAN-36 Production release on 2026-10-08: Production Supabase ref
  `wbaxmuvudpnkvuliicuy` received only `20261007160000_kan36_fixed_assets.sql`
  before frontend deploy and only
  `20261008110000_kan36_redirect_manual_equipment_purchases.sql` after
  frontend deploy. GitHub `origin/main` was pushed from `a491afb` to
  `3868ef19cbb927ed15a4d9ad15c8223d4082d50a`; Vercel Production deployment
  `dpl_EEy4gDWNq9Ag99LeDtSrY1CdDdg1` is `Ready` and aliased to
  `https://sololedger.vercel.app`. Production smoke passed for app load,
  existing auth session, Inventarier access, 5410 redirect guidance, disabled
  ordinary submit, neutral initial equipment assessment, transaction history,
  NE/report and Moms views, and zero browser console errors. No fictional
  Production accounting transaction was created. Inventory value labels after
  depreciation were not visually testable in Production because no fixed assets
  exist there yet.
- Full repo `npm run lint` still fails on older unrelated lint debt. Focused
  lint for changed KAN-36 TypeScript files passed when the pre-existing
  `no-explicit-any` debt in `TransactionTable.tsx` was disabled; one old
  unused prop warning remains in that file.

## Completed Release

- KAN-14 and KAN-46 are closed: Production DB migrations are live, frontend is
  deployed, automated non-destructive Production smoke passed, and Pontus manual
  Production acceptance passed.
- KAN-49 is closed: Production migration `20261006143000` is live, the
  Production frontend is deployed, and Pontus manually verified the VAT-number
  field saves, persists after reload, and leaves VAT-policy settings intact.
- KAN-50 is closed: Profile UX polish is deployed to Production at `64367a6`
  and Pontus manually accepted the Production visual result.
- KAN-51 is closed: historical customer-invoice linkage support is deployed to
  Production at `9640942`; Production migration `20261007110000` is live; the
  approved one-off repair linked the two historical invoices to existing
  VER-5/VER-7 bookkeeping without creating transactions, journal rows, VAT/tax
  rows, corrections, or verification-number changes; Pontus accepted the
  Production result.
- Jessika Foto & Media's real Production profile now represents:
  VAT registered, annual VAT reporting, SoloLedger VAT-period handling from
  `2026-06-02`, domestic sales small-business exempt, foreign-purchase VAT
  reporting required, and no normal input-VAT deduction.
- Manual Production verification confirmed ordinary Swedish
  `Försäljning (Intäkt)` is locked to `0%` VAT for that profile and explains
  the small-business exemption. KAN-46 `Registrera kundfaktura` and
  `Utlandsinköp` entry points are present. No Production test bookkeeping
  transaction was created.
- KAN-52 is closed: customer-invoice year-end wording is deployed to
  Production at `2040be3`; the UI now says `Kundfordran vid bokslut`,
  `Ingen kundfordran vid bokslut`, and `Bokför kundfordran` for the
  receivable-at-year-end workflow. It was wording/UX only; no accounting,
  schema, RPC, Supabase, VAT, or existing data changed.
- KAN-41 is closed: dashboard VAT overview is deployed to Production at
  `c2f4a0e`; it now uses the authoritative VAT-report aggregation for the
  selected calendar year, including legacy VAT, native VAT V2, and VAT V2 audit
  snapshots. `Säkert uttag` now uses that corrected VAT balance and falls back
  to a controlled review-required state instead of an old legacy-only VAT amount
  when VAT cannot be trusted.
- KAN-22 is closed: VAT V2 foreign-purchase fact capture is deployed to
  Production at `020fb09`; Production migration `20261007130000` is live.
  The UI asks for business facts instead of BAS/VAT implementation choices,
  durable `business_facts` are preserved in VAT V2 audit snapshots, and the
  RPC fails closed for missing or contradictory business facts.
- KAN-23 is closed: VAT V1 and native VAT V2 coexistence was accepted and
  released to Production at `a491afb`. Verification covered V1 domestic VAT,
  VAT V2 EU service with no deduction and full deduction, mixed V1+V2 report
  aggregation, no omission/double-counting, KAN-22 business-facts
  persistence/fail-closed validation, dashboard semantics, mixed close/2650,
  declare boundary, missing/broken VAT V2 snapshots fail-closed, unsupported
  EU goods fail-closed, and relevant SIE/correction/undo boundaries. Real
  two-session concurrency remains a documented accepted limitation, not a
  KAN-23 blocker.
- Detailed release evidence has been moved to `PROJECT_ARCHIVE.md`.

## Open Follow-Ups

- KAN-53 covers future EU-goods VAT V2 accounting support.

- Future UI/UX consistency pass: consider aligning other Profile areas such as
  `Betalningskonton` with the newer Profile card language. This was explicitly
  out of scope for KAN-50.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- KAN-47/KAN-48 remain future work.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- Full repo lint still has older unrelated debt.

## Git / Local Files

- KAN-54 local dirty files for the pending frontend release commit:
  `src/components/FixedAssetsPanel.tsx`,
  `supabase/migrations/20261008170000_kan54_fixed_asset_vat_deduction_guard.sql`,
  `supabase/migrations/20261008173000_kan54_revoke_internal_delegate_service_role.sql`,
  `supabase/tests/kan36_fixed_assets_candidate.sql`,
  `supabase/tests/kan54_fixed_asset_vat_deduction_guard_candidate.sql`, and
  this `PROJECT_STATE.md` update.
- `origin/main` is currently `5716576`; the next approved push should contain
  the scoped KAN-54 frontend/migration/test commit and will trigger Vercel
  Production deployment.
- Local git-ignored files hold staging E2E env/auth state; do not copy
  credentials into Git, Jira, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`, or chat.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are tracked as
  an immutable historical snapshot.

## Local Test Environment

- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.
- PostgreSQL 17 client may exist at
  `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`. Never read/display/copy/hash pgpass
  contents; use it only through process/session-local `PGPASSFILE`.
- Hosted staging/E2E write target: local Next app -> `fzxqiqenqjzhlyxxpvhg` ->
  dedicated Playwright user. Local files `.env.e2e.local` and
  `tests/e2e/.auth/` are git-ignored.
- For manual local staging testing, start `npm run dev` with `.env.e2e.local`
  loaded and open `http://localhost:3000`. Do not use
  `http://127.0.0.1:3000` for manual browser testing because Next dev HMR can
  cross-origin block `/_next/webpack-hmr`.
- E2E fast path: run `npm run test:e2e:smoke` for read-only smoke,
  `npm run test:e2e:safety` for the fail-safe guard, and
  `npm run test:e2e:write -- <spec>` only for staging write tests.

## Next Safe Step

1. Run final focused KAN-54 checks, commit the scoped KAN-54 release files, and
   push `main` to trigger the authorized Vercel Production deployment.
2. Verify Vercel Production READY and run non-destructive Production smoke.
3. Update Jira KAN-54 with release evidence, keep it `In Review`, and assign
   Pontus for final product-owner review. Do not set `Done`.
4. Prepare a separate post-release documentation checkpoint if needed; do not
   push it without explicit approval.
5. KAN-36 is released to Production and ready for Pontus product-owner review.
6. Keep KAN-36 `In Review`; Pontus final testing remains before `Done`.
7. Do not start Adobe corrections, KAN-47, or KAN-48 unless Pontus explicitly
   starts that work.
