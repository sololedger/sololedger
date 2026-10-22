# SoloLedger Project Archive

This file is for compact long-term summaries of completed or superseded workstreams.

Do not archive active work here prematurely. Current active work remains in `PROJECT_STATE.md`.

## Archived Workstreams

### KAN-75 – superseded readiness checkpoint (2026-10-19)

- The KAN-75 readiness-era PROJECT_STATE.md inherited by the KAN-78 worktree is superseded. A fresh GitHub main read for KAN-78 confirms released commit e7f1442921338bc3983a96ae75a4aaeca4bc8bcd.
- The Desktop handoff records KAN-75 Production PASS / Jira Done and preserves the full release evidence. KAN-78 does not repeat that release or modify its evidence, database state, or concurrency implementation. Existing KAN-75 review material remains historical.
- Current KAN-78 implementation/verification belongs in PROJECT_STATE.md and docs/reviews/KAN-78-accounting-load-safety.md. Other open workstreams and the deliberate Staging differences are not accepted or changed by KAN-78.

### KAN-48 Fakturor Search And Filtering Release

- KAN-48 reached Production release on 2026-10-11 at commit
  `609b902756046a467a241f497b38feb4339ac1a9`
  (`KAN-48 fix invoice filter search`).
- Final Vercel Production deployment:
  `dpl_BgMR9sNoQCrRqbJmd5qgthRhhpL9`,
  `https://sololedger-17gsffhcj-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build verified branch `main`, commit
  `609b902`, status `Ready`.
- `origin/main`, `origin/staging`, and local `main` were synchronized at
  `609b902` after release.
- Scope completed: Fakturor gained display-only search/filter/sort improvements
  for invoice number, customer phrase, invoice-date prefixes, amount search,
  paid/unpaid buttons, year-end status buttons, reset, empty result state, and
  a compact filter layout consistent with transaction history.
- Stripe checkout/portal/webhook initialization was made lazy so builds and
  environments without Stripe configuration fail with controlled route errors
  instead of crashing the app. Existing configured Stripe behavior was
  preserved.
- Verification included focused invoice-filter regression scripts,
  `npm run typecheck`, `npm run test:domain`, `npm run build`,
  `git diff --check`, Staging manual acceptance by Pontus, and non-destructive
  Production smoke checks for the start/login pages and Stripe route metadata.
- No database migration, Supabase write, Vercel environment change, Jira
  mutation, write-E2E run, or bookkeeping/VAT/year-end logic change was part of
  this release.

### KAN-35 / KAN-47 Complete Transaction History Release

- KAN-35 and KAN-47 reached Production release, Pontus manual Production
  acceptance, and Jira `Done` on 2026-10-10.
- Production `main`/`origin/main` release commit:
  `0f4e316f0db8f94942f229c6665a5875e3451d6b`
  (`docs: update KAN-35 KAN-47 release checkpoint`).
- Final Vercel Production deployment:
  `dpl_7ZbZuwLUavdQJReTvgNWJBzB5WPm`,
  `sololedger-6334acy49-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `0f4e316`, status `Ready`.
- KAN-35 scope completed: transaction history now loads through complete-safe
  `fetchAllRows`/chunked journal-row loading, verifies exact counts, preserves
  user/year scope, fails closed on incomplete history, and only shows history
  after a verified complete status for the currently selected year. Older
  overlapping loads and refreshes cannot overwrite newer history.
- KAN-47 scope completed: TransactionTable has compact search, category/source
  filter chips, sorting, show-more behavior, category/source regression
  coverage, and amount/date search. The work is presentation/read behavior and
  does not mutate bookkeeping data.
- Local verification before release included the focused transaction-history
  loader/state/filter scripts, `npm run typecheck`, `npm run test`,
  `npm run test:e2e:smoke`, and `git diff --check`.
- Production verification was non-destructive. Pontus manually accepted the
  released KAN-35 and KAN-47 behavior in Production on 2026-10-10.
- Full Staging-write-E2E and real browser E2E with over 1000 transactions were
  not verified for this release and remain documented limitations.
- KAN-60 was created separately as a future `Bug`, priority `Medium`,
  status `To Do`: historically linked customer invoices are missing from the
  `Kundfakturor` filter. KAN-60 concerns historical links between manual
  vouchers and customer invoices from earlier KAN-51 work, not ordinary
  `customer_invoice` transactions and not a confirmed double-booking problem.
- No database migration, Supabase write, data repair, backfill, new bookkeeping,
  deploy outside the approved release, or KAN-60 implementation was part of
  this closeout.

### KAN-59 Responsive Header / Adaptive Navigation Release

- KAN-59 reached Production release, Pontus manual Production acceptance, and
  Jira `Done` on 2026-10-10.
- Production `main`/`origin/main` release commits:
  `147fdb5` (`docs: close KAN-56 KAN-57 KAN-58 release`),
  `65d369c` (`KAN-59 fix responsive header navigation`),
  `4ca6bba` (`KAN-59 refine header more menu`), and
  `dc9efae` (`KAN-59 make header navigation adaptive`).
- Final Vercel Production deployment:
  `dpl_7QN9QZbudAtKVvJUUPUC6TEroDt7`,
  `sololedger-1z3ya3l3q-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `dc9efae`, status `Ready`.
- Scope completed: `src/components/Layout.tsx` now keeps the SOLOLEDGER brand
  and subtitle visible, preserves mobile hamburger navigation, keeps `Logga ut`
  separate on desktop, and uses adaptive one-line desktop navigation from
  `lg`/1024 px. Desktop navigation measures available width and actual button
  widths, shows as many items as fit in order, and moves only overflow items to
  `Mer`; if everything fits, `Mer` is hidden.
- Admin is included in the width calculation and is visible only for admins.
  Active-page indication works both for visible tabs and pages inside `Mer`.
  The dropdown preserves mouse/touch behavior, keyboard focus, Escape, outside
  click handling, close-on-navigation behavior, and relevant ARIA attributes.
- Local verification included `npm run typecheck`, `npm run test:e2e:smoke`,
  `git diff --check`, and isolated component fixtures for normal/admin users
  at 390, 768, 1024, 1280, 1440, and 1920 px, including resize both narrower
  and wider. Full write-E2E was not run for this UI-only release because it
  requires staging write credentials/configuration.
- Production verification was non-destructive: Vercel build was `Ready`,
  public auth/login smoke against `https://sololedger.vercel.app` passed 2/2,
  and Pontus manually accepted the Production navigation.
- No database migration, Supabase write, Edge Function change, authentication
  change, routing change, bookkeeping logic change, or data mutation was part
  of KAN-59.

### KAN-56 / KAN-57 / KAN-58 DB Regression Repair Release

- KAN-56, KAN-57, and KAN-58 reached Production release, Pontus manual
  Production acceptance, and Jira `Done` on 2026-10-10.
- Production `main`/`origin/main` release commits:
  `a74f03ddfb2bdbce4467271f599ea1ac04e6b7d67`
  (`docs: finalize KAN-55 closeout and project handoff`) and
  `68942aa7db73e1031ca2815d2908a2a2d58af996`
  (`KAN-56 KAN-57 KAN-58 repair delete and year-close regressions`).
- Vercel Production deployment:
  `dpl_8JzW66bPDMisHM3shaHhoNTjCm2p`,
  `sololedger-q4avp7aaz-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `68942aa`, status `Ready`.
- Supabase Production ref `wbaxmuvudpnkvuliicuy` received only the approved
  migrations in order: `20261009203900_kan56_kan57_db_regression_repair.sql`
  then `20261009220552_kan56_customer_invoice_booking_delete_context.sql`.
  Final Production migration head is `20261009220552`.
- Production DB post-check confirmed both migration versions, lifecycle-context
  rows `0`, RLS enabled on relevant tables, lifecycle table grants restricted
  to `postgres`, `delete_user_data_atomic(uuid)` executable only by `postgres`
  and `service_role`, and relevant immutability triggers still installed.
- KAN-56 scope completed: `delete_user_data_atomic` and lifecycle-context use
  the correct `backend_pid` path; admin/profile deletion protections and
  delete result counts are restored; fixed-asset, tax-account, VAT V2,
  customer-invoice, and related user-owned deletion ordering/parity are covered.
- KAN-57 scope completed: `close_year_atomic(integer)` again blocks unsafe
  year closing for unpaid/unfinished customer invoices while preserving the
  mandatory fixed-asset depreciation guard and other year-close protections.
- KAN-58 scope completed: local DB rollback regression guard, metadata and
  invariant checks, admin-delete dry-run contract tests, lifecycle postcheck
  harness, and documented run instructions were added. The write-capable DB
  regression guard refuses Supabase/non-local targets and was run against the
  verified isolated local database `sololedger_kan17c_test`.
- Edge Function `delete-user` was deployed to Supabase Production as version
  `10`, status `ACTIVE`, with `verify_jwt=true`. Downloaded Production source
  matched the approved local `index.ts` SHA-256 exactly.
- Automated release verification included local DB regression, invariant,
  admin-delete dry-run, typecheck, E2E safety, read-only E2E smoke, domain
  tests, `git diff --check`, Production DB read-only postchecks, Vercel build
  verification, HTTP `200`, and Production public-auth Playwright smoke 2/2.
- Pontus manually verified Production after release: login works, dashboard and
  existing bookkeeping display normally, customer invoices and fixed assets open
  without error, and no unexpected error messages appear.
- No real Production user deletion or Production bookkeeping mutation was used
  for final verification. Destructive admin-delete behavior was verified in
  Staging, not Production.
- Remaining non-blocking hardening follow-ups: full staging-write E2E has not
  been run as a complete suite for this closeout, and a fully fresh Supabase
  migration-chain build is not yet automated as its own release gate.

### KAN-55 Ordinary Purchase Input VAT Deduction Release

- KAN-55 reached Production release, Pontus owner acceptance, and Jira `Done`
  on 2026-10-09.
- Final Production `main`/`origin/main` release commits:
  `4dba2b47b7511332c95b268360c43782c3450da7`
  (`KAN-55 guard ordinary input VAT deduction`),
  `83da6f286461de972fdf8ba62f050b48bd66279e`
  (`KAN-55 clarify purchase VAT in transaction table`), and
  `f6696fa88f9ff730732ddc67e362fecf7ae68d68`
  (`KAN-55 keep purchase VAT profile guidance visible`).
- Final Vercel Production deployment:
  `dpl_8LXPsmEk6gB9o37iS6JiNpFZUWSn`,
  `sololedger-p9ntxvjzl-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `f6696fa`, status `Ready`.
- KAN-55 addresses ordinary Bokföring/V1 input VAT deduction entitlement for
  domestic purchases and periodizations, plus a VAT V2 guard for new
  full-deduction EU-service reverse-charge bookings.
- Product behavior: `none` and `unknown` profiles do not create automatic
  `2641`; `full` profiles default to full deduction but can choose no deduction
  for an individual purchase. Invoice VAT rate and deductible VAT remain
  separate concepts. No partial deduction rule was implemented.
- Final UI behavior: the transaction table separates invoice VAT
  (`Fakturamoms`) from actually booked deductible input VAT (`Momsavdrag`) by
  reading the transaction's journal rows. The bookkeeping form keeps profile
  guidance visible for ordinary Swedish cost purchases: `none` and `unknown`
  show guidance at both `0%` and positive invoice VAT; `full` keeps the
  existing deduction choice only when invoice VAT is positive.
- Production DB migration `20261008175927_kan55_purchase_input_vat_deduction`
  was applied to Supabase Production ref `wbaxmuvudpnkvuliicuy` on
  2026-10-08 before code release. Post-checks confirmed the migration ledger,
  `book_transaction_atomic(jsonb)`, `book_periodized_transaction_atomic(jsonb)`,
  internal helper/resolver functions, VAT V2 public wrapper, protected VAT V2
  delegate, grants, KAN-22 business facts, and KAN-54 fixed-asset guard.
- Staging verification covered rollback-safe SQL regressions for `none`,
  `unknown`, missing profile setting, `full`, per-purchase override to no
  deduction, ordinary purchases, periodizations, manipulated RPC attempts, VAT
  V2 full-deduction guard, VAT V2 no-deduction EU-service flow, and no
  persistent test data.
- Local release checks before commit: `npm run typecheck`, `npm run
  test:domain`, focused UI/domain scripts, and `git diff --check` passed.
  Read-only Production smoke passed 2/2 after deployment. Pontus manually
  verified Production behavior for the final UI adjustment.
- No existing verifications or bookkeeping data were changed. No Production
  accounting test transaction was created during final UI release.

### KAN-54 Fixed-Asset VAT Deduction Guard Production Release

- KAN-54 reached Production release on 2026-10-08 and is `Done` in Jira after
  Pontus product-owner acceptance.
- Production `main`/`origin/main` release commit:
  `4e90d1a487098c36f0608849fb315fde8fd61d35`
  (`KAN-54 guard fixed asset VAT deduction`).
- Vercel Production deployment:
  `dpl_68zo3FwhLxdNhHqevk8qDPhU91J1`,
  `sololedger-1msukfnht-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build commit verified as `4e90d1a`, status
  `Ready`.
- Supabase Production ref `wbaxmuvudpnkvuliicuy` received only the approved
  migrations in the controlled order:
  `20261008170000_kan54_fixed_asset_vat_deduction_guard.sql`, then
  `20261008173000_kan54_revoke_internal_delegate_service_role.sql`. The final
  Production migration ledger includes both versions.
- Production DB verification confirmed the internal fixed-asset acquisition
  delegate is executable by `postgres` only and denied for `anon`,
  `authenticated`, and `service_role`; the public wrapper remains executable by
  `authenticated` and `service_role`. KAN-54 functions are owned by `postgres`,
  run as `SECURITY DEFINER`, and use `search_path=public`.
- Production smoke was non-destructive: app loaded, an existing auth session
  worked, Inventarier loaded, a profile without deduction entitlement showed
  only `Inget momsavdrag` with the expected explanation, Bokföring/Moms/NE
  remained accessible, and browser console error count was zero.
- No artificial Production accounting transaction was created. Production UI
  states for `full` and `unknown` profiles were not tested because no such
  authenticated Production session was used and no Production profiles were
  changed; those server/RPC cases were covered in staging and focused SQL
  regressions.
- Remaining non-blocking risk/follow-up: ordinary Bokföring/V1 may still allow
  `2641` based on VAT rate without checking actual deduction entitlement. Jira
  search during KAN-54 found no exact existing issue; KAN-14/KAN-22/KAN-34/KAN-53
  are related but not the same scope. This was intentionally not implemented in
  KAN-54.

### KAN-36 K1 Fixed Assets Production Release

- KAN-36 reached Production release on 2026-10-08 and remains `In Review` in
  Jira for Pontus product-owner review; it was not marked `Done`.
- Production `main`/`origin/main` release commit:
  `3868ef19cbb927ed15a4d9ad15c8223d4082d50a`
  (`docs: record KAN-36 final staging guard verification`).
- Vercel Production deployment:
  `dpl_EEy4gDWNq9Ag99LeDtSrY1CdDdg1`,
  `sololedger-g9b8euw3k-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build commit verified as `3868ef1`, status
  `Ready`, and HTTP check returned `200`.
- Supabase Production ref `wbaxmuvudpnkvuliicuy` received the approved
  migrations in the controlled order:
  `20261007160000_kan36_fixed_assets.sql` before frontend deploy, then
  `20261008110000_kan36_redirect_manual_equipment_purchases.sql` after the
  frontend was confirmed live. Final Production migration ledger includes both
  versions, plus prior KAN-51 `20261007110000` and KAN-22 `20261007130000`.
- Production DB verification confirmed KAN-36 fixed-asset tables, RPCs,
  `get_tax_rule_parameters_for_year(2026)` returning half PBB `29600.00`, the
  `transactions_source_check` fixed-asset sources, and the final manual 5410
  guard trigger/function. The guard function was verified to skip non-manual
  sources and corrections and target only debit account `5410`.
- Production smoke was non-destructive: app loaded, existing auth session
  worked, Inventarier view loaded, ordinary Bokföring showed the 5410 redirect
  explanation, `Gå till Inventarier` navigated correctly, ordinary submit was
  disabled for 5410, initial fixed-asset assessment was neutral before amount,
  transaction history loaded, NE/report and Moms views loaded, and browser
  console error count was zero.
- No fictional Production accounting transaction was created. Inventory
  register value labels after depreciation were not visually testable in
  Production because no fixed assets existed there yet; this was the only
  smoke limitation.

### KAN-23 VAT V1 + VAT V2 Regression Acceptance

- KAN-23 reached `Done` in Jira on 2026-10-07 after leader acceptance and
  Production release verification.
- Production `main`/`origin/main` release commit:
  `a491afbc56a499b39a89df9908abc3e341a96955`
  (`test: add KAN-23 VAT V1/V2 acceptance coverage`).
- Vercel Production deployment:
  `dpl_5Rj6ha7MmrLsD8QhQPgt2m22YkxS`,
  `sololedger-pwytdpkdc-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build commit verified as `a491afb`, status
  `Ready`, and HTTP check returned `200`.
- Scope completed: bounded acceptance proved VAT V1 and native VAT V2 coexist
  correctly through booking, reporting, dashboard semantics, and VAT
  close/declare boundaries.
- Focused DB/RPC rollback acceptance file added:
  `supabase/tests/kan23_vat_v1_v2_acceptance_candidate.sql`. It books
  ordinary V1 sale/purchase, books VAT V2 EU service with no deduction through
  the current RPC, verifies KAN-22 `businessFacts` persistence, rejects missing
  and tampered business facts without side effects, closes the mixed period to
  expected net VAT `282` and 2650 payable balance, and declares the same
  period.
- Local verification: `npm run test:domain`, `npm run typecheck`,
  `git diff --check`, and the focused local DB/RPC rollback acceptance passed.
  Known Node module-type warnings were non-blocking.
- Existing domain/report/dashboard coverage supported V1 domestic reporting,
  VAT V2 full deduction, mixed aggregation, missing/broken VAT V2 snapshot
  fail-closed behavior, unsupported EU goods fail-closed behavior, and relevant
  SIE/correction/undo boundaries.
- No staging write testing, browser E2E, concurrency harness, Supabase
  migration, Production database write, or broad unrelated test rerun was
  performed for KAN-23.
- Real two-session concurrency remains not empirically tested. Pontus accepted
  this as a documented verification limitation, not a KAN-23 blocker.
- KAN-53 remains separate `To Do` future work for real EU-goods VAT V2
  accounting support.

### KAN-22 VAT V2 UX Fact Capture

- KAN-22 reached `Done` in Jira on 2026-10-07 after leader review, manual UI
  acceptance, Production Supabase migration, and Vercel Production deployment
  verification.
- Production `main`/`origin/main` release commit:
  `020fb099c1cb946b84a1cb624e5b12881e81f5b0`
  (`KAN-22 structure derived VAT field`).
- Vercel Production deployment:
  `dpl_8fkQGirnxE733DMmZ38qwdPBFsAN`,
  `sololedger-p5yq9vx5b-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build commit verified as `020fb09`, status
  `Ready`, and HTTP check returned `200 OK`.
- Supabase Production ref `wbaxmuvudpnkvuliicuy` migration
  `20261007130000_kan22_vat_v2_business_facts.sql` is live as version
  `20261007130000`.
- Pre-migration Production checks verified KAN-22 was not already applied,
  KAN-14 no-deduction and KAN-51 prerequisites were present, the VAT V2
  idempotency table and booking RPC existed, and the pre-KAN-22 RPC did not yet
  require `business_facts`.
- Post-migration Production read-only verification showed the migration version
  exists, the RPC requires `p_payload->'business_facts'`, persists
  `businessFacts` in the VAT audit snapshot, includes tamper validation for
  mismatched taxable base, keeps `authenticated` execute access, and has the
  audit/idempotency tables present.
- Product scope completed: the `Utlandsinköp` form now asks for observable
  business facts rather than BAS accounts, VAT report boxes, or VAT V2
  implementation categories. Supported choices remain
  `Programvara/prenumeration`, `Annan tjänst`, and `Vara`; EU-goods accounting
  remains intentionally unsupported in KAN-22.
- Jessika/Adobe acceptance path: EU software/subscription service with no
  supplier VAT and no deduction entitlement produces output VAT `57`,
  deductible input VAT `0`, and net payable `57` for a `228 SEK` base.
- Full-deduction reverse-charge path produces output VAT `57`, deductible input
  VAT `57`, and net `0` for the same base.
- Staging RPC validation on `fzxqiqenqjzhlyxxpvhg` verified valid no-deduction
  and full-deduction scenarios, persisted `businessFacts` evidence in audit
  snapshots, rejected contradictory/tampered facts, rejected missing
  `business_facts`, and cleaned synthetic staging test data to zero residual
  rows. The staging migration ledger was intentionally not advanced because
  staging had unrelated migration-history differences.
- Local verification before release included focused VAT audit snapshot tests,
  VAT transaction preflight tests, VAT runtime booking tests, transaction-form
  UI tests, `npm run test:domain`, `npm run typecheck`, and `git diff --check`.
- KAN-53 `VAT V2 – Stöd EU-varuinköp` was created as a separate `To Do`
  follow-up for real EU-goods VAT/accounting support. KAN-22 did not implement
  EU-goods accounting.
- No artificial bookkeeping transaction was created in Production, no staging
  write matrix was rerun against Production, and no broad Playwright/E2E suite
  was run during release.

### KAN-41 Dashboard VAT Correctness

- KAN-41 reached `Done` in Jira on 2026-10-07 after leader review, local visual
  acceptance, manual E2E/SIE cross-check, and Production release verification.
- Production `main`/`origin/main` release commit:
  `c2f4a0edd1e5fbbc6c22113a02b8038798bb2772`
  (`KAN-41 use VAT report semantics in dashboard`).
- Vercel Production deployment:
  `dpl_Gb2XLb4zKoNfcT6wKZVkSqYWP5vZ`,
  `sololedger-dwilkk3ta-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; build log verified branch `main`, commit
  `c2f4a0e`, and HTTP check returned `200 OK`.
- Scope completed: dashboard VAT overview now uses the same authoritative
  VAT-report aggregation semantics as the VAT report for the selected calendar
  year, including legacy VAT, native VAT V2, and VAT V2 audit snapshots.
- `Säkert uttag` now consumes the corrected VAT balance and enters a controlled
  review-required state instead of presenting a falsely safe amount when VAT
  cannot be calculated safely.
- No Supabase migration, Supabase write, accounting write-path change, VAT V2
  write-path change, audit snapshot change, journal-generation change, or
  existing accounting data change was made.
- Local verification before release: focused dashboard/VAT tests,
  VAT-report aggregation/service/presentation tests, `npm run test:domain`,
  `npm run typecheck`, and `git diff --check` passed.
- Pontus manual cross-check verified VAT V2 no-deduction contributes output VAT
  `57` and payable `57`, full-deduction reverse charge contributes output VAT
  `57` and deductible input VAT `57` with net `0`, and the dashboard/VAT/SIE/NE
  totals reconcile.

### KAN-52 Customer Invoice Year-End Receivable Wording

- KAN-52 reached `Done` in Jira on 2026-10-07 after Pontus local visual
  acceptance and Production release verification.
- Production `main`/`origin/main` release commit:
  `2040be360ebeea9fdc70d353472535d19f7db54b`
  (`KAN-52 clarify invoice year-end wording`).
- Vercel Production deployment:
  `dpl_FQH754uuhMDZJj4eo6LhF7g8fyj2`,
  `sololedger-oh0tkmg6l-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`; HTTP check returned `200 OK`.
- Scope completed: wording/UX only for customer-invoice year-end receivable
  semantics. The visible UI now uses `Kundfordran vid bokslut`,
  `Ingen kundfordran vid bokslut`, and `Bokför kundfordran` so same-year paid
  invoices are not described as excluded from the year's accounting.
- No Supabase migration, database write, schema change, RPC change, accounting
  behavior change, VAT behavior change, or existing invoice data change was
  made.
- Local verification before release: focused UI regression source check,
  `npm run typecheck`, and `git diff --check` passed. No Playwright, staging,
  or E2E was run, matching the approved low-risk wording-only scope.

### KAN-51 Historical Customer Invoice Linkage

- KAN-51 reached `Done` in Jira on 2026-10-07 after Pontus manual Production
  acceptance of the two historical customer invoices in `Fakturor`.
- Production `main`/`origin/main` release commit:
  `96409421dba19ecfdab9e7208152a95fae02c319`
  (`KAN-51 add historical invoice linkage support`).
- Vercel Production deployment:
  `dpl_zYehYHHC2TkaEXrFmGrXxHo4E1C4`,
  `sololedger-esinyxpxd-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`.
- Supabase Production migration:
  `20261007110000_kan51_historical_customer_invoice_linkage.sql`, live as
  version `20261007110000`.
- Scope completed: added a tightly scoped historical customer-invoice booking
  kind, `historical_payment_same_year`, so two pre-KAN-46 invoices could be
  represented in `Fakturor` while preserving the existing manual
  verifications, journal rows, attachments, and verification-number sequence.
- Approved Production repair created only two `customer_invoices` rows and two
  `historical_payment_same_year` linkage rows. It did not create transactions,
  journal entries, VAT/tax rows, corrections, or verification-number changes.
- Production acceptance verified both invoices are paid, historical payment
  labels display correctly after refresh, normal undo is hidden, and no further
  KAN-51 data repair is required.
- Model clarification from acceptance: current `Med i bokslutet` /
  `Inte med i bokslutet` labels refer specifically to whether a
  `year_end_receivable` booking exists. Same-year paid invoices correctly have
  no `year_end_receivable`. The wording can still be misunderstood; KAN-52
  was created as a separate wording/UX follow-up.

### KAN-50 Profile UX Polish

- KAN-50 reached `Done` in Jira on 2026-10-06 after Pontus manual Production
  visual acceptance.
- Scope completed: Profile `Företagsinformation` hierarchy/readability polish
  only. The final accepted layout uses a subtle `Företagsuppgifter` card and
  side-by-side `Momsregistrering` / `Momsbehandling` cards on desktop, with
  clean responsive stacking on smaller screens.
- Production Git commit:
  `64367a6a9a210534c46130ff05b82638d5361a78`
  (`KAN-50 refine profile card layout`).
- Vercel Production deployment:
  `dpl_3yHfVPwxRCA72Lq3HUuEP78pYMxP`,
  `sololedger-ab3n8jb93-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`.
- Verification followed the low-risk UI budget: TypeScript and diff checks,
  no Playwright/E2E, no staging DB, no schema or behavior changes.
- Future follow-up preserved: a broader UI/UX consistency pass may later align
  areas such as `Betalningskonton` with the newer Profile card language.

### KAN-49 Company VAT Number Field

- KAN-49 reached `Done` in Jira on 2026-10-06 after Pontus manual Production
  acceptance.
- Scope completed: a nullable company profile `VAT-nummer` field, Swedish VAT
  number format validation, profile load/save support, and no coupling from the
  identifier field to VAT policy semantics.
- Production Supabase ref `wbaxmuvudpnkvuliicuy` migration
  `20261006143000_add_profile_vat_number.sql` is live; final migration head:
  `20261006143000`.
- Deployed Production Git commit:
  `0162654e08d24780ef8ab5da8118dcfd04463fec`
  (`docs: record KAN-49 production release`).
- Vercel Production deployment:
  `dpl_35vXDLXKjkY7QgRv2XmCeaUmKraU`,
  `sololedger-gfm0d7o75-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`.
- Verification included staging write acceptance, Production read-only schema
  verification, Vercel Ready/alias verification, and Pontus manual Production
  acceptance that the field saves, survives reload, and leaves VAT-policy
  settings intact.
- Follow-up captured separately as KAN-50: Profile page information hierarchy,
  readability, and neutral VAT help text.

### KAN-14 + KAN-46 Production Release And Acceptance

- KAN-14 and KAN-46 reached `Done` in Jira on 2026-10-06 after Pontus manual
  Production acceptance.
- Production Supabase ref: `wbaxmuvudpnkvuliicuy`; final migration head:
  `20261006120000`.
- Deployed Production Git commit:
  `28868fafb395d266227b47b10bbbc9f8a789495d`
  (`docs: record KAN-14 production DB gate`).
- Vercel Production deployment:
  `dpl_EK2hQxEMwMXNsAirgGnHtgNbXVQA`,
  `sololedger-hxq6vopry-sololedger1.vercel.app`, aliased to
  `https://sololedger.vercel.app`.
- Automated non-destructive Production smoke passed:
  `npx playwright test tests/e2e/public-auth.spec.ts --project=chromium
  --reporter=list` against `https://sololedger.vercel.app` passed 2/2.
- KAN-46 completed scope: external customer invoice lifecycle for unpaid
  customer receivables at year end; customer invoice registry/UI; mandatory
  attachment handling; explicit paid/unpaid and year-end booked status; 31/12
  controlled receivable booking; later settlement against 1510; safe payment
  undo; edit-before-booking only; Swedish date entry and clearer invoice UI.
- KAN-46 accounting remained server-side through the reviewed RPCs. Verified
  flows include `1510 D / 3010 K / 2611 K` for year-end receivable,
  `1930 D / 1510 K` for next-year settlement, no duplicate revenue/VAT, and
  undo that preserves traceable journal history.
- KAN-14 completed scope: Jessika VAT profile support where VAT registration
  does not by itself imply taxable Swedish sales; ordinary manual domestic
  3xxx income follows `domestic_sales_vat_treatment`; exempt/not-registered
  sales cannot carry ordinary domestic VAT; unknown/mixed fails closed; EU
  service reverse charge supports no normal input-VAT deduction.
- KAN-14 228 SEK EU service / 25% / no-deduction acceptance: journal
  `4535 D 228`, `4535 D 57`, `2614 K 57`, payment account `K 228`, no `2645`;
  VAT return field 21 = 228, field 30 = 57, field 48 = 0, field 49 = 57
  payable.
- Production DB gates were completed before frontend release. KAN-46 Production
  DB migrations live: `20261005193000`, `20261005203000`, `20261005210000`,
  `20261005213000`. KAN-14 Production DB migration live:
  `20261006120000_kan14_vat_v2_no_deduction.sql`.
- Pontus Production acceptance evidence: in Jessika Foto & Media's real
  Production company profile, Pontus configured VAT registered, annual VAT
  reporting, SoloLedger VAT-period handling from `2026-06-02`, domestic sales
  small-business exempt, foreign purchases in VAT return required, and normal
  input VAT deduction entitlement none. Manual Production verification
  confirmed `Försäljning (Intäkt)` locks VAT to 0% with clear small-business
  exemption explanation; KAN-46 `Registrera kundfaktura` entry point is present;
  `Utlandsinköp` entry point is present; no obvious Production UI issue was
  found; no test bookkeeping transaction was created.
- Separate follow-ups preserved: VAT number / VAT ID field is not implemented;
  Jessika's two historical customer invoices predate KAN-46 and need careful
  future backfill without duplicate revenue/VAT; historical Adobe invoices
  remain a separate unresolved correction task; KAN-47/KAN-48 remain future
  work.

### KAN-39 Clearer Bookkeeping Form and VAT V2 Blocked Submit UX

- KAN-39 reached `Done` in Jira on 2026-10-05 after Pontus final-smoked the
  Production flow.
- Production `main`/`origin/main` checkpoint:
  `bb739642c6fca4faad96751cd8d891eacb69b226`
  (`KAN-39 clarify blocked VAT V2 submit feedback`).
- Scope completed: UX-only improvements to the bookkeeping form. `Datum` and
  `Beskrivning` now have clearer input affordance, VAT V2 no longer shows the
  previous duplicate red missing-role submit error, and a blocked VAT V2 submit
  updates the existing status panel to `KAN INTE BOKFÖRA ÄNNU` with a
  deterministic, deduplicated list of current blockers.
- No bookkeeping logic, RPC, Supabase migration, or KAN-38 server-side
  enforcement behavior was changed.
- Verification included targeted UI regression coverage, `npm run typecheck`,
  `npm run test:domain`, targeted lint, `npm run build`, `git diff --check`,
  Vercel Production deployment verification, and Pontus Production smoke.

### KAN-38 VAT V2 Server-Side Payment Role Enforcement

- KAN-38 reached `Done` in Jira on 2026-10-04 after Pontus IRL-accepted the
  Production flow on a separate test account.
- Production `main`/`origin/main` checkpoint:
  `8740c4dadc135433ad27826a04b8dc61799c0c74`
  (`KAN-38 enforce VAT V2 payment roles`).
- Live Supabase migration:
  `supabase/migrations/20261004152057_kan38_vat_v2_payment_role_enforcement.sql`,
  registered live as version `20261004152057`.
- Scope completed: `book_vat_v2_eu_service_reverse_charge_atomic(jsonb)` now
  treats payment role as the authoritative client/server contract for new VAT
  V2 EU-service bookings. The RPC resolves the actual payment account from
  `company_payment_account_roles` for `auth.uid()`, validates role semantics
  and the user's account plan, rejects new client-supplied
  `payment_account_number`, and records both role and server-resolved account
  in booking-time audit/idempotency metadata.
- Legacy idempotency behavior was preserved: exact old account-number replay
  remains stable, and a role-based replay of an old successful operation only
  succeeds when immutable canonical fields match and the role matches the old
  account class. Role match alone is not enough.
- Automated verification included rollback SQL regression on
  `sololedger_kan17c_test`, VAT V2 runtime tests, `npm run typecheck`,
  `npm run test:domain`, targeted ESLint, `npm run build`, `git diff --check`,
  pre-deploy read-only live review, live migration verification, and Vercel
  Production deployment verification.
- Production IRL acceptance verified business role `1930` created
  `VER-4 / TEST V2` with `2614 K`, `1930 K`, `2645 D`, `4535 D`; private role
  `2018` created `VER-5 / TEST V2 PRIVAT` with `2614 K`, `2018 K`, `2645 D`,
  `4535 D`; and missing business role blocked before booking with no `VER-6`
  or observed partial write. `business_payment_account = 1930` was restored on
  the test account afterward.
- UX follow-up from acceptance was captured separately as KAN-39: clearer
  Date/Description input affordance and non-duplicated VAT V2 missing-role
  validation text. KAN-39 is UX-only and must not change bookkeeping logic or
  security rules.

### KAN-37 Central Payment Account Settings

- KAN-37 reached `Done` in Jira on 2026-10-04 after Pontus IRL-verified the
  local and Production flows.
- Production `main`/`origin/main` checkpoint: `db93f2d` (`KAN-37 fix payment
  account loading race`).
- Scope completed: central `Betalningskonton` in Profil backed by
  `company_payment_account_roles`; non-blocking Bokföringssidan prompt; VAT V2
  and Momsrapport guidance to Profil; preserved 2013 semantics for private
  withdrawal from tax account; and explicit account-plan load-state handling so
  saved roles do not flash as missing while the account plan is still loading.
- Verified behavior included Profile selection/persistence, reminder removal,
  VAT V2 business/private paths, missing-2018 blocking, Momsrapport
  pre-submit guidance, and the payment-account loading race fix.
- KAN-37 intentionally did not change the VAT V2 RPC contract. KAN-38 remains
  the separate follow-up for server-side payment-role enforcement/hardening.

### External Audit #1 Final Closeout

- External Audit #1 was closed on 2026-10-01 after KAN-33 reached `Done`.
- Production sanity at final closeout: local `HEAD` matched `origin/main`,
  production returned HTTP 200 from `https://sololedger.vercel.app`, and live
  Supabase migrations were in sync through `20261001120000`.
- Canonical audit package files `SOLOLEDGER_AUDIT_*.md` were intentionally
  left untouched. They remain the original external audit snapshot rather than
  the mutable closeout record.
- Jira audit work status verified at closeout:
  KAN-29, KAN-30, KAN-31, KAN-32, and KAN-33 were all `Done`.
- KAN-34 remains `To Do` as a parked future UX feature for completing VAT facts
  on ambiguous legacy/SIE rows. It is not an audit blocker because KAN-32
  already fixed the audit risk by blocking/flagging ambiguous inference rather
  than guessing.
- KAN-35 remains `To Do` as a low-priority UI transaction-history pagination
  follow-up. It is not an audit blocker because KAN-33 removed known silent
  row-limit risk from economic report/calculation paths.
- Finding disposition:
  F1-F6 were fixed/verified by the P0 remediation in KAN-29; F7 was documented
  as a false positive/design decision; F8 was fixed/verified by KAN-30; F5 and
  F10 were fixed/verified by KAN-31; F9 was fixed/verified by KAN-32; the
  query-completeness follow-up was fixed/verified by KAN-33.
- No known External Audit #1 finding remains open without an explicit
  non-blocking disposition.

### KAN-33 External Audit #1 Query Completeness

- KAN-33 reached production IRL verification on 2026-10-01.
- Implementation commit:
  `d3dd79943572f3760607e04914907faa835d417f`.
- Live migration:
  `supabase/migrations/20261001120000_kan33_account_balance_rpcs.sql`.
- Migration SHA-256:
  `995578DB38841CC4CA031573C9F62182D96B1DDDA6BAB804885C41D93CA73A76`.
- The migration is live in Supabase production project `wbaxmuvudpnkvuliicuy`
  as version `20261001120000`.
- Root cause: several accounting/report read paths could depend on
  PostgREST/Supabase default row limits or `.in(...)` list limits, which could
  silently truncate large user datasets and make economic figures look
  complete when they were not.
- Phase 1 added `src/lib/supabaseFetchAll.ts`, a strict fetch-all helper that
  requires exact counts, pages until the verified count is reached, rejects
  query/count drift/mismatch/missing count, and deduplicates chunk input values.
- VAT report reads were moved to strict fetch-all/chunked fetch while
  preserving VAT V2 and KAN-32 semantics.
- Phase 2 added read-only server-side saldo aggregation RPCs:
  `get_period_account_balances(date,date)` and
  `get_cumulative_account_balances(date)`.
- The RPCs derive tenant from `auth.uid()`, use `SECURITY INVOKER`, explicitly
  filter both `transactions.user_id` and `journal_entries.user_id`, grant
  execute only to `authenticated`, and do not weaken RLS.
- Dashboard, result, balance, and NE paths now use complete server-side
  aggregation instead of client-side journal-row loading.
- Phase 3 made SIE export complete-safe for current-year transactions,
  current-year journal rows, prior-year transaction/journal data used for
  `#RES -1`, account rows, and opening-balance candidates. `#VER`, `#RES`,
  `#IB`, and `#UB` now fail closed if source completeness cannot be verified.
- Dashboard VAT breakdown and available VAT years were also moved to complete
  fetch-all paths.
- Automated evidence included:
  `node scripts/test-supabase-fetch-all.ts`, `npm run test:domain`,
  `scripts/test-sie-export-completeness.ts`, `scripts/test-vat-report-service.ts`,
  local SQL regression `scripts/test-account-balance-rpcs.sql`,
  `npm run typecheck`, scoped ESLint, and `git diff --check`.
- The >1000-row regressions verify complete fetches, correct VAT/SIE/account
  sums, and multi-user isolation. These tests are the evidence for exact
  completeness and amounts.
- Full repo lint still has old unrelated debt; scoped KAN-33 lint was green.
- Production DB post-apply verification showed migration registered exactly
  once; both RPCs existed with expected signatures; both were `SECURITY
  INVOKER`; `PUBLIC` and `anon` lacked execute; `authenticated` had execute;
  RLS policy fingerprint and pre-existing public-function fingerprint were
  unchanged.
- Production IRL on Pontan AB after F5 verified that Ekonomiöversikten,
  NE-bilagan, Momsrapport, and SIE-export 2026 load/work normally after the
  migration, with no new observed errors, empty economic views, or obvious
  regressions. Exact amounts were not manually validated in IRL because Pontan
  AB contains many test verifications.
- Code/product view mapping verified: there are no separate result/balance
  report UI views beyond existing Ekonomiöversikt, NE-bilaga, Momsrapport, and
  SIE export paths.
- Remaining non-economic/UI-only completeness follow-up:
  KAN-35 `UI transaction history completeness beyond PostgREST row limits`,
  low priority, `To Do`.
- External Audit #1 implementation work is complete through KAN-33. Final
  audit-level closeout was completed after this workstream.

### KAN-32 / F9 Legacy/SIE Reverse-Charge VAT Safety

- KAN-32 reached final production IRL verification on 2026-10-01.
- Root cause: legacy/manual/SIE VAT inference treated some BAS VAT accounts
  broadly enough that reverse-charge-shaped rows such as `2614`, `2624`,
  `2634`, and `2645` could be interpreted as ordinary Swedish VAT even when
  no authoritative VAT return base field existed.
- Safety principle preserved: account `2614` or `2645` indicates VAT account
  shape, not enough by itself to infer fields such as ruta 21.
- Safety fix commit:
  `a1bdbb508c0ebd187ac51b6abc0ec3794e2f6a54`.
- The safety fix blocks/flags ambiguous legacy/manual/SIE reverse-charge
  indicators instead of guessing, while ordinary Swedish VAT that can be
  inferred safely and native VAT V2 snapshot-backed reporting continue to work.
- No migration, DB-write, historical correction, backfill, or manual deploy was
  needed for the safety fix.
- IRL test file `KAN-32-IRL-legacy-reverse-charge.se` was imported manually in
  test company Pontan AB / Testfirma SoloLedger and created an active
  ambiguous SIE case.
- Production IRL before cleanup: Momsrapport Q3 2026 stopped correctly with a
  clear warning; dashboard 2026 showed `MOMS — Kontroll krävs`; VAT detail
  explained that an imported SIE row with reverse-charge indicator lacked a
  controllable VAT return field.
- The larger UX feature for completing VAT facts after SIE import was parked
  separately as KAN-34:
  `Komplettera momsuppgifter för tvetydiga legacy/SIE-bokningar`.
- Undo follow-up root cause: after normal `Ångra import`, the original
  `sie_import` and generated `sie_import_undo` economically neutralized each
  other, but KAN-32 evaluated both individually and ignored the authoritative
  `import_batches.status = 'undone'`.
- Undo follow-up commit:
  `5520536af23a29fabaa57b6eb5b3afc46568f697`.
- The undo fix uses existing SIE batch status as the authoritative signal. It
  does not net journal rows and does not affect other completed SIE imports or
  native VAT V2.
- Production deploy for `5520536af23a29fabaa57b6eb5b3afc46568f697` was
  verified through GitHub/Vercel as `success`, and
  `https://sololedger.vercel.app` returned HTTP 200.
- Final IRL after undo fix: Pontan AB dashboard 2026 showed normally again and
  no longer `Kontroll krävs`; Momsrapport Q3 2026 worked normally after the
  KAN-32 test import was undone; active ambiguous SIE import had already been
  verified to block safely.
- Local verification for the undo follow-up included targeted VAT report,
  service, dashboard tests, `npm run typecheck`, targeted ESLint,
  `npm run test:domain`, and `git diff --check`.
- KAN-32/F9 is complete. The later KAN-33 query-completeness investigation is
  also complete, so no KAN-32 audit blocker remains.

### KAN-31 / F5 + F10 Durable VAT Operation Idempotency

- KAN-31 reached production IRL replay verification on 2026-10-01.
- F5 fixed: VAT V2 now has durable protection against duplicate booking on
  retry through `vat_v2_booking_idempotency`.
- F10-A fixed: VAT V2 retry identity survives reload within the same browser
  session for the same operation intent.
- F10-B fixed: an already completed operation can be reconfirmed by exact
  same-key replay even if the year is later locked, while a new operation is
  still blocked by the mutable guards.
- Main implementation commit:
  `ea08d9b8c98b254b73dd933f4fd6dcab9ebc25f1`.
- ACL fix commit:
  `37230c6a5e4c65395e87f5bded0011f6f7104c23`.
- Main migration live: `20260930190000`.
- ACL migration live: `20261001060000`.
- The ACL fix leaves `service_role` with SELECT-only access to
  `vat_v2_booking_idempotency`; ordinary app roles have no direct table access
  and RLS remains enabled.
- `delete-user` Edge Function v9 is live with `verify_jwt: true` and includes
  `vat_v2_booking_idempotency` in dry-run counting.
- Production IRL used disposable test company `TESTNAMN AB`.
- First booking: date `2026-10-01`, description
  `KAN-31 idempotency IRL 2026-10-01 001`, amount `100`, created VER-18.
- Controlled replay used the same idempotency key and canonical payload and
  returned the same transaction/snapshot/VER-18 with `idempotent_replay: true`.
- Post-replay production verification: still exactly 1 matching transaction,
  1 VAT audit snapshot, 1 idempotency row, and 4 journal rows; no duplicate
  booking or new verification was created.
- F5 + F10 are complete. Later closeouts completed F9 through KAN-32 and the
  query-completeness investigation through KAN-33.

### KAN-30 / F8 Atomic User Deletion Lifecycle Coverage

- KAN-30 / F8 reached `PRODUCTION IRL VERIFIED` on 2026-09-30.
- Root cause: stale `delete_user_data_atomic` omitted modern VAT/lifecycle
  tables, so accounts with tax-account lifecycle rows could leave RESTRICT FK
  blockers and immutable lifecycle rows outside the deletion scope.
- Implementation commit:
  `076a6fa45dae2edd4881f85c92b760351d0529d2`.
- Live migration:
  `supabase/migrations/20260930163000_kan30_delete_user_data_vat_lifecycle.sql`.
- Migration SHA-256:
  `9494FC49991F572CBE8AB667A0285174130245FB1F03880AAB000AF66C7D110B`.
- The migration is live in Supabase as version `20260930163000`.
- KAN-30 introduced a private
  `delete_user_data_atomic_lifecycle_context` table and controlled lifecycle
  DELETE context for `delete_user_data_atomic`, without weakening ordinary
  lifecycle immutability. UPDATE remains immutable, and ordinary app roles did
  not gain lifecycle write/delete/bypass capability.
- The authoritative deletion order now removes `tax_account_movements`,
  `tax_account_events`, `vat_audit_snapshots`, `vat_periods`,
  `company_payment_account_roles`, then legacy application data in dependency
  order.
- Dry-run parity commit:
  `d3e9ea8d0e29116ab97cc6e6daab805febea58d7`.
- `delete-user` Edge Function version `8` is live with `verify_jwt: true`.
- Production dry-run matched the DB snapshot for the strong F8 fixture.
- The disposable production fixture exercised both former blocker classes:
  `1` `tax_account_movement`, `1` `tax_account_event`, `3` `vat_periods`,
  `1` `company_payment_account_roles`, `32` `transactions`, and `89`
  `journal_entries`.
- Normal Admin permanent deletion succeeded.
- Post-delete verification: auth user absent; all 13 known application-table
  counts were `0`; former blocker rows and associated lifecycle transactions
  were absent; `delete_user_data_atomic_lifecycle_context` had `0` target rows
  and `0` global rows.
- Security post-verification passed: KAN-30 migration remained live,
  `delete-user` remained active v8 with JWT verification, lifecycle
  immutability triggers remained installed/enabled, RPC/function ACLs remained
  restricted to `service_role`/`postgres`, and relevant RLS stayed enabled.
- External Audit #1 status after KAN-30: F1/F2/F3/F4/F6 fixed/verified,
  F7 false positive/closed, F8 fixed/production IRL verified. Remaining:
  F5 -> KAN-31, F9 -> KAN-32, F10 -> KAN-31, query-completeness
  investigation -> KAN-33.
- Separate follow-up candidate: the VAT tax-account movement flow can require
  `business_payment_account`, while the available UI for configuring suggested
  `1930` is discoverable through the VAT V2/foreign-purchase booking flow
  rather than a general settings surface. The VAT UI warning can therefore
  point users toward settings that are not actually available there.

### External Audit #1 P0 Remediation Batch 2

- External Audit #1 P0 Batch 2 reached `IRL VERIFIED` on 2026-09-30.
- Checkpoint/deployed commit:
  `0d8a4c891b418f8195a9f9cd2863fbf4e28048e2`.
- Live migration:
  `supabase/migrations/20260930120000_audit1_p0_vat_lifecycle_semantics.sql`.
- Migration SHA-256:
  `B321142E53B4906B1ED448254799907C5415C9C78683D5AB4C4F021B5371B1DF`.
- Production deployment was tied to the exact checkpoint commit.
- F1/F2/F3/F4/F6 scoped regressions passed.
- RC-A existing Q1 lifecycle/report production smoke passed.
- RC-C configured `1930` VAT V2 payment-source production UI path passed.
- RC-B production negative IRL passed: declared Q2 2026, event date
  `2026-06-30` exactly at period end, attempted settlement `1.00`, correctly
  rejected.
- RC-B post-attempt DB verification showed registered `0.00`, remaining
  `1640.00`, event count `0`.
- No cleanup was required because the rejected operation produced no settlement
  event.
- Jira was not modified as part of acceptance recording; Jira remains a
  separate explicit approval gate.
- RC-D was not started.
- Deferred/non-P0 findings remain deferred; this acceptance does not mark
  F5/F8/F9/F10 or RC-D complete.

### KAN-18 VAT Treatment Decision Engine

- KAN-18 `VAT V2-3 - VAT treatment decision engine` is Done in Jira as of read-only verification on 2026-09-26.
- KAN-18 added pure TypeScript/domain work only: `VatFactsInput -> VatTreatment` through a typed ready/blocked decision result.
- KAN-18 extended the facts contract with `companyProfile`, explicit `calculationRate`, and transaction-level `deductionEntitlement`.
- KAN-18 kept `calculationRate` as an input fact, not the whole VAT treatment, and returned `treatment: null` for blocked decisions.
- KAN-18 blocked unknown/material facts when they can change VAT treatment and blocked unsupported first-slice scenarios rather than guessing.
- Implemented first-slice ready paths: domestic taxable sale, domestic deductible purchase with full deduction and supplier-charged VAT, EU service reverse charge with no deduction, and EU service reverse charge with full deduction.
- Verified blocked/unsupported paths included unknown rate/countries/supplier VAT/deduction/profile facts, invalid profile invariants, invalid amounts, partial deduction, supplier-charged foreign VAT, domestic no-deduction purchase, non-Swedish sale, and domestic purchase without supplier-charged VAT.
- KAN-18 final verification: `npm run test:domain`, `npm run typecheck`, targeted lint, `git diff --check`, and `npm run test:regression` passed.
- KAN-18 preserved boundaries: no BAS account mapping, no journal/debit/credit plan, no DB/RPC/Supabase/migration/live data change, no frontend/runtime integration, no K1/NE implementation, no partial deduction formula, no import VAT implementation, and no partial first VAT period implementation.

### VAT V2 Foundation Through KAN-17

- KAN-16 `VAT V2-1 - Domain/profile model` implemented the pure TypeScript VAT foundation: `CompanyVatProfile`, `VatFactsInput`, `VatTreatment`, explicit unknown states, profile validation, and representation tests.
- KAN-16 established that domestic small-business exemption can coexist with VAT registration and required foreign-purchase reporting; company-level default deduction is context only and transaction-level VAT treatment decides deduction.
- KAN-16 kept `VatTreatment` representational only: no decision engine, journal plan, account mapping, RPC payload, or runtime integration.
- KAN-17 `VAT V2-2 - Central VAT account roles` was completed through KAN-17A/B/C and then frozen for later VAT V2 work.
- KAN-17A added the central DB-safe VAT account classification primitive and wrappers for period-guard relevance, close-balance participation, and close manual-review relevance.
- KAN-17B migrated the P1 VAT period guard/concurrency compatibility helper to delegate through the KAN-17A classifier path.
- KAN-17C migrated `close_vat_period_atomic(uuid)` P2/P3 account-role predicates to the central KAN-17A wrappers while preserving VAT V1 business semantics.
- KAN-17 live rollout and migration-history reconciliation were completed before KAN-18 work. No KAN-17 design should be reopened unless new evidence proves incompatibility with the next architecture.
- VAT account semantics are capability-based, not a one-role/one-boolean model.
- VAT V1 remains the locked regression baseline. KAN-17 did not introduce VAT V2 booking/report/runtime behavior.

### VAT V1 Production Baseline Locked

- Manual IRL/Production test completed 2026-09-20 for real VAT period `2026-04-01` to `2026-06-30`.
- Before close, VAT report showed taxable sales excl VAT `8,560.00 SEK`, outgoing VAT 25% `2,140.00 SEK`, input VAT `500.00 SEK`, VAT payable `1,640.00 SEK`.
- Close moved the period `open -> closed` and created `VER-81`, transaction `23f91b08-dac2-4f77-b253-f2c5bd7b1aad`, date `2026-06-30`, source `vat_closing`, description `Momsavslut 2026-04-01 - 2026-06-30`.
- Read-only live DB verification of closing journal entries: `2611` debit `2140.00`, `2641` credit `500.00`, `2650` credit `1640.00`; total debit and credit both `2140.00`.
- VAT period after close: status `closed`, source `sololedger`, closing amount `1640.00`, closing transaction ID `23f91b08-dac2-4f77-b253-f2c5bd7b1aad`, `declared_at NULL`; VAT report remained `8,560 / 2,140 / 500 / 1,640`.
- Production UI close flow verified correct close eligibility, confirmation, atomic close success, `STÄNGD` state, closing amount `1,640 SEK ATT BETALA`, `VER-81` shown as `MOMSAVSLUT / SYSTEMBOKNING`, no ordinary edit/delete behavior for the system booking, and unchanged VAT report.
- Production declaration moved the period `closed -> declared`; confirmation correctly explained that declaration should only be marked after submission to Skatteverket and that no new accounting verification/payment is created.
- After declaration, UI showed status `DEKLARERAD`, source `SOLOLEDGER`, period type `KVARTAL`, closing amount `1,640 SEK ATT BETALA`, declaration timestamp `2026-09-20 13:45`, and no Declare action. Re-running VAT calculation returned unchanged sales `8,560`, outgoing VAT `2,140`, input VAT `500`, payable `1,640`.
- KAN-7, KAN-8, and KAN-12 were manually moved to `Done` in Jira after Production validation.

### KAN-5 3B.5 Undo SIE VAT Guard

- Completed checkpoint commit: `2efdfa1 KAN-5 add undo SIE VAT concurrency guard`.
- Jira KAN-5 was moved to `In Review`; Pontus final IRL/review remains before `Done`.
- Permanent live migration installed: `supabase/migrations/20260917_add_vat_guard_to_undo_sie_import.sql`.
- Migration SHA-256: `6176E76A30A9A38E010260542B299036B457FE1607C17BB2532D148C27EA3597`.
- Live `public.undo_sie_import_atomic(uuid)` now includes VAT pre-scan, transaction fingerprint revalidation, VAT advisory locks, deterministic transaction and journal-entry locks, authoritative VAT-date recompute, and SoloLedger `closed`/`declared` VAT period guard.
- Functional rollback DB tests against live: 10/10 PASS; post-test live verification clean.
- Permanent post-install read-only verification: PASS for live definition, function grants, VAT helper grants, relevant RLS/policies, constraints, indexes, and absence of unexpected KAN-5 schema objects.
- Concurrency A/B tests were designed and adversarially reviewed but not empirically run; they are deferred to an isolated Supabase branch/test environment and must not be marked PASS.

### KAN-6 3B.5 Import SIE VAT Guard

- Completed checkpoint commit: `8ee64fc KAN-6 add import SIE VAT guard`.
- Jira KAN-6 was moved to `In Review` and assigned to Pontus; Pontus final IRL/review remains before `Done`.
- Permanent live migration installed: `supabase/migrations/20260918_add_vat_guard_to_import_sie_batch.sql`.
- Migration SHA-256: `096E0825DFF11B7744C8024AF1BD64E0108AD720C54A0D1554C1913FD06BF611`.
- Live `public.import_sie_batch(jsonb)` now includes read-only VAT pre-scan, VAT advisory locks, SoloLedger VAT-period state guard before writes, duplicate check after VAT guard, and `get_next_ver_nr` only after protective locks/state guard.
- Functional/regression rollback DB tests against live: 14/14 PASS; atomicity/negative cases, outer rollback, and fixture cleanup PASS.
- Permanent post-install read-only verification: PASS. Live function md5 `13ce699a75462ce1e97cc52755a79376`, length `18408`, and grants/metadata verified.
- Empirically executed rollback test artifact before final `\ir` rename-reference SHA-256: `E807AB1BAFC6C19F19BE2DE50881A5B8B8564C0794F22036A50218EB841EFCC6`; final test file differs only by pointing `\ir` to the permanent migration filename.
- KAN-6 concurrency is DEFERRED / NOT EMPIRICALLY TESTED.
- KAN-5 concurrency remains DEFERRED / NOT EMPIRICALLY TESTED.

### KAN-7 3B.5 close_vat_period_atomic Foundation

- Completed checkpoint commit: `d3427f9 KAN-7 add atomic VAT period closing`.
- Jira KAN-7 was moved to `In Review` and assigned to Pontus; Pontus final IRL/review remains before `Done`.
- Permanent live migration installed: `supabase/migrations/20260918_add_close_vat_period_atomic.sql`.
- Migration SHA-256: `07EA138C427D07AAAF2E073E9CC3092B60C9A0042CBA56F6FBA605D7EA00B269`.
- Test file: `supabase/tests/kan7_close_vat_period_atomic_candidate.sql`; final SHA-256 after permanent `\ir` rename: `14FB0A6C52B26947B28BDCBBC583A96457EBA2C53270BCDED4E7139BCA50840E`.
- Live `public.close_vat_period_atomic(uuid)` creates atomic VAT closing transactions with `source='vat_closing'`, uses `journal_entries.date` for period membership, closes exact scope `261x/262x/263x/2641`, blocks 265x activity for manual review, does not set `declared_at`, and sets `transactions.amount = total debit`.
- Rollback DB tests against live: 18/18 PASS; rollback postflight CLEAN.
- Permanent post-install read-only verification: POST-INSTALL VERIFIED; live normalized `pg_get_functiondef()` matches the migration function definition exactly.
- Test-user `ver_nr_sequences.last_ver_nr` remained `22`; no fixtures or unexpected schema/data changes were found.
- True two-session concurrency remains DEFERRED / NOT EMPIRICALLY TESTED.
- UI/app integration caveat: before exposing VAT close to users, `vat_closing` must be treated as a system booking in TransactionTable/app flows so ordinary edit/delete/correction controls are not offered for VAT closing transactions.

### KAN-12 7B App Integration And VAT Closing Integrity

- Completed checkpoint commit: `8311ee4 KAN-12 add VAT period close app integration`.
- Jira KAN-12 was moved to `In Review`; Pontus final IRL/review remains before `Done`.
- KAN-12 7B.1 DB-integrity guard was installed live and checkpointed in commit `bb52c91`.
- 7B.1 behavior: `create_correction_transaction_atomic` blocks `source='vat_closing'` in pre-scan and authoritative post-row-lock paths; `update_transaction_safe` blocks all updates to `source='vat_closing'`, including `file_url`.
- 7B.1 rollback DB test against live: 55 assertions PASS, explicit ROLLBACK, clean postflight; permanent post-install read-only verification passed.
- 7B.2 app protection presents `source='vat_closing'` as `Momsavslut` / `Systembokning`, hides ordinary edit/correction/delete/file actions for VAT closing rows, and adds defense-in-depth page handler guards.
- 7B.3 VAT periods read model adds typed `VatPeriod`, `ensureVatPeriods(throughDate)`, and read-only `getVatPeriods(startDate,endDate)`, with `Momsrapport.tsx` using DB-backed period dates/status/source.
- 7B.4 close flow adds typed `closeVatPeriod(periodId)` over live `close_vat_period_atomic`, exposes close only for eligible open SoloLedger-managed periods, requires confirmation, avoids optimistic close, refreshes central bookkeeping, reloads `vat_periods`, and handles refresh-failure warnings.
- KAN-12 app verification: `npm run typecheck` PASS; `npm run test:domain` PASS, 81/81; targeted ESLint introduced no new debt beyond existing baseline; `git diff --check` PASS with CRLF warnings only; `npm run build` PASS after approved network access for Next/Google Fonts.
- Full close UI/E2E against an isolated staging/test environment remains pending. No destructive close test was run against ordinary/live user data.


## KAN-87 — completed Production release (2026-10-17 closeout)

- Final accepted Production commit: 172f3a138874e587122ba500c8791a2ab9ac3a45; sole parent 7467143e3221b012b3d0e49397e2b0c8d3b6f445. Main exact SHA rechecked at start of KAN-85/64/67/68 round.
- KAN-87 Done / Pontus verified from Jira on 2026-10-17. Prior worktree checkpoint still says In Review; current Jira status supersedes that wording. No KAN-87 Jira mutation here.
- Preserved KAN-87 post-release checkpoint records Production PASS, Vercel dpl_3qo6dpN7Dqb78BqqeNrj1fzJkMe1 READY, public HTTP/browser smoke and exact Production binding. Those are prior release receipts, not a deployment re-audit in this UI round.
- Delivered readable Adobe transaction labels/search, positive refunds, neutral reclassifications and preserved originals. Review and detailed tests remain in docs/reviews/KAN-87-local-verification.md and Git history; no accounting semantics changed.
- Production/Preview evidence remains in the preserved KAN-87 worktree and its referenced ignored evidence locations. Its uncommitted PROJECT_STATE.md is untouched.
- Existing Staging PDF privacy finding remains separate: do not copy/reuse it as synthetic evidence. KAN-85/64/67/68 uses newly generated synthetic data only.
- Superseded KAN-87 preparation/publication steps from inherited PROJECT_STATE are replaced by this completed navigation entry; no deployment or bookkeeping operation repeated.


## KAN-63 old test worktree — accepted historical risk B (2026-10-17)

- Pontus accepted class B and explicitly closed the investigation. No further investigation or restoration is needed now. No lost product code or other important work was demonstrated; possible ignored local-file loss remains an acknowledged historical uncertainty.
- App automatic cleanup triggered after creating kan85-68-ui removed kan63-staging-base-test on 2026-10-17 11:25:44–45 CEST. The saved source snapshot refs/codex/snapshots/4188b821a228a469f229c8ec6a7dbd181b8743a9 exactly matches prior HEAD 13e6a0a8160f7ca2cfd65d204c9b4853562bfaf0/tree efbc659349569454d217f7502658dbee8d07e556.
- Bounded checks covered exact parent directory, known app/snapshot logs, Git snapshot metadata and original-chat summaries. No verified inventory/backup of ignored contents or known unique ignored work/configuration/test material was identified; this is not proof that none existed.
- Detailed evidence and previous STOP decisions remain in docs/reviews/KAN-85-64-67-68-local-verification.md, superseded by this explicit acceptance for checkpoint purposes. No cleanup/restore was performed during the investigation.
- Permanent prevention rule now in AGENTS.md: explicit approval and tracked/untracked/ignored inventory before removal; do not trigger managed-worktree creation if automatic cleanup protection cannot be verified. App cleanup is NOT verified disabled; that environment limitation remains.


## KAN-85/64/67/68 — technical Production PASS (2026-10-17)

- Pontus accepted final Staging UI and explicitly approved release 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340. Verified exact history: 172f3a138874e587122ba500c8791a2ab9ac3a45 -> d7825e6918dad83f21e94ea39fd7d31a75d3f7f9 -> 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340; pushed exact SHA non-force to GitHub main only. No rebase/squash/cherry-pick or old staging/KAN-62/65 integration.
- Delivered: KAN-85 deposit Belopp/no VAT/zero guard; KAN-64 verified existing profile text, no product code; KAN-67 empty validated date/full amount/neutral invoice header; KAN-68 receivable/year-end/settlement/exempt help. No shared date/RPC/report/NE/DB semantics changed. Ten-path release manifest retained in Git history and release receipt.
- Automatic Vercel main integration produced dpl_HqcZejtMKu2z3SirE2dBeNfnGZmA READY/PROMOTED, same exact GitHub main SHA. Canonical https://sololedger.vercel.app/ HTTP 200. Nine observed deployed client scripts: Production wbaxmuvudpnkvuliicuy present, Staging absent, new amount/deposit/year-end code present. No manual Production deploy or environment/config changes.
- Public browser smoke login/registration-view/reset-view PASS, all observed requests GET and responses 200, no failed requests/console errors or requests from view switches. No login/form submission/DB request/positive payment/booking/migration/Storage write. Bookkeeping data was not touched by release actions; no full global DB comparison or concurrent-user audit claimed.
- Local supporting evidence: typecheck/UI-round 1440/390/all profile/VAT variants/deposit IDs and favorites/date invalidation/record-settle-undo/amount header statuses/layout PASS; targeted invoice filters/VAT-policy/tests lint PASS. Two prior component lint errors remain; original safe-regression wrapper had known Turbopack junction failure, prior constituents and bounded webpack public smoke passed. Earlier synthetic local rollback journal/VAT/NE/balance/dashboard lifecycle preserved; no Production DB test repeated. Detailed evidence remains in docs/reviews/KAN-85-64-67-68-local-verification.md.
- Initial Preview dpl_7eu5z6K5cW1JXisFRhqunccRNgdL at d7825e6 and updated Preview dpl_5cresudSvQUDU9yVfiK5BKcRm24N at 2423f4b were clean archives (330 committed files/329 uploaded hashes matched) with explicit Staging binding and no Production client ref. Earlier dirty Preview review evidence preserved. Pontus initial partial KAN-67/68 acceptance and final full UI approval remain distinguished from absent hosted positive lifecycle tests.
- Remote staging 5809094dd3ce808dba35986c65e772b842f0d0e1 and updated Preview unchanged by release; other 16 worktree HEAD/status/changed-untracked file metadata unchanged. Local main ref remains stale 0bc166de68f7989f6a3d1483c062f4b4b1570629, untouched. No worktree cleanup/creation.
- After technical PASS, Jira KAN-85/67/68 assigned Pontus and moved to In Review, comments 11633/11634/11635. KAN-64 remains To Do/unassigned, already-working verification comment 11636. This was the immediate post-release snapshot. Final acceptance/Done verification below supersedes it.
- KAN-88 remains separate/unimplemented, observed exempt 3010 -> R1; expected R1/R2 EJ FASTSTÄLLT. Historical old-worktree risk B accepted/CLOSED, earlier archive/detail preserved; automatic-cleanup disablement not verified. Existing private Staging PDF never accessed/reused here.
- Release receipt: C:/Users/Familjedator/.codex/visualizations/2026/10/17/01a14929-cdaf-7f42-be41-c37f69ea04b4/kan85-68-production-release/release-result.md; exact deployment/push/public-client/smoke/other-worktree evidence adjacent. Post-release state/archive edits are local/uncommitted; prior dirty review retained; no documentation commit/push or staging synchronization authorized at that point. The later account-switch decision below authorizes a local documentation checkpoint only.


## KAN-85/64/67/68 — final acceptance and local account-switch handoff (2026-10-17)

- Pontus gave final Production acceptance. Jira read-only recheck: KAN-85 Done/Pontus; KAN-64 Done/unassigned; KAN-67 Done/Pontus; KAN-68 Done/Pontus. No Jira write in this handoff. KAN-64 remains a verified-already-working closeout with no new product implementation.
- Production/GitHub main remains 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340; base 172f3a1 -> d7825e6 -> 2423f4b. Prior verified automatic Vercel Production dpl_HqcZejtMKu2z3SirE2dBeNfnGZmA READY, public HTTP/browser smoke, Production binding and unchanged data/write boundaries retained above. No new deploy, database operation or tool-auth experiment for account switch.
- KAN-88 To Do/unassigned remains a separate unresolved NE investigation; observed exempt 3010 -> R1, expected R1/R2 EJ FASTSTÄLLT. KAN-89 To Do/unassigned newly requests per-user hiding/showing categories for new bookings while preserving history, safe favorites/defaults/legacy IDs and accounting/VAT behavior. Neither is implemented or automatically selected as the next task.
- Active continuation path: C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user, branch codex/KAN-85-64-67-68-ui. Read AGENTS.md, PROJECT_STATE.md, Architecture.md, then relevant archive/review/Jira. Open this existing checkout directly; do not create a managed worktree. The Desktop checkout is an older dirty staging context, not current Production.
- Authorized local documentation checkpoint: PROJECT_STATE.md, PROJECT_ARCHIVE.md and prior uncommitted docs/reviews/KAN-85-64-67-68-local-verification.md Preview evidence. Parent 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340; final SHA is reported after commit. New commit changes documentation only and is intentionally not pushed. No product/test/lockfile/env/auth/migration changes or Jira status changes.
- Retention: accepted UI publication/verification/previous partial and final acceptance navigation now archived; detailed original review and historical worktree-risk findings retained without deleting history. Risk B remains accepted/CLOSED, AGENTS protection rule present, automatic cleanup-off control still unverified. No cleanup/removal/restore/prune/reset.
- Tool/account continuity is not proven by repository continuity. Existing ignored local credentials/configuration/test material remain on the same computer, not stored/copied into Git or chat; next account may need its own normal connector/login access. No secrets read/hashed/copied and no external access setup attempted.

### Preserved worktree inventory before local documentation checkpoint

All 17 registered directories exist. For named managed worktrees below, absolute path is C:/Users/Familjedator/.codex/worktrees/<name>/sololedger_multi_user; Desktop has the explicit original repository path in current state. Counts cover Git tracked changes plus untracked files, excluding ignored contents. No content inspection of credentials/ignored files. Full HEAD/status/file-size/mtime receipt: C:/Users/Familjedator/.codex/visualizations/2026/10/17/01a14929-cdaf-7f42-be41-c37f69ea04b4/account-switch-handoff/worktrees-before.json.

| Worktree | Branch | HEAD before checkpoint | Changed/untracked files |
|---|---|---|---:|
| Desktop (original repository) | staging | 11d830644232 | 7 |
| kan63-production-candidate | codex/KAN-63-production-candidate | 357c980fba8a | 0 |
| kan63-staging-integration | codex/KAN-63-staging-integration | 30e82adf9d28 | 0 |
| kan63-staging-migration-prep | codex/KAN-63-staging-migration-prep | 01ae664f12e0 | 2 |
| kan71-production-release | codex/KAN-71-production-release | 1d297c1fd387 | 1 |
| kan71-sie-vat-periods | codex/KAN-71-sie-vat-periods | 69f928ac0208 | 0 |
| kan71-staging-release | codex/KAN-71-staging-release | a47a57d07fd7 | 0 |
| kan72-journal-index | codex/KAN-72-journal-user-ver-index | d67db203c0d2 | 0 |
| kan72-staging-integration | codex/KAN-72-staging-integration | 9ff22b45cc7b | 1 |
| kan72-standard-amount-guard | codex/KAN-72-standard-amount-guard | 5ae670c32693 | 0 |
| kan74-release-checkpoint | codex/KAN-74-release-checkpoint | 8692f0566fea | 0 |
| kan74-sie-opening-guard | codex/KAN-74-sie-opening-guard | 1d297c1fd387 | 26 |
| kan74-staging-release | codex/KAN-74-staging-release | 5809094dd3ce | 5 |
| kan84-adobe-oneoff | codex/KAN-84-adobe-oneoff | 9756abca8ac2 | 18 |
| kan85-68-ui | codex/KAN-85-64-67-68-ui | 2423f4b3f090 | 3 |
| kan86-shared-attachments | codex/KAN-86-shared-attachments | 7467143e3221 | 1 |
| kan87-history-presentation | codex/KAN-87-history-presentation | 172f3a138874 | 1 |

Dirty files outside the selected UI checkout (preserve; not included in handoff commit):

- Desktop: ` M PROJECT_STATE.md`; `?? audit-packages/2026-10-independent-product-technical-audit/01_PRODUCT_OVERVIEW.md`; `?? audit-packages/2026-10-independent-product-technical-audit/02_ACCOUNTING_FLOWS.md`; `?? audit-packages/2026-10-independent-product-technical-audit/03_ACCOUNTING_RULES.md`; `?? audit-packages/2026-10-independent-product-technical-audit/04_TECHNICAL_ARCHITECTURE.md`; `?? audit-packages/2026-10-independent-product-technical-audit/05_TESTS_AND_KNOWN_RISKS.md`; `?? scripts/create-kan63-staging-user.mjs`.

- kan63-staging-migration-prep: `?? supabase/migrations/20261012123000_kan62_fixed_asset_gross_vat_rate.sql`; `?? supabase/migrations/20261012153000_kan62_fixed_asset_group_locking.sql`.

- kan71-production-release: ` M PROJECT_STATE.md`.

- kan72-staging-integration: ` M PROJECT_STATE.md`.

- kan74-sie-opening-guard: ` M PROJECT_STATE.md`; ` M package.json`; ` M scripts/check-db-regression-invariants.mjs`; ` M src/components/SieImportModal.tsx`; ` M src/lib/adminDeleteDryRun.ts`; ` M src/lib/sieImport.ts`; ` M src/lib/sieParser.ts`; ` M supabase/functions/delete-user/index.ts`; `?? docs/reviews/KAN-74-P1-blocker.md`; `?? docs/reviews/KAN-74-P2-period-blocker.md`; `?? docs/reviews/KAN-74-company-lock-followup.md`; `?? docs/reviews/KAN-74-server-import-design.md`; `?? docs/reviews/KAN-74-server-import-implementation.md`; `?? docs/reviews/KAN-74-sie-opening-guard.md`; `?? docs/reviews/KAN-74-single-year-guard.md`; `?? docs/reviews/KAN-74-staging-release-plan.md`; `?? scripts/test-sie-import.mjs`; `?? scripts/test-sie-opening-guard.mjs`; `?? src/app/api/sie/import/route.ts`; `?? src/lib/sieImportPayload.ts`; `?? src/lib/sieImportServer.ts`; `?? supabase/migrations/20261015115900_kan74_sie_verified_inputs.sql`; `?? supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql`; `?? supabase/migrations/20261015121000_kan74_sie_receipt_deletion.sql`; `?? supabase/tests/helpers/kan74_receipt_fixture.sql`; `?? supabase/tests/kan74_sie_opening_guard.sql`.

- kan74-staging-release: ` M PROJECT_STATE.md`; `?? docs/reviews/KAN-74-production-publication.md`; `?? docs/reviews/KAN-74-production-release-plan.md`; `?? docs/reviews/KAN-74-staging-publication.md`; `?? docs/reviews/KAN-74-staging-release-result.md`.

- kan84-adobe-oneoff: ` M package.json`; `?? docs/reviews/KAN-84-B-pid-retest-pass.md`; `?? docs/reviews/KAN-84-B-timeout-diagnosis.md`; `?? docs/reviews/KAN-84-local-candidate.md`; `?? docs/reviews/KAN-84-staging-execution-stopped.md`; `?? docs/reviews/KAN-84-staging-run-ready.md`; `?? scripts/kan84/adobe-plan.mjs`; `?? scripts/kan84/adobe-sql.mjs`; `?? scripts/kan84/b-pid-retest.mjs`; `?? scripts/kan84/staging-kit.mjs`; `?? scripts/kan84/staging-migrate.ps1`; `?? scripts/kan84/staging-run.mjs`; `?? scripts/kan84/test-b-pid-monitor.mjs`; `?? scripts/kan84/test-local.mjs`; `?? scripts/kan84/test-plan.mjs`; `?? scripts/kan84/test-staging-kit.mjs`; `?? supabase/migrations/20261015180458_kan84_explicit_first_vat_year_period.sql`; `?? supabase/oneoff/kan84_adobe_body.sql`.

- kan86-shared-attachments: ` M PROJECT_STATE.md`.

- kan87-history-presentation: ` M PROJECT_STATE.md`.


### KAN-97 – ersatt verifierings-/releasechronologi inför kontobyte (2026-10-20)

- Detta arkiverar endast ersatta delsteg, inte den aktiva KAN-97-uppgiften. Nuvarande release, kvarvarande hostad acceptans, faktura-/UI-uppgift och inventarieberoenden står i PROJECT_STATE.md och docs/reviews/KAN-97-INVOICE-INVENTORY-DEPENDENCIES.md.
- Tidig kritisk granskning fann fyra P1; lokala test-first-rättningar följdes av isolerad PG17-verifiering, gemensam årsprocent och ny full checkpointregression/build. De tidiga smoke-/infrastrukturstoppen är historiska och ersätts av senare godkända slutkörningar, utan att gamla FAIL/BLOCKED räknas om till PASS. P1/DB/UX-rapporter och coverage-bevis bevaras på ursprungliga platser.
- Äldre full lint 75 fel/6 varningar ersattes efter UX av 74 befintliga fel/6 varningar; ingen bred lintstädning. Tidigt test-results-bevarandeavsteg kvarstår redovisat i aktiv state och P1-rapport; originalråloggar påstås inte återställda.
- Checkpoint 430842c → integrationscommit 504ee839 (staginghistorik bevarad, exakt checkpointträd) → tom identitetscommit 585c894. GitHub staging har fast-forwardats; ingen omskrivning/force-push. KAN-62/65:s pausade produktkod återinfördes inte.
- Godkända Staging-installationer: C installerade endast migration 20261019200000, 52→53 versionsrader, och D1 publicerade enbart delete-user v5→v6 med JWT-skydd. Fulla definition-/inventarie-/bevarandebevis finns i ../KAN-97-staging-integration-20261020/KAN-97-STAGING-MIGRATION-C.md respektive KAN-97-STAGING-EDGE-D1.md. Hostad användarfunktionalitet var inte provad genom dessa installationskontroller.
- Första manuella D2 dpl_EhqAia9ZTJnpcNaK7wVS5d3rNTYV blev BLOCKED på nolare-författarens behörighet, ingen app/acceptansadress. Inga teamrättigheter ändrades. Lokal rätt SoloLedger-identitet och en godkänd tom releasecommit gav senare ett nytt separat godkänt Preview-försök READY. Första försöket är inte retroaktivt PASS.
- Detaljrapporter, releasekommandon, lokala diagnostikbegränsningar och exakta SHA/manifest finns bevarade under ../KAN-97-staging-integration-20261020/. Pre-retention PROJECT_STATE och filmanifest bevaras i account-handoff-20261020/ där. Inga befintliga bevis/filer raderades eller flyttades under handoffen.

## Superseded local inventory UX checkpoint (retained 2026-10-22)

Previous PROJECT_STATE described codex/inventory-ux-profile-drafts, local code 261147c,
base ad0f54c, and local verification recorded in docs/reviews/INVENTORY-UX-LOCAL-PASS.md.
Subsequent root release audit records accepted Production/Staging 3e7aa0c; that root audit,
not this old clone state, governs external release claims. KAN-98 starts from 3e7aa0c.
Existing inventory fixtures and older evidence remain preserved; no reset or replay.

## 2026-10-22 – avslutat plansteg inför KAN-99 Etapp A

- Pontus godkände konkret åttastegsplan efter återanvänd kartläggning och verifierad bas 53b9c82.
- KAN-98 har därefter accepterad Production PASS/Done; dess produktkopia bevaras oförändrad.
- Lokal A-implementation ligger nu på separat KAN-99-gren; aktiv status/testgränser i PROJECT_STATE.md
  och docs/reviews/KAN-99-ETAPP-A-LOCAL-PASS.md. Hela KAN-99 är inte avslutad; B/C inte godkända.

## 2026-10-22 – KAN-99 ursprunglig lokal A-checkpoint ersatt av lokal navigationsrättelse

- Ursprunglig A-kandidat81ea7e9 publicerades efter Pontus godkännande och fick separat godkänd aliasrättning.
- A:s historiska 8 browsergrupper och bredare verifieringsgränser finns i LOCAL-PASS/kan99-local-a;
  aktiv rättelse, riktade10 grupper och hosted delprov ligger i STATE och KAN-99-NAVIGATION-FIX-20261022.md.
- KAN-99 är fortsatt aktiv In Review/Pontus; ingen B/C eller ny Production-release.

## 2026-10-22 – föregående KAN-99 returknappsfel accepterat i Staging

- Kandidat41ad08f publicerades separat och Pontus bekräftar manuellt att kvarhängande returknapp är löst.
- Sista UX-detaljen (öppna kontroller vid återgång) fick separat lokalt godkännande; aktiv lokal verifiering i STATE
  och KAN-99-OPEN-CONTROLS-LOCAL-PASS-20261022.md. Ingen ny Staging/Production-release här.

## 2026-10-22 – KAN-99 Etapp A manuellt accepterad på Stagingf7

- Pontus bekräftar navigation, förbrukad retur och bevarade öppna kontroller på exaktf7da31d.
- Före Production begärdes endast neutralt fiktivt EU-momsexempel. Aktiv liten lokal textkandidat i STATE
  och KAN-99-FICTIONAL-VAT-LOCAL-PASS-20261022.md; ingen ny publicering eller Done.
