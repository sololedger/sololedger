\set ON_ERROR_STOP on

-- Audit #1 remediation Batch 1 RED rollback regressions.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/audit1_remediation_batch1_red_candidate.sql
--
-- This file proves remediation behavior for verified Audit #1 findings.
-- Batch 2-scoped findings must pass; deferred out-of-scope findings are still
-- reported as known RED without failing this rollback test.
-- The relevant active migrations are replayed inside one outer transaction for
-- the production-derived local regression DB. Everything ends with ROLLBACK.

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
\ir ../migrations/20260927151231_add_payment_account_roles.sql
\ir ../migrations/20260927174627_harden_payment_account_roles_acl.sql
\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260929143000_add_vat_settlement_foundation.sql
\ir ../migrations/20260929183000_add_tax_account_movement.sql
\ir ../migrations/20260930120000_audit1_p0_vat_lifecycle_semantics.sql

CREATE TEMP TABLE audit1_red_failures (
  finding text NOT NULL,
  scenario text NOT NULL,
  current_result text NOT NULL,
  expected_future_result text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE audit1_deferred_red_failures (
  finding text NOT NULL,
  scenario text NOT NULL,
  current_result text NOT NULL,
  expected_future_result text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE audit1_red_context (
  test_user_id uuid PRIMARY KEY,
  other_user_id uuid NOT NULL,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO audit1_red_context (
  test_user_id,
  other_user_id,
  run_tag,
  base_year
) VALUES (
  :'test_user_id'::uuid,
  gen_random_uuid(),
  'audit1-red-' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

CREATE OR REPLACE FUNCTION pg_temp.record_failure(
  p_finding text,
  p_scenario text,
  p_current_result text,
  p_expected_future_result text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO audit1_red_failures (
    finding,
    scenario,
    current_result,
    expected_future_result
  ) VALUES (
    p_finding,
    p_scenario,
    p_current_result,
    p_expected_future_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.record_deferred_failure(
  p_finding text,
  p_scenario text,
  p_current_result text,
  p_expected_future_result text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO audit1_deferred_red_failures (
    finding,
    scenario,
    current_result,
    expected_future_result
  ) VALUES (
    p_finding,
    p_scenario,
    p_current_result,
    p_expected_future_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(
  p_user_id uuid
)
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
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_rejects(
  p_finding text,
  p_scenario text,
  p_sql text,
  p_expected_future_result text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.record_failure(
      p_finding,
      p_scenario,
      'accepted',
      p_expected_future_result
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS %: % rejected with %', p_finding, p_scenario, SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_accepts(
  p_finding text,
  p_scenario text,
  p_sql text,
  p_expected_future_result text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE NOTICE 'PASS %: % accepted', p_finding, p_scenario;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_failure(
      p_finding,
      p_scenario,
      'rejected: ' || SQLERRM,
      p_expected_future_result
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_deferred_accepts(
  p_finding text,
  p_scenario text,
  p_sql text,
  p_expected_future_result text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE NOTICE 'PASS deferred %: % accepted', p_finding, p_scenario;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record_deferred_failure(
      p_finding,
      p_scenario,
      'rejected: ' || SQLERRM,
      p_expected_future_result
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_tx(
  p_user_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_source text,
  p_booked boolean DEFAULT true
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
    p_date,
    p_description,
    p_amount,
    NULL,
    NULL,
    p_booked,
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
  p_source text DEFAULT 'sololedger',
  p_closing_transaction_id uuid DEFAULT NULL
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
    'quarter',
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
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
    (p_run_tag || '-bank', p_user_id, 'Audit test bank', '1930', '3001'),
    (p_run_tag || '-private', p_user_id, 'Audit test private', '4000', '2017'),
    (p_run_tag || '-tax-account', p_user_id, 'Audit test tax account', '2012', '2012'),
    (p_run_tag || '-owner-withdrawal', p_user_id, 'Audit test owner withdrawal', '2013', '2013'),
    (p_run_tag || '-vat-output', p_user_id, 'Audit test output VAT', '2614', '2614'),
    (p_run_tag || '-vat-input', p_user_id, 'Audit test input VAT', '2645', '2645'),
    (p_run_tag || '-vat-settlement', p_user_id, 'Audit test VAT settlement', '2650', '2650'),
    (p_run_tag || '-software', p_user_id, 'Audit test software', '4535', '4535')
  ON CONFLICT (id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vat_v2_payload(
  p_date date,
  p_description text,
  p_payment_account_number text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
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
    'idempotency_key', p_idempotency_key
  ));
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_q1_close_tx uuid;
  v_q1_period uuid;
  v_q2_close_tx uuid;
  v_q2_declared_period uuid;
  v_q2_open_period uuid;
  v_q3_open_period uuid;
  v_result jsonb;
  v_replay_key uuid;
  v_before_count integer;
  v_after_count integer;
  v_movement_id uuid;
  v_event_id uuid;
BEGIN
  SELECT test_user_id, other_user_id, run_tag, base_year
    INTO v_user_id, v_other_user_id, v_run_tag, v_base_year
  FROM audit1_red_context;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'test_user_id must already exist in auth.users: %', v_user_id;
  END IF;

  INSERT INTO auth.users (id)
  VALUES (v_other_user_id);

  PERFORM pg_temp.set_auth(v_user_id);
  PERFORM pg_temp.insert_basic_accounts(v_user_id, v_run_tag);

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES
    (v_user_id, 'business_payment_account', '1930'),
    (v_user_id, 'owner_private_payment', '2017')
  ON CONFLICT (user_id, role)
  DO UPDATE SET account_number = excluded.account_number;

  v_q1_close_tx := pg_temp.create_tx(
    v_user_id,
    make_date(v_base_year, 3, 31),
    1000,
    'Audit Q1 VAT close',
    'vat_closing'
  );

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (v_q1_close_tx, 1, '2611', 1000, 0, 'Audit Q1 VAT close', make_date(v_base_year, 3, 31), v_user_id),
    (v_q1_close_tx, 1, '2650', 0, 1000, 'Audit Q1 VAT close', make_date(v_base_year, 3, 31), v_user_id);

  v_q1_period := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    1000,
    'sololedger',
    v_q1_close_tx
  );

  v_q2_close_tx := pg_temp.create_tx(
    v_user_id,
    make_date(v_base_year, 6, 30),
    500,
    'Audit Q2 VAT close',
    'vat_closing'
  );

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (v_q2_close_tx, 2, '2611', 500, 0, 'Audit Q2 VAT close', make_date(v_base_year, 6, 30), v_user_id),
    (v_q2_close_tx, 2, '2650', 0, 500, 'Audit Q2 VAT close', make_date(v_base_year, 6, 30), v_user_id);

  v_q2_declared_period := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 6, 30),
    'declared',
    500,
    'sololedger',
    v_q2_close_tx
  );

  v_q2_open_period := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 4, 1),
    make_date(v_base_year + 1, 6, 30),
    'open',
    NULL
  );

  v_q3_open_period := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 7, 1),
    make_date(v_base_year + 1, 9, 30),
    'open',
    NULL
  );

  PERFORM pg_temp.expect_rejects(
    'F3',
    'VAT V2 RPC rejects payment account 2614',
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(make_date(v_base_year + 1, 7, 10), 'Audit bad 2614', '2614')::text
    ),
    'semantic VAT/system account is rejected at DB boundary'
  );

  PERFORM pg_temp.expect_rejects(
    'F3',
    'VAT V2 RPC rejects payment account 2645',
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(make_date(v_base_year + 1, 7, 11), 'Audit bad 2645', '2645')::text
    ),
    'semantic VAT/system account is rejected at DB boundary'
  );

  PERFORM pg_temp.expect_rejects(
    'F3',
    'VAT V2 RPC rejects payment account 2650',
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(make_date(v_base_year + 1, 7, 12), 'Audit bad 2650', '2650')::text
    ),
    'semantic VAT/system account is rejected at DB boundary'
  );

  PERFORM pg_temp.expect_rejects(
    'F3',
    'VAT V2 RPC rejects payment account 2012',
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(make_date(v_base_year + 1, 7, 13), 'Audit bad 2012', '2012')::text
    ),
    'tax-account clearing account is rejected at DB boundary'
  );

  PERFORM pg_temp.expect_accepts(
    'F3',
    'VAT V2 RPC accepts ordinary payment account 1930',
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_payload(make_date(v_base_year + 1, 7, 14), 'Audit good 1930', '1930')::text
    ),
    'ordinary configured payment account remains usable'
  );

  PERFORM pg_temp.expect_rejects(
    'F4',
    'payment role config rejects owner-private role configured to 2650',
    format(
      'update public.company_payment_account_roles set account_number = %L where user_id = %L::uuid and role = ''owner_private_payment''',
      '2650',
      v_user_id
    ),
    'semantic VAT settlement account cannot be configured as payment account'
  );

  PERFORM pg_temp.expect_rejects(
    'F4',
    'payment role config rejects owner-private role configured to 2614',
    format(
      'update public.company_payment_account_roles set account_number = %L where user_id = %L::uuid and role = ''owner_private_payment''',
      '2614',
      v_user_id
    ),
    'semantic output VAT account cannot be configured as payment account'
  );

  PERFORM pg_temp.expect_rejects(
    'F4',
    'payment role config rejects owner-private role configured to 2645',
    format(
      'update public.company_payment_account_roles set account_number = %L where user_id = %L::uuid and role = ''owner_private_payment''',
      '2645',
      v_user_id
    ),
    'semantic input VAT account cannot be configured as payment account'
  );

  PERFORM pg_temp.expect_rejects(
    'F4',
    'payment role config rejects owner-private role configured to 2012',
    format(
      'update public.company_payment_account_roles set account_number = %L where user_id = %L::uuid and role = ''owner_private_payment''',
      '2012',
      v_user_id
    ),
    'tax-account clearing account cannot be configured as payment account'
  );

  UPDATE public.company_payment_account_roles
  SET account_number = '2017'
  WHERE user_id = v_user_id
    AND role = 'owner_private_payment';

  PERFORM pg_temp.expect_accepts(
    'F4',
    'tax-account movement accepts ordinary owner-private role account 2017',
    format(
      'select public.record_tax_account_movement_atomic(''owner_private_to_tax_account'', %L::date, 100::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 19),
      v_q1_period,
      gen_random_uuid()
    ),
    'known legitimate owner-private account remains usable'
  );

  PERFORM pg_temp.expect_rejects(
    'F6-A',
    'settlement date inside selected declared VAT period',
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 100::numeric, %L::uuid)',
      v_q1_period,
      make_date(v_base_year, 2, 15),
      gen_random_uuid()
    ),
    'settlement cannot silently add ledger activity inside its already declared period'
  );

  PERFORM pg_temp.expect_rejects(
    'F6-B',
    'settlement date inside another declared VAT period',
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 100::numeric, %L::uuid)',
      v_q1_period,
      make_date(v_base_year, 5, 15),
      gen_random_uuid()
    ),
    'settlement cannot silently add ledger activity inside another declared period'
  );

  PERFORM pg_temp.expect_accepts(
    'F6-C',
    'settlement date inside later open VAT period',
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 100::numeric, %L::uuid)',
      v_q1_period,
      make_date(v_base_year + 1, 4, 20),
      gen_random_uuid()
    ),
    'legitimate later open-period settlement remains allowed'
  );

  PERFORM pg_temp.expect_accepts(
    'F2',
    'later open VAT period closes despite controlled prior-period settlement rows',
    format(
      'select public.close_vat_period_atomic(%L::uuid)',
      v_q2_open_period
    ),
    'controlled vat_settlement 2650 rows do not deadlock later close'
  );

  v_replay_key := gen_random_uuid();
  SELECT count(*) INTO v_before_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND source = 'vat_v2';

  PERFORM public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_payload(
      make_date(v_base_year + 1, 8, 15),
      'Audit idempotent VAT V2',
      '1930',
      v_replay_key
    )
  );
  PERFORM public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_payload(
      make_date(v_base_year + 1, 8, 15),
      'Audit idempotent VAT V2',
      '1930',
      v_replay_key
    )
  );

  SELECT count(*) INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND source = 'vat_v2';

  IF v_after_count <> v_before_count + 1 THEN
    PERFORM pg_temp.record_deferred_failure(
      'F5',
      'VAT V2 booking same explicit idempotency key after ambiguous response',
      format('created %s VAT V2 transactions', v_after_count - v_before_count),
      'same key and same payload returns the existing committed VAT V2 booking'
    );
  ELSE
    RAISE NOTICE 'PASS F5: VAT V2 explicit idempotency replay returned existing booking';
  END IF;

  v_replay_key := gen_random_uuid();
  v_result := public.record_vat_settlement_atomic(
    v_q1_period,
    make_date(v_base_year + 1, 7, 25),
    100,
    v_replay_key
  );
  v_event_id := (v_result->>'event_id')::uuid;

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 1);

  PERFORM pg_temp.expect_deferred_accepts(
    'F10-B-settlement',
    'settlement exact replay after year lock',
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 100::numeric, %L::uuid)',
      v_q1_period,
      make_date(v_base_year + 1, 7, 25),
      v_replay_key
    ),
    'existing committed settlement replay returns original result before closed-year rejection'
  );

  PERFORM pg_temp.expect_rejects(
    'F10-B-settlement-control',
    'new settlement after year lock',
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 100::numeric, %L::uuid)',
      v_q1_period,
      make_date(v_base_year + 1, 7, 26),
      gen_random_uuid()
    ),
    'new settlement in locked accounting year still fails'
  );

  UPDATE public.company_payment_account_roles
  SET account_number = '1930'
  WHERE user_id = v_user_id
    AND role = 'business_payment_account';

  v_replay_key := gen_random_uuid();
  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 27),
    100,
    v_q1_period,
    v_replay_key
  );
  v_movement_id := (v_result->>'movement_id')::uuid;

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year);

  PERFORM pg_temp.expect_deferred_accepts(
    'F10-B-movement',
    'tax-account movement exact replay after year lock',
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 100::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 27),
      v_q1_period,
      v_replay_key
    ),
    'existing committed movement replay returns original result before closed-year rejection'
  );

  PERFORM pg_temp.expect_rejects(
    'F10-B-movement-control',
    'new tax-account movement after year lock',
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 100::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 28),
      v_q1_period,
      gen_random_uuid()
    ),
    'new movement in locked accounting year still fails'
  );

  RAISE NOTICE 'Audit RED fixture event %, movement %', v_event_id, v_movement_id;
END;
$$;

DO $$
DECLARE
  v_failure_count integer;
  v_deferred_failure_count integer;
  v_failure record;
BEGIN
  SELECT count(*) INTO v_failure_count FROM audit1_red_failures;
  SELECT count(*) INTO v_deferred_failure_count FROM audit1_deferred_red_failures;

  FOR v_failure IN
    SELECT *
    FROM audit1_red_failures
    ORDER BY finding, scenario
  LOOP
    RAISE NOTICE
      'RED % / %: current %, expected %',
      v_failure.finding,
      v_failure.scenario,
      v_failure.current_result,
      v_failure.expected_future_result;
  END LOOP;

  FOR v_failure IN
    SELECT *
    FROM audit1_deferred_red_failures
    ORDER BY finding, scenario
  LOOP
    RAISE NOTICE
      'KNOWN DEFERRED RED % / %: current %, expected %',
      v_failure.finding,
      v_failure.scenario,
      v_failure.current_result,
      v_failure.expected_future_result;
  END LOOP;

  IF v_failure_count > 0 THEN
    RAISE EXCEPTION
      'Audit #1 Batch 1 RED regressions reproduced % current failures.',
      v_failure_count;
  END IF;

  RAISE NOTICE
    'Audit #1 Batch 2 scoped regression checks passed; % deferred RED checks remain documented.',
    v_deferred_failure_count;
END;
$$;

ROLLBACK;

\echo 'Audit #1 remediation Batch 1 RED rollback test completed with explicit ROLLBACK.'
