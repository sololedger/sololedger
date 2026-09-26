\set ON_ERROR_STOP on

-- KAN-19 rollback regression for exact 2645 VAT account classification.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/kan19_2645_vat_account_classification_candidate.sql
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

CREATE TEMP TABLE kan19_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan19_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-19 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-19 assertion failed: % (actual %, expected %)',
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
    RAISE EXCEPTION 'KAN-19 fixture is unbalanced: % (debit %, credit %)',
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_writes(
  p_user_id uuid,
  p_before_tx integer,
  p_before_entries integer,
  p_before_ver_nr integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_after_tx integer;
  v_after_entries integer;
  v_after_ver_nr integer;
BEGIN
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = p_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = p_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, p_before_tx, p_message || ': no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, p_before_entries, p_message || ': no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM p_before_ver_nr, p_message || ': no ver_nr');
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
    count(*) FILTER (WHERE coalesce(debit, 0) = 0 AND coalesce(credit, 0) = 0)::integer,
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO
    v_row_count,
    v_zero_row_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_row_count, p_expected_row_count, p_message || ': journal row count');
  PERFORM pg_temp.assert_eq(v_zero_row_count, 0, p_message || ': no fabricated zero rows');
  PERFORM pg_temp.assert_eq(v_total_debit, v_total_credit, p_message || ': journal balanced');
  PERFORM pg_temp.assert_eq(v_total_debit, p_expected_amount, p_message || ': amount is total debit');
END;
$$;

CREATE TEMP TABLE kan19_before_matrix AS
WITH accounts(account_number) AS (
  VALUES
    ('2614'),
    ('2641'),
    ('2645'),
    ('2650'),
    ('2640'),
    ('2646')
)
SELECT
  a.account_number,
  c.vat_period_guard_relevant AS p1,
  c.vat_close_balance_participant AS p2,
  c.vat_close_manual_review_relevant AS p3
FROM accounts a
CROSS JOIN LATERAL public.vat_account_classification(a.account_number) c;

-- Install the exact local KAN-19 candidate inside the rollback transaction.
\ir ../migrations/20260926132107_add_2645_vat_account_classification.sql

CREATE TEMP TABLE kan19_expected_accounts (
  account_number text,
  before_p1 boolean,
  before_p2 boolean,
  before_p3 boolean,
  after_p1 boolean,
  after_p2 boolean,
  after_p3 boolean,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan19_expected_accounts (
  account_number,
  before_p1,
  before_p2,
  before_p3,
  after_p1,
  after_p2,
  after_p3,
  note
) VALUES
  ('2610', true,  true,  false, true,  true,  false, '261x lower representative'),
  ('2614', true,  true,  false, true,  true,  false, '261x reverse-charge output VAT representative'),
  ('2619', true,  true,  false, true,  true,  false, '261x upper representative'),
  ('2620', true,  true,  false, true,  true,  false, '262x lower representative'),
  ('2621', true,  true,  false, true,  true,  false, '262x canonical representative'),
  ('2629', true,  true,  false, true,  true,  false, '262x upper representative'),
  ('2630', true,  true,  false, true,  true,  false, '263x lower representative'),
  ('2631', true,  true,  false, true,  true,  false, '263x canonical representative'),
  ('2639', true,  true,  false, true,  true,  false, '263x upper representative'),
  ('2640', false, false, false, false, false, false, 'other 264x below exact 2641'),
  ('2641', true,  true,  false, true,  true,  false, 'exact domestic deductible input VAT'),
  ('26410', false, false, false, false, false, false, 'exact 2641 does not match longer text'),
  ('2642', false, false, false, false, false, false, 'other 264x remains outside'),
  ('2645', false, false, false, true,  true,  false, 'exact calculated input VAT on foreign acquisitions'),
  ('2646', false, false, false, false, false, false, 'other 264x remains outside'),
  ('26450', false, false, false, false, false, false, 'exact 2645 does not match longer text'),
  ('2650', true,  false, true,  true,  false, true,  'canonical VAT settlement account'),
  ('2651', true,  false, true,  true,  false, true,  'other 265x representative'),
  ('1930', false, false, false, false, false, false, 'ordinary bank account'),
  ('4535', false, false, false, false, false, false, 'EU service acquisition base account'),
  (NULL,   NULL,  NULL,  NULL,  NULL,  NULL,  NULL,  'NULL preserves SQL predicate NULL behavior');

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_type_2645 text;

  v_period_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_definition text;
  v_mismatch_count integer;
  v_count integer;

  v_before_tx integer;
  v_before_entries integer;
  v_before_ver_nr integer;
  v_failed boolean;
  v_error_message text;
  v_period_start date;
  v_period_end date;
  v_batch_id uuid;
  v_payload jsonb;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan19_test_context;

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
  FROM kan19_expected_accounts e
  JOIN kan19_before_matrix b USING (account_number)
  WHERE b.p1 IS DISTINCT FROM e.before_p1
     OR b.p2 IS DISTINCT FROM e.before_p2
     OR b.p3 IS DISTINCT FROM e.before_p3;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'pre-candidate matrix matches verified current semantics'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan19_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_period_guard_relevant IS DISTINCT FROM e.after_p1
     OR c.vat_close_balance_participant IS DISTINCT FROM e.after_p2
     OR c.vat_close_manual_review_relevant IS DISTINCT FROM e.after_p3;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'post-candidate classification matrix matches exact 2645 target'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan19_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant
     OR public.vat_account_is_period_guard_relevant(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant
     OR public.vat_account_is_close_balance_participant(e.account_number)
          IS DISTINCT FROM c.vat_close_balance_participant
     OR public.vat_account_requires_close_manual_review(e.account_number)
          IS DISTINCT FROM c.vat_close_manual_review_relevant;

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'wrappers delegate central classifier outputs');

  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('service_role', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE'),
    'classifier execute privileges preserve internal-helper boundary'
  );

  SELECT pg_get_functiondef('public.vat_account_classification(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%RETURNS TABLE(vat_period_guard_relevant boolean, vat_close_balance_participant boolean, vat_close_manual_review_relevant boolean)%'
    AND v_definition LIKE '%LANGUAGE sql%'
    AND v_definition LIKE '%IMMUTABLE PARALLEL SAFE%'
    AND v_definition LIKE '%SET search_path TO ''public''%'
    AND v_definition LIKE '%p_account_number IN (''2641'', ''2645'')%'
    AND v_definition NOT LIKE '%p_account_number LIKE ''264%''%',
    'classifier signature/properties preserved and only exact 2645 added'
  );

  SELECT pg_get_functiondef('public.vat_concurrency_account(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%public.vat_account_is_period_guard_relevant(p_account_number)%'
    AND v_definition NOT LIKE '%2645%',
    'vat_concurrency_account delegates without 2645 special-case'
  );

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%PERFORM public.lock_vat_months(v_user_id, v_lock_dates)%'
    AND position('FOR UPDATE' in v_definition) > position('PERFORM public.lock_vat_months(v_user_id, v_lock_dates)' in v_definition),
    'close VAT locking order remains advisory locks before row lock'
  );

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%public.vat_account_requires_close_manual_review(je.account_number)%'
    AND v_definition LIKE '%public.vat_account_is_close_balance_participant(je.account_number)%'
    AND v_definition NOT LIKE '%je.account_number = ''2645''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''264%''%'
    AND v_definition LIKE '%''2650''%',
    'close delegates P2/P3 and keeps literal 2650 settlement'
  );

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_is_close_balance_participant(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_is_close_balance_participant(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 2, 'P2 wrapper occurs exactly twice in close');

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_requires_close_manual_review(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_requires_close_manual_review(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 1, 'P3 wrapper occurs exactly once in close');

  FOR v_definition IN
    SELECT pg_get_functiondef(r)
    FROM (
      VALUES
        ('public.book_transaction_atomic(jsonb)'::regprocedure),
        ('public.book_periodized_transaction_atomic(jsonb)'::regprocedure),
        ('public.import_sie_batch(jsonb)'::regprocedure),
        ('public.undo_sie_import_atomic(uuid)'::regprocedure),
        ('public.create_correction_transaction_atomic(uuid)'::regprocedure)
    ) AS funcs(r)
  LOOP
    PERFORM pg_temp.assert_true(
      v_definition LIKE '%vat_concurrency_account%'
      AND v_definition NOT LIKE '%2645%'
      AND v_definition NOT LIKE '%vat_account_classification%',
      'P1 consumer delegates through vat_concurrency_account without 2645 special-case'
    );
  END LOOP;

  v_tag := 'kan19-' || v_run_id;
  v_type_2645 := 'kan19_2645_' || v_run_id;

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

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate,
    comment
  ) VALUES (
    v_type_2645,
    v_user_id,
    v_tag || ' direct 2645 fixture account',
    '2645',
    '1930',
    0,
    v_tag || ' rollback-only account fixture'
  );

  -- A. Open period: ordinary booking and import with direct 2645 are allowed.
  v_period_start := make_date(v_base_year, 1, 1);
  v_period_end := make_date(v_base_year, 1, 31);
  PERFORM pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);

  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 1, 10)::text,
      'description', v_tag || ' open 2645 booking',
      'amount', 57,
      'type', v_type_2645,
      'vat_rate', 0,
      'file_url', ''
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'A open 2645 booking succeeds');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 57, 'A open booking 2645 balance');

  v_payload := jsonb_build_object(
    'filename', v_tag || '-open-2645.se',
    'file_hash', v_tag || '-open-2645',
    'company_name', 'KAN19 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_base_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '1',
      'date', make_date(v_base_year, 1, 11)::text,
      'description', 'KAN19 open 2645 import',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '2645', 'amount', 57, 'date', make_date(v_base_year, 1, 11)::text),
        jsonb_build_object('account_number', '1930', 'amount', -57, 'date', make_date(v_base_year, 1, 11)::text)
      )
    ))
  );
  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'A open 2645 import succeeds');
  PERFORM pg_temp.assert_true(v_batch_id IS NOT NULL, 'A open import returns batch id');

  -- B. Closed period: ordinary booking and import with direct 2645 are blocked.
  v_period_start := make_date(v_base_year, 2, 1);
  v_period_end := make_date(v_base_year, 2, 28);
  PERFORM pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'closed', 'sololedger', 0);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 2, 10)::text,
        'description', v_tag || ' closed 2645 booking',
        'amount', 57,
        'type', v_type_2645,
        'vat_rate', 0,
        'file_url', ''
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'B closed 2645 booking blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'B closed booking atomicity');

  v_payload := jsonb_build_object(
    'filename', v_tag || '-closed-2645.se',
    'file_hash', v_tag || '-closed-2645',
    'company_name', 'KAN19 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_base_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '2',
      'date', make_date(v_base_year, 2, 11)::text,
      'description', 'KAN19 closed 2645 import',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '2645', 'amount', 57, 'date', make_date(v_base_year, 2, 11)::text),
        jsonb_build_object('account_number', '1930', 'amount', -57, 'date', make_date(v_base_year, 2, 11)::text)
      )
    ))
  );
  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'B closed 2645 import blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'B closed import atomicity');

  -- C. Declared period: ordinary booking and import with direct 2645 are blocked.
  v_period_start := make_date(v_base_year, 3, 1);
  v_period_end := make_date(v_base_year, 3, 31);
  PERFORM pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'declared', 'sololedger', 0, NULL, now());

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 3, 10)::text,
        'description', v_tag || ' declared 2645 booking',
        'amount', 57,
        'type', v_type_2645,
        'vat_rate', 0,
        'file_url', ''
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'C declared 2645 booking blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'C declared booking atomicity');

  v_payload := jsonb_build_object(
    'filename', v_tag || '-declared-2645.se',
    'file_hash', v_tag || '-declared-2645',
    'company_name', 'KAN19 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_base_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '3',
      'date', make_date(v_base_year, 3, 11)::text,
      'description', 'KAN19 declared 2645 import',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '2645', 'amount', 57, 'date', make_date(v_base_year, 3, 11)::text),
        jsonb_build_object('account_number', '1930', 'amount', -57, 'date', make_date(v_base_year, 3, 11)::text)
      )
    ))
  );
  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'C declared 2645 import blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'C declared import atomicity');

  -- D. Reverse-charge close: Dr 4535 228, Dr 2645 57, Cr 2614 57, Cr bank 228.
  v_period_start := make_date(v_base_year, 4, 1);
  v_period_end := make_date(v_base_year, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 10),
    v_tag || ' reverse charge 228 57 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '4535', 'debit', 228, 'credit', 0),
      jsonb_build_object('account', '2645', 'debit', 57, 'credit', 0),
      jsonb_build_object('account', '2614', 'debit', 0, 'credit', 57),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 228)
    ),
    790004
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, 'D reverse-charge closing_amount zero');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 57::numeric, 2, 'D reverse-charge closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2614', 0, 'D reverse-charge 2614 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 0, 'D reverse-charge 2645 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 0, 'D reverse-charge no 2650 balance');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE transaction_id = v_tx_id
        AND user_id = v_user_id
        AND account_number = '2650'
    ),
    'D reverse-charge no 2650 settlement row'
  );

  -- E. Existing/manual 2645 debit balance participates in close.
  v_period_start := make_date(v_base_year, 5, 1);
  v_period_end := make_date(v_base_year, 5, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 5, 10),
    v_tag || ' manual 2645 balance fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2645', 'debit', 57, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 57)
    ),
    790005
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -57::numeric, 'E manual 2645 closing_amount refund');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 57::numeric, 2, 'E manual 2645 closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 0, 'E manual 2645 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 57, 'E manual 2645 2650 debit settlement');

  -- F. Representative VAT V1 2611/2641 close remains correct.
  v_period_start := make_date(v_base_year, 6, 1);
  v_period_end := make_date(v_base_year, 6, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_tag || ' VAT V1 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    790006
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 200::numeric, 'F VAT V1 closing_amount payable');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 250::numeric, 3, 'F VAT V1 closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, 'F VAT V1 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, 'F VAT V1 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -200, 'F VAT V1 2650 credit settlement');

  -- G. 2650 remains P1/P3 only and blocks close manual-review path.
  v_period_start := make_date(v_base_year, 7, 1);
  v_period_end := make_date(v_base_year, 7, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 7, 10),
    v_tag || ' 2650 manual-review fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 100)
    ),
    790007
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'G 2650 activity blocks close');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%265x%', 'G 2650 manual-review error');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'G 2650 close atomicity');

  -- H. Other 264x do not inherit 2645 behavior.
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 8, 10),
    v_tag || ' other 264x fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2640', 'debit', 33, 'credit', 0),
      jsonb_build_object('account', '2646', 'debit', 44, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 77)
    ),
    790008
  );
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, 'H other 264x no closing transaction');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, 'H other 264x closing amount zero');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'H other 264x no closing writes');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2640', 33, 'H 2640 untouched');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2646', 44, 'H 2646 untouched');

  -- I. Zero-activity close remains no-transaction.
  v_period_start := make_date(v_base_year, 9, 1);
  v_period_end := make_date(v_base_year, 9, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, 'I zero-activity transaction_created');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, 'I zero-activity closing amount');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'I zero-activity no writes');

  -- J. imported_history close restriction remains unchanged.
  v_period_start := make_date(v_base_year, 10, 1);
  v_period_end := make_date(v_base_year, 10, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'open', 'imported_history');
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'J imported_history close blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'J imported_history close atomicity');

  RAISE NOTICE 'KAN-19 exact 2645 VAT account-classification candidate completed for run id %. True two-session concurrency is NOT tested here.',
    v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate function install and fixtures are discarded.
ROLLBACK;
