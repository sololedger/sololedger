\set ON_ERROR_STOP on

-- KAN-19 rollback regression for VAT V2 EU service reverse-charge persistence.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/kan19_vat_v2_reverse_charge_persistence_candidate.sql
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

CREATE TEMP TABLE kan19_vat_v2_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan19_vat_v2_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-19 VAT V2 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-19 VAT V2 assertion failed: % (actual %, expected %)',
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

\ir ../migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql

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
  v_before_ver_nr integer;
  v_after_tx integer;
  v_after_entries integer;
  v_after_snapshots integer;
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

  SELECT coalesce(max(last_ver_nr), 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, p_message || ' transaction atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, p_message || ' journal atomicity');
  PERFORM pg_temp.assert_eq(v_after_snapshots, v_before_snapshots, p_message || ' snapshot atomicity');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, p_message || ' ver_nr atomicity');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid := gen_random_uuid();
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_tag text := 'kan19-vat-v2-' || v_run_id;
  v_payment_1930_type text := 'kan19_payment_1930_' || v_run_id;
  v_payment_2018_type text := 'kan19_payment_2018_' || v_run_id;
  v_payment_cross_user_type text := 'kan19_payment_cross_user_' || v_run_id;
  v_v1_type text := 'kan19_v1_' || v_run_id;
  v_non_vat_type text := 'kan19_non_vat_' || v_run_id;
  v_payload jsonb;
  v_result jsonb;
  v_tx_id uuid;
  v_non_vat_tx_id uuid;
  v_snapshot_id uuid;
  v_ver_nr integer;
  v_non_vat_ver_nr integer;
  v_snapshot jsonb;
  v_count integer;
  v_failed boolean;
  v_before_tx integer;
  v_before_entries integer;
  v_before_snapshots integer;
  v_before_ver_nr integer;
  v_after_tx integer;
  v_after_entries integer;
  v_after_snapshots integer;
  v_after_ver_nr integer;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan19_vat_v2_test_context;

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

  INSERT INTO auth.users (id)
  VALUES (v_other_user_id);

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate
  ) VALUES
    (
      v_payment_1930_type,
      v_user_id,
      v_tag || ' payment 1930',
      '4535',
      '1930',
      0
    ),
    (
      v_payment_2018_type,
      v_user_id,
      v_tag || ' payment 2018',
      '4535',
      '2018',
      0
    ),
    (
      v_payment_cross_user_type,
      v_other_user_id,
      v_tag || ' other tenant payment 2441',
      '4535',
      '2441',
      0
    ),
    (
      v_v1_type,
      v_user_id,
      v_tag || ' ordinary V1 purchase',
      '4000',
      '1930',
      25
    ),
    (
      v_non_vat_type,
      v_user_id,
      v_tag || ' ordinary non-VAT purchase',
      '4000',
      '1930',
      0
    );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 1, 31),
    'open'
  );

  v_payload := jsonb_build_object(
    'date', make_date(v_base_year, 1, 10)::text,
    'description', v_tag || ' happy path',
    'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
    'calculation_rate', 25,
    'deduction_entitlement', 'full',
    'taxable_base', 228,
    'output_vat_amount', 57,
    'deductible_input_vat_amount', 57,
    'acquisition_base_field', '21',
    'output_vat_report_field', '30',
    'deductible_input_vat_report_field', '48',
    'payment_account_number', '1930',
    'rule_version', 'vat-v2-kan18-first-slice',
    'facts_version', 'vat-facts-v1'
  );

  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(v_payload);

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'happy path succeeds');

  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_snapshot_id := (v_result->>'vat_audit_snapshot_id')::uuid;
  v_ver_nr := (v_result->>'ver_nr')::integer;

  PERFORM pg_temp.assert_true(v_tx_id IS NOT NULL, 'happy path transaction id');
  PERFORM pg_temp.assert_true(v_snapshot_id IS NOT NULL, 'happy path snapshot id');

  PERFORM pg_temp.assert_eq(
    (
      SELECT source
      FROM public.transactions
      WHERE id = v_tx_id
        AND user_id = v_user_id
    ),
    'vat_v2'::text,
    'happy path transaction source'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT amount
      FROM public.transactions
      WHERE id = v_tx_id
        AND user_id = v_user_id
    ),
    228::numeric,
    'happy path transaction amount is payment/acquisition base'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries
      WHERE transaction_id = v_tx_id
        AND user_id = v_user_id
        AND ver_nr = v_ver_nr
    ),
    4,
    'happy path journal row count'
  );

  PERFORM pg_temp.assert_account_amount(v_tx_id, '4535', 228, 0, 'happy path 4535');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '2645', 57, 0, 'happy path 2645');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '2614', 0, 57, 'happy path 2614');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 228, 'happy path payment');

  SELECT snapshot
    INTO v_snapshot
  FROM public.vat_audit_snapshots
  WHERE id = v_snapshot_id
    AND user_id = v_user_id
    AND transaction_id = v_tx_id;

  PERFORM pg_temp.assert_true(v_snapshot IS NOT NULL, 'happy path persisted audit snapshot');
  PERFORM pg_temp.assert_eq(v_snapshot->>'schemaVersion', 'vat-audit-snapshot-v1', 'snapshot schema version');
  PERFORM pg_temp.assert_eq(v_snapshot->>'journalPlanVersion', 'vat-journal-plan-v1', 'snapshot journal plan version');
  PERFORM pg_temp.assert_eq(v_snapshot->>'treatmentCode', 'EU_SERVICE_REVERSE_CHARGE', 'snapshot treatment');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{vat,taxableBase}', '228', 'snapshot field 21 base');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{vat,outputVat,amount}', '57', 'snapshot field 30 output VAT');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{vat,deductibleInputVat,amount}', '57', 'snapshot field 48 input VAT');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{reconciliation,totalDebit}', '285.00', 'snapshot reconciliation debit');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{reconciliation,totalCredit}', '285.00', 'snapshot reconciliation credit');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 2, 1),
    make_date(v_base_year, 2, 28),
    'open'
  );

  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(
    v_payload
      || jsonb_build_object(
        'date', make_date(v_base_year, 2, 10)::text,
        'description', v_tag || ' non 1930 payment',
        'payment_account_number', '2018'
      )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_account_amount(v_tx_id, '2018', 0, 228, 'non-1930 payment');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 0, 'non-1930 does not write 1930');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31),
    'open'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 10)::text,
      'treatment_code', 'EU_GOODS_ACQUISITION'
    ),
    'unsupported treatment'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 11)::text,
      'calculation_rate', 12
    ),
    'unsupported rate'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 12)::text,
      'deduction_entitlement', 'none',
      'deductible_input_vat_amount', 0,
      'deductible_input_vat_report_field', NULL
    ),
    'no deduction'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 13)::text,
      'deduction_entitlement', 'partial'
    ),
    'partial deduction'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 14)::text,
      'deduction_entitlement', 'unknown'
    ),
    'unknown deduction'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 15)::text,
      'output_vat_amount', 56
    ),
    'wrong VAT amount'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 16)::text,
      'output_vat_report_field', '31'
    ),
    'wrong report field'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 17)::text,
      'payment_account_number', '4535'
    ),
    'wrong payment account class'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 18)::text,
      'payment_account_number', '2440'
    ),
    'payment account outside user account context'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 18)::text,
      'payment_account_number', '2441'
    ),
    'payment account owned by another tenant'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 19)::text,
      'journal_rows', jsonb_build_array(
        jsonb_build_object('account', '1930', 'debit', 1, 'credit', 0)
      )
    ),
    'client journal rows rejected'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 20)::text,
      'audit_snapshot', jsonb_build_object('mismatch', true)
    ),
    'client audit snapshot rejected'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 4, 30),
    'closed'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 4, 10)::text
    ),
    'closed VAT period'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 5, 1),
    make_date(v_base_year, 5, 31),
    'declared',
    'sololedger'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 5, 10)::text
    ),
    'declared VAT period'
  );

  -- Existing VAT V1 purchase path remains ordinary book_transaction_atomic:
  -- it writes 2641 and no VAT V2 audit snapshot.
  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 6, 1),
    make_date(v_base_year, 6, 30),
    'open'
  );

  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 6, 10)::text,
      'description', v_tag || ' ordinary V1',
      'amount', 125,
      'type', v_v1_type,
      'vat_rate', 25
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary V1 still succeeds');
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_account_amount(v_tx_id, '4000', 100, 0, 'ordinary V1 expense');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '2641', 25, 0, 'ordinary V1 2641');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 125, 'ordinary V1 payment');

  SELECT count(*)::integer
    INTO v_count
  FROM public.vat_audit_snapshots
  WHERE transaction_id = v_tx_id;

  PERFORM pg_temp.assert_eq(v_count, 0, 'ordinary V1 creates no VAT V2 snapshot');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 7, 1),
    make_date(v_base_year, 7, 31),
    'closed'
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_before_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = v_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
      'date', make_date(v_base_year, 7, 10)::text,
      'description', v_tag || ' ordinary V1 closed',
      'amount', 125,
      'type', v_v1_type,
      'vat_rate', 25
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'ordinary V1 2641 closed-period guard rejects');

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_after_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_after_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = v_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, 'ordinary V1 closed transaction atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'ordinary V1 closed journal atomicity');
  PERFORM pg_temp.assert_eq(v_after_snapshots, v_before_snapshots, 'ordinary V1 closed snapshot atomicity');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, 'ordinary V1 closed ver_nr atomicity');

  -- VAT V2 rows are intentionally immutable through the generic correction
  -- path until a VAT V2-aware correction flow can copy/reconcile audit state.
  v_failed := false;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(
      (
        SELECT t.id
        FROM public.transactions t
        WHERE t.user_id = v_user_id
          AND t.source = 'vat_v2'
        ORDER BY t.date
        LIMIT 1
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'generic correction blocks VAT V2 transaction');

  -- The VAT V2 correction trigger must not block ordinary manual
  -- corrections whose original ver_nr belongs to a non-VAT-V2 transaction.
  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 8, 10)::text,
      'description', v_tag || ' ordinary non-VAT correction source',
      'amount', 100,
      'type', v_non_vat_type,
      'vat_rate', 0
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary non-VAT booking for correction succeeds');
  v_non_vat_tx_id := (v_result->>'transaction_id')::uuid;
  v_non_vat_ver_nr := (v_result->>'ver_nr')::integer;

  v_result := public.create_correction_transaction_atomic(v_non_vat_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary non-VAT correction still succeeds');
  PERFORM pg_temp.assert_eq(
    (v_result->>'corrects_ver_nr')::integer,
    v_non_vat_ver_nr,
    'ordinary correction corrects original ver_nr'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions corr
      WHERE corr.user_id = v_user_id
        AND corr.id = (v_result->>'transaction_id')::uuid
        AND corr.source = 'manual'
        AND corr.is_correction = true
        AND corr.corrects_ver_nr = v_non_vat_ver_nr
    ),
    'ordinary correction transaction remains manual correction'
  );

  SELECT count(*)::integer
    INTO v_count
  FROM public.vat_audit_snapshots
  WHERE transaction_id = (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(v_count, 0, 'ordinary correction creates no VAT V2 snapshot');

  RAISE NOTICE 'KAN-19 VAT V2 reverse-charge persistence candidate completed for run id %. True two-session concurrency is NOT tested here.',
    v_run_id;
END;
$$;

ROLLBACK;
