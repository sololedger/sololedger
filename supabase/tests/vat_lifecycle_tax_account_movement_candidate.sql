\set ON_ERROR_STOP on

-- VAT lifecycle Slice 3 rollback regression for tax-account money movements.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/vat_lifecycle_tax_account_movement_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. Everything,
-- including the candidate migration and fixture writes, runs inside one outer
-- transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE tax_movement_test_context (
  test_user_id uuid PRIMARY KEY,
  other_user_id uuid NOT NULL,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tax_movement_test_context (
  test_user_id,
  other_user_id,
  run_tag,
  base_year
)
VALUES (
  :'test_user_id'::uuid,
  gen_random_uuid(),
  'tax-account movement rollback ' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260927151231_add_payment_account_roles.sql
\ir ../migrations/20260927174627_harden_payment_account_roles_acl.sql
\ir ../migrations/20260929183000_add_tax_account_movement.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'Tax-account movement assertion failed: %', p_message;
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
    RAISE EXCEPTION 'Tax-account movement assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, p_message || ' rejects');
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

  PERFORM pg_temp.assert_eq(auth.uid(), p_user_id, 'auth.uid() test context');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text,
  p_source text,
  p_closing_amount numeric
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
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    'quarter',
    p_status,
    p_source,
    p_closing_amount,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_movement_journal(
  p_transaction_id uuid,
  p_kind text,
  p_counter_account text,
  p_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_row_count integer;
  v_2012_debit numeric;
  v_2012_credit numeric;
  v_counter_debit numeric;
  v_counter_credit numeric;
BEGIN
  SELECT count(*)::integer
    INTO v_row_count
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id;

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO v_2012_debit, v_2012_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = '2012';

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO v_counter_debit, v_counter_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = p_counter_account;

  PERFORM pg_temp.assert_eq(v_row_count, 2, p_message || ' row count');

  IF p_kind IN ('business_to_tax_account', 'owner_private_to_tax_account') THEN
    PERFORM pg_temp.assert_eq(v_2012_debit, p_amount, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, 0::numeric, p_message || ' 2012 credit');
    PERFORM pg_temp.assert_eq(v_counter_debit, 0::numeric, p_message || ' counter debit');
    PERFORM pg_temp.assert_eq(v_counter_credit, p_amount, p_message || ' counter credit');
  ELSE
    PERFORM pg_temp.assert_eq(v_counter_debit, p_amount, p_message || ' counter debit');
    PERFORM pg_temp.assert_eq(v_counter_credit, 0::numeric, p_message || ' counter credit');
    PERFORM pg_temp.assert_eq(v_2012_debit, 0::numeric, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, p_amount, p_message || ' 2012 credit');
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_run_tag text;
  v_base_year integer;
  v_payable_period_id uuid;
  v_refund_period_id uuid;
  v_open_period_id uuid;
  v_imported_period_id uuid;
  v_zero_period_id uuid;
  v_locked_period_id uuid;
  v_other_period_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tx_id uuid;
  v_movement_id uuid;
  v_bad_tx_id uuid;
  v_bad_ver_nr integer;
  v_before_tx integer;
  v_after_tx integer;
  v_before_movements integer;
  v_after_movements integer;
  v_count integer;
BEGIN
  SELECT test_user_id, other_user_id, run_tag, base_year
    INTO v_user_id, v_other_user_id, v_run_tag, v_base_year
  FROM tax_movement_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  INSERT INTO auth.users (id)
  VALUES (v_other_user_id);

  PERFORM pg_temp.set_auth(v_user_id);

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'transactions'
        AND con.conname = 'transactions_source_check'
        AND pg_get_constraintdef(con.oid, true) LIKE '%tax_account_movement%'
    ),
    'source constraint accepts tax_account_movement'
  );

  PERFORM pg_temp.assert_eq(public.transaction_source_is_current('tax_account_movement'), true, 'tax_account_movement current');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_reserved_future('tax_account_movement'), false, 'tax_account_movement no longer reserved');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_system_managed('tax_account_movement'), true, 'tax_account_movement system managed');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_controlled_vat_lifecycle('tax_account_movement'), true, 'tax_account_movement lifecycle');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_correction('tax_account_movement'), false, 'tax_account_movement no generic correction');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_update('tax_account_movement'), false, 'tax_account_movement no generic update');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_ordinary_vat_guard_activity('tax_account_movement'), false, 'tax_account_movement not ordinary VAT guard activity');

  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'SELECT'), true, 'authenticated can select own movements');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'INSERT'), false, 'authenticated cannot insert movements directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'UPDATE'), false, 'authenticated cannot update movements directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'DELETE'), false, 'authenticated cannot delete movements directly');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tax_account_movements'
        AND cmd = 'SELECT'
        AND qual LIKE '%auth.uid%'
    ),
    'RLS owner-select policy exists'
  );

  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (v_run_tag || '-bank', v_user_id, 'Test bank', '1930', '3001'),
    (v_run_tag || '-private', v_user_id, 'Test privat betalning', '4000', '2018'),
    (v_run_tag || '-other-bank', v_other_user_id, 'Other test bank', '1930', '3001');

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES
    (v_user_id, 'business_payment_account', '1930'),
    (v_user_id, 'owner_private_payment', '2018'),
    (v_other_user_id, 'business_payment_account', '1930')
  ON CONFLICT (user_id, role)
  DO UPDATE SET account_number = excluded.account_number;

  v_payable_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'closed',
    'sololedger',
    4000
  );

  v_refund_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 6, 30),
    'declared',
    'sololedger',
    -1500
  );

  v_open_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 1, 1),
    make_date(v_base_year + 1, 3, 31),
    'open',
    'sololedger',
    NULL
  );

  v_imported_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 4, 1),
    make_date(v_base_year + 1, 6, 30),
    'closed',
    'imported_history',
    100
  );

  v_zero_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 7, 1),
    make_date(v_base_year + 1, 9, 30),
    'closed',
    'sololedger',
    0
  );

  v_locked_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 2, 1, 1),
    make_date(v_base_year + 2, 3, 31),
    'closed',
    'sololedger',
    100
  );

  v_other_period_id := pg_temp.create_vat_period(
    v_other_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'closed',
    'sololedger',
    900
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_other_period_id,
      gen_random_uuid()
    ),
    'wrong tenant period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 1, 4, 15),
      v_open_period_id,
      gen_random_uuid()
    ),
    'open period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 1, 7, 15),
      v_imported_period_id,
      gen_random_uuid()
    ),
    'imported period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 1, 10, 15),
      v_zero_period_id,
      gen_random_uuid()
    ),
    'zero closing period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      current_date + 1,
      v_payable_period_id,
      gen_random_uuid()
    ),
    'future movement date'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 2, 4, 15),
      v_locked_period_id,
      gen_random_uuid()
    ),
    'locked movement year'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 0::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'zero amount'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''tax_account_to_business'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'wrong payable movement direction'
  );

  DELETE FROM public.company_payment_account_roles
  WHERE user_id = v_user_id
    AND role = 'owner_private_payment';

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''owner_private_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'missing owner private role'
  );

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES (v_user_id, 'owner_private_payment', '2018');

  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 12),
    1000,
    v_payable_period_id,
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_movement_id := (v_result->>'movement_id')::uuid;

  PERFORM pg_temp.assert_eq(v_result->>'movement_kind', 'business_to_tax_account', 'business payable kind');
  PERFORM pg_temp.assert_eq(v_result->>'payment_account_role', 'business_payment_account', 'business role derived');
  PERFORM pg_temp.assert_eq(v_result->>'counter_account_number', '1930', 'business counter account derived');
  PERFORM pg_temp.assert_eq((v_result->>'cumulative_movement')::numeric, 1000::numeric, 'business payable cumulative');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 3000::numeric, 'business payable remaining');
  PERFORM pg_temp.assert_movement_journal(v_tx_id, 'business_to_tax_account', '1930', 1000, 'business payable journal');

  v_result := public.record_tax_account_movement_atomic(
    'owner_private_to_tax_account',
    make_date(v_base_year, 4, 13),
    500,
    v_payable_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'counter_account_number', '2018', 'owner private counter account derived');
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'owner_private_to_tax_account', '2018', 500, 'owner private payable journal');

  v_result := public.record_tax_account_movement_atomic(
    'tax_account_to_business',
    make_date(v_base_year, 7, 12),
    500,
    v_refund_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'tax_account_to_business', '1930', 500, 'refund to business journal');

  v_result := public.record_tax_account_movement_atomic(
    'tax_account_to_owner_private',
    make_date(v_base_year, 7, 13),
    1000,
    v_refund_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'counter_account_number', '2013', 'private withdrawal fixed account');
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'tax_account_to_owner_private', '2013', 1000, 'refund private withdrawal journal');
  PERFORM pg_temp.assert_eq(v_result->>'movement_state', 'fully_moved', 'refund fully moved');

  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 14),
    700,
    NULL,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'vat_period_id', NULL::text, 'nullable VAT period supported');
  PERFORM pg_temp.assert_eq(v_result->>'cumulative_movement', NULL::text, 'unlinked movement has no VAT cumulative');
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'business_to_tax_account', '1930', 700, 'unlinked business movement journal');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 2501::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'over movement cap'
  );

  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 16),
    2500,
    v_payable_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'movement_state', 'fully_moved', 'payable exact cap completion');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 0::numeric, 'payable exact cap remaining');

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_movements
  FROM public.tax_account_movements
  WHERE user_id = v_user_id;

  UPDATE public.company_payment_account_roles
  SET account_number = '2018'
  WHERE user_id = v_user_id
    AND role = 'business_payment_account';

  v_replay := public.record_tax_account_movement_atomic(
    (SELECT movement_kind FROM public.tax_account_movements WHERE id = v_movement_id),
    make_date(v_base_year, 4, 12),
    1000,
    (SELECT vat_period_id FROM public.tax_account_movements WHERE id = v_movement_id),
    (SELECT idempotency_key FROM public.tax_account_movements WHERE id = v_movement_id)
  );

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_movements
  FROM public.tax_account_movements
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_replay->>'idempotent_replay', 'true', 'idempotent replay flag');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, 'idempotent replay no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_movements, v_before_movements, 'idempotent replay no duplicate movement');
  PERFORM pg_temp.assert_eq(v_replay->>'counter_account_number', '1930', 'idempotent replay returns original counter account after role config change');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, NULL::uuid, %L::uuid)',
      make_date(v_base_year, 4, 18),
      gen_random_uuid()
    ),
    'stored invalid business payment role config'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 999::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 12),
      v_payable_period_id,
      (SELECT idempotency_key FROM public.tax_account_movements WHERE id = v_movement_id)
    ),
    'idempotency conflict'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.update_transaction_safe(%L::uuid, jsonb_build_object(''file_url'', ''slice3.txt''))',
      v_tx_id
    ),
    'generic update forbidden'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.create_correction_transaction_atomic(%L::uuid)',
      v_tx_id
    ),
    'generic correction forbidden'
  );

  SELECT public.get_next_ver_nr(v_user_id) INTO v_bad_ver_nr;
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
    v_user_id,
    make_date(v_base_year, 4, 17),
    'bad movement metadata fixture',
    123,
    NULL,
    NULL,
    true,
    'tax_account_movement'
  )
  RETURNING id INTO v_bad_tx_id;

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
    (v_bad_tx_id, v_bad_ver_nr, '2012', 123, 0, 'bad movement metadata fixture', make_date(v_base_year, 4, 17), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '1930', 0, 123, 'bad movement metadata fixture', make_date(v_base_year, 4, 17), v_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_movements (
         user_id,
         vat_period_id,
         transaction_id,
         movement_kind,
         movement_date,
         amount,
         payment_account_role,
         counter_account_number,
         idempotency_key
       ) values (
         %L::uuid,
         %L::uuid,
         %L::uuid,
         ''tax_account_to_business'',
         %L::date,
         123::numeric,
         ''business_payment_account'',
         ''1930'',
         %L::uuid
       )',
      v_user_id,
      v_payable_period_id,
      v_bad_tx_id,
      make_date(v_base_year, 4, 17),
      gen_random_uuid()
    ),
    'movement direction metadata mismatch validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'update public.tax_account_movements set amount = amount + 1 where id = %L::uuid',
      v_movement_id
    ),
    'movement immutability update'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'delete from public.tax_account_movements where id = %L::uuid',
      v_movement_id
    ),
    'movement immutability delete'
  );

  PERFORM pg_temp.set_auth(v_other_user_id);
  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 12),
    100,
    v_other_period_id,
    gen_random_uuid()
  );

  SELECT count(*) INTO v_count
  FROM public.tax_account_movements
  WHERE user_id = v_other_user_id;
  PERFORM pg_temp.assert_eq(v_count, 1, 'other tenant movement count');

  PERFORM pg_temp.set_auth(v_user_id);
  SELECT count(*) INTO v_count
  FROM public.tax_account_movements
  WHERE user_id = v_other_user_id;
  PERFORM pg_temp.assert_eq(v_count, 1, 'tenant data remains physically separate');

  RAISE NOTICE 'VAT lifecycle tax-account movement rollback assertions passed for run tag %.', v_run_tag;
END;
$$;

ROLLBACK;

\echo 'VAT lifecycle tax-account movement rollback test completed with explicit ROLLBACK.'
