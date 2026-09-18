\set ON_ERROR_STOP on

-- KAN-6 rollback test candidate for import_sie_batch VAT guard.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan6_import_sie_vat_guard_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users and must be the
-- previously verified dedicated SoloLedger test user. This script does not
-- create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan6_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan6_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

-- Install the exact local KAN-6 candidate inside the rollback transaction.
\ir ../migrations/20260918_add_vat_guard_to_import_sie_batch.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-6 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-6 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  -- Keep generated payload dates four-digit YYYY-MM-DD because the RPC
  -- intentionally validates that exact direct-RPC date shape.
  v_year integer := 2400 + floor(random() * 1000)::integer;
  v_tag text;

  v_payload jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_tx_id uuid;

  v_failed boolean;
  v_error_message text;

  v_before_batches integer;
  v_before_transactions integer;
  v_before_entries integer;
  v_before_ver_nr integer;
  v_after_batches integer;
  v_after_transactions integer;
  v_after_entries integer;
  v_after_ver_nr integer;

  v_date_a date;
  v_date_b date;
  v_date_c date;

  v_row_count integer;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan6_test_context;

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

  -- Keep fixtures far from ordinary dates and unique for every run. The outer
  -- rollback guarantees cleanup even though we intentionally create DB rows.
  v_tag := 'kan6-' || v_run_id;
  v_date_a := make_date(v_year, 1, 15);
  v_date_b := make_date(v_year, 2, 15);
  v_date_c := make_date(v_year, 3, 15);

  -- 1. Non-VAT happy path.
  v_payload := jsonb_build_object(
    'filename', v_tag || '-01.se',
    'file_hash', v_tag || '-01-non-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '1',
      'date', v_date_a::text,
      'description', 'KAN6 non-VAT happy path',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', v_date_a::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_a::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;

  SELECT count(*) INTO v_row_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id IN (
      SELECT id FROM public.transactions WHERE import_batch_id = v_batch_id
    );
  PERFORM pg_temp.assert_eq(v_row_count, 2, 'non-VAT happy path writes two rows');

  -- 2. VAT in one open SoloLedger period.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES (
    v_user_id,
    date_trunc('month', v_date_b)::date,
    (date_trunc('month', v_date_b)::date + interval '1 month' - interval '1 day')::date,
    'month',
    'open',
    'sololedger'
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-02.se',
    'file_hash', v_tag || '-02-one-open-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '2',
      'date', v_date_b::text,
      'description', 'KAN6 one open VAT period',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', v_date_b::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', v_date_b::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_b::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'VAT one open period succeeds');

  -- 3. VAT across multiple calendar months.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES
    (
      v_user_id,
      date_trunc('month', v_date_c)::date,
      (date_trunc('month', v_date_c)::date + interval '1 month' - interval '1 day')::date,
      'month',
      'open',
      'sololedger'
    ),
    (
      v_user_id,
      date_trunc('month', v_date_c + interval '1 month')::date,
      (date_trunc('month', v_date_c + interval '1 month')::date + interval '1 month' - interval '1 day')::date,
      'month',
      'open',
      'sololedger'
    );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-03.se',
    'file_hash', v_tag || '-03-multi-month',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(
      jsonb_build_object(
        'series', 'A',
        'ver_number', '3',
        'date', v_date_c::text,
        'description', 'KAN6 VAT month one',
        'rows', jsonb_build_array(
          jsonb_build_object('account_number', '1930', 'amount', 125, 'date', v_date_c::text),
          jsonb_build_object('account_number', '2611', 'amount', -25, 'date', v_date_c::text),
          jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_c::text)
        )
      ),
      jsonb_build_object(
        'series', 'A',
        'ver_number', '4',
        'date', (v_date_c + interval '1 month')::date::text,
        'description', 'KAN6 VAT month two',
        'rows', jsonb_build_array(
          jsonb_build_object('account_number', '1930', 'amount', 112, 'date', (v_date_c + interval '1 month')::date::text),
          jsonb_build_object('account_number', '2621', 'amount', -12, 'date', (v_date_c + interval '1 month')::date::text),
          jsonb_build_object('account_number', '3001', 'amount', -100, 'date', (v_date_c + interval '1 month')::date::text)
        )
      )
    )
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_eq((v_result->>'imported_count')::integer, 2, 'multi-month import count');

  -- 4. Same verification, different actual row dates.
  v_payload := jsonb_build_object(
    'filename', v_tag || '-04.se',
    'file_hash', v_tag || '-04-same-ver-row-dates',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '5',
      'date', v_date_c::text,
      'description', 'KAN6 same verification row dates',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 162, 'date', v_date_c::text),
        jsonb_build_object('account_number', '2611', 'amount', -50, 'date', v_date_c::text),
        jsonb_build_object('account_number', '2621', 'amount', -12, 'date', (v_date_c + interval '1 month')::date::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_c::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;

  SELECT count(*) INTO v_row_count
  FROM public.journal_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.import_batch_id = v_batch_id
    AND e.user_id = v_user_id
    AND (
      (e.account_number = '2611' AND e.date = v_date_c)
      OR (e.account_number = '2621' AND e.date = (v_date_c + interval '1 month')::date)
    );
  PERFORM pg_temp.assert_eq(v_row_count, 2, 'same verification uses actual VAT row dates');

  -- 5. Closed SoloLedger period blocks atomically.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 5, 15))::date,
    (date_trunc('month', make_date(v_year, 5, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'closed',
    'sololedger',
    0
  );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-05.se',
    'file_hash', v_tag || '-05-closed-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '6',
      'date', make_date(v_year, 5, 15)::text,
      'description', 'KAN6 closed VAT period',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year, 5, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year, 5, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year, 5, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'closed SoloLedger VAT period blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%stängd%' OR v_error_message ILIKE '%deklarerad%', 'closed VAT error message');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'closed block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'closed block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'closed block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'closed block does not consume ver_nr');

  -- 6. Declared SoloLedger period blocks atomically.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount, declared_at
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 6, 15))::date,
    (date_trunc('month', make_date(v_year, 6, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'declared',
    'sololedger',
    0,
    now()
  );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-06.se',
    'file_hash', v_tag || '-06-declared-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '7',
      'date', make_date(v_year, 6, 15)::text,
      'description', 'KAN6 declared VAT period',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year, 6, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year, 6, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year, 6, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'declared SoloLedger VAT period blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'declared block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'declared block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'declared block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'declared block does not consume ver_nr');

  -- 7. imported_history closed/declared must not block.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount, declared_at
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 7, 15))::date,
    (date_trunc('month', make_date(v_year, 7, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'declared',
    'imported_history',
    0,
    now()
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-07.se',
    'file_hash', v_tag || '-07-imported-history',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '8',
      'date', make_date(v_year, 7, 15)::text,
      'description', 'KAN6 imported history does not block',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year, 7, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year, 7, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year, 7, 15)::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'imported_history does not block');

  -- 8. 265x participates in synchronization/state guard.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 8, 15))::date,
    (date_trunc('month', make_date(v_year, 8, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'closed',
    'sololedger',
    0
  );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-08.se',
    'file_hash', v_tag || '-08-265x',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '9',
      'date', make_date(v_year, 8, 15)::text,
      'description', 'KAN6 265x guard',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year, 8, 15)::text),
        jsonb_build_object('account_number', '2650', 'amount', -100, 'date', make_date(v_year, 8, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '265x closed SoloLedger period blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, '265x block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, '265x block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '265x block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '265x block does not consume ver_nr');

  -- 9. Opening balance with VAT account uses fiscal_year-01-01 as guard date.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES (
    v_user_id,
    make_date(v_year + 1, 1, 1),
    make_date(v_year + 1, 1, 31),
    'month',
    'open',
    'sololedger'
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-09.se',
    'file_hash', v_tag || '-09-ib-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 1)::text,
    'opening_balances', jsonb_build_array(
      jsonb_build_object('account_number', '1930', 'amount', 100),
      jsonb_build_object('account_number', '2611', 'amount', -100)
    ),
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '10',
      'date', make_date(v_year + 1, 2, 15)::text,
      'description', 'KAN6 regular verification after VAT IB',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year + 1, 2, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 1, 2, 15)::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;

  SELECT count(*) INTO v_row_count
  FROM public.journal_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.import_batch_id = v_batch_id
    AND t.source = 'sie_opening_balance'
    AND e.account_number = '2611'
    AND e.date = make_date(v_year + 1, 1, 1);
  PERFORM pg_temp.assert_eq(v_row_count, 1, 'VAT opening balance row uses fiscal_year-01-01');

  -- 10. Opening balance without VAT still works after IB lock move.
  v_payload := jsonb_build_object(
    'filename', v_tag || '-10.se',
    'file_hash', v_tag || '-10-ib-non-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 2)::text,
    'opening_balances', jsonb_build_array(
      jsonb_build_object('account_number', '1930', 'amount', 100),
      jsonb_build_object('account_number', '2010', 'amount', -100)
    ),
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '11',
      'date', make_date(v_year + 2, 2, 15)::text,
      'description', 'KAN6 regular verification after non-VAT IB',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year + 2, 2, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 2, 2, 15)::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'opening_balance_imported')::boolean, 'non-VAT opening balance still imports');

  -- 11. Ambiguous VAT state: two overlapping open SoloLedger periods block.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES
    (
      v_user_id,
      make_date(v_year + 3, 1, 1),
      make_date(v_year + 3, 1, 31),
      'month',
      'open',
      'sololedger'
    ),
    (
      v_user_id,
      make_date(v_year + 3, 1, 1),
      make_date(v_year + 3, 3, 31),
      'quarter',
      'open',
      'sololedger'
    );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-11.se',
    'file_hash', v_tag || '-11-ambiguous-open',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 3)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '12',
      'date', make_date(v_year + 3, 1, 15)::text,
      'description', 'KAN6 ambiguous open periods',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year + 3, 1, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year + 3, 1, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 3, 1, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'ambiguous open SoloLedger VAT periods block');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'ambiguous block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'ambiguous block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'ambiguous block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'ambiguous block does not consume ver_nr');

  -- 12. Year lock regression: existing behavior blocks by verification year.
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_year + 4);

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-12.se',
    'file_hash', v_tag || '-12-year-lock',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 4)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '13',
      'date', make_date(v_year + 4, 1, 15)::text,
      'description', 'KAN6 year lock',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year + 4, 1, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 4, 1, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'year lock still blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'year lock import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'year lock transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'year lock journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'year lock does not consume ver_nr');

  -- 13. Duplicate import/file hash regression.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES (
    v_user_id,
    make_date(v_year + 5, 1, 1),
    make_date(v_year + 5, 1, 31),
    'month',
    'open',
    'sololedger'
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-13.se',
    'file_hash', v_tag || '-13-duplicate',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 5)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '14',
      'date', make_date(v_year + 5, 1, 15)::text,
      'description', 'KAN6 duplicate first pass',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year + 5, 1, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year + 5, 1, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 5, 1, 15)::text)
      )
    ))
  );

  PERFORM public.import_sie_batch(v_payload);

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'duplicate file hash still blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'duplicate block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'duplicate block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'duplicate block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'duplicate block does not consume ver_nr');

  -- 14. Malformed direct-RPC payload: early date error remains atomic.
  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-14.se',
    'file_hash', v_tag || '-14-malformed-row-date',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 6)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '15',
      'date', make_date(v_year + 6, 1, 15)::text,
      'description', 'KAN6 malformed VAT row date',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year + 6, 1, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', 'not-a-date'),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 6, 1, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'malformed direct VAT row date blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'malformed date import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'malformed date transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'malformed date journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'malformed date does not consume ver_nr');

  RAISE NOTICE 'KAN-6 import_sie_batch VAT guard candidate rollback tests completed for run id %', v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate RPC install and every fixture row
-- are discarded together.
ROLLBACK;
