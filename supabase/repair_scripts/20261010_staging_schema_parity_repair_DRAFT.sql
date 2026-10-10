-- SoloLedger Staging schema parity repair DRAFT.
--
-- Status:
--   REVIEW ONLY. Do not run without Pontus explicit approval.
--
-- Intended target:
--   Supabase Staging only: fzxqiqenqjzhlyxxpvhg.
--
-- Absolute safety boundaries:
--   - Never run against Production wbaxmuvudpnkvuliicuy.
--   - No Production data, credentials, or environment values are used here.
--   - No data deletion.
--   - No automatic bookkeeping-value changes or rounding.
--   - This draft ends with ROLLBACK by default.
--
-- Execution note for a future approved repair:
--   Run only through an explicitly verified Staging connection. Replace the
--   final ROLLBACK with COMMIT only after a fresh read-only preflight and
--   leader approval for the exact SQL state.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Single-run guard for concurrent repair attempts.
SELECT pg_advisory_xact_lock(hashtext('sololedger_staging_schema_parity_repair_20261010'));

-- ---------------------------------------------------------------------------
-- 1. Fail-closed preflight: expected Staging drift and compatible data only.
-- ---------------------------------------------------------------------------

DO $preflight$
DECLARE
  v_count bigint;
  v_version_count bigint;
  v_head text;
BEGIN
  SELECT count(*), max(version)
    INTO v_version_count, v_head
  FROM supabase_migrations.schema_migrations;

  IF v_version_count <> 35 OR v_head <> '20261009220552' THEN
    RAISE EXCEPTION 'Unexpected migration ledger state: count %, head %.', v_version_count, v_head;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
  ) THEN
    RAISE EXCEPTION 'Expected Staging drift not found: ensure_rls event trigger already exists.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname IN (
      'closed_years_user_id_year_key',
      'import_batches_user_id_file_hash_key'
    )
  ) THEN
    RAISE EXCEPTION 'Expected Staging drift not found: unique constraints already exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'delete_user_data_atomic_lifecycle_context'
      AND c.relrowsecurity = false
  ) THEN
    RAISE EXCEPTION 'Expected Staging drift not found: lifecycle context RLS is not disabled.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'tax_rule_parameters'
      AND c.relrowsecurity = false
  ) THEN
    RAISE EXCEPTION 'Expected Staging drift not found: tax_rule_parameters RLS is not disabled.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT user_id, year
      FROM public.closed_years
      GROUP BY user_id, year
      HAVING count(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'closed_years has duplicate (user_id, year) groups.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT user_id, file_hash
      FROM public.import_batches
      GROUP BY user_id, file_hash
      HAVING count(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'import_batches has duplicate (user_id, file_hash) groups.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.accounts t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'accounts.user_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.closed_years t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE t.user_id IS NOT NULL
    AND u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'closed_years.user_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.favorites t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'favorites.user_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.import_batches t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'import_batches.user_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.journal_entries t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'journal_entries.user_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.journal_entries t
  LEFT JOIN public.transactions tx ON tx.id = t.transaction_id
  WHERE tx.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'journal_entries.transaction_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles t
  LEFT JOIN auth.users u ON u.id = t.id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'profiles.id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.transactions t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'transactions.user_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.transactions t
  LEFT JOIN public.import_batches b ON b.id = t.import_batch_id
  WHERE t.import_batch_id IS NOT NULL
    AND b.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'transactions.import_batch_id orphan count is %.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.ver_nr_sequences t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ver_nr_sequences.user_id orphan count is %.', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE amount IS NOT NULL
      AND (amount <> round(amount, 2) OR abs(amount) >= 10000000000000)
  ) THEN
    RAISE EXCEPTION 'transactions.amount cannot be losslessly constrained to numeric(15,2).';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE vat_rate IS NOT NULL
      AND (vat_rate <> round(vat_rate, 2) OR abs(vat_rate) >= 1000)
  ) THEN
    RAISE EXCEPTION 'transactions.vat_rate cannot be losslessly constrained to numeric(5,2).';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE debit IS NOT NULL
      AND (debit <> round(debit, 2) OR abs(debit) >= 10000000000000)
  ) THEN
    RAISE EXCEPTION 'journal_entries.debit cannot be losslessly constrained to numeric(15,2).';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE credit IS NOT NULL
      AND (credit <> round(credit, 2) OR abs(credit) >= 10000000000000)
  ) THEN
    RAISE EXCEPTION 'journal_entries.credit cannot be losslessly constrained to numeric(15,2).';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. Numeric type parity. Preflight above rejects any lossy conversion.
-- ---------------------------------------------------------------------------

ALTER TABLE public.transactions
  ALTER COLUMN amount TYPE numeric(15,2),
  ALTER COLUMN vat_rate TYPE numeric(5,2);

ALTER TABLE public.journal_entries
  ALTER COLUMN debit TYPE numeric(15,2),
  ALTER COLUMN credit TYPE numeric(15,2);

-- ---------------------------------------------------------------------------
-- 3. Missing unique constraints.
-- ---------------------------------------------------------------------------

ALTER TABLE public.closed_years
  ADD CONSTRAINT closed_years_user_id_year_key UNIQUE (user_id, year);

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_user_id_file_hash_key UNIQUE (user_id, file_hash);

-- ---------------------------------------------------------------------------
-- 4. Foreign key parity: rebuild legacy FKs with ON DELETE CASCADE.
--    Each current FK definition is asserted before it is dropped.
-- ---------------------------------------------------------------------------

DO $fk_guards$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'accounts_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected accounts_user_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'closed_years_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected closed_years_user_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'favorites_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected favorites_user_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'import_batches_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected import_batches_user_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'journal_entries_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected journal_entries_user_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'journal_entries_transaction_id_fkey';
  IF v_definition <> 'FOREIGN KEY (transaction_id) REFERENCES transactions(id)' THEN
    RAISE EXCEPTION 'Unexpected journal_entries_transaction_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'profiles_id_fkey';
  IF v_definition <> 'FOREIGN KEY (id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected profiles_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'transactions_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected transactions_user_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'transactions_import_batch_id_fkey';
  IF v_definition <> 'FOREIGN KEY (import_batch_id) REFERENCES import_batches(id)' THEN
    RAISE EXCEPTION 'Unexpected transactions_import_batch_id_fkey definition: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_definition
  FROM pg_constraint c
  WHERE c.conname = 'ver_nr_sequences_user_id_fkey';
  IF v_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id)' THEN
    RAISE EXCEPTION 'Unexpected ver_nr_sequences_user_id_fkey definition: %', v_definition;
  END IF;
END;
$fk_guards$;

ALTER TABLE public.accounts DROP CONSTRAINT accounts_user_id_fkey;
ALTER TABLE public.closed_years DROP CONSTRAINT closed_years_user_id_fkey;
ALTER TABLE public.favorites DROP CONSTRAINT favorites_user_id_fkey;
ALTER TABLE public.import_batches DROP CONSTRAINT import_batches_user_id_fkey;
ALTER TABLE public.journal_entries DROP CONSTRAINT journal_entries_user_id_fkey;
ALTER TABLE public.journal_entries DROP CONSTRAINT journal_entries_transaction_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT transactions_user_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT transactions_import_batch_id_fkey;
ALTER TABLE public.ver_nr_sequences DROP CONSTRAINT ver_nr_sequences_user_id_fkey;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.closed_years
  ADD CONSTRAINT closed_years_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_import_batch_id_fkey
  FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.ver_nr_sequences
  ADD CONSTRAINT ver_nr_sequences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.accounts VALIDATE CONSTRAINT accounts_user_id_fkey;
ALTER TABLE public.closed_years VALIDATE CONSTRAINT closed_years_user_id_fkey;
ALTER TABLE public.favorites VALIDATE CONSTRAINT favorites_user_id_fkey;
ALTER TABLE public.import_batches VALIDATE CONSTRAINT import_batches_user_id_fkey;
ALTER TABLE public.journal_entries VALIDATE CONSTRAINT journal_entries_user_id_fkey;
ALTER TABLE public.journal_entries VALIDATE CONSTRAINT journal_entries_transaction_id_fkey;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_id_fkey;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_user_id_fkey;
ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_import_batch_id_fkey;
ALTER TABLE public.ver_nr_sequences VALIDATE CONSTRAINT ver_nr_sequences_user_id_fkey;

-- ---------------------------------------------------------------------------
-- 5. RLS parity and future-table guard.
-- ---------------------------------------------------------------------------

ALTER TABLE public.delete_user_data_atomic_lifecycle_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rule_parameters ENABLE ROW LEVEL SECURITY;

DO $event_trigger$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
  ) THEN
    RAISE EXCEPTION 'ensure_rls already exists.';
  END IF;

  EXECUTE $ddl$
    CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable()
  $ddl$;
END;
$event_trigger$;

-- ---------------------------------------------------------------------------
-- 6. Grants parity for the drifted public objects.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE
  public.accounts,
  public.closed_years,
  public.favorites,
  public.import_batches,
  public.journal_entries,
  public.profiles,
  public.transactions,
  public.ver_nr_sequences,
  public.tax_rule_parameters
FROM anon;

REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.accounts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts TO authenticated;

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.closed_years FROM authenticated;
GRANT SELECT ON TABLE public.closed_years TO authenticated;

REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.favorites FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.favorites TO authenticated;

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.import_batches FROM authenticated;
GRANT SELECT ON TABLE public.import_batches TO authenticated;

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.journal_entries FROM authenticated;
GRANT SELECT ON TABLE public.journal_entries TO authenticated;

REVOKE ALL ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  company_name,
  org_nr,
  vat_status,
  vat_period_type,
  vat_management_from,
  domestic_sales_vat_treatment,
  foreign_purchase_reporting,
  default_deduction_entitlement,
  vat_number
) ON TABLE public.profiles TO authenticated;

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.transactions FROM authenticated;
GRANT SELECT ON TABLE public.transactions TO authenticated;

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.ver_nr_sequences FROM authenticated;
GRANT SELECT ON TABLE public.ver_nr_sequences TO authenticated;

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.tax_rule_parameters FROM authenticated;
GRANT SELECT ON TABLE public.tax_rule_parameters TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE
  public.accounts,
  public.closed_years,
  public.favorites,
  public.import_batches,
  public.journal_entries,
  public.profiles,
  public.transactions,
  public.ver_nr_sequences,
  public.tax_rule_parameters
TO service_role;

REVOKE ALL ON FUNCTION public.book_transaction_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_transaction_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_transaction_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_transaction_atomic(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.book_periodized_transaction_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_periodized_transaction_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_periodized_transaction_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_periodized_transaction_atomic(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.import_sie_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_sie_batch(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_sie_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_sie_batch(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.undo_sie_import_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_sie_import_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_sie_import_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_sie_import_atomic(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Verification queries to run after an approved COMMIT.
-- ---------------------------------------------------------------------------

-- Data safety counts should all remain zero:
--   duplicate closed_years(user_id, year)
--   duplicate import_batches(user_id, file_hash)
--   orphan FK counts for rebuilt constraints
--   non-lossless numeric conversion counts
--
-- Metadata parity checks should match Production for:
--   column, constraint, function_norm, index, policy, rls, routine_grant,
--   table, table_grant.
--
-- Spot checks:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN (
--     'closed_years_user_id_year_key',
--     'import_batches_user_id_file_hash_key',
--     'accounts_user_id_fkey',
--     'closed_years_user_id_fkey',
--     'favorites_user_id_fkey',
--     'import_batches_user_id_fkey',
--     'journal_entries_user_id_fkey',
--     'journal_entries_transaction_id_fkey',
--     'profiles_id_fkey',
--     'transactions_user_id_fkey',
--     'transactions_import_batch_id_fkey',
--     'ver_nr_sequences_user_id_fkey'
--   )
--   ORDER BY conname;
--
--   SELECT relname, relrowsecurity
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND relname IN (
--       'delete_user_data_atomic_lifecycle_context',
--       'tax_rule_parameters'
--     );
--
--   SELECT evtname, evtevent, evtenabled, evtfoid::regprocedure::text
--   FROM pg_event_trigger
--   WHERE evtname = 'ensure_rls';

-- DRAFT SAFETY: keep rollback until Pontus approves execution and commit.
ROLLBACK;
