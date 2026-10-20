\set ON_ERROR_STOP on

-- KAN-54 rollback regression for fixed-asset VAT deduction profile guard.
--
-- Intended for the isolated local PostgreSQL regression database after the
-- KAN-54 migration has been applied. It creates only synthetic users and ends
-- with ROLLBACK.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-54 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-54 assertion failed: % (actual %, expected %)',
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

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_rejected := true;
  END;

  PERFORM pg_temp.assert_true(v_rejected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.setup_user(
  p_user_id uuid,
  p_run_tag text,
  p_default_deduction_entitlement text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (id) VALUES (p_user_id);

  IF p_default_deduction_entitlement IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, default_deduction_entitlement)
    VALUES (
      p_user_id,
      p_run_tag || '@example.test',
      p_default_deduction_entitlement
    );
  END IF;

  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (p_run_tag || '-bank', p_user_id, 'KAN-54 bank', '1930', '3001'),
    (p_run_tag || '-expense', p_user_id, 'KAN-54 inventariekostnad', '5410', '1930'),
    (p_run_tag || '-asset', p_user_id, 'KAN-54 inventarier', '1220', '1930'),
    (p_run_tag || '-vat', p_user_id, 'KAN-54 ingående moms', '2641', '1930');

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES (p_user_id, 'business_payment_account', '1930');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.asset_payload(
  p_description text,
  p_taxable numeric,
  p_vat numeric,
  p_deduction text,
  p_useful_life text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'idempotency_key', gen_random_uuid(),
    'date', '2026-02-01',
    'description', p_description,
    'supplier_country', 'SE',
    'taxable_base_amount', p_taxable,
    'supplier_vat_amount', p_vat,
    'vat_deduction_entitlement', p_deduction,
    'payment_account_role', 'business_payment_account',
    'connection_assessment', 'standalone',
    'useful_life_answer', p_useful_life
  ));
$$;

CREATE OR REPLACE FUNCTION pg_temp.journal_amount(
  p_user_id uuid,
  p_transaction_id uuid,
  p_account text,
  p_side text
)
RETURNS numeric
LANGUAGE sql
AS $$
  SELECT round(coalesce(sum(
    CASE WHEN p_side = 'debit' THEN debit ELSE credit END
  ), 0), 2)
  FROM public.journal_entries
  WHERE user_id = p_user_id
    AND transaction_id = p_transaction_id
    AND account_number = p_account;
$$;

CREATE OR REPLACE FUNCTION pg_temp.user_transaction_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT count(*)::integer
  FROM public.transactions
  WHERE user_id = p_user_id;
$$;

DO $$
DECLARE
  v_run_tag text := 'kan54-' || replace(gen_random_uuid()::text, '-', '');
  v_none_user_id uuid := gen_random_uuid();
  v_full_user_id uuid := gen_random_uuid();
  v_unknown_user_id uuid := gen_random_uuid();
  v_missing_profile_user_id uuid := gen_random_uuid();
  v_result jsonb;
  v_tx_id uuid;
BEGIN
  PERFORM pg_temp.setup_user(v_none_user_id, v_run_tag || '-none', 'none');
  PERFORM pg_temp.set_auth(v_none_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('KAN-54 none profile manipulated full deduction', 5000, 1250, 'full')::text
    ),
    'none profile rejects full VAT deduction'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.user_transaction_count(v_none_user_id),
    0,
    'rejected none plus full creates no transaction'
  );

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      'KAN-54 none profile no deduction capitalized',
      40000,
      10000,
      'none',
      'more_than_three_years_or_unknown'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'capitalized', 'none plus none keeps KAN-36 capitalized flow');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_none_user_id, v_tx_id, '1220', 'debit'), 50000::numeric, 'none plus none capitalizes non-deductible VAT');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_none_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'none plus none creates no 2641 row');

  PERFORM pg_temp.setup_user(v_full_user_id, v_run_tag || '-full', 'full');
  PERFORM pg_temp.set_auth(v_full_user_id);

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload('KAN-54 full profile full deduction', 5000, 1250, 'full')
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '5410', 'debit'), 5000::numeric, 'full plus full expenses net amount');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 1250::numeric, 'full plus full creates 2641 row');

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload('KAN-54 full profile no deduction', 5000, 1250, 'none')
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '5410', 'debit'), 6250::numeric, 'full plus none expenses non-deductible VAT');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'full plus none creates no 2641 row');

  PERFORM pg_temp.setup_user(v_unknown_user_id, v_run_tag || '-unknown', 'unknown');
  PERFORM pg_temp.set_auth(v_unknown_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('KAN-54 unknown profile rejects full', 5000, 1250, 'full')::text
    ),
    'unknown profile rejects full VAT deduction'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.user_transaction_count(v_unknown_user_id),
    0,
    'rejected unknown plus full creates no transaction'
  );

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload('KAN-54 unknown profile no deduction', 5000, 1250, 'none')
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_unknown_user_id, v_tx_id, '5410', 'debit'), 6250::numeric, 'unknown plus none expenses non-deductible VAT');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_unknown_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'unknown plus none creates no 2641 row');

  PERFORM pg_temp.setup_user(v_missing_profile_user_id, v_run_tag || '-missing', NULL);
  PERFORM pg_temp.set_auth(v_missing_profile_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('KAN-54 missing profile rejects full', 5000, 1250, 'full')::text
    ),
    'missing profile rejects full VAT deduction'
  );
  PERFORM pg_temp.assert_eq(
    pg_temp.user_transaction_count(v_missing_profile_user_id),
    0,
    'rejected missing profile plus full creates no transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('KAN-54 partial remains unsupported', 5000, 1250, 'partial')::text
    ),
    'partial VAT deduction remains rejected'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-54 fixed asset VAT deduction guard rollback test completed.'
