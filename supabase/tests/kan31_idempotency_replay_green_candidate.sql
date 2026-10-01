\set ON_ERROR_STOP on

-- KAN-31 GREEN rollback regression for durable idempotency and replay semantics.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

\ir ../migrations/20260925050113_20260925_add_vat_account_classification.sql
\ir ../migrations/20260925070346_20260925_delegate_vat_concurrency_account.sql
\ir ../migrations/20260925124023_delegate_vat_close_account_classification.sql
\ir ../migrations/20260926132107_add_2645_vat_account_classification.sql
\ir ../migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql
\ir ../migrations/20260927070224_add_vat_profile_runtime_fields.sql
\ir ../migrations/20260927151231_add_payment_account_roles.sql
\ir ../migrations/20260927174627_harden_payment_account_roles_acl.sql
\ir ../migrations/20260928193000_add_vat_declaration_submission_date.sql
\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260929143000_add_vat_settlement_foundation.sql
\ir ../migrations/20260929183000_add_tax_account_movement.sql
\ir ../migrations/20260930120000_audit1_p0_vat_lifecycle_semantics.sql
\ir ../migrations/20260930163000_kan30_delete_user_data_vat_lifecycle.sql
\ir ../migrations/20260930190000_kan31_idempotency_replay.sql

CREATE TEMP TABLE kan31_green_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan31_green_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'kan31-green-' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-31 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-31 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_sqlstate text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rejected boolean := false;
  v_sqlstate text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_rejected := true;
    v_sqlstate := SQLSTATE;
  END;

  PERFORM pg_temp.assert_true(v_rejected, p_message || ' rejects');
  PERFORM pg_temp.assert_eq(v_sqlstate, p_sqlstate, p_message || ' SQLSTATE');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'auth.uid() test context was not established';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_tx(
  p_user_id uuid,
  p_tx_date date,
  p_amount numeric,
  p_description text,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
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
    abs(p_amount),
    NULL,
    NULL,
    true,
    p_source
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text,
  p_closing_amount numeric,
  p_closing_transaction_id uuid
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
    skv_submitted_on
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    'quarter',
    p_status,
    'sololedger',
    p_closing_amount,
    p_closing_transaction_id,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'declared' THEN p_period_end ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_basic_accounts(
  p_user_id uuid,
  p_run_tag text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (p_run_tag || '-bank', p_user_id, 'KAN-31 bank', '1930', '3001'),
    (p_run_tag || '-private', p_user_id, 'KAN-31 private', '4000', '2017'),
    (p_run_tag || '-tax-account', p_user_id, 'KAN-31 tax account', '2012', '2012'),
    (p_run_tag || '-owner-withdrawal', p_user_id, 'KAN-31 owner withdrawal', '2013', '2013'),
    (p_run_tag || '-vat-output', p_user_id, 'KAN-31 output VAT', '2614', '2614'),
    (p_run_tag || '-vat-input', p_user_id, 'KAN-31 input VAT', '2645', '2645'),
    (p_run_tag || '-vat-settlement', p_user_id, 'KAN-31 VAT settlement', '2650', '2650'),
    (p_run_tag || '-software', p_user_id, 'KAN-31 software', '4535', '4535')
  ON CONFLICT (id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vat_v2_payload(
  p_date date,
  p_description text,
  p_payment_account_number text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'date', p_date::text,
    'description', p_description,
    'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
    'calculation_rate', 25,
    'deduction_entitlement', 'full',
    'taxable_base', 228,
    'output_vat_amount', 57,
    'deductible_input_vat_amount', 57,
    'acquisition_base_field', '21',
    'output_vat_report_field', '30',
    'deductible_input_vat_report_field', '48',
    'payment_account_number', p_payment_account_number,
    'rule_version', 'vat-v2-kan18-first-slice',
    'facts_version', 'vat-facts-v1',
    'idempotency_key', p_idempotency_key,
    'file_url', NULL
  );
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;
  v_close_tx uuid;
  v_period_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_key uuid;
  v_new_key uuid;
  v_before_count integer;
  v_after_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan31_green_context;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'test_user_id must already exist in auth.users: %', v_user_id;
  END IF;

  PERFORM pg_temp.set_auth(v_user_id);
  PERFORM pg_temp.insert_basic_accounts(v_user_id, v_run_tag);

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES
    (v_user_id, 'business_payment_account', '1930'),
    (v_user_id, 'owner_private_payment', '2017')
  ON CONFLICT (user_id, role)
  DO UPDATE SET account_number = excluded.account_number;

  SELECT count(*)::integer
    INTO v_before_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND source = 'vat_v2';

  v_key := gen_random_uuid();
  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_payload(
      make_date(v_base_year + 2, 8, 15),
      'KAN-31 duplicate VAT V2',
      '1930',
      v_key
    )
  );
  v_replay := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_payload(
      make_date(v_base_year + 2, 8, 15),
      'KAN-31 duplicate VAT V2',
      '1930',
      v_key
    )
  );

  SELECT count(*)::integer
    INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND source = 'vat_v2';

  PERFORM pg_temp.assert_eq(v_after_count, v_before_count + 1, 'VAT V2 exact retry creates exactly one transaction');
  PERFORM pg_temp.assert_eq(v_replay->>'transaction_id', v_result->>'transaction_id', 'VAT V2 exact retry returns original transaction');
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'VAT V2 exact retry marks replay');
  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.vat_v2_booking_idempotency
      WHERE user_id = v_user_id
        AND idempotency_key = v_key
    ),
    1,
    'VAT V2 durable idempotency row is unique'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(
        make_date(v_base_year + 2, 8, 15),
        'KAN-31 duplicate VAT V2 changed',
        '1930',
        v_key
      )::text
    ),
    '23505',
    'VAT V2 same key with different payload'
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  v_replay := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_payload(
      make_date(v_base_year + 2, 8, 15),
      'KAN-31 duplicate VAT V2',
      '1930',
      v_key
    )
  );
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'VAT V2 exact replay works after later year lock');

  v_new_key := gen_random_uuid();
  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(
        make_date(v_base_year + 2, 8, 15),
        'KAN-31 duplicate VAT V2',
        '1930',
        v_new_key
      )::text
    ),
    '23514',
    'VAT V2 new key after year lock'
  );

  v_close_tx := pg_temp.create_tx(
    v_user_id,
    make_date(v_base_year, 3, 31),
    1000,
    'KAN-31 VAT close',
    'vat_closing'
  );
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    1000,
    v_close_tx
  );

  v_key := gen_random_uuid();
  v_result := public.record_vat_settlement_atomic(
    v_period_id,
    make_date(v_base_year + 1, 7, 25),
    100,
    v_key
  );
  v_replay := public.record_vat_settlement_atomic(
    v_period_id,
    make_date(v_base_year + 1, 7, 25),
    100,
    v_key
  );
  PERFORM pg_temp.assert_eq(v_replay->>'event_id', v_result->>'event_id', 'settlement exact retry returns original event');
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'settlement exact retry marks replay');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 101::numeric, %L::uuid)',
      v_period_id,
      make_date(v_base_year + 1, 7, 25),
      v_key
    ),
    '23505',
    'settlement same key with different amount'
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 1);

  v_replay := public.record_vat_settlement_atomic(
    v_period_id,
    make_date(v_base_year + 1, 7, 25),
    100,
    v_key
  );
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'settlement exact replay works after later year lock');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 100::numeric, %L::uuid)',
      v_period_id,
      make_date(v_base_year + 1, 7, 25),
      gen_random_uuid()
    ),
    '23514',
    'settlement new key after year lock'
  );

  v_key := gen_random_uuid();
  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 27),
    100,
    v_period_id,
    v_key
  );
  v_replay := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 27),
    100,
    v_period_id,
    v_key
  );
  PERFORM pg_temp.assert_eq(v_replay->>'movement_id', v_result->>'movement_id', 'movement exact retry returns original movement');
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'movement exact retry marks replay');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(%L, %L::date, 101::numeric, %L::uuid, %L::uuid)',
      'business_to_tax_account',
      make_date(v_base_year, 4, 27),
      v_period_id,
      v_key
    ),
    '23505',
    'movement same key with different amount'
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year);

  v_replay := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 27),
    100,
    v_period_id,
    v_key
  );
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'movement exact replay works after later year lock');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(%L, %L::date, 100::numeric, %L::uuid, %L::uuid)',
      'business_to_tax_account',
      make_date(v_base_year, 4, 27),
      v_period_id,
      gen_random_uuid()
    ),
    '23514',
    'movement new key after year lock'
  );
END;
$$;

ROLLBACK;
