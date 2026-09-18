\set ON_ERROR_STOP on

-- KAN-7 rollback test candidate for close_vat_period_atomic().
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan7_close_vat_period_atomic_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan7_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan7_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

-- Install the exact local KAN-7 candidate inside the rollback transaction.
\ir ../migrations/20260918_add_close_vat_period_atomic.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-7 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-7 assertion failed: % (actual %, expected %)',
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
  p_source text DEFAULT 'manual'
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
    RAISE EXCEPTION 'KAN-7 fixture is unbalanced: % (debit %, credit %)',
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

CREATE OR REPLACE FUNCTION pg_temp.assert_account_balance(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_account_number text,
  p_expected numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
    INTO v_balance
  FROM public.journal_entries
  WHERE user_id = p_user_id
    AND date BETWEEN p_period_start AND p_period_end
    AND account_number = p_account_number;

  PERFORM pg_temp.assert_eq(v_balance, p_expected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_closing_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_period_end date,
  p_expected_amount numeric,
  p_expected_row_count integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_row_count integer;
  v_distinct_ver_nr_count integer;
  v_bad_date_count integer;
  v_zero_row_count integer;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': closing transaction exists');
  PERFORM pg_temp.assert_eq(v_tx.source, 'vat_closing', p_message || ': source');
  PERFORM pg_temp.assert_eq(v_tx.booked, true, p_message || ': booked');
  PERFORM pg_temp.assert_eq(v_tx.date, p_period_end, p_message || ': transaction date');
  PERFORM pg_temp.assert_eq(v_tx.amount, p_expected_amount, p_message || ': transactions.amount');

  SELECT
    count(*)::integer,
    count(DISTINCT ver_nr)::integer,
    count(*) FILTER (WHERE date IS DISTINCT FROM p_period_end)::integer,
    count(*) FILTER (WHERE coalesce(debit, 0) = 0 AND coalesce(credit, 0) = 0)::integer,
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO
    v_row_count,
    v_distinct_ver_nr_count,
    v_bad_date_count,
    v_zero_row_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_row_count, p_expected_row_count, p_message || ': journal row count');
  PERFORM pg_temp.assert_eq(v_distinct_ver_nr_count, 1, p_message || ': one ver_nr');
  PERFORM pg_temp.assert_eq(v_bad_date_count, 0, p_message || ': all journal rows on period_end');
  PERFORM pg_temp.assert_eq(v_zero_row_count, 0, p_message || ': no fabricated zero rows');
  PERFORM pg_temp.assert_eq(v_total_debit, v_total_credit, p_message || ': debit equals credit');
  PERFORM pg_temp.assert_eq(v_total_debit, p_expected_amount, p_message || ': amount is total debit');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_period_closed_with_transaction(
  p_period_id uuid,
  p_transaction_id uuid,
  p_closing_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_period public.vat_periods%ROWTYPE;
BEGIN
  SELECT *
    INTO v_period
  FROM public.vat_periods
  WHERE id = p_period_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': period exists');
  PERFORM pg_temp.assert_eq(v_period.status, 'closed', p_message || ': status closed');
  PERFORM pg_temp.assert_eq(v_period.closing_amount, p_closing_amount, p_message || ': closing_amount');
  PERFORM pg_temp.assert_eq(v_period.closing_transaction_id, p_transaction_id, p_message || ': closing_transaction_id');
  PERFORM pg_temp.assert_true(v_period.declared_at IS NULL, p_message || ': declared_at remains NULL');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_future_year integer := extract(year from current_date)::integer + 20;

  v_period_id uuid;
  v_tx_id uuid;
  v_existing_tx_id uuid;
  v_result jsonb;
  v_definition text;

  v_before_tx integer;
  v_after_tx integer;
  v_before_entries integer;
  v_after_entries integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_before_period_status text;
  v_after_period_status text;

  v_failed boolean;
  v_error_message text;
  v_period_start date;
  v_period_end date;
  v_count integer;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan7_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  v_tag := 'kan7-' || v_run_id;

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 2, 12, 31)
    ),
    'isolated transaction date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 2, 12, 31)
    ),
    'isolated journal date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE user_id = v_user_id
        AND period_start <= make_date(v_base_year + 2, 12, 31)
        AND period_end >= make_date(v_base_year, 1, 1)
    ),
    'isolated VAT period window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year BETWEEN v_base_year AND v_base_year + 2
    ),
    'isolated closed_years window must be empty before fixtures'
  );

  -- 1. No VAT activity: close state only, no transaction and no ver_nr.
  v_period_start := make_date(v_base_year, 1, 1);
  v_period_end := make_date(v_base_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.close_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, '1 no VAT activity transaction_created');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '1 no VAT activity amount');
  PERFORM pg_temp.assert_true(v_result->>'closing_transaction_id' IS NULL, '1 no VAT activity closing_transaction_id');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '1 no VAT activity no transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '1 no VAT activity no journal rows');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '1 no VAT activity no ver_nr');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM public.vat_periods
      WHERE id = v_period_id
        AND status = 'closed'
        AND closing_amount = 0
        AND closing_transaction_id IS NULL
        AND declared_at IS NULL
    ),
    '1 no VAT activity period state'
  );

  -- 2. Payable VAT: output VAT credit 250 + input VAT debit 50.
  v_period_start := make_date(v_base_year, 2, 1);
  v_period_end := make_date(v_base_year, 2, 28);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 10),
    v_tag || ' test 02 payable fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    700002
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 200::numeric, '2 payable closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 250::numeric, 3, '2 payable closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 200::numeric, '2 payable period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '2 payable 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '2 payable 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -200, '2 payable 2650 credit');

  -- 3. Refund VAT: input VAT debit 100.
  v_period_start := make_date(v_base_year, 3, 1);
  v_period_end := make_date(v_base_year, 3, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 10),
    v_tag || ' test 03 refund fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 100)
    ),
    700003
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -100::numeric, '3 refund closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 100::numeric, 2, '3 refund closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, -100::numeric, '3 refund period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '3 refund 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 100, '3 refund 2650 debit');

  -- 4. Zero-net with actual activity and nonzero account balances.
  v_period_start := make_date(v_base_year, 4, 1);
  v_period_end := make_date(v_base_year, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 10),
    v_tag || ' test 04 zero-net fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 100)
    ),
    700004
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '4 zero-net closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 100::numeric, 2, '4 zero-net closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 0::numeric, '4 zero-net period link');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE user_id = v_user_id
        AND transaction_id = v_tx_id
        AND account_number = '2650'
    ),
    '4 zero-net no 2650 row'
  );
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '4 zero-net 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '4 zero-net 2641 zero');

  -- 5. Mixed balances over several 261/262/263/2641 accounts.
  v_period_start := make_date(v_base_year, 5, 1);
  v_period_end := make_date(v_base_year, 5, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 5, 10),
    v_tag || ' test 05 mixed fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 210, 'credit', 0),
      jsonb_build_object('account', '2631', 'debit', 20, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 80, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250),
      jsonb_build_object('account', '2621', 'debit', 0, 'credit', 60)
    ),
    700005
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 210::numeric, '5 mixed closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 310::numeric, 5, '5 mixed closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 210::numeric, '5 mixed period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '5 mixed 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2621', 0, '5 mixed 2621 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2631', 0, '5 mixed 2631 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '5 mixed 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -210, '5 mixed 2650 credit');

  -- 6. 265x activity before close: manual-review block and no ver_nr.
  v_period_start := make_date(v_base_year, 6, 1);
  v_period_end := make_date(v_base_year, 6, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_tag || ' test 06 265x fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 100)
    ),
    700006
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, '6 265x activity blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%265x%', '6 265x error message');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '6 265x no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '6 265x no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '6 265x no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '6 265x period remains open');

  -- 7. Activity exists, but all per-account balances are exactly zero.
  v_period_start := make_date(v_base_year, 7, 1);
  v_period_end := make_date(v_base_year, 7, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 7, 10),
    v_tag || ' test 07 all balances zero fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    700007
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '7 all balances zero blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '7 all balances zero no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '7 all balances zero no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '7 all balances zero no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '7 all balances zero period remains open');

  -- 8. imported_history blocks normal close.
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'open',
    'imported_history'
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '8 imported_history blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '8 imported_history no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '8 imported_history no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '8 imported_history no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '8 imported_history period remains open');

  -- 9. Already closed: idempotent success with existing amount/transaction.
  v_period_start := make_date(v_base_year, 9, 1);
  v_period_end := make_date(v_base_year, 9, 30);
  v_existing_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    v_period_end,
    v_tag || ' test 09 pre-closed existing closing',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 0, 'credit', 25),
      jsonb_build_object('account', '2650', 'debit', 25, 'credit', 0)
    ),
    700009,
    'vat_closing'
  );
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'closed',
    'sololedger',
    -25,
    v_existing_tx_id
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.close_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq((v_result->>'already_closed')::boolean, true, '9 already closed flag');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -25::numeric, '9 already closed amount');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_existing_tx_id, '9 already closed transaction id');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '9 already closed no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '9 already closed no duplicate journal rows');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '9 already closed no ver_nr');

  -- 10. declared blocks.
  v_period_start := make_date(v_base_year, 10, 1);
  v_period_end := make_date(v_base_year, 10, 31);
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'declared',
    'sololedger',
    0,
    NULL,
    now()
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '10 declared blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '10 declared no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '10 declared no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '10 declared no ver_nr');

  -- 11. Future period_end blocks.
  v_period_start := make_date(v_future_year, 1, 1);
  v_period_end := make_date(v_future_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '11 future period blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '11 future no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '11 future no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '11 future no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '11 future period remains open');

  -- 12. period_end year in closed_years blocks.
  v_period_start := make_date(v_base_year + 2, 1, 1);
  v_period_end := make_date(v_base_year + 2, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '12 closed year blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '12 closed year no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '12 closed year no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '12 closed year no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '12 closed year period remains open');

  -- 13. Idempotent retry after a real close in the same outer transaction.
  v_period_start := make_date(v_base_year + 1, 1, 1);
  v_period_end := make_date(v_base_year + 1, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 1, 10),
    v_tag || ' test 13 retry fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 125, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    700013
  );

  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 25::numeric, '13 first close period link');
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr + 1, '13 first close consumes one ver_nr');

  v_before_ver_nr := v_after_ver_nr;
  v_result := public.close_vat_period_atomic(v_period_id);
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq((v_result->>'already_closed')::boolean, true, '13 retry already_closed');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_tx_id, '13 retry same transaction');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '13 retry no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '13 retry no duplicate journal rows');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, '13 retry no ver_nr');

  -- 14. Wrong user / nonexistent period id, tested safely without touching any other real user.
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '14 nonexistent period blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '14 nonexistent no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '14 nonexistent no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '14 nonexistent no ver_nr');

  -- 15. declared_at remains NULL after normal open -> closed.
  v_period_start := make_date(v_base_year + 1, 2, 1);
  v_period_end := make_date(v_base_year + 1, 2, 28);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 2, 10),
    v_tag || ' test 15 declared_at fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 125, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    700015
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 25::numeric, '15 declared_at period link');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM public.vat_periods
      WHERE id = v_period_id
        AND status = 'closed'
        AND declared_at IS NULL
    ),
    '15 declared_at remains NULL'
  );

  -- 16. Scope invariant: no 1630, and exactly 2641 inside 264x.
  v_period_start := make_date(v_base_year + 1, 3, 1);
  v_period_end := make_date(v_base_year + 1, 3, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 3, 10),
    v_tag || ' test 16 scope fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 40, 'credit', 0),
      jsonb_build_object('account', '2642', 'debit', 70, 'credit', 0),
      jsonb_build_object('account', '1630', 'debit', 30, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 140)
    ),
    700016
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -40::numeric, '16 scope closing_amount only 2641');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 40::numeric, 2, '16 scope closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, -40::numeric, '16 scope period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '16 scope 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2642', 70, '16 scope 2642 untouched');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '1630', 30, '16 scope 1630 untouched');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE user_id = v_user_id
        AND transaction_id = v_tx_id
        AND (account_number = '1630' OR account_number = '2642')
    ),
    '16 scope no 1630 or 2642 closing rows'
  );

  -- 17. Closing date/self-interaction invariant.
  v_period_start := make_date(v_base_year + 1, 4, 1);
  v_period_end := make_date(v_base_year + 1, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 4, 10),
    v_tag || ' test 17 closing date fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    700017
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 25::numeric, 2, '17 closing date');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 25::numeric, '17 closing date period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '17 self-interaction final 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -25, '17 self-interaction 2650 credit once');

  SELECT count(*)::integer
    INTO v_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_tx_id
    AND date IS DISTINCT FROM v_period_end;
  PERFORM pg_temp.assert_eq(v_count, 0, '17 all closing rows have period_end date');

  -- 18. Lock-domain revalidation. Real two-session race remains deferred; in
  -- this single-session rollback script we verify the installed candidate has
  -- the explicit guard and correct lock-before-row-lock structure.
  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    position('PERFORM public.lock_vat_months(v_user_id, v_lock_dates)' in v_definition) > 0,
    '18 lock_vat_months call exists'
  );
  PERFORM pg_temp.assert_true(
    position('FOR UPDATE' in v_definition) > position('PERFORM public.lock_vat_months(v_user_id, v_lock_dates)' in v_definition),
    '18 VAT advisory locks before row lock'
  );
  PERFORM pg_temp.assert_true(
    v_definition LIKE '%v_period.user_id IS DISTINCT FROM v_pre_user_id%'
    AND v_definition LIKE '%v_period.period_start IS DISTINCT FROM v_pre_period_start%'
    AND v_definition LIKE '%v_period.period_end IS DISTINCT FROM v_pre_period_end%'
    AND v_definition LIKE '%Momsperiodens datum ändrades under stängningen. Försök igen.%'
    AND v_definition LIKE '%ERRCODE = ''40001''%',
    '18 lock-domain mismatch guard exists'
  );

  RAISE NOTICE 'KAN-7 close_vat_period_atomic candidate rollback tests completed for run id %. Test 18 single-session structural guard verified; true two-session concurrency remains DEFERRED / NOT EMPIRICALLY TESTED.',
    v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate RPC install, all fixtures, and any
-- ver_nr_sequences changes are discarded together.
ROLLBACK;
