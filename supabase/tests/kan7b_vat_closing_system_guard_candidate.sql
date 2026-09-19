\set ON_ERROR_STOP on

-- KAN-7B rollback test candidate for vat_closing system-transaction guards.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan7b_vat_closing_system_guard_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION statements and all fixtures/assertions, runs inside one outer
-- transaction and ends with an explicit ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan7b_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan7b_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-7B rollback ' || replace(gen_random_uuid()::text, '-', ''),
  2400 + floor(random() * 500)::integer
);

-- Install the exact local KAN-7B candidate inside the rollback transaction.
\ir ../migrations/20260919_guard_vat_closing_system_transactions.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-7B assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-7B assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT NULL,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'manual',
  p_booked boolean DEFAULT true,
  p_file_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-7B fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source,
    file_url
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    p_booked,
    p_source,
    p_file_url
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_vat_closing_tx_id uuid;
  v_manual_tx_id uuid;
  v_manual_update_tx_id uuid;
  v_periodized_tx_id uuid;
  v_periodized_reversal_tx_id uuid;
  v_periodized_corr_tx_id uuid;
  v_periodized_reversal_corr_tx_id uuid;
  v_periodization_group_id uuid;
  v_vat_protected_tx_id uuid;

  v_before_tx_count integer;
  v_after_tx_count integer;
  v_before_journal_count integer;
  v_after_journal_count integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_before_corrections integer;
  v_after_corrections integer;

  v_original_manual_ver_nr integer := 810001;
  v_vat_closing_ver_nr integer := 810002;
  v_manual_update_ver_nr integer := 810003;
  v_vat_protected_ver_nr integer := 810004;
  v_sequence_floor integer := 820000;

  v_result jsonb;
  v_periodized_result jsonb;
  v_failed boolean;
  v_error_message text;
  v_file_url text;
  v_description text;
  v_amount numeric;
  v_returned_ver_nr integer;
  v_periodized_type text;
  v_original_row_count integer;
  v_reversal_row_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan7b_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  INSERT INTO public.ver_nr_sequences (user_id, last_ver_nr)
  VALUES (v_user_id, v_sequence_floor)
  ON CONFLICT (user_id) DO UPDATE
  SET last_ver_nr = greatest(public.ver_nr_sequences.last_ver_nr, EXCLUDED.last_ver_nr);

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'authenticated can execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'anon cannot execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.create_correction_transaction_atomic(uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    'PUBLIC cannot execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'service_role can execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'postgres can execute create_correction_transaction_atomic'
  );

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'authenticated can execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'anon cannot execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.update_transaction_safe(uuid,jsonb)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    'PUBLIC cannot execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'service_role can execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'postgres can execute update_transaction_safe'
  );

  PERFORM pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'public.transactions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.transactions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.transactions', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.journal_entries', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.journal_entries', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.journal_entries', 'DELETE'),
    'authenticated still lacks direct transaction/journal table writes'
  );

  v_vat_closing_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 31),
    v_run_tag || ' vat closing fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 25)
    ),
    v_vat_closing_ver_nr,
    'vat_closing',
    true
  );

  SELECT count(*), count(*)
    INTO v_before_tx_count, v_after_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_before_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  SELECT count(*)
    INTO v_before_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND coalesce(is_correction, false) = true
    AND corrects_ver_nr = v_vat_closing_ver_nr;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_closing_tx_id);
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'correction of vat_closing transaction is blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%Momsavslut%' AND v_error_message ILIKE '%systemverifikation%',
    'vat_closing correction error is explicit'
  );

  SELECT count(*)
    INTO v_after_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_after_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  SELECT count(*)
    INTO v_after_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND coalesce(is_correction, false) = true
    AND corrects_ver_nr = v_vat_closing_ver_nr;

  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, 'blocked vat_closing correction creates no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, 'blocked vat_closing correction creates no journal entries');
  PERFORM pg_temp.assert_eq(v_after_corrections, v_before_corrections, 'blocked vat_closing correction creates no correction row');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, 'blocked vat_closing correction consumes no ver_nr');

  v_manual_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 10),
    v_run_tag || ' ordinary correction fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    v_original_manual_ver_nr,
    'manual',
    true
  );

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_result := public.create_correction_transaction_atomic(v_manual_tx_id);
  v_returned_ver_nr := (v_result->>'ver_nr')::integer;

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary correction returns success');
  PERFORM pg_temp.assert_eq(v_returned_ver_nr, v_before_ver_nr + 1, 'ordinary correction consumes exactly one ver_nr');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND id = (v_result->>'transaction_id')::uuid
        AND coalesce(is_correction, false) = true
        AND corrects_ver_nr = v_original_manual_ver_nr
    ),
    'ordinary correction creates correction transaction'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND transaction_id = (v_result->>'transaction_id')::uuid
    ),
    2,
    'ordinary correction creates mirrored journal rows'
  );

  v_periodized_type := 'kan7b_periodized_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate,
    comment
  ) VALUES (
    v_periodized_type,
    v_user_id,
    v_run_tag || ' periodized expense account',
    '6570',
    '1930',
    0,
    v_run_tag || ' rollback-only account fixture'
  );

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_periodized_result := public.book_periodized_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 5, 10)::text,
      'future_date', make_date(v_base_year + 1, 1, 15)::text,
      'description', v_run_tag || ' periodized correction fixture',
      'amount', 120,
      'type', v_periodized_type,
      'vat_rate', 0,
      'file_url', ''
    )
  );

  v_periodized_tx_id := (v_periodized_result->>'transaction_id')::uuid;
  v_periodized_reversal_tx_id := (v_periodized_result->>'reversal_transaction_id')::uuid;
  v_periodization_group_id := (v_periodized_result->>'periodization_group_id')::uuid;

  PERFORM pg_temp.assert_true(
    (v_periodized_result->>'success')::boolean,
    'periodized fixture booking returns success'
  );
  PERFORM pg_temp.assert_eq(
    (v_periodized_result->>'ver_nr')::integer,
    v_before_ver_nr + 1,
    'periodized original fixture gets next ver_nr'
  );
  PERFORM pg_temp.assert_eq(
    (v_periodized_result->>'reversal_ver_nr')::integer,
    v_before_ver_nr + 2,
    'periodized reversal fixture gets following ver_nr'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions original
      JOIN public.transactions reversal
        ON reversal.periodization_group_id = original.periodization_group_id
       AND reversal.user_id = original.user_id
      WHERE original.id = v_periodized_tx_id
        AND reversal.id = v_periodized_reversal_tx_id
        AND original.user_id = v_user_id
        AND original.source = 'manual'
        AND reversal.source = 'manual'
        AND original.periodization_group_id = v_periodization_group_id
        AND original.is_periodized = true
        AND coalesce(original.is_periodized_reversal, false) = false
        AND original.periodized_future_date = make_date(v_base_year + 1, 1, 15)
        AND reversal.is_periodized = true
        AND reversal.is_periodized_reversal = true
        AND reversal.periodized_future_date IS NULL
    ),
    'periodized original and reversal fixtures are linked by existing model'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries e
      WHERE e.user_id = v_user_id
        AND e.transaction_id IN (v_periodized_tx_id, v_periodized_reversal_tx_id)
        AND public.vat_concurrency_account(e.account_number)
    ),
    'periodized regression fixture does not enter VAT-period guard scope'
  );

  SELECT count(*)::integer
    INTO v_original_row_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_periodized_tx_id;

  SELECT count(*)::integer
    INTO v_reversal_row_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_periodized_reversal_tx_id;

  PERFORM pg_temp.assert_eq(v_original_row_count, 2, 'periodized original fixture has expected journal rows');
  PERFORM pg_temp.assert_eq(v_reversal_row_count, 2, 'periodized reversal fixture has expected journal rows');

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_result := public.create_correction_transaction_atomic(v_periodized_tx_id);
  v_periodized_corr_tx_id := (v_result->>'transaction_id')::uuid;
  v_periodized_reversal_corr_tx_id := (v_result->>'reversal_correction_transaction_id')::uuid;

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'periodized correction returns success');
  PERFORM pg_temp.assert_eq(
    (v_result->>'ver_nr')::integer,
    v_before_ver_nr + 1,
    'periodized original correction gets next ver_nr'
  );
  PERFORM pg_temp.assert_eq(
    (v_result->>'reversal_correction_ver_nr')::integer,
    v_before_ver_nr + 2,
    'periodized reversal correction gets following ver_nr'
  );
  PERFORM pg_temp.assert_true(
    v_periodized_corr_tx_id IS NOT NULL
    AND v_periodized_reversal_corr_tx_id IS NOT NULL
    AND v_periodized_corr_tx_id IS DISTINCT FROM v_periodized_reversal_corr_tx_id,
    'periodized correction creates separate original and reversal corrections'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions corr
      WHERE corr.id = v_periodized_corr_tx_id
        AND corr.user_id = v_user_id
        AND corr.source = 'manual'
        AND coalesce(corr.is_correction, false) = true
        AND corr.corrects_ver_nr = (v_periodized_result->>'ver_nr')::integer
    ),
    'periodized original correction relates to original ver_nr'
  );
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions corr
      WHERE corr.id = v_periodized_reversal_corr_tx_id
        AND corr.user_id = v_user_id
        AND corr.source = 'manual'
        AND coalesce(corr.is_correction, false) = true
        AND corr.corrects_ver_nr = (v_periodized_result->>'reversal_ver_nr')::integer
    ),
    'periodized reversal correction relates to reversal ver_nr'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries original
      JOIN public.journal_entries corr
        ON corr.account_number = original.account_number
       AND corr.debit = original.credit
       AND corr.credit = original.debit
      WHERE original.user_id = v_user_id
        AND corr.user_id = v_user_id
        AND original.transaction_id = v_periodized_tx_id
        AND corr.transaction_id = v_periodized_corr_tx_id
    ),
    v_original_row_count,
    'periodized original correction mirrors original journal rows'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries reversal
      JOIN public.journal_entries corr
        ON corr.account_number = reversal.account_number
       AND corr.debit = reversal.credit
       AND corr.credit = reversal.debit
      WHERE reversal.user_id = v_user_id
        AND corr.user_id = v_user_id
        AND reversal.transaction_id = v_periodized_reversal_tx_id
        AND corr.transaction_id = v_periodized_reversal_corr_tx_id
    ),
    v_reversal_row_count,
    'periodized reversal correction mirrors reversal journal rows'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.user_id = v_user_id
        AND t.id IN (
          v_periodized_tx_id,
          v_periodized_reversal_tx_id,
          v_periodized_corr_tx_id,
          v_periodized_reversal_corr_tx_id
        )
        AND t.source = 'vat_closing'
    ),
    'periodized correction path is unaffected by vat_closing guard'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL,
    'month'
  );

  v_vat_protected_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 12),
    v_run_tag || ' closed vat correction fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 125, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    v_vat_protected_ver_nr,
    'manual',
    true
  );

  SELECT count(*)
    INTO v_before_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_before_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_protected_tx_id);
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'VAT-protected correction in closed period is still blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%stängd%' OR v_error_message ILIKE '%deklarerad%',
    'VAT-protected correction keeps closed/declared period error'
  );

  SELECT count(*)
    INTO v_after_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_after_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, 'VAT-protected blocked correction creates no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, 'VAT-protected blocked correction creates no journal entries');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, 'VAT-protected blocked correction consumes no ver_nr');

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_vat_closing_tx_id,
      jsonb_build_object('file_url', 'https://example.invalid/kan7b-vat-closing.pdf')
    );
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'file_url update of vat_closing transaction is blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%Momsavslut%' AND v_error_message ILIKE '%systemverifikation%',
    'vat_closing update error is explicit'
  );

  SELECT file_url
    INTO v_file_url
  FROM public.transactions
  WHERE id = v_vat_closing_tx_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_file_url, NULL::text, 'blocked vat_closing update leaves file_url unchanged');

  v_manual_update_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 5),
    v_run_tag || ' manual update fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 50)
    ),
    v_manual_update_ver_nr,
    'manual',
    true
  );

  v_result := public.update_transaction_safe(
    v_manual_update_tx_id,
    jsonb_build_object('file_url', 'https://example.invalid/kan7b-manual.pdf')
  );

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary allowed update returns success');

  SELECT file_url
    INTO v_file_url
  FROM public.transactions
  WHERE id = v_manual_update_tx_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq(
    v_file_url,
    'https://example.invalid/kan7b-manual.pdf'::text,
    'ordinary allowed update changes file_url'
  );

  SELECT description, amount
    INTO v_description, v_amount
  FROM public.transactions
  WHERE id = v_manual_update_tx_id
    AND user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_manual_update_tx_id,
      jsonb_build_object(
        'description', v_run_tag || ' forbidden booked description',
        'amount', 51
      )
    );
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'booked accounting-field update is still blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%Bokförda transaktioner%',
    'booked accounting-field update keeps existing error path'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT description
      FROM public.transactions
      WHERE id = v_manual_update_tx_id
        AND user_id = v_user_id
    ),
    v_description,
    'forbidden booked-field update leaves description unchanged'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT amount
      FROM public.transactions
      WHERE id = v_manual_update_tx_id
        AND user_id = v_user_id
    ),
    v_amount,
    'forbidden booked-field update leaves amount unchanged'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-7B vat_closing system guard rollback test candidate completed inside explicit ROLLBACK.'
