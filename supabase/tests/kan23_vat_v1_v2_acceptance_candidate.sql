\set ON_ERROR_STOP on

-- KAN-23 focused rollback acceptance for VAT V1 + native VAT V2 coexistence.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use: an isolated local/test database with current migrations applied.
-- The script creates only synthetic rollback-scoped fixture data and ends with
-- ROLLBACK.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-23 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-23 assertion failed: % (actual %, expected %)',
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
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    CASE WHEN p_status IN ('closed', 'declared') THEN 0 ELSE NULL END,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
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
  PERFORM pg_temp.assert_eq(auth.uid(), p_user_id, 'auth.uid() test context');
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

CREATE OR REPLACE FUNCTION pg_temp.assert_journal_amount(
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

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text := 'kan23-vat-v1-v2-' || v_run_id;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_period_start date;
  v_period_end date;
  v_period_id uuid;
  v_sale_type text := 'kan23_sale_' || v_run_id;
  v_purchase_type text := 'kan23_purchase_' || v_run_id;
  v_result jsonb;
  v_sale_tx_id uuid;
  v_purchase_tx_id uuid;
  v_v2_tx_id uuid;
  v_snapshot_id uuid;
  v_snapshot jsonb;
  v_payload jsonb;
  v_closing_tx_id uuid;
  v_declared_at timestamptz;
BEGIN
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);

  INSERT INTO auth.users (id)
  VALUES (v_user_id);

  PERFORM pg_temp.set_auth(v_user_id);

  INSERT INTO public.profiles (
    id,
    subscription_type,
    company_name,
    email,
    vat_status,
    vat_period_type,
    vat_management_from,
    domestic_sales_vat_treatment,
    foreign_purchase_reporting,
    default_deduction_entitlement,
    vat_number
  ) VALUES (
    v_user_id,
    'free',
    v_tag,
    v_tag || '@example.invalid',
    'registered',
    'month',
    make_date(v_base_year, 1, 1),
    'taxable',
    'required',
    'none',
    'SE123456789001'
  );

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate
  ) VALUES
    (
      v_sale_type,
      v_user_id,
      v_tag || ' domestic sale',
      '1930',
      '3010',
      25
    ),
    (
      v_purchase_type,
      v_user_id,
      v_tag || ' domestic purchase',
      '4000',
      '1930',
      25
    );

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES (v_user_id, 'business_payment_account', '1930');

  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'open'
  );

  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 8, 3)::text,
      'description', v_tag || ' V1 domestic sale',
      'amount', 1250,
      'type', v_sale_type,
      'vat_rate', 25
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'V1 domestic sale succeeds');
  v_sale_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_journal_amount(v_sale_tx_id, '1930', 1250, 0, 'V1 sale payment');
  PERFORM pg_temp.assert_journal_amount(v_sale_tx_id, '3010', 0, 1000, 'V1 sale income');
  PERFORM pg_temp.assert_journal_amount(v_sale_tx_id, '2611', 0, 250, 'V1 sale output VAT');

  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 8, 4)::text,
      'description', v_tag || ' V1 domestic purchase',
      'amount', 125,
      'type', v_purchase_type,
      'vat_rate', 25
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'V1 domestic purchase succeeds');
  v_purchase_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_journal_amount(v_purchase_tx_id, '4000', 100, 0, 'V1 purchase cost');
  PERFORM pg_temp.assert_journal_amount(v_purchase_tx_id, '2641', 25, 0, 'V1 purchase input VAT');
  PERFORM pg_temp.assert_journal_amount(v_purchase_tx_id, '1930', 0, 125, 'V1 purchase payment');

  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.vat_audit_snapshots
      WHERE transaction_id IN (v_sale_tx_id, v_purchase_tx_id)
    ),
    0,
    'V1 transactions create no VAT V2 snapshots'
  );

  v_payload := jsonb_build_object(
    'date', make_date(v_base_year, 8, 5)::text,
    'description', v_tag || ' VAT V2 EU service no deduction',
    'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
    'calculation_rate', 25,
    'deduction_entitlement', 'none',
    'taxable_base', 228,
    'output_vat_amount', 57,
    'deductible_input_vat_amount', 0,
    'acquisition_base_field', '21',
    'output_vat_report_field', '30',
    'deductible_input_vat_report_field', NULL::text,
    'payment_account_role', 'business_payment_account',
    'rule_version', 'vat-v2-kan18-first-slice',
    'facts_version', 'vat-facts-v1',
    'business_facts', jsonb_build_object(
      'schemaVersion', 'vat-v2-business-facts-v1',
      'supplierCountry', 'IE',
      'customerCountry', 'SE',
      'purchaseClassification', 'software_subscription_service',
      'goodsOrService', 'service',
      'supplierVatCharged', 'no',
      'calculationRate', 25,
      'taxableBase', 228,
      'currency', 'SEK',
      'deductionEntitlement', 'none',
      'deductionEntitlementSource', 'company_profile_default'
    ),
    'idempotency_key', gen_random_uuid(),
    'file_url', NULL::text
  );

  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'VAT V2 booking with business facts succeeds');
  PERFORM pg_temp.assert_eq((v_result->>'idempotent_replay')::boolean, false, 'VAT V2 first booking is not replay');

  v_v2_tx_id := (v_result->>'transaction_id')::uuid;
  v_snapshot_id := (v_result->>'vat_audit_snapshot_id')::uuid;
  PERFORM pg_temp.assert_true(v_v2_tx_id IS NOT NULL, 'VAT V2 transaction id returned');
  PERFORM pg_temp.assert_true(v_snapshot_id IS NOT NULL, 'VAT V2 snapshot id returned');

  PERFORM pg_temp.assert_eq(
    (
      SELECT source
      FROM public.transactions
      WHERE id = v_v2_tx_id
        AND user_id = v_user_id
    ),
    'vat_v2'::text,
    'VAT V2 transaction source'
  );

  PERFORM pg_temp.assert_journal_amount(v_v2_tx_id, '4535', 285, 0, 'VAT V2 no deduction acquisition and cost');
  PERFORM pg_temp.assert_journal_amount(v_v2_tx_id, '2614', 0, 57, 'VAT V2 calculated output VAT');
  PERFORM pg_temp.assert_journal_amount(v_v2_tx_id, '2645', 0, 0, 'VAT V2 no deduction writes no 2645');
  PERFORM pg_temp.assert_journal_amount(v_v2_tx_id, '1930', 0, 228, 'VAT V2 payment');

  SELECT snapshot
    INTO v_snapshot
  FROM public.vat_audit_snapshots
  WHERE id = v_snapshot_id
    AND user_id = v_user_id
    AND transaction_id = v_v2_tx_id;

  PERFORM pg_temp.assert_true(v_snapshot IS NOT NULL, 'VAT V2 audit snapshot persisted');
  PERFORM pg_temp.assert_eq(
    v_snapshot->'businessFacts'->>'schemaVersion',
    'vat-v2-business-facts-v1',
    'business facts schema persisted'
  );
  PERFORM pg_temp.assert_eq(v_snapshot->'businessFacts'->>'supplierCountry', 'IE', 'business facts supplier country persisted');
  PERFORM pg_temp.assert_eq(v_snapshot->'businessFacts'->>'customerCountry', 'SE', 'business facts customer country persisted');
  PERFORM pg_temp.assert_eq(v_snapshot->'businessFacts'->>'goodsOrService', 'service', 'business facts service persisted');
  PERFORM pg_temp.assert_eq(v_snapshot->'businessFacts'->>'supplierVatCharged', 'no', 'business facts supplier VAT persisted');
  PERFORM pg_temp.assert_eq(v_snapshot->'businessFacts'->>'deductionEntitlement', 'none', 'business facts deduction persisted');
  PERFORM pg_temp.assert_eq(v_snapshot->'businessFacts'->>'deductionEntitlementSource', 'company_profile_default', 'business facts deduction source persisted');
  PERFORM pg_temp.assert_eq((v_snapshot->'businessFacts'->>'taxableBase')::numeric, 228::numeric, 'business facts taxable base persisted');
  PERFORM pg_temp.assert_eq((v_snapshot->'vat'->>'taxableBase')::numeric, 228::numeric, 'VAT snapshot taxable base');
  PERFORM pg_temp.assert_eq((v_snapshot->'vat'->'outputVat'->>'amount')::numeric, 57::numeric, 'VAT snapshot output VAT');
  PERFORM pg_temp.assert_eq((v_snapshot->'vat'->'deductibleInputVat'->>'amount')::numeric, 0::numeric, 'VAT snapshot no deductible VAT');
  PERFORM pg_temp.assert_true(
    v_snapshot->'vat'->'deductibleInputVat'->>'reportField' IS NULL,
    'VAT snapshot no deductible report field'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    (v_payload - 'business_facts')
      || jsonb_build_object(
        'date', make_date(v_base_year, 8, 6)::text,
        'description', v_tag || ' missing business facts rejected',
        'idempotency_key', gen_random_uuid()
      ),
    'missing business facts'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    jsonb_set(
      v_payload
        || jsonb_build_object(
          'date', make_date(v_base_year, 8, 7)::text,
          'description', v_tag || ' tampered business facts rejected',
          'idempotency_key', gen_random_uuid()
        ),
      '{business_facts,taxableBase}',
      '999'::jsonb,
      false
    ),
    'tampered business facts'
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_closing_tx_id := (v_result->>'closing_transaction_id')::uuid;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, 'mixed close succeeds');
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, true, 'mixed close creates settlement transaction');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 282::numeric, 'mixed close net VAT position');
  PERFORM pg_temp.assert_true(v_closing_tx_id IS NOT NULL, 'mixed close transaction id returned');

  PERFORM pg_temp.assert_eq(
    (
      SELECT source
      FROM public.transactions
      WHERE id = v_closing_tx_id
        AND user_id = v_user_id
    ),
    'vat_closing'::text,
    'mixed close transaction source'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT amount
      FROM public.transactions
      WHERE id = v_closing_tx_id
        AND user_id = v_user_id
    ),
    307::numeric,
    'mixed close transaction amount is gross zeroed output VAT'
  );
  PERFORM pg_temp.assert_journal_amount(v_closing_tx_id, '2611', 250, 0, 'mixed close zeros V1 output VAT');
  PERFORM pg_temp.assert_journal_amount(v_closing_tx_id, '2614', 57, 0, 'mixed close zeros VAT V2 output VAT');
  PERFORM pg_temp.assert_journal_amount(v_closing_tx_id, '2641', 0, 25, 'mixed close zeros V1 input VAT');
  PERFORM pg_temp.assert_journal_amount(v_closing_tx_id, '2650', 0, 282, 'mixed close posts payable to 2650');

  PERFORM pg_temp.assert_eq(
    (
      SELECT status
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
    ),
    'closed'::text,
    'mixed period status closed'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT closing_amount
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
    ),
    282::numeric,
    'mixed period stores net closing amount'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT closing_transaction_id
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
    ),
    v_closing_tx_id,
    'mixed period stores closing transaction'
  );

  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, 'post-close 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2614', 0, 'post-close 2614 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, 'post-close 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 0, 'post-close 2645 remains zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -282, 'post-close 2650 payable balance');

  v_result := public.declare_vat_period_atomic(v_period_id);
  v_declared_at := (v_result->>'declared_at')::timestamptz;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, 'mixed declare succeeds');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, false, 'mixed declare first call');
  PERFORM pg_temp.assert_eq(v_result->>'status', 'declared', 'mixed declare status result');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 282::numeric, 'mixed declare preserves closing amount');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_closing_tx_id, 'mixed declare preserves closing transaction');
  PERFORM pg_temp.assert_true(v_declared_at IS NOT NULL, 'mixed declare returns timestamp');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND closing_amount = 282
        AND closing_transaction_id = v_closing_tx_id
        AND declared_at = v_declared_at
    ),
    'mixed period stored as declared'
  );

  RAISE NOTICE 'KAN-23 VAT V1/V2 focused acceptance completed for run id %. True two-session concurrency is NOT tested here by scope decision.',
    v_run_id;
END;
$$;

ROLLBACK;

\echo 'KAN-23 VAT V1/V2 focused acceptance rollback test completed.'
