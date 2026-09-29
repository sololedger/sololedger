\set ON_ERROR_STOP on

-- KAN-21 prerequisite rollback regression for VAT lifecycle source taxonomy.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan21_vat_lifecycle_source_taxonomy_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. Everything,
-- including the candidate migration and fixtures, runs inside one outer
-- transaction and ends with an explicit ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan21_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan21_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-21 rollback ' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

-- Install the current VAT V2 source/trigger prerequisite first when the local
-- rollback database snapshot predates it, then install the exact KAN-21
-- prerequisite candidate. Both are contained by the outer rollback.
\ir ../migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql
\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-21 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-21 assertion failed: % (actual %, expected %)',
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
    RAISE EXCEPTION 'KAN-21 fixture is unbalanced: % (debit %, credit %)',
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_side_effect_counts(
  p_user_id uuid,
  p_before_tx integer,
  p_before_entries integer,
  p_before_corrections integer,
  p_before_ver_nr integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_after_tx integer;
  v_after_entries integer;
  v_after_corrections integer;
  v_after_ver_nr integer;
BEGIN
  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_entries
  FROM public.journal_entries
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_corrections
  FROM public.transactions
  WHERE user_id = p_user_id
    AND is_correction IS TRUE;

  SELECT coalesce(last_ver_nr, 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, p_before_tx, p_message || ' transaction count');
  PERFORM pg_temp.assert_eq(v_after_entries, p_before_entries, p_message || ' journal count');
  PERFORM pg_temp.assert_eq(v_after_corrections, p_before_corrections, p_message || ' correction count');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, p_before_ver_nr, p_message || ' ver_nr');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_source_policy(
  p_source text,
  p_current boolean,
  p_reserved_future boolean,
  p_system_managed boolean,
  p_controlled_lifecycle boolean,
  p_allows_correction boolean,
  p_allows_update boolean,
  p_ordinary_vat_activity boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_current(p_source),
    p_current,
    p_message || ' current'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_reserved_future(p_source),
    p_reserved_future,
    p_message || ' reserved future'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_system_managed(p_source),
    p_system_managed,
    p_message || ' system managed'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_controlled_vat_lifecycle(p_source),
    p_controlled_lifecycle,
    p_message || ' controlled lifecycle'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_allows_generic_correction(p_source),
    p_allows_correction,
    p_message || ' generic correction'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_allows_generic_update(p_source),
    p_allows_update,
    p_message || ' generic update'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_ordinary_vat_guard_activity(p_source),
    p_ordinary_vat_activity,
    p_message || ' ordinary VAT activity'
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_internal_function_exposure(
  p_function regprocedure,
  p_routine_name text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.routine_privileges rp
      WHERE rp.specific_schema = 'public'
        AND rp.routine_name = p_routine_name
        AND rp.grantee = 'PUBLIC'
        AND rp.privilege_type = 'EXECUTE'
    ),
    p_message || ' not executable by PUBLIC'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', p_function, 'EXECUTE'),
    p_message || ' not executable by anon'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', p_function, 'EXECUTE'),
    p_message || ' not executable by authenticated'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', p_function, 'EXECUTE'),
    p_message || ' executable by postgres'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', p_function, 'EXECUTE'),
    p_message || ' executable by service_role'
  );
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_manual_tx_id uuid;
  v_sie_import_tx_id uuid;
  v_sie_opening_tx_id uuid;
  v_sie_undo_tx_id uuid;
  v_vat_closing_tx_id uuid;
  v_vat_v2_tx_id uuid;
  v_265_tx_id uuid;
  v_closed_guard_period_id uuid;
  v_declared_guard_period_id uuid;
  v_close_period_id uuid;

  v_manual_ver_nr integer := 921001;
  v_vat_closing_ver_nr integer := 921002;
  v_vat_v2_ver_nr integer := 921003;
  v_265_ver_nr integer := 921004;
  v_sie_import_ver_nr integer := 921005;
  v_sie_opening_ver_nr integer := 921006;
  v_sie_undo_ver_nr integer := 921007;
  v_sequence_floor integer := 921500;

  v_constraint_def text;
  v_trigger_count integer;
  v_failed boolean;
  v_error_message text;
  v_result jsonb;
  v_file_url text;
  v_before_tx integer;
  v_before_entries integer;
  v_before_corrections integer;
  v_before_ver_nr integer;
  v_after_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan21_test_context;

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
    NOT has_function_privilege('authenticated', 'public.transaction_source_classification(text)'::regprocedure, 'EXECUTE'),
    'taxonomy helper is not directly exposed to authenticated'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.transaction_source_classification(text)'::regprocedure, 'EXECUTE'),
    'taxonomy helper is not directly exposed to anon'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'existing update RPC remains callable by authenticated'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'existing correction RPC remains callable by authenticated'
  );

  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_classification(text)'::regprocedure,
    'transaction_source_classification',
    'transaction_source_classification exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_current(text)'::regprocedure,
    'transaction_source_is_current',
    'transaction_source_is_current exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_reserved_future(text)'::regprocedure,
    'transaction_source_is_reserved_future',
    'transaction_source_is_reserved_future exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_system_managed(text)'::regprocedure,
    'transaction_source_is_system_managed',
    'transaction_source_is_system_managed exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_controlled_vat_lifecycle(text)'::regprocedure,
    'transaction_source_is_controlled_vat_lifecycle',
    'transaction_source_is_controlled_vat_lifecycle exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_allows_generic_correction(text)'::regprocedure,
    'transaction_source_allows_generic_correction',
    'transaction_source_allows_generic_correction exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_allows_generic_update(text)'::regprocedure,
    'transaction_source_allows_generic_update',
    'transaction_source_allows_generic_update exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_ordinary_vat_guard_activity(text)'::regprocedure,
    'transaction_source_is_ordinary_vat_guard_activity',
    'transaction_source_is_ordinary_vat_guard_activity exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.prevent_disallowed_generic_correction_insert()'::regprocedure,
    'prevent_disallowed_generic_correction_insert',
    'prevent_disallowed_generic_correction_insert exposure'
  );

  SELECT pg_get_constraintdef(c.oid)
    INTO v_constraint_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.transactions'::regclass
    AND c.conname = 'transactions_source_check';

  PERFORM pg_temp.assert_true(
    v_constraint_def LIKE '%manual%'
      AND v_constraint_def LIKE '%vat_closing%'
      AND v_constraint_def LIKE '%vat_v2%',
    'source constraint still contains current sources'
  );
  PERFORM pg_temp.assert_true(
    v_constraint_def NOT LIKE '%vat_settlement%',
    'vat_settlement is not added to active source constraint'
  );

  PERFORM pg_temp.assert_source_policy('manual', true, false, false, false, true, true, true, 'manual policy');
  PERFORM pg_temp.assert_source_policy('sie_import', true, false, true, false, true, true, true, 'sie_import policy');
  PERFORM pg_temp.assert_source_policy('sie_opening_balance', true, false, true, false, true, true, true, 'sie_opening_balance policy');
  PERFORM pg_temp.assert_source_policy('sie_import_undo', true, false, true, false, true, true, true, 'sie_import_undo policy');
  PERFORM pg_temp.assert_source_policy('vat_closing', true, false, true, true, false, false, false, 'vat_closing policy');
  PERFORM pg_temp.assert_source_policy('vat_v2', true, false, true, false, false, true, true, 'vat_v2 policy');
  PERFORM pg_temp.assert_source_policy('vat_settlement', false, true, true, true, false, false, false, 'vat_settlement policy');
  PERFORM pg_temp.assert_source_policy('kan21_unknown_source', false, false, false, false, false, false, false, 'unknown source policy');
  PERFORM pg_temp.assert_source_policy(NULL, false, false, false, false, false, false, false, 'NULL source policy');

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname = 'prevent_disallowed_generic_correction_insert'
    AND NOT tgisinternal;
  PERFORM pg_temp.assert_eq(v_trigger_count, 1, 'generic correction trigger installed once');

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname = 'prevent_vat_v2_correction_insert'
    AND NOT tgisinternal;
  PERFORM pg_temp.assert_eq(v_trigger_count, 0, 'VAT V2-specific correction trigger replaced');

  v_failed := false;
  BEGIN
    INSERT INTO public.transactions (
      user_id,
      date,
      description,
      amount,
      booked,
      source
    ) VALUES (
      v_user_id,
      make_date(v_base_year, 1, 2),
      v_run_tag || ' forbidden settlement source',
      0,
      true,
      'vat_settlement'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_settlement remains rejected by transactions_source_check');

  v_manual_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 10),
    v_run_tag || ' manual fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 1250, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 1000),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    v_manual_ver_nr,
    'manual',
    true
  );

  v_sie_import_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 11),
    v_run_tag || ' sie import fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    v_sie_import_ver_nr,
    'sie_import',
    true
  );

  v_sie_opening_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 12),
    v_run_tag || ' sie opening balance fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2010', 'debit', 0, 'credit', 200)
    ),
    v_sie_opening_ver_nr,
    'sie_opening_balance',
    true
  );

  v_sie_undo_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 13),
    v_run_tag || ' sie import undo fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 300, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 300)
    ),
    v_sie_undo_ver_nr,
    'sie_import_undo',
    true
  );

  v_vat_closing_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 28),
    v_run_tag || ' vat closing fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 250, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 250)
    ),
    v_vat_closing_ver_nr,
    'vat_closing',
    true
  );

  v_vat_v2_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 10),
    v_run_tag || ' vat v2 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '4535', 'debit', 1000, 'credit', 0),
      jsonb_build_object('account', '2645', 'debit', 250, 'credit', 0),
      jsonb_build_object('account', '2614', 'debit', 0, 'credit', 250),
      jsonb_build_object('account', '2440', 'debit', 0, 'credit', 1000)
    ),
    v_vat_v2_ver_nr,
    'vat_v2',
    true
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND is_correction IS TRUE;
  SELECT coalesce(last_ver_nr, 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_closing_tx_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_closing correction is blocked');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%Momsavslut%', 'vat_closing correction message remains explicit');
  PERFORM pg_temp.assert_no_side_effect_counts(
    v_user_id,
    v_before_tx,
    v_before_entries,
    v_before_corrections,
    v_before_ver_nr,
    'blocked vat_closing correction'
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND is_correction IS TRUE;
  SELECT coalesce(last_ver_nr, 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_v2_tx_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_v2 correction is blocked');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%VAT V2%', 'vat_v2 correction message remains explicit');
  PERFORM pg_temp.assert_no_side_effect_counts(
    v_user_id,
    v_before_tx,
    v_before_entries,
    v_before_corrections,
    v_before_ver_nr,
    'blocked vat_v2 correction'
  );

  v_result := public.create_correction_transaction_atomic(v_manual_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'manual correction still succeeds');

  v_result := public.create_correction_transaction_atomic(v_sie_import_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import correction still succeeds');

  v_result := public.create_correction_transaction_atomic(v_sie_opening_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_opening_balance correction still succeeds');

  v_result := public.create_correction_transaction_atomic(v_sie_undo_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import_undo correction still succeeds');

  -- Intentional hardening: the RPC keeps its vat_closing fast-fail for
  -- compatibility, while this trigger is defense-in-depth for direct generic
  -- correction inserts that bypass the RPC.
  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    INSERT INTO public.transactions (
      user_id,
      date,
      description,
      amount,
      booked,
      is_correction,
      corrects_ver_nr,
      source
    ) VALUES (
      v_user_id,
      make_date(v_base_year, 2, 28),
      v_run_tag || ' direct vat_closing correction hardening',
      250,
      true,
      true,
      v_vat_closing_ver_nr,
      'manual'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'direct vat_closing generic correction insert is blocked by trigger');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%Momsavslut%', 'direct vat_closing trigger error remains explicit');

  SELECT count(*) INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_count, v_before_tx, 'direct vat_closing trigger block leaves no transaction');

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_vat_closing_tx_id,
      jsonb_build_object('file_url', 'kan21-forbidden.pdf')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_closing metadata update is blocked');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%Momsavslut%', 'vat_closing update message remains explicit');

  SELECT file_url INTO v_file_url
  FROM public.transactions
  WHERE id = v_vat_closing_tx_id
    AND user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_file_url, NULL::text, 'blocked vat_closing update leaves file_url unchanged');

  v_result := public.update_transaction_safe(
    v_vat_v2_tx_id,
    jsonb_build_object('file_url', 'kan21-vat-v2.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'vat_v2 metadata update remains allowed');

  SELECT file_url INTO v_file_url
  FROM public.transactions
  WHERE id = v_vat_v2_tx_id
    AND user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_file_url, 'kan21-vat-v2.pdf'::text, 'vat_v2 file_url updated');

  v_result := public.update_transaction_safe(
    v_sie_import_tx_id,
    jsonb_build_object('file_url', 'kan21-sie-import.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import metadata update still succeeds');

  v_result := public.update_transaction_safe(
    v_sie_opening_tx_id,
    jsonb_build_object('file_url', 'kan21-sie-opening.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_opening_balance metadata update still succeeds');

  v_result := public.update_transaction_safe(
    v_sie_undo_tx_id,
    jsonb_build_object('file_url', 'kan21-sie-undo.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import_undo metadata update still succeeds');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_sie_import_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked sie_import accounting update remains blocked');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_sie_opening_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked sie_opening_balance accounting update remains blocked');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_sie_undo_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked sie_import_undo accounting update remains blocked');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_vat_v2_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked vat_v2 accounting update remains blocked');

  v_closed_guard_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 4, 30),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL
  );

  v_declared_guard_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 5, 1),
    make_date(v_base_year, 5, 31),
    'declared',
    'sololedger',
    0,
    NULL,
    now()
  );

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate
  ) VALUES (
    'kan21_vat_sale_' || replace(gen_random_uuid()::text, '-', ''),
    v_user_id,
    v_run_tag || ' VAT sale',
    '1930',
    '3001',
    25
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 4, 12)::text,
        'description', v_run_tag || ' closed VAT guard booking',
        'amount', 1250,
        'type', (SELECT id FROM public.accounts WHERE user_id = v_user_id AND name = v_run_tag || ' VAT sale' LIMIT 1),
        'vat_rate', 25,
        'booked', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'ordinary closed VAT guard remains effective');

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 5, 12)::text,
        'description', v_run_tag || ' declared VAT guard booking',
        'amount', 1250,
        'type', (SELECT id FROM public.accounts WHERE user_id = v_user_id AND name = v_run_tag || ' VAT sale' LIMIT 1),
        'vat_rate', 25,
        'booked', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'ordinary declared VAT guard remains effective');

  SELECT count(*) INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_count, v_before_tx, 'closed/declared booking guards leave no transactions');

  v_close_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 6, 1),
    make_date(v_base_year, 6, 30),
    'open',
    'sololedger',
    NULL,
    NULL,
    NULL
  );

  v_265_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_run_tag || ' 2650 manual review fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 300, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 300)
    ),
    v_265_ver_nr,
    'manual',
    true
  );

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_close_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, '265x close manual-review guard remains effective');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%265x%', '265x close guard message remains explicit');

  PERFORM pg_temp.assert_eq(
    (SELECT status FROM public.vat_periods WHERE id = v_close_period_id),
    'open'::text,
    '265x close guard leaves period open'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND source = 'vat_closing'
        AND description LIKE v_run_tag || ' 2650%'
    ),
    '265x close guard creates no VAT closing transaction'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-21 VAT lifecycle source taxonomy rollback test candidate completed inside explicit ROLLBACK.'
