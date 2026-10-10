-- SoloLedger Staging schema parity repair postcheck.
--
-- READ ONLY. This file contains only SELECT statements.
--
-- Intended use:
--   Run after a separately approved Staging-only repair commit, against
--   Supabase Staging fzxqiqenqjzhlyxxpvhg, to verify the repaired objects and
--   data-safety invariants. Do not use this as a target selector; verify the
--   connected Supabase project out-of-band before running it.
--
-- Expected result:
--   Every row should have status = 'PASS'. Any 'FAIL' means Staging is still
--   not ready for Staging-write-E2E.

WITH
expected_columns(table_name, column_name, expected) AS (
  VALUES
    ('transactions', 'amount', 'numeric(15,2)'),
    ('transactions', 'vat_rate', 'numeric(5,2)'),
    ('journal_entries', 'debit', 'numeric(15,2)'),
    ('journal_entries', 'credit', 'numeric(15,2)')
),
actual_columns AS (
  SELECT
    c.table_name,
    c.column_name,
    c.data_type ||
      COALESCE('(' || c.numeric_precision::text || ',' || c.numeric_scale::text || ')', '') AS actual
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
),
column_checks AS (
  SELECT
    'numeric_column' AS section,
    e.table_name || '.' || e.column_name AS object_name,
    e.expected,
    COALESCE(a.actual, '<missing>') AS actual,
    CASE WHEN a.actual = e.expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_columns e
  LEFT JOIN actual_columns a
    ON a.table_name = e.table_name
   AND a.column_name = e.column_name
),
expected_constraints(table_name, constraint_name, expected) AS (
  VALUES
    ('closed_years', 'closed_years_user_id_year_key', 'UNIQUE (user_id, year)'),
    ('import_batches', 'import_batches_user_id_file_hash_key', 'UNIQUE (user_id, file_hash)'),
    ('accounts', 'accounts_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('closed_years', 'closed_years_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('favorites', 'favorites_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('import_batches', 'import_batches_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('journal_entries', 'journal_entries_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('journal_entries', 'journal_entries_transaction_id_fkey', 'FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE'),
    ('profiles', 'profiles_id_fkey', 'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('transactions', 'transactions_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('transactions', 'transactions_import_batch_id_fkey', 'FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE'),
    ('ver_nr_sequences', 'ver_nr_sequences_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE')
),
actual_constraints AS (
  SELECT
    r.relname AS table_name,
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS actual
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
),
constraint_checks AS (
  SELECT
    'constraint' AS section,
    e.table_name || '.' || e.constraint_name AS object_name,
    e.expected,
    COALESCE(a.actual, '<missing>') AS actual,
    CASE WHEN a.actual = e.expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_constraints e
  LEFT JOIN actual_constraints a
    ON a.table_name = e.table_name
   AND a.constraint_name = e.constraint_name
),
expected_rls(table_name, expected) AS (
  VALUES
    ('accounts', 'true'),
    ('closed_years', 'true'),
    ('delete_user_data_atomic_lifecycle_context', 'true'),
    ('favorites', 'true'),
    ('import_batches', 'true'),
    ('journal_entries', 'true'),
    ('profiles', 'true'),
    ('tax_rule_parameters', 'true'),
    ('transactions', 'true'),
    ('ver_nr_sequences', 'true')
),
actual_rls AS (
  SELECT
    r.relname AS table_name,
    r.relrowsecurity::text AS actual
  FROM pg_class r
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
),
rls_checks AS (
  SELECT
    'rls' AS section,
    e.table_name AS object_name,
    e.expected,
    COALESCE(a.actual, '<missing>') AS actual,
    CASE WHEN a.actual = e.expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_rls e
  LEFT JOIN actual_rls a ON a.table_name = e.table_name
),
expected_event_trigger(object_name, expected) AS (
  VALUES
    ('ensure_rls', 'ddl_command_end|O|rls_auto_enable()')
),
actual_event_trigger AS (
  SELECT
    evtname AS object_name,
    evtevent || '|' || evtenabled::text || '|' || evtfoid::regprocedure::text AS actual
  FROM pg_event_trigger
  WHERE evtname = 'ensure_rls'
),
event_trigger_checks AS (
  SELECT
    'event_trigger' AS section,
    e.object_name,
    e.expected,
    COALESCE(a.actual, '<missing>') AS actual,
    CASE WHEN a.actual = e.expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_event_trigger e
  LEFT JOIN actual_event_trigger a ON a.object_name = e.object_name
),
full_privileges AS (
  SELECT 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'::text AS value
),
expected_table_grants(table_name, grantee, expected) AS (
  SELECT *
  FROM (
    VALUES
      ('accounts', 'anon', ''),
      ('closed_years', 'anon', ''),
      ('favorites', 'anon', ''),
      ('import_batches', 'anon', ''),
      ('journal_entries', 'anon', ''),
      ('profiles', 'anon', ''),
      ('tax_rule_parameters', 'anon', ''),
      ('transactions', 'anon', ''),
      ('ver_nr_sequences', 'anon', ''),
    ('accounts', 'authenticated', 'DELETE,INSERT,SELECT,UPDATE'),
    ('closed_years', 'authenticated', 'SELECT'),
    ('favorites', 'authenticated', 'DELETE,INSERT,SELECT,UPDATE'),
    ('import_batches', 'authenticated', 'SELECT'),
    ('journal_entries', 'authenticated', 'SELECT'),
    ('profiles', 'authenticated', 'SELECT'),
    ('tax_rule_parameters', 'authenticated', 'SELECT'),
    ('transactions', 'authenticated', 'SELECT'),
    ('ver_nr_sequences', 'authenticated', 'SELECT')
  ) AS v(table_name, grantee, expected)
  UNION ALL
  SELECT table_name, grantee, (SELECT value FROM full_privileges)
  FROM (
    VALUES
      ('accounts'), ('closed_years'), ('favorites'), ('import_batches'),
      ('journal_entries'), ('profiles'), ('tax_rule_parameters'),
      ('transactions'), ('ver_nr_sequences')
  ) AS t(table_name)
  CROSS JOIN (VALUES ('postgres'), ('service_role')) AS g(grantee)
),
actual_table_grants AS (
  SELECT
    table_name,
    grantee,
    string_agg(privilege_type, ',' ORDER BY privilege_type) AS actual
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'postgres', 'service_role')
  GROUP BY table_name, grantee
),
table_grant_checks AS (
  SELECT
    'table_grant' AS section,
    e.table_name || ' to ' || e.grantee AS object_name,
    e.expected,
    COALESCE(a.actual, '') AS actual,
    CASE WHEN COALESCE(a.actual, '') = e.expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_table_grants e
  LEFT JOIN actual_table_grants a
    ON a.table_name = e.table_name
   AND a.grantee = e.grantee
),
expected_profile_updates(column_name) AS (
  VALUES
    ('company_name'),
    ('org_nr'),
    ('vat_status'),
    ('vat_period_type'),
    ('vat_management_from'),
    ('domestic_sales_vat_treatment'),
    ('foreign_purchase_reporting'),
    ('default_deduction_entitlement'),
    ('vat_number')
),
actual_profile_updates AS (
  SELECT column_name
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND grantee = 'authenticated'
    AND privilege_type = 'UPDATE'
),
profile_update_checks AS (
  SELECT
    'column_grant' AS section,
    'profiles.' || e.column_name || ' UPDATE to authenticated' AS object_name,
    'granted' AS expected,
    CASE WHEN a.column_name IS NULL THEN '<missing>' ELSE 'granted' END AS actual,
    CASE WHEN a.column_name IS NULL THEN 'FAIL' ELSE 'PASS' END AS status
  FROM expected_profile_updates e
  LEFT JOIN actual_profile_updates a ON a.column_name = e.column_name
  UNION ALL
  SELECT
    'column_grant' AS section,
    'profiles unexpected UPDATE column ' || a.column_name AS object_name,
    '<none>' AS expected,
    'granted' AS actual,
    'FAIL' AS status
  FROM actual_profile_updates a
  LEFT JOIN expected_profile_updates e ON e.column_name = a.column_name
  WHERE e.column_name IS NULL
),
expected_function_execute(function_name, identity_args, grantee, expected) AS (
  VALUES
    ('book_transaction_atomic', 'p_payload jsonb', 'anon', false),
    ('book_transaction_atomic', 'p_payload jsonb', 'authenticated', true),
    ('book_transaction_atomic', 'p_payload jsonb', 'postgres', true),
    ('book_transaction_atomic', 'p_payload jsonb', 'service_role', true),
    ('book_periodized_transaction_atomic', 'p_payload jsonb', 'anon', false),
    ('book_periodized_transaction_atomic', 'p_payload jsonb', 'authenticated', true),
    ('book_periodized_transaction_atomic', 'p_payload jsonb', 'postgres', true),
    ('book_periodized_transaction_atomic', 'p_payload jsonb', 'service_role', true),
    ('import_sie_batch', 'p_payload jsonb', 'anon', false),
    ('import_sie_batch', 'p_payload jsonb', 'authenticated', true),
    ('import_sie_batch', 'p_payload jsonb', 'postgres', true),
    ('import_sie_batch', 'p_payload jsonb', 'service_role', true),
    ('undo_sie_import_atomic', 'p_import_batch_id uuid', 'anon', false),
    ('undo_sie_import_atomic', 'p_import_batch_id uuid', 'authenticated', true),
    ('undo_sie_import_atomic', 'p_import_batch_id uuid', 'postgres', true),
    ('undo_sie_import_atomic', 'p_import_batch_id uuid', 'service_role', true)
),
actual_functions AS (
  SELECT
    p.oid,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
function_execute_checks AS (
  SELECT
    'function_execute' AS section,
    e.function_name || '(' || e.identity_args || ') to ' || e.grantee AS object_name,
    e.expected::text AS expected,
    COALESCE(has_function_privilege(e.grantee, a.oid, 'EXECUTE')::text, '<missing>') AS actual,
    CASE
      WHEN a.oid IS NULL THEN 'FAIL'
      WHEN has_function_privilege(e.grantee, a.oid, 'EXECUTE') = e.expected THEN 'PASS'
      ELSE 'FAIL'
    END AS status
  FROM expected_function_execute e
  LEFT JOIN actual_functions a
    ON a.function_name = e.function_name
   AND a.identity_args = e.identity_args
),
data_safety_counts(object_name, count_value) AS (
  SELECT 'duplicate closed_years(user_id, year)', count(*)::bigint
  FROM (
    SELECT user_id, year
    FROM public.closed_years
    GROUP BY user_id, year
    HAVING count(*) > 1
  ) d
  UNION ALL
  SELECT 'duplicate import_batches(user_id, file_hash)', count(*)::bigint
  FROM (
    SELECT user_id, file_hash
    FROM public.import_batches
    GROUP BY user_id, file_hash
    HAVING count(*) > 1
  ) d
  UNION ALL
  SELECT 'orphan accounts.user_id', count(*)::bigint
  FROM public.accounts t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'orphan closed_years.user_id', count(*)::bigint
  FROM public.closed_years t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE t.user_id IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT 'orphan favorites.user_id', count(*)::bigint
  FROM public.favorites t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'orphan import_batches.user_id', count(*)::bigint
  FROM public.import_batches t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'orphan journal_entries.user_id', count(*)::bigint
  FROM public.journal_entries t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'orphan journal_entries.transaction_id', count(*)::bigint
  FROM public.journal_entries t
  LEFT JOIN public.transactions tx ON tx.id = t.transaction_id
  WHERE tx.id IS NULL
  UNION ALL
  SELECT 'orphan profiles.id', count(*)::bigint
  FROM public.profiles t
  LEFT JOIN auth.users u ON u.id = t.id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'orphan transactions.user_id', count(*)::bigint
  FROM public.transactions t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'orphan transactions.import_batch_id', count(*)::bigint
  FROM public.transactions t
  LEFT JOIN public.import_batches b ON b.id = t.import_batch_id
  WHERE t.import_batch_id IS NOT NULL AND b.id IS NULL
  UNION ALL
  SELECT 'orphan ver_nr_sequences.user_id', count(*)::bigint
  FROM public.ver_nr_sequences t
  LEFT JOIN auth.users u ON u.id = t.user_id
  WHERE u.id IS NULL
  UNION ALL
  SELECT 'non-lossless transactions.amount', count(*)::bigint
  FROM public.transactions
  WHERE amount IS NOT NULL
    AND (amount <> round(amount, 2) OR abs(amount) >= 10000000000000)
  UNION ALL
  SELECT 'non-lossless transactions.vat_rate', count(*)::bigint
  FROM public.transactions
  WHERE vat_rate IS NOT NULL
    AND (vat_rate <> round(vat_rate, 2) OR abs(vat_rate) >= 1000)
  UNION ALL
  SELECT 'non-lossless journal_entries.debit', count(*)::bigint
  FROM public.journal_entries
  WHERE debit IS NOT NULL
    AND (debit <> round(debit, 2) OR abs(debit) >= 10000000000000)
  UNION ALL
  SELECT 'non-lossless journal_entries.credit', count(*)::bigint
  FROM public.journal_entries
  WHERE credit IS NOT NULL
    AND (credit <> round(credit, 2) OR abs(credit) >= 10000000000000)
),
data_safety_checks AS (
  SELECT
    'data_safety' AS section,
    object_name,
    '0' AS expected,
    count_value::text AS actual,
    CASE WHEN count_value = 0 THEN 'PASS' ELSE 'FAIL' END AS status
  FROM data_safety_counts
)
SELECT section, object_name, expected, actual, status
FROM column_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM constraint_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM rls_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM event_trigger_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM table_grant_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM profile_update_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM function_execute_checks
UNION ALL
SELECT section, object_name, expected, actual, status FROM data_safety_checks
ORDER BY status, section, object_name;
