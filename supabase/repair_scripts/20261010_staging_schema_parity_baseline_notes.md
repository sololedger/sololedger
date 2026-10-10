# SoloLedger Staging Schema Parity Baseline Notes

Status: draft notes only. Do not change the active CLI baseline in this step.

## Verified Root Cause

Staging was built from `supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql`.
Production was not rebuilt from that file; it already had manually applied live
schema effects and was later migration-ledger aligned.

The active CLI baseline therefore does not fully reproduce the Production live
structure for a fresh Staging/local database.

## Later Baseline Changes Needed

The active CLI baseline should later be corrected so fresh environments match
Production without needing a Staging-only repair. At minimum, review and add:

- `numeric(15,2)` for `transactions.amount`.
- `numeric(5,2)` for `transactions.vat_rate`.
- `numeric(15,2)` for `journal_entries.debit` and `journal_entries.credit`.
- `UNIQUE (user_id, year)` for `closed_years`.
- `UNIQUE (user_id, file_hash)` for `import_batches`.
- `ON DELETE CASCADE` on the legacy user/transaction/import-batch foreign keys
  that Production currently has.
- RLS enabled for every `public` table created by the baseline and later
  migrations, including `delete_user_data_atomic_lifecycle_context` and
  `tax_rule_parameters`.
- The `ensure_rls` event trigger binding for `public.rls_auto_enable()`, or an
  explicitly documented replacement strategy.
- Production-equivalent grants for old core tables and sensitive RPCs, avoiding
  accidental broad `anon` or `PUBLIC` access.

Do not edit historical applied migrations casually. A baseline correction needs
its own review because it changes the behavior of future fresh environments, not
the already-running Production database.

## Repair Draft Safety Notes

The Staging-only repair draft is intentionally separate from a future baseline
correction. It now takes deterministic `ACCESS EXCLUSIVE` locks before data
preflight so numeric, unique, and FK checks run while relevant Staging writes
are blocked. A lock timeout should stop the repair attempt; it should not retry
automatically.

The draft cannot prove the Supabase project ref from ordinary SQL. A future
approved execution therefore must verify the connected target outside the
database as `fzxqiqenqjzhlyxxpvhg` and set the required session marker before
running the draft. Missing or different marker values fail closed.

After a future approved Staging repair commit, run the read-only postcheck:
`supabase/repair_scripts/20261010_staging_schema_parity_postcheck_READ_ONLY.sql`.
Every row should report `PASS` before Staging-write-E2E is reconsidered.
