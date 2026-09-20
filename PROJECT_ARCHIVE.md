# SoloLedger Project Archive

This file is for compact long-term summaries of completed or superseded workstreams.

Do not archive active work here prematurely. Current active work remains in `PROJECT_STATE.md`.

## Archived Workstreams

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
