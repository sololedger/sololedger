\set ON_ERROR_STOP on

-- KAN-17C rollback/equivalence candidate for VAT close account classification.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan17c_vat_close_account_classification_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION and fixture writes, runs inside one outer transaction and ends with
-- ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan17c_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan17c_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

-- Install local foundations and the KAN-17C candidate inside the rollback
-- transaction. This script is not for live use.
\ir ../migrations/20260925_add_vat_account_classification.sql
\ir ../migrations/20260925124023_delegate_vat_close_account_classification.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-17C assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-17C assertion failed: % (actual %, expected %)',
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
    RAISE EXCEPTION 'KAN-17C fixture is unbalanced: % (debit %, credit %)',
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
  PERFORM pg_temp.assert_eq(v_tx.date, p_period_end, p_message || ': transaction date');
  PERFORM pg_temp.assert_eq(v_tx.amount, p_expected_amount, p_message || ': transactions.amount');

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE date IS DISTINCT FROM p_period_end)::integer,
    count(*) FILTER (WHERE coalesce(debit, 0) = 0 AND coalesce(credit, 0) = 0)::integer,
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO
    v_row_count,
    v_bad_date_count,
    v_zero_row_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_row_count, p_expected_row_count, p_message || ': journal row count');
  PERFORM pg_temp.assert_eq(v_bad_date_count, 0, p_message || ': all journal rows on period_end');
  PERFORM pg_temp.assert_eq(v_zero_row_count, 0, p_message || ': no fabricated zero rows');
  PERFORM pg_temp.assert_eq(v_total_debit, v_total_credit, p_message || ': journal balanced');
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

CREATE TEMP TABLE kan17c_expected_accounts (
  account_number text,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan17c_expected_accounts (account_number, note) VALUES
  (NULL, 'NULL preserves SQL three-valued predicate behavior'),
  ('', 'empty string'),
  ('26', 'prefix boundary before supported ranges'),
  ('261', '261 prefix boundary'),
  ('26100', '261 longer text'),
  ('261ABC', '261 nonnumeric suffix'),
  ('262', '262 prefix boundary'),
  ('263', '263 prefix boundary'),
  ('264', '264 exact is not close-scope'),
  ('2640', 'other 264x below exact 2641'),
  ('2641', 'exact input VAT close participant'),
  ('26410', 'exact 2641 does not match longer text'),
  ('2642', 'other 264x above exact 2641'),
  ('265', '265 prefix boundary'),
  ('2650', 'canonical VAT settlement account'),
  ('265ABC', '265 nonnumeric suffix'),
  ('vat', 'unrelated text');

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_future_year integer := extract(year from current_date)::integer + 20;

  v_period_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_definition text;
  v_mismatch_count integer;
  v_count integer;

  v_before_tx integer;
  v_after_tx integer;
  v_before_entries integer;
  v_after_entries integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_after_period_status text;

  v_failed boolean;
  v_error_message text;
  v_period_start date;
  v_period_end date;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan17c_test_context;

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

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17c_expected_accounts e
  WHERE public.vat_account_is_close_balance_participant(e.account_number)
          IS DISTINCT FROM (
               e.account_number LIKE '261%'
            OR e.account_number LIKE '262%'
            OR e.account_number LIKE '263%'
            OR e.account_number = '2641'
          )
     OR public.vat_account_requires_close_manual_review(e.account_number)
          IS DISTINCT FROM (e.account_number LIKE '265%');

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P2/P3 wrappers match legacy embedded predicates for edge cases'
  );

  WITH p2_where_legacy AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE account_number LIKE '261%'
       OR account_number LIKE '262%'
       OR account_number LIKE '263%'
       OR account_number = '2641'
  ),
  p2_where_wrapper AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE public.vat_account_is_close_balance_participant(account_number)
  ),
  p3_where_legacy AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE account_number LIKE '265%'
  ),
  p3_where_wrapper AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE public.vat_account_requires_close_manual_review(account_number)
  )
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM p2_where_legacy p2l, p2_where_wrapper p2w, p3_where_legacy p3l, p3_where_wrapper p3w
  WHERE p2l.selected_accounts IS DISTINCT FROM p2w.selected_accounts
     OR p3l.selected_accounts IS DISTINCT FROM p3w.selected_accounts;

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'WHERE context preserves selected accounts');

  WITH filter_context AS (
    SELECT
      count(*) FILTER (
        WHERE account_number LIKE '261%'
           OR account_number LIKE '262%'
           OR account_number LIKE '263%'
           OR account_number = '2641'
      ) AS p2_legacy_count,
      count(*) FILTER (
        WHERE public.vat_account_is_close_balance_participant(account_number)
      ) AS p2_wrapper_count,
      count(*) FILTER (WHERE account_number LIKE '265%') AS p3_legacy_count,
      count(*) FILTER (
        WHERE public.vat_account_requires_close_manual_review(account_number)
      ) AS p3_wrapper_count
    FROM kan17c_expected_accounts
  )
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM filter_context
  WHERE p2_legacy_count IS DISTINCT FROM p2_wrapper_count
     OR p3_legacy_count IS DISTINCT FROM p3_wrapper_count;

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'FILTER context preserves counts');

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17c_expected_accounts
  WHERE (
      CASE WHEN public.vat_account_is_close_balance_participant(account_number) THEN 'true' ELSE 'false_or_null' END
    ) IS DISTINCT FROM (
      CASE WHEN (
             account_number LIKE '261%'
          OR account_number LIKE '262%'
          OR account_number LIKE '263%'
          OR account_number = '2641'
      ) THEN 'true' ELSE 'false_or_null' END
    )
     OR (
      CASE WHEN public.vat_account_requires_close_manual_review(account_number) THEN 'true' ELSE 'false_or_null' END
    ) IS DISTINCT FROM (
      CASE WHEN account_number LIKE '265%' THEN 'true' ELSE 'false_or_null' END
    );

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'CASE/IF-like NULL semantics are preserved');

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%public.vat_account_requires_close_manual_review(je.account_number)%'
    AND v_definition LIKE '%public.vat_account_is_close_balance_participant(je.account_number)%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''265%''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''261%''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''262%''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''263%''%'
    AND v_definition NOT LIKE '%je.account_number = ''2641''%'
    AND v_definition LIKE '%''2650''%',
    'close definition delegates P2/P3 predicates and keeps literal 2650 settlement'
  );

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_is_close_balance_participant(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_is_close_balance_participant(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 2, 'P2 wrapper occurs exactly twice');

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_requires_close_manual_review(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_requires_close_manual_review(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 1, 'P3 wrapper occurs exactly once');

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('service_role', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('postgres', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.vat_account_is_close_balance_participant(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.vat_account_requires_close_manual_review(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.vat_account_is_close_balance_participant(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.vat_account_requires_close_manual_review(text)'::regprocedure, 'EXECUTE'),
    'close and wrapper privileges preserve the intended security boundary'
  );

  v_tag := 'kan17c-' || v_run_id;

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

  -- 1 and 18. Zero VAT activity: close state only, no closing transaction/ver_nr.
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
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, '1 zero activity transaction_created');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '1 zero activity amount');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '1 zero activity no transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '1 zero activity no journal rows');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '1 zero activity no ver_nr');

  -- 2. Normal payable VAT close.
  v_period_start := make_date(v_base_year, 2, 1);
  v_period_end := make_date(v_base_year, 2, 28);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 10),
    v_tag || ' payable fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    710002
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 200::numeric, '2 payable closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 250::numeric, 3, '2 payable closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 200::numeric, '2 payable period');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '2 payable 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '2 payable 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -200, '2 payable 2650 settlement');

  -- 3. VAT refund/receivable close.
  v_period_start := make_date(v_base_year, 3, 1);
  v_period_end := make_date(v_base_year, 3, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 10),
    v_tag || ' refund fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 100)
    ),
    710003
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -100::numeric, '3 refund closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 100::numeric, 2, '3 refund closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '3 refund 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 100, '3 refund 2650 settlement');

  -- 4, 11, 12, 13, 14, 15, 16, 17. Mixed P2 accounts, exact P2 scope,
  -- literal settlement 2650, vat_closing source, period_end date, balanced
  -- journal, expected closing_amount and closing_transaction_id.
  v_period_start := make_date(v_base_year, 4, 1);
  v_period_end := make_date(v_base_year, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 10),
    v_tag || ' mixed scope fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 310, 'credit', 0),
      jsonb_build_object('account', '2631', 'debit', 20, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 80, 'credit', 0),
      jsonb_build_object('account', '2642', 'debit', 70, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250),
      jsonb_build_object('account', '2621', 'debit', 0, 'credit', 60),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 170)
    ),
    710004
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 210::numeric, '4 mixed closing_amount excludes 2642');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 310::numeric, 5, '4 mixed closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 210::numeric, '4 mixed period');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '4 mixed 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2621', 0, '4 mixed 2621 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2631', 0, '4 mixed 2631 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '4 mixed 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2642', 70, '4 mixed 2642 untouched');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -210, '4 mixed 2650 settlement');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE transaction_id = v_tx_id
        AND user_id = v_user_id
        AND account_number = '2642'
    ),
    '4 mixed generated zeroing rows use exactly P2 scope'
  );

  -- 5. P3/265x activity blocks normal close/manual review with no writes.
  v_period_start := make_date(v_base_year, 5, 1);
  v_period_end := make_date(v_base_year, 5, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 5, 10),
    v_tag || ' 265x fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 100)
    ),
    710005
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
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_true(v_failed, '5 265x activity blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%265x%', '5 265x error message');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '5 265x no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '5 265x no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '5 265x no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '5 265x period remains open');

  -- 6. P2 activity with already-zero relevant balances blocks/manual review.
  v_period_start := make_date(v_base_year, 6, 1);
  v_period_end := make_date(v_base_year, 6, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_tag || ' already zero P2 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    710006
  );
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_true(v_failed, '6 already-zero P2 blocks');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '6 already-zero period remains open');

  -- 7. imported_history cannot normal-close.
  v_period_start := make_date(v_base_year, 7, 1);
  v_period_end := make_date(v_base_year, 7, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'open', 'imported_history');
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '7 imported_history blocks');

  -- 8. declared period behavior blocks close.
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'declared', 'sololedger', 0, NULL, now());
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '8 declared period blocks');

  -- 9. Future period guard.
  v_period_start := make_date(v_future_year, 1, 1);
  v_period_end := make_date(v_future_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '9 future period blocks');

  -- 10. Locked year guard.
  v_period_start := make_date(v_base_year + 2, 1, 1);
  v_period_end := make_date(v_base_year + 2, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '10 locked year blocks');

  RAISE NOTICE 'KAN-17C VAT close account-classification candidate completed for run id %. True two-session concurrency is NOT tested here.',
    v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate function install and fixtures are discarded.
ROLLBACK;
