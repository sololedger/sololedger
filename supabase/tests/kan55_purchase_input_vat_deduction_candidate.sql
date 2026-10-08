\set ON_ERROR_STOP on

-- KAN-55 rollback regression for ordinary purchase input VAT deduction.
--
-- Intended for the isolated local PostgreSQL regression database after the
-- KAN-55 migration has been applied. It creates only synthetic users and ends
-- with ROLLBACK.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-55 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-55 assertion failed: % (actual %, expected %)',
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
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_expense_account_id text := p_run_tag || '-expense';
BEGIN
  INSERT INTO auth.users (id) VALUES (p_user_id);

  IF p_default_deduction_entitlement IS NOT NULL THEN
    INSERT INTO public.profiles (
      id,
      email,
      vat_status,
      vat_period_type,
      vat_management_from,
      domestic_sales_vat_treatment,
      foreign_purchase_reporting,
      default_deduction_entitlement
    )
    VALUES (
      p_user_id,
      p_run_tag || '@example.test',
      'registered',
      'month',
      '2026-01-01',
      'taxable',
      'required',
      p_default_deduction_entitlement
    );
  END IF;

  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (p_run_tag || '-bank', p_user_id, 'KAN-55 bank', '1930', '3001'),
    (v_expense_account_id, p_user_id, 'KAN-55 kostnad', '5420', '1930'),
    (p_run_tag || '-sales', p_user_id, 'KAN-55 intäkt', '1930', '3001'),
    (p_run_tag || '-vat', p_user_id, 'KAN-55 ingående moms', '2641', '1930');

  RETURN v_expense_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.purchase_payload(
  p_description text,
  p_account_id text,
  p_amount numeric,
  p_vat_rate numeric,
  p_deduction text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'date', '2026-02-01',
    'description', p_description,
    'amount', p_amount,
    'type', p_account_id,
    'vat_rate', p_vat_rate,
    'input_vat_deduction_entitlement', p_deduction
  ));
$$;

CREATE OR REPLACE FUNCTION pg_temp.periodized_payload(
  p_description text,
  p_account_id text,
  p_amount numeric,
  p_vat_rate numeric,
  p_deduction text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'date', '2026-12-15',
    'future_date', '2027-01-01',
    'description', p_description,
    'amount', p_amount,
    'type', p_account_id,
    'vat_rate', p_vat_rate,
    'input_vat_deduction_entitlement', p_deduction
  ));
$$;

CREATE OR REPLACE FUNCTION pg_temp.vat_v2_full_payload()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'idempotency_key', gen_random_uuid(),
    'deduction_entitlement', 'full'
  );
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
  v_run_tag text := 'kan55-' || replace(gen_random_uuid()::text, '-', '');
  v_none_user_id uuid := gen_random_uuid();
  v_unknown_user_id uuid := gen_random_uuid();
  v_missing_profile_user_id uuid := gen_random_uuid();
  v_full_user_id uuid := gen_random_uuid();
  v_account_id text;
  v_result jsonb;
  v_tx_id uuid;
  v_reversal_tx_id uuid;
BEGIN
  v_account_id := pg_temp.setup_user(v_none_user_id, v_run_tag || '-none', 'none');
  PERFORM pg_temp.set_auth(v_none_user_id);

  v_result := public.book_transaction_atomic(
    pg_temp.purchase_payload(
      'KAN-55 none profile gross purchase',
      v_account_id,
      1250,
      25,
      'profile_default'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_none_user_id, v_tx_id, '5420', 'debit'), 1250::numeric, 'none profile expenses gross amount');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_none_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'none profile creates no 2641');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_none_user_id, v_tx_id, '1930', 'credit'), 1250::numeric, 'none profile credits gross payment');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_transaction_atomic(%L::jsonb)',
      pg_temp.purchase_payload('KAN-55 none profile manipulated full', v_account_id, 1250, 25, 'full')::text
    ),
    'ordinary purchase rejects manipulated full deduction for none profile'
  );
  PERFORM pg_temp.assert_eq(pg_temp.user_transaction_count(v_none_user_id), 1, 'rejected ordinary purchase has no side effect');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_vat_v2_eu_service_reverse_charge_atomic(%L::jsonb)',
      pg_temp.vat_v2_full_payload()::text
    ),
    'VAT V2 rejects manipulated full deduction for none profile'
  );
  PERFORM pg_temp.assert_eq(pg_temp.user_transaction_count(v_none_user_id), 1, 'rejected VAT V2 guard has no transaction side effect');

  v_account_id := pg_temp.setup_user(v_unknown_user_id, v_run_tag || '-unknown', 'unknown');
  PERFORM pg_temp.set_auth(v_unknown_user_id);

  v_result := public.book_transaction_atomic(
    pg_temp.purchase_payload(
      'KAN-55 unknown profile gross purchase',
      v_account_id,
      1250,
      25,
      'profile_default'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_unknown_user_id, v_tx_id, '5420', 'debit'), 1250::numeric, 'unknown profile expenses gross amount');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_unknown_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'unknown profile creates no automatic 2641');

  v_account_id := pg_temp.setup_user(v_missing_profile_user_id, v_run_tag || '-missing', NULL);
  PERFORM pg_temp.set_auth(v_missing_profile_user_id);

  v_result := public.book_transaction_atomic(
    pg_temp.purchase_payload(
      'KAN-55 missing profile gross purchase',
      v_account_id,
      1250,
      25,
      'profile_default'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_missing_profile_user_id, v_tx_id, '5420', 'debit'), 1250::numeric, 'missing profile expenses gross amount');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_missing_profile_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'missing profile creates no automatic 2641');

  v_account_id := pg_temp.setup_user(v_full_user_id, v_run_tag || '-full', 'full');
  PERFORM pg_temp.set_auth(v_full_user_id);

  v_result := public.book_transaction_atomic(
    pg_temp.purchase_payload(
      'KAN-55 full profile default deduction',
      v_account_id,
      1250,
      25,
      'profile_default'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '5420', 'debit'), 1000::numeric, 'full profile expenses net amount');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 250::numeric, 'full profile creates 2641 input VAT');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '1930', 'credit'), 1250::numeric, 'full profile credits gross payment');

  UPDATE public.profiles
  SET default_deduction_entitlement = 'none'
  WHERE id = v_full_user_id;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 250::numeric, 'later profile change does not recalculate old journal rows');

  UPDATE public.profiles
  SET default_deduction_entitlement = 'full'
  WHERE id = v_full_user_id;

  v_result := public.book_transaction_atomic(
    pg_temp.purchase_payload(
      'KAN-55 full profile transaction override none',
      v_account_id,
      1250,
      25,
      'none'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '5420', 'debit'), 1250::numeric, 'full profile override none expenses gross amount');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'full profile override none creates no 2641');

  v_result := public.book_periodized_transaction_atomic(
    pg_temp.periodized_payload(
      'KAN-55 periodized full profile default deduction',
      v_account_id,
      1250,
      25,
      'profile_default'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_reversal_tx_id := (v_result->>'reversal_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '1790', 'debit'), 1000::numeric, 'full periodization parks net amount on 1790');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 250::numeric, 'full periodization creates 2641');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_reversal_tx_id, '1790', 'credit'), 1000::numeric, 'full periodization reverses net amount from 1790');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_reversal_tx_id, '5420', 'debit'), 1000::numeric, 'full periodization activates net cost');

  v_result := public.book_periodized_transaction_atomic(
    pg_temp.periodized_payload(
      'KAN-55 periodized full profile override none',
      v_account_id,
      1250,
      25,
      'none'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_reversal_tx_id := (v_result->>'reversal_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '1790', 'debit'), 1250::numeric, 'no-deduction periodization parks gross amount on 1790');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'no-deduction periodization creates no 2641');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_reversal_tx_id, '1790', 'credit'), 1250::numeric, 'no-deduction periodization reverses gross amount from 1790');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_full_user_id, v_reversal_tx_id, '5420', 'debit'), 1250::numeric, 'no-deduction periodization activates gross cost');
END;
$$;

ROLLBACK;

\echo 'KAN-55 purchase input VAT deduction rollback test completed.'
