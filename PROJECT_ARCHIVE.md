# SoloLedger Project Archive

This file is for compact long-term summaries of completed or superseded workstreams.

Do not archive active work here prematurely. Current active work remains in `PROJECT_STATE.md`.

## Archived Workstreams

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
