\set ON_ERROR_STOP on

-- KAN-38 rollback regression for VAT V2 central payment-role enforcement.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
-- This test creates synthetic users and fixture rows inside one transaction
-- and ends with ROLLBACK.

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
\ir ../migrations/20261001060000_kan31_vat_v2_idempotency_acl_fix.sql

CREATE TEMP TABLE kan38_context (
  user_id uuid PRIMARY KEY,
  other_user_id uuid NOT NULL,
  run_tag text NOT NULL,
  base_year integer NOT NULL,
  legacy_key uuid,
  legacy_transaction_id uuid,
  legacy_snapshot_id uuid,
  business_key uuid,
  business_transaction_id uuid,
  business_snapshot_id uuid
) ON COMMIT DROP;

INSERT INTO kan38_context (user_id, other_user_id, run_tag, base_year)
VALUES (
  gen_random_uuid(),
  gen_random_uuid(),
  'kan38-' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-38 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-38 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
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

CREATE OR REPLACE FUNCTION pg_temp.insert_basic_accounts(
  p_user_id uuid,
  p_other_user_id uuid,
  p_run_tag text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (p_run_tag || '-bank-1930', p_user_id, 'KAN-38 bank 1930', '1930', '3001'),
    (p_run_tag || '-bank-1940', p_user_id, 'KAN-38 bank 1940', '1940', '3001'),
    (p_run_tag || '-owner-2017', p_user_id, 'KAN-38 owner 2017', '4000', '2017'),
    (p_run_tag || '-owner-2018', p_user_id, 'KAN-38 owner 2018', '4000', '2018'),
    (p_run_tag || '-software', p_user_id, 'KAN-38 software', '4535', '4535'),
    (p_run_tag || '-vat-output', p_user_id, 'KAN-38 output VAT', '2614', '2614'),
    (p_run_tag || '-vat-input', p_user_id, 'KAN-38 input VAT', '2645', '2645'),
    (p_run_tag || '-other-bank', p_other_user_id, 'KAN-38 other bank', '1999', '3001')
  ON CONFLICT (id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    'month',
    'open',
    'sololedger'
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vat_v2_role_payload(
  p_date date,
  p_description text,
  p_payment_account_role text,
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
    'payment_account_role', p_payment_account_role,
    'rule_version', 'vat-v2-kan18-first-slice',
    'facts_version', 'vat-facts-v1',
    'idempotency_key', p_idempotency_key,
    'file_url', NULL
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.vat_v2_legacy_payload(
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

CREATE OR REPLACE FUNCTION pg_temp.assert_rejected_without_side_effects(
  p_user_id uuid,
  p_payload jsonb,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_before_tx integer;
  v_before_entries integer;
  v_before_snapshots integer;
  v_before_idempotency integer;
  v_before_ver_nr integer;
  v_after_tx integer;
  v_after_entries integer;
  v_after_snapshots integer;
  v_after_idempotency integer;
  v_after_ver_nr integer;
  v_failed boolean := false;
BEGIN
  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_before_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_before_idempotency
  FROM public.vat_v2_booking_idempotency
  WHERE user_id = p_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  BEGIN
    PERFORM public.book_vat_v2_eu_service_reverse_charge_atomic(p_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, p_message || ' rejects');

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_entries
  FROM public.journal_entries
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_idempotency
  FROM public.vat_v2_booking_idempotency
  WHERE user_id = p_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, p_message || ' transaction atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, p_message || ' journal atomicity');
  PERFORM pg_temp.assert_eq(v_after_snapshots, v_before_snapshots, p_message || ' snapshot atomicity');
  PERFORM pg_temp.assert_eq(v_after_idempotency, v_before_idempotency, p_message || ' idempotency atomicity');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, p_message || ' ver_nr atomicity');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_account_amount(
  p_transaction_id uuid,
  p_account_number text,
  p_debit numeric,
  p_credit numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit numeric;
  v_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO v_debit, v_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = p_account_number;

  PERFORM pg_temp.assert_eq(v_debit, p_debit, p_message || ' debit');
  PERFORM pg_temp.assert_eq(v_credit, p_credit, p_message || ' credit');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_run_tag text;
  v_base_year integer;
  v_key uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  SELECT user_id, other_user_id, run_tag, base_year
    INTO v_user_id, v_other_user_id, v_run_tag, v_base_year
  FROM kan38_context;

  INSERT INTO auth.users (id) VALUES (v_user_id), (v_other_user_id);

  PERFORM pg_temp.set_auth(v_user_id);
  PERFORM pg_temp.insert_basic_accounts(v_user_id, v_other_user_id, v_run_tag);

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES
    (v_user_id, 'business_payment_account', '1930'),
    (v_user_id, 'owner_private_payment', '2017');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 1, 31)
  );

  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_legacy_payload(
      make_date(v_base_year, 1, 10),
      v_run_tag || ' legacy booking',
      '1930',
      v_key
    )
  );

  UPDATE kan38_context
  SET legacy_key = v_key,
      legacy_transaction_id = (v_result->>'transaction_id')::uuid,
      legacy_snapshot_id = (v_result->>'vat_audit_snapshot_id')::uuid;
END;
$$;

\ir ../migrations/20261004152057_kan38_vat_v2_payment_role_enforcement.sql

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;
  v_legacy_key uuid;
  v_legacy_tx_id uuid;
  v_legacy_snapshot_id uuid;
  v_business_key uuid;
  v_owner_key uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tx_id uuid;
  v_snapshot_id uuid;
  v_snapshot jsonb;
  v_before_count integer;
  v_after_count integer;
BEGIN
  SELECT user_id, run_tag, base_year, legacy_key, legacy_transaction_id, legacy_snapshot_id
    INTO v_user_id, v_run_tag, v_base_year, v_legacy_key, v_legacy_tx_id, v_legacy_snapshot_id
  FROM kan38_context;

  PERFORM pg_temp.set_auth(v_user_id);

  UPDATE public.company_payment_account_roles
  SET account_number = '1940'
  WHERE user_id = v_user_id
    AND role = 'business_payment_account';

  SELECT count(*)::integer
    INTO v_before_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND source = 'vat_v2';

  v_replay := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_legacy_payload(
      make_date(v_base_year, 1, 10),
      v_run_tag || ' legacy booking',
      '1930',
      v_legacy_key
    )
  );

  SELECT count(*)::integer
    INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND source = 'vat_v2';

  PERFORM pg_temp.assert_eq(v_after_count, v_before_count, 'legacy replay creates no new transaction');
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'legacy replay is marked as replay');
  PERFORM pg_temp.assert_eq((v_replay->>'transaction_id')::uuid, v_legacy_tx_id, 'legacy replay returns original transaction');
  PERFORM pg_temp.assert_eq((v_replay->>'vat_audit_snapshot_id')::uuid, v_legacy_snapshot_id, 'legacy replay returns original snapshot');

  v_replay := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 1, 10),
      v_run_tag || ' legacy booking',
      'business_payment_account',
      v_legacy_key
    )
  );

  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'legacy row replays through new role payload');
  PERFORM pg_temp.assert_eq((v_replay->>'transaction_id')::uuid, v_legacy_tx_id, 'new client role payload returns legacy transaction');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 2, 1),
    make_date(v_base_year, 2, 28)
  );

  v_business_key := gen_random_uuid();
  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 2, 10),
      v_run_tag || ' business role',
      'business_payment_account',
      v_business_key
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_snapshot_id := (v_result->>'vat_audit_snapshot_id')::uuid;

  UPDATE kan38_context
  SET business_key = v_business_key,
      business_transaction_id = v_tx_id,
      business_snapshot_id = v_snapshot_id;

  PERFORM pg_temp.assert_account_amount(v_tx_id, '1940', 0, 228, 'business role resolved 1940');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 0, 'business role does not use stale 1930');
  PERFORM pg_temp.assert_eq(v_result->>'payment_account_role', 'business_payment_account', 'business result role');
  PERFORM pg_temp.assert_eq(v_result->>'payment_account_number', '1940', 'business result account');

  SELECT snapshot
    INTO v_snapshot
  FROM public.vat_audit_snapshots
  WHERE id = v_snapshot_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_snapshot->>'paymentAccountRole', 'business_payment_account', 'business snapshot role');
  PERFORM pg_temp.assert_eq(v_snapshot->>'paymentAccountNumber', '1940', 'business snapshot account');

  PERFORM pg_temp.assert_eq(
    (
      SELECT request_canonical->>'payment_account_role'
      FROM public.vat_v2_booking_idempotency
      WHERE user_id = v_user_id
        AND idempotency_key = v_business_key
    ),
    'business_payment_account',
    'new canonical stores payment role'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT request_canonical->>'payment_account_number'
      FROM public.vat_v2_booking_idempotency
      WHERE user_id = v_user_id
        AND idempotency_key = v_business_key
    ),
    '1940',
    'new canonical stores server-resolved account'
  );

  UPDATE public.company_payment_account_roles
  SET account_number = '1930'
  WHERE user_id = v_user_id
    AND role = 'business_payment_account';

  v_replay := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 2, 10),
      v_run_tag || ' business role',
      'business_payment_account',
      v_business_key
    )
  );

  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'new role replay survives profile change');
  PERFORM pg_temp.assert_eq((v_replay->>'transaction_id')::uuid, v_tx_id, 'new role replay returns original transaction');
  PERFORM pg_temp.assert_eq(
    (
      SELECT snapshot->>'paymentAccountNumber'
      FROM public.vat_audit_snapshots
      WHERE id = v_snapshot_id
        AND user_id = v_user_id
    ),
    '1940',
    'audit snapshot keeps account from booking time'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31)
  );

  v_owner_key := gen_random_uuid();
  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 3, 10),
      v_run_tag || ' owner role',
      'owner_private_payment',
      v_owner_key
    )
  );
  PERFORM pg_temp.assert_account_amount((v_result->>'transaction_id')::uuid, '2017', 0, 228, 'owner role resolved 2017');

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 3, 11),
      v_run_tag || ' manipulated account',
      'business_payment_account',
      gen_random_uuid()
    ) || jsonb_build_object('payment_account_number', '2017'),
    'client supplied account number cannot steer new booking'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 3, 12),
      v_run_tag || ' same key different role',
      'owner_private_payment',
      v_business_key
    ),
    'same key with different payment role'
  );

  DELETE FROM public.company_payment_account_roles
  WHERE user_id = v_user_id
    AND role = 'owner_private_payment';

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 3, 13),
      v_run_tag || ' missing owner role',
      'owner_private_payment',
      gen_random_uuid()
    ),
    'missing saved owner role'
  );

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES (v_user_id, 'owner_private_payment', '2018');

  DELETE FROM public.accounts
  WHERE user_id = v_user_id
    AND id = v_run_tag || '-owner-2018';

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    pg_temp.vat_v2_role_payload(
      make_date(v_base_year, 3, 14),
      v_run_tag || ' missing account plan account',
      'owner_private_payment',
      gen_random_uuid()
    ),
    'saved role account missing from account plan'
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'book_vat_v2_eu_service_reverse_charge_atomic'
        AND p.oid::regprocedure::text = 'book_vat_v2_eu_service_reverse_charge_atomic(jsonb)'
    ),
    'VAT V2 RPC remains SECURITY DEFINER'
  );

  PERFORM pg_temp.assert_true(
    (
      SELECT p.proconfig @> ARRAY['search_path=public']
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'book_vat_v2_eu_service_reverse_charge_atomic'
        AND p.oid::regprocedure::text = 'book_vat_v2_eu_service_reverse_charge_atomic(jsonb)'
    ),
    'VAT V2 RPC keeps explicit search_path'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)',
      'EXECUTE'
    ),
    'anon cannot execute VAT V2 RPC'
  );

  PERFORM pg_temp.assert_true(
    has_function_privilege(
      'authenticated',
      'public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)',
      'EXECUTE'
    ),
    'authenticated can execute VAT V2 RPC'
  );
END;
$$;

ROLLBACK;
