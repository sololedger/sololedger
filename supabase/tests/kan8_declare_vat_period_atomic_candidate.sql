\set ON_ERROR_STOP on

-- KAN-8 rollback test candidate for declare_vat_period_atomic().
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan8_declare_vat_period_atomic_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION, all fixtures, and closed_years rows, runs inside one outer
-- transaction and ends with an explicit ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan8_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan8_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-8 rollback ' || replace(gen_random_uuid()::text, '-', ''),
  2600 + floor(random() * 500)::integer
);

-- Install the exact local KAN-8 candidate inside the rollback transaction.
\ir ../migrations/20260920_add_declare_vat_period_atomic.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-8 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-8 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'vat_closing'
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
    RAISE EXCEPTION 'KAN-8 fixture is unbalanced: % (debit %, credit %)',
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
    source
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    true,
    p_source
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

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'closed',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT 0,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month',
  p_updated_at timestamptz DEFAULT '2001-01-01 00:00:00+00'::timestamptz
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
    declared_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at,
    p_updated_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_period_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_definition text;
  v_declared_at timestamptz;
  v_updated_at timestamptz;
  v_initial_updated_at timestamptz := '2001-01-01 00:00:00+00'::timestamptz;
  v_existing_declared_at timestamptz := '2026-09-20 12:34:56+00'::timestamptz;
  v_existing_updated_at timestamptz := '2026-09-20 12:35:56+00'::timestamptz;

  v_before_tx_count integer;
  v_after_tx_count integer;
  v_before_journal_count integer;
  v_after_journal_count integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_security_definer boolean;
  v_search_path_ok boolean;

  v_failed boolean;
  v_error_message text;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan8_test_context;

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

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 1, 12, 31)
    ),
    'isolated transaction date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 1, 12, 31)
    ),
    'isolated journal date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE user_id = v_user_id
        AND period_start <= make_date(v_base_year + 1, 12, 31)
        AND period_end >= make_date(v_base_year, 1, 1)
    ),
    'isolated VAT period window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year BETWEEN v_base_year AND v_base_year + 1
    ),
    'isolated closed_years window must be empty before fixtures'
  );

  -- 1-4. Closed SoloLedger with a real closing transaction -> declared.
  v_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 31),
    v_run_tag || ' closing transaction fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 250, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 250)
    ),
    830001,
    'vat_closing'
  );

  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 1, 31),
    'closed',
    'sololedger',
    250,
    v_tx_id,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT declared_at, updated_at
    INTO v_declared_at, v_updated_at
  FROM public.vat_periods
  WHERE id = v_period_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '1 success');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, false, '1 not already_declared');
  PERFORM pg_temp.assert_eq(v_result->>'status', 'declared', '1 returned status');
  PERFORM pg_temp.assert_true(v_declared_at IS NOT NULL, '2 declared_at set');
  PERFORM pg_temp.assert_true((v_result->>'declared_at')::timestamptz IS NOT NULL, '2 returned declared_at set');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 250::numeric, '3 closing_amount preserved in result');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_tx_id, '4 closing_transaction_id preserved in result');
  PERFORM pg_temp.assert_true(v_updated_at IS DISTINCT FROM v_initial_updated_at, '15 first declaration updates updated_at');
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '11 no new transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '12 no new journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '13 no ver_nr consumption');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND closing_amount = 250
        AND closing_transaction_id = v_tx_id
        AND declared_at = v_declared_at
    ),
    '1-4 stored declared state preserves closing snapshot'
  );

  -- 6-7 and 15. Second declare is idempotent and timestamp-stable.
  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '6 second declare success');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, true, '6 second declare already_declared');
  PERFORM pg_temp.assert_eq((v_result->>'declared_at')::timestamptz, v_declared_at, '7 second declare preserves declared_at result');
  PERFORM pg_temp.assert_eq((v_result->>'updated_at')::timestamptz, v_updated_at, '15 second declare preserves updated_at result');
  PERFORM pg_temp.assert_eq(
    (SELECT declared_at FROM public.vat_periods WHERE id = v_period_id),
    v_declared_at,
    '7 second declare preserves stored declared_at'
  );
  PERFORM pg_temp.assert_eq(
    (SELECT updated_at FROM public.vat_periods WHERE id = v_period_id),
    v_updated_at,
    '15 second declare does not update updated_at'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '6 second declare no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '6 second declare no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '6 second declare no ver_nr');

  -- 5. Closed/no-activity period with NULL closing_transaction_id is valid.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 2, 1),
    make_date(v_base_year, 2, 28),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '5 no-activity declare success');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '5 no-activity closing_amount preserved');
  PERFORM pg_temp.assert_true(v_result->>'closing_transaction_id' IS NULL, '5 no-activity NULL closing_transaction_id in result');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND closing_amount = 0
        AND closing_transaction_id IS NULL
        AND declared_at IS NOT NULL
    ),
    '5 no-activity NULL closing_transaction_id preserved in table'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '5 no-activity no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '5 no-activity no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '5 no-activity no ver_nr');

  -- Already-declared SoloLedger fixture is idempotent without rewriting timestamps.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    'sololedger',
    0,
    NULL,
    v_existing_declared_at,
    'month',
    v_existing_updated_at
  );

  v_result := public.declare_vat_period_atomic(v_period_id);

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, 'declared fixture success');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, true, 'declared fixture already_declared');
  PERFORM pg_temp.assert_eq((v_result->>'declared_at')::timestamptz, v_existing_declared_at, 'declared fixture preserves declared_at');
  PERFORM pg_temp.assert_eq((v_result->>'updated_at')::timestamptz, v_existing_updated_at, 'declared fixture preserves updated_at');

  -- 8. Open SoloLedger period blocks and remains unchanged.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 4, 30),
    'open',
    'sololedger',
    NULL,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.declare_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_true(v_failed, '8 open period blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%stängda%', '8 open error mentions closed requirement');
  PERFORM pg_temp.assert_eq(
    (SELECT status FROM public.vat_periods WHERE id = v_period_id),
    'open'::text,
    '8 open period remains open'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '8 open no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '8 open no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '8 open no ver_nr');

  -- 9. imported_history blocks even when otherwise constraint-compatible.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 5, 1),
    make_date(v_base_year, 5, 31),
    'closed',
    'imported_history',
    0,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.declare_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_true(v_failed, '9 imported_history blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%SoloLedger%', '9 imported_history error mentions SoloLedger-managed periods');
  PERFORM pg_temp.assert_eq(
    (SELECT status FROM public.vat_periods WHERE id = v_period_id),
    'closed'::text,
    '9 imported_history remains closed'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '9 imported_history no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '9 imported_history no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '9 imported_history no ver_nr');

  -- 10. Nonexistent or wrong-user-safe period id blocks without touching data.
  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.declare_vat_period_atomic(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_true(v_failed, '10 nonexistent/wrong-user-safe id blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%hittades inte%' OR v_error_message ILIKE '%tillhör inte%', '10 safe ownership error');
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '10 nonexistent no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '10 nonexistent no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '10 nonexistent no ver_nr');

  -- 14. Declaration works after the accounting year has already been locked.
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 1);

  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 1, 1),
    make_date(v_base_year + 1, 1, 31),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '14 closed-year declare success');
  PERFORM pg_temp.assert_eq(v_result->>'status', 'declared', '14 closed-year returned declared');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND declared_at IS NOT NULL
    ),
    '14 closed-year stored declared'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '14 closed-year no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '14 closed-year no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '14 closed-year no ver_nr');

  -- 16. Function contract, grants, SECURITY DEFINER, and search_path.
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.declare_vat_period_atomic(uuid)') IS NOT NULL,
    '16 function signature exists'
  );

  SELECT pg_get_functiondef('public.declare_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  SELECT
    p.prosecdef,
    p.proconfig @> ARRAY['search_path=public']
  INTO
    v_security_definer,
    v_search_path_ok
  FROM pg_proc p
  WHERE p.oid = 'public.declare_vat_period_atomic(uuid)'::regprocedure;

  PERFORM pg_temp.assert_eq(v_security_definer, true, '16 pg_proc SECURITY DEFINER');
  PERFORM pg_temp.assert_eq(v_search_path_ok, true, '16 pg_proc search_path public');
  PERFORM pg_temp.assert_true(
    v_definition LIKE '%SECURITY DEFINER%',
    '16 SECURITY DEFINER present'
  );
  PERFORM pg_temp.assert_true(
    v_definition LIKE '%SET search_path TO ''public''%',
    '16 explicit search_path public'
  );
  PERFORM pg_temp.assert_true(
    position('FOR UPDATE' in v_definition) > 0,
    '16 row lock exists'
  );
  PERFORM pg_temp.assert_true(
    position('UPDATE public.vat_periods' in v_definition) > position('v_period.status <> ''closed''' in v_definition),
    '16 update occurs only after closed-status guard'
  );
  PERFORM pg_temp.assert_true(
    v_definition NOT ILIKE '%journal_entries%'
    AND v_definition NOT ILIKE '%get_next_ver_nr%'
    AND v_definition NOT ILIKE '%1630%'
    AND v_definition NOT ILIKE '%1930%'
    AND v_definition NOT ILIKE '%lock_vat_months%',
    '16 declaration function has no accounting/payment/VAT-advisory write path'
  );

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 authenticated can execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 service_role can execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 postgres can execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 anon cannot execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.declare_vat_period_atomic(uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    '16 PUBLIC cannot execute declare_vat_period_atomic'
  );

  RAISE NOTICE 'KAN-8 declare_vat_period_atomic rollback test candidate completed for run tag %.',
    v_run_tag;
END;
$$;

-- This must stay ROLLBACK so the candidate RPC install, all fixtures, any
-- closed_years rows, and any accidental sequence observations are discarded.
ROLLBACK;

\echo 'KAN-8 declare_vat_period_atomic rollback test candidate completed inside explicit ROLLBACK.'
