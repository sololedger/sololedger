\set ON_ERROR_STOP on

-- KAN-27 rollback regression for VAT settlement / tax-account foundation.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/kan27_vat_settlement_foundation_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. A second
-- synthetic tenant is created inside the rollback transaction only for
-- cross-user isolation proof. Everything, including the candidate migration
-- and fixture writes, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan27_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan27_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-27 rollback ' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260929143000_add_vat_settlement_foundation.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-27 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-27 assertion failed: % (actual %, expected %)',
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

CREATE OR REPLACE FUNCTION pg_temp.create_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_amount numeric,
  p_description text,
  p_source text,
  p_booked boolean
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
    p_booked,
    p_source
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_closing_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_amount numeric,
  p_description text,
  p_booked boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN pg_temp.create_transaction(
    p_user_id,
    p_tx_date,
    p_amount,
    p_description,
    'vat_closing',
    p_booked
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text,
  p_source text,
  p_closing_amount numeric,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_create_default_closing_transaction boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
  v_closing_tx_id uuid := NULL;
BEGIN
  IF p_closing_transaction_id IS NOT NULL THEN
    v_closing_tx_id := p_closing_transaction_id;
  ELSIF p_closing_amount IS NOT NULL AND p_create_default_closing_transaction THEN
    v_closing_tx_id := pg_temp.create_closing_transaction(
      p_user_id,
      p_period_end,
      p_closing_amount,
      'KAN-27 fixture closing'
    );
  END IF;

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
    v_closing_tx_id,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_settlement_journal(
  p_transaction_id uuid,
  p_kind text,
  p_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_2012_debit numeric;
  v_2012_credit numeric;
  v_2650_debit numeric;
  v_2650_credit numeric;
  v_row_count integer;
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
  INTO v_2650_debit, v_2650_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = '2650';

  PERFORM pg_temp.assert_eq(v_row_count, 2, p_message || ' row count');

  IF p_kind = 'vat_debit' THEN
    PERFORM pg_temp.assert_eq(v_2650_debit, p_amount, p_message || ' 2650 debit');
    PERFORM pg_temp.assert_eq(v_2650_credit, 0::numeric, p_message || ' 2650 credit');
    PERFORM pg_temp.assert_eq(v_2012_debit, 0::numeric, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, p_amount, p_message || ' 2012 credit');
  ELSE
    PERFORM pg_temp.assert_eq(v_2012_debit, p_amount, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, 0::numeric, p_message || ' 2012 credit');
    PERFORM pg_temp.assert_eq(v_2650_debit, 0::numeric, p_message || ' 2650 debit');
    PERFORM pg_temp.assert_eq(v_2650_credit, p_amount, p_message || ' 2650 credit');
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid := gen_random_uuid();
  v_run_tag text;
  v_base_year integer;
  v_payable_period_id uuid;
  v_refund_period_id uuid;
  v_legacy_period_id uuid;
  v_open_period_id uuid;
  v_imported_period_id uuid;
  v_zero_period_id uuid;
  v_other_period_id uuid;
  v_locked_period_id uuid;
  v_missing_closing_tx_period_id uuid;
  v_wrong_source_closing_tx_id uuid;
  v_wrong_source_closing_period_id uuid;
  v_other_user_closing_tx_id uuid;
  v_cross_user_closing_period_id uuid;
  v_unbooked_closing_tx_id uuid;
  v_unbooked_closing_period_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tx_id uuid;
  v_event_id uuid;
  v_bad_tx_id uuid;
  v_bad_ver_nr integer;
  v_before_tx integer;
  v_after_tx integer;
  v_before_events integer;
  v_after_events integer;
  v_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan27_test_context;

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
        AND pg_get_constraintdef(con.oid, true) LIKE '%vat_settlement%'
    ),
    'source constraint accepts vat_settlement'
  );

  PERFORM pg_temp.assert_eq(public.transaction_source_is_current('vat_settlement'), true, 'vat_settlement current');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_reserved_future('vat_settlement'), false, 'vat_settlement no longer reserved');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_system_managed('vat_settlement'), true, 'vat_settlement system managed');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_controlled_vat_lifecycle('vat_settlement'), true, 'vat_settlement lifecycle');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_correction('vat_settlement'), false, 'vat_settlement no generic correction');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_update('vat_settlement'), false, 'vat_settlement no generic update');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_ordinary_vat_guard_activity('vat_settlement'), false, 'vat_settlement not ordinary VAT guard activity');

  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'SELECT'), true, 'authenticated can select own events');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'INSERT'), false, 'authenticated cannot insert events directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'UPDATE'), false, 'authenticated cannot update events directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'DELETE'), false, 'authenticated cannot delete events directly');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tax_account_events'
        AND cmd = 'SELECT'
        AND qual LIKE '%auth.uid%'
    ),
    'RLS owner-select policy exists'
  );

  v_payable_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'declared',
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

  v_legacy_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 7, 1),
    make_date(v_base_year, 9, 30),
    'declared',
    'sololedger',
    700
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
    'declared',
    'imported_history',
    100
  );

  v_zero_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 7, 1),
    make_date(v_base_year + 1, 9, 30),
    'declared',
    'sololedger',
    0
  );

  v_other_period_id := pg_temp.create_vat_period(
    v_other_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    'sololedger',
    900
  );

  v_locked_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 2, 1, 1),
    make_date(v_base_year + 2, 3, 31),
    'declared',
    'sololedger',
    100
  );

  v_missing_closing_tx_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 1, 1),
    make_date(v_base_year + 3, 3, 31),
    'declared',
    'sololedger',
    111,
    NULL,
    false
  );

  v_wrong_source_closing_tx_id := pg_temp.create_transaction(
    v_user_id,
    make_date(v_base_year + 3, 6, 30),
    222,
    'KAN-27 wrong-source closing provenance',
    'manual',
    true
  );
  v_wrong_source_closing_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 4, 1),
    make_date(v_base_year + 3, 6, 30),
    'declared',
    'sololedger',
    222,
    v_wrong_source_closing_tx_id
  );

  v_other_user_closing_tx_id := pg_temp.create_closing_transaction(
    v_other_user_id,
    make_date(v_base_year + 3, 9, 30),
    333,
    'KAN-27 cross-user closing provenance'
  );
  v_cross_user_closing_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 7, 1),
    make_date(v_base_year + 3, 9, 30),
    'declared',
    'sololedger',
    333,
    v_other_user_closing_tx_id
  );

  v_unbooked_closing_tx_id := pg_temp.create_closing_transaction(
    v_user_id,
    make_date(v_base_year + 3, 12, 31),
    444,
    'KAN-27 unbooked closing provenance',
    false
  );
  v_unbooked_closing_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 10, 1),
    make_date(v_base_year + 3, 12, 31),
    'declared',
    'sololedger',
    444,
    v_unbooked_closing_tx_id
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_other_period_id,
      make_date(v_base_year, 4, 15),
      gen_random_uuid()
    ),
    'wrong tenant period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_open_period_id,
      make_date(v_base_year + 1, 4, 15),
      gen_random_uuid()
    ),
    'open period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_imported_period_id,
      make_date(v_base_year + 1, 7, 15),
      gen_random_uuid()
    ),
    'imported period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_zero_period_id,
      make_date(v_base_year + 1, 10, 15),
      gen_random_uuid()
    ),
    'zero closing period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_payable_period_id,
      current_date + 1,
      gen_random_uuid()
    ),
    'future settlement date'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_locked_period_id,
      make_date(v_base_year + 2, 4, 15),
      gen_random_uuid()
    ),
    'locked event year'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 0::numeric, %L::uuid)',
      v_payable_period_id,
      make_date(v_base_year, 4, 20),
      gen_random_uuid()
    ),
    'zero amount'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_missing_closing_tx_period_id,
      make_date(v_base_year + 3, 4, 15),
      gen_random_uuid()
    ),
    'declared nonzero period missing closing transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_wrong_source_closing_period_id,
      make_date(v_base_year + 3, 7, 15),
      gen_random_uuid()
    ),
    'declared period with non-vat-closing closing transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_cross_user_closing_period_id,
      make_date(v_base_year + 3, 10, 15),
      gen_random_uuid()
    ),
    'declared period with cross-user closing transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_unbooked_closing_period_id,
      make_date(v_base_year + 4, 1, 15),
      gen_random_uuid()
    ),
    'declared period with unbooked closing transaction'
  );

  v_result := public.record_vat_settlement_atomic(
    v_payable_period_id,
    make_date(v_base_year, 5, 12),
    1000,
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_event_id := (v_result->>'event_id')::uuid;

  PERFORM pg_temp.assert_eq(v_result->>'event_kind', 'vat_debit', 'payable event kind');
  PERFORM pg_temp.assert_eq((v_result->>'cumulative_settled')::numeric, 1000::numeric, 'payable cumulative partial');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 3000::numeric, 'payable remaining partial');
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'partially_settled', 'payable partial state');
  PERFORM pg_temp.assert_settlement_journal(v_tx_id, 'vat_debit', 1000, 'payable journal');

  v_result := public.record_vat_settlement_atomic(
    v_refund_period_id,
    make_date(v_base_year, 8, 12),
    1500,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'event_kind', 'vat_credit', 'refund event kind');
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'fully_settled', 'refund full state');
  PERFORM pg_temp.assert_settlement_journal((v_result->>'transaction_id')::uuid, 'vat_credit', 1500, 'refund journal');

  v_result := public.record_vat_settlement_atomic(
    v_legacy_period_id,
    make_date(v_base_year, 10, 12),
    700,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'fully_settled', 'legacy null skv accepted');

  v_result := public.record_vat_settlement_atomic(
    v_payable_period_id,
    make_date(v_base_year, 6, 12),
    2000,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq((v_result->>'cumulative_settled')::numeric, 3000::numeric, 'multiple settlement cumulative');
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'partially_settled', 'multiple settlement partial');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 1001::numeric, %L::uuid)',
      v_payable_period_id,
      make_date(v_base_year, 7, 12),
      gen_random_uuid()
    ),
    'over settlement'
  );

  v_result := public.record_vat_settlement_atomic(
    v_payable_period_id,
    make_date(v_base_year, 7, 13),
    1000,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'fully_settled', 'exact completion state');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 0::numeric, 'exact completion remaining');

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_events
  FROM public.tax_account_events
  WHERE user_id = v_user_id;

  v_replay := public.record_vat_settlement_atomic(
    (SELECT vat_period_id FROM public.tax_account_events WHERE id = v_event_id),
    make_date(v_base_year, 5, 12),
    1000,
    (SELECT idempotency_key FROM public.tax_account_events WHERE id = v_event_id)
  );

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_events
  FROM public.tax_account_events
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_replay->>'idempotent_replay', 'true', 'idempotent replay flag');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, 'idempotent replay no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_events, v_before_events, 'idempotent replay no duplicate event');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 999::numeric, %L::uuid)',
      v_payable_period_id,
      make_date(v_base_year, 5, 12),
      (SELECT idempotency_key FROM public.tax_account_events WHERE id = v_event_id)
    ),
    'idempotency conflict'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.update_transaction_safe(%L::uuid, jsonb_build_object(''file_url'', ''kan27.txt''))',
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
    make_date(v_base_year, 5, 13),
    'KAN-27 wrong event kind fixture',
    123,
    NULL,
    NULL,
    true,
    'vat_settlement'
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
    (v_bad_tx_id, v_bad_ver_nr, '2650', 123, 0, 'KAN-27 wrong event kind fixture', make_date(v_base_year, 5, 13), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '2012', 0, 123, 'KAN-27 wrong event kind fixture', make_date(v_base_year, 5, 13), v_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       ) values (
         %L::uuid,
         %L::uuid,
         %L::uuid,
         ''vat_credit'',
         %L::date,
         123::numeric,
         %L::uuid
       )',
      v_user_id,
      v_payable_period_id,
      v_bad_tx_id,
      make_date(v_base_year, 5, 13),
      gen_random_uuid()
    ),
    'event kind direction mismatch validation'
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
    make_date(v_base_year, 5, 14),
    'KAN-27 extra journal row fixture',
    124,
    NULL,
    NULL,
    true,
    'vat_settlement'
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
    (v_bad_tx_id, v_bad_ver_nr, '2650', 124, 0, 'KAN-27 extra journal row fixture', make_date(v_base_year, 5, 14), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '2012', 0, 124, 'KAN-27 extra journal row fixture', make_date(v_base_year, 5, 14), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '2013', 0, 0, 'KAN-27 extra journal row fixture', make_date(v_base_year, 5, 14), v_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       ) values (
         %L::uuid,
         %L::uuid,
         %L::uuid,
         ''vat_debit'',
         %L::date,
         124::numeric,
         %L::uuid
       )',
      v_user_id,
      v_payable_period_id,
      v_bad_tx_id,
      make_date(v_base_year, 5, 14),
      gen_random_uuid()
    ),
    'event extra journal row validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       )
       select
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount + 1,
         gen_random_uuid()
       from public.tax_account_events
       where id = %L::uuid',
      v_event_id
    ),
    'event journal consistency validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       )
       select
         %L::uuid,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         gen_random_uuid()
       from public.tax_account_events
       where id = %L::uuid',
      v_other_user_id,
      v_event_id
    ),
    'tenant linkage validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'update public.tax_account_events set idempotency_key = gen_random_uuid() where id = %L::uuid',
      v_event_id
    ),
    'event immutability update'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'delete from public.tax_account_events where id = %L::uuid',
      v_event_id
    ),
    'event immutability delete'
  );

  SELECT count(*) INTO v_count
  FROM public.tax_account_events
  WHERE user_id = v_other_user_id;
  PERFORM pg_temp.assert_eq(v_count, 0, 'tenant isolation event count');

  RAISE NOTICE 'KAN-27 VAT settlement foundation rollback assertions passed for run tag %.', v_run_tag;
END;
$$;

ROLLBACK;

\echo 'KAN-27 VAT settlement foundation rollback test completed with explicit ROLLBACK.'
