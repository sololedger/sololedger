\set ON_ERROR_STOP on

-- KAN-63 candidate regression for customer invoice VAT profile guard.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
-- Applies the candidate schema change unless skip_migration=1 is provided,
-- then creates synthetic users and fixture rows inside one transaction and
-- ends with ROLLBACK.

BEGIN;

\if :{?skip_migration}
\else
  \ir ../migrations/20261013103000_kan63_customer_invoice_vat_guard.sql
\endif

CREATE TEMP TABLE kan63_context (
  user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan63_context (user_id, run_tag, base_year)
VALUES (
  gen_random_uuid(),
  'kan63-' || replace(gen_random_uuid()::text, '-', ''),
  2090 + floor(random() * 100)::integer
);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-63 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-63 assertion failed: % (actual %, expected %)',
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

CREATE OR REPLACE FUNCTION pg_temp.set_profile(
  p_user_id uuid,
  p_vat_status text,
  p_domestic_sales_vat_treatment text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.profiles
  SET
    vat_status = p_vat_status,
    vat_period_type = CASE WHEN p_vat_status = 'registered' THEN 'quarter' ELSE NULL END,
    vat_management_from = CASE WHEN p_vat_status = 'registered' THEN DATE '2026-01-01' ELSE NULL END,
    domestic_sales_vat_treatment = p_domestic_sales_vat_treatment,
    foreign_purchase_reporting = 'unknown',
    default_deduction_entitlement = 'unknown'
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.journal_balance(
  p_transaction_id uuid,
  p_account_number text
)
RETURNS numeric
LANGUAGE sql
AS $$
  SELECT coalesce(round(sum(debit - credit), 2), 0)
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = p_account_number;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_year integer;
  v_invoice_id uuid;
  v_exempt_invoice_id uuid;
  v_legacy_invoice_id uuid;
  v_update_invoice_id uuid;
  v_year_end_invoice_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_blocked boolean;
  v_message text;
BEGIN
  SELECT user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_year
  FROM kan63_context;

  INSERT INTO auth.users (id) VALUES (v_user_id);
  INSERT INTO public.profiles (id, email)
  VALUES (v_user_id, v_run_tag || '@example.invalid');
  PERFORM pg_temp.set_auth(v_user_id);

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'small_business_exempt');

  v_blocked := false;
  BEGIN
    PERFORM public.create_customer_invoice_atomic(
      jsonb_build_object(
        'invoice_number', v_run_tag || '-blocked-small-business',
        'customer_name', 'KAN-63 svensk kund',
        'customer_country', 'SE',
        'currency', 'SEK',
        'invoice_date', make_date(v_year, 6, 1),
        'service_date', make_date(v_year, 6, 1),
        'due_date', make_date(v_year, 6, 30),
        'gross_amount', 1250,
        'vat_treatment', 'taxable',
        'vat_rate', 25
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;

  PERFORM pg_temp.assert_true(v_blocked, 'small-business profile blocks taxable invoice creation');
  PERFORM pg_temp.assert_true(
    v_message ILIKE '%småföretagarregeln%',
    'small-business creation error names the exemption'
  );

  PERFORM pg_temp.set_profile(v_user_id, 'not_registered', 'taxable');

  v_blocked := false;
  BEGIN
    PERFORM public.create_customer_invoice_atomic(
      jsonb_build_object(
        'invoice_number', v_run_tag || '-blocked-not-registered',
        'customer_name', 'KAN-63 svensk kund',
        'invoice_date', make_date(v_year, 6, 2),
        'service_date', make_date(v_year, 6, 2),
        'due_date', make_date(v_year, 7, 2),
        'gross_amount', 1250,
        'vat_treatment', 'taxable',
        'vat_rate', 25
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  PERFORM pg_temp.assert_true(v_blocked, 'not-registered profile blocks taxable invoice creation');

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'unknown');

  v_blocked := false;
  BEGIN
    PERFORM public.create_customer_invoice_atomic(
      jsonb_build_object(
        'invoice_number', v_run_tag || '-blocked-unknown',
        'customer_name', 'KAN-63 svensk kund',
        'invoice_date', make_date(v_year, 6, 3),
        'service_date', make_date(v_year, 6, 3),
        'due_date', make_date(v_year, 7, 3),
        'gross_amount', 1250,
        'vat_treatment', 'taxable',
        'vat_rate', 25
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;

  PERFORM pg_temp.assert_true(v_blocked, 'unknown domestic treatment blocks taxable invoice creation');
  PERFORM pg_temp.assert_true(
    v_message ILIKE '%gissar inte moms%',
    'unknown domestic treatment error follows no-guessing rule'
  );

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'mixed');

  v_blocked := false;
  BEGIN
    PERFORM public.create_customer_invoice_atomic(
      jsonb_build_object(
        'invoice_number', v_run_tag || '-blocked-mixed',
        'customer_name', 'KAN-63 svensk kund',
        'invoice_date', make_date(v_year, 6, 4),
        'service_date', make_date(v_year, 6, 4),
        'due_date', make_date(v_year, 7, 4),
        'gross_amount', 1250,
        'vat_treatment', 'taxable',
        'vat_rate', 25
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  PERFORM pg_temp.assert_true(v_blocked, 'mixed domestic treatment blocks free taxable invoice override');

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'small_business_exempt');

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-exempt',
      'customer_name', 'KAN-63 momsfri kund',
      'customer_country', 'SE',
      'currency', 'SEK',
      'invoice_date', make_date(v_year, 7, 1),
      'service_date', make_date(v_year, 7, 1),
      'due_date', make_date(v_year, 7, 31),
      'gross_amount', 1000,
      'vat_treatment', 'exempt',
      'attachment_url', 'fixtures/kan63-exempt.pdf'
    )
  );
  v_exempt_invoice_id := (v_result->>'invoice_id')::uuid;

  PERFORM pg_temp.assert_eq(
    (
      SELECT vat_policy_snapshot_status
      FROM public.customer_invoices
      WHERE id = v_exempt_invoice_id
    ),
    'captured'::text,
    'new exempt invoice captures current profile policy'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT vat_policy_source
      FROM public.customer_invoices
      WHERE id = v_exempt_invoice_id
    ),
    'create'::text,
    'new exempt invoice snapshot source is create'
  );

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-update-block',
      'customer_name', 'KAN-63 redigeringskund',
      'customer_country', 'SE',
      'currency', 'SEK',
      'invoice_date', make_date(v_year, 7, 2),
      'service_date', make_date(v_year, 7, 2),
      'due_date', make_date(v_year, 8, 2),
      'gross_amount', 1000,
      'vat_treatment', 'exempt',
      'attachment_url', 'fixtures/kan63-update-block.pdf'
    )
  );
  v_update_invoice_id := (v_result->>'invoice_id')::uuid;

  v_blocked := false;
  BEGIN
    PERFORM public.update_customer_invoice_unbooked_atomic(
      v_update_invoice_id,
      jsonb_build_object(
        'invoice_number', v_run_tag || '-update-block',
        'customer_name', 'KAN-63 redigeringskund',
        'invoice_date', make_date(v_year, 7, 2),
        'service_date', make_date(v_year, 7, 2),
        'due_date', make_date(v_year, 8, 2),
        'gross_amount', 1000,
        'vat_treatment', 'taxable',
        'vat_rate', 25,
        'attachment_url', 'fixtures/kan63-update-block.pdf'
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  PERFORM pg_temp.assert_true(
    v_blocked,
    'unbooked invoice cannot be updated into taxable treatment under small-business exemption'
  );

  v_result := public.record_customer_invoice_payment_atomic(
    v_exempt_invoice_id,
    make_date(v_year, 8, 1),
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '1930'), 1000::numeric, 'exempt payment debits bank');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '3010'), -1000::numeric, 'exempt payment credits income');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '2611'), 0::numeric, 'exempt payment creates no output VAT');

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'taxable');

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-taxable-then-profile-change',
      'customer_name', 'KAN-63 momspliktig kund',
      'customer_country', 'SE',
      'currency', 'SEK',
      'invoice_date', make_date(v_year, 9, 1),
      'service_date', make_date(v_year, 9, 1),
      'due_date', make_date(v_year, 9, 30),
      'gross_amount', 1250,
      'vat_treatment', 'taxable',
      'vat_rate', 25,
      'attachment_url', 'fixtures/kan63-taxable.pdf'
    )
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;

  PERFORM pg_temp.assert_eq(
    (
      SELECT vat_policy_snapshot_status
      FROM public.customer_invoices
      WHERE id = v_invoice_id
    ),
    'captured'::text,
    'new taxable invoice captures VAT policy snapshot'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT vat_policy_vat_status
      FROM public.customer_invoices
      WHERE id = v_invoice_id
    ),
    'registered'::text,
    'taxable invoice snapshot stores registered VAT status'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT vat_policy_domestic_sales_vat_treatment
      FROM public.customer_invoices
      WHERE id = v_invoice_id
    ),
    'taxable'::text,
    'taxable invoice snapshot stores taxable domestic sales policy'
  );

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'small_business_exempt');

  PERFORM public.update_customer_invoice_unbooked_atomic(
    v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_run_tag || '-taxable-then-profile-change',
      'customer_name', 'KAN-63 namnändrad kund',
      'invoice_date', make_date(v_year, 9, 1),
      'service_date', make_date(v_year, 9, 1),
      'due_date', make_date(v_year, 10, 15),
      'gross_amount', 1250,
      'vat_treatment', 'taxable',
      'vat_rate', 25,
      'attachment_url', 'fixtures/kan63-taxable.pdf'
    )
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT vat_policy_source
      FROM public.customer_invoices
      WHERE id = v_invoice_id
    ),
    'create'::text,
    'non-VAT edit preserves original snapshot source after profile change'
  );

  v_blocked := false;
  BEGIN
    PERFORM public.update_customer_invoice_unbooked_atomic(
      v_invoice_id,
      jsonb_build_object(
        'invoice_number', v_run_tag || '-taxable-then-profile-change',
        'customer_name', 'KAN-63 namnändrad kund',
        'invoice_date', make_date(v_year, 9, 1),
        'service_date', make_date(v_year, 9, 1),
        'due_date', make_date(v_year, 10, 15),
        'gross_amount', 1500,
        'vat_treatment', 'taxable',
        'vat_rate', 25,
        'attachment_url', 'fixtures/kan63-taxable.pdf'
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  PERFORM pg_temp.assert_true(
    v_blocked,
    'VAT-relevant edit revalidates current profile and blocks taxable treatment'
  );

  v_result := public.record_customer_invoice_payment_atomic(
    v_invoice_id,
    make_date(v_year, 10, 1),
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '1930'), 1250::numeric, 'allowed taxable payment debits bank');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '3010'), -1000::numeric, 'allowed taxable payment credits income');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '2611'), -250::numeric, 'allowed taxable payment credits output VAT');

  INSERT INTO public.customer_invoices (
    user_id,
    invoice_number,
    customer_name,
    customer_country,
    currency,
    invoice_date,
    service_date,
    due_date,
    gross_amount,
    net_amount,
    vat_amount,
    vat_rate,
    vat_treatment,
    attachment_url
  ) VALUES (
    v_user_id,
    v_run_tag || '-legacy-taxable',
    'KAN-63 legacy momspliktig kund',
    'SE',
    'SEK',
    make_date(v_year, 11, 1),
    make_date(v_year, 11, 1),
    make_date(v_year, 11, 30),
    1250,
    1000,
    250,
    25,
    'taxable',
    'fixtures/kan63-legacy-taxable.pdf'
  )
  RETURNING id INTO v_legacy_invoice_id;

  v_blocked := false;
  BEGIN
    PERFORM public.record_customer_invoice_payment_atomic(
      v_legacy_invoice_id,
      make_date(v_year, 11, 20),
      gen_random_uuid()
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  END;

  PERFORM pg_temp.assert_true(v_blocked, 'legacy taxable invoice without snapshot is blocked at booking');
  PERFORM pg_temp.assert_true(
    v_message ILIKE '%saknar sparat momsbeslut%',
    'legacy taxable booking error explains missing saved VAT decision'
  );

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'taxable');

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-taxable-year-end',
      'customer_name', 'KAN-63 bokslutskund',
      'customer_country', 'SE',
      'currency', 'SEK',
      'invoice_date', make_date(v_year, 12, 20),
      'service_date', make_date(v_year, 12, 20),
      'due_date', make_date(v_year + 1, 1, 20),
      'gross_amount', 2500,
      'vat_treatment', 'taxable',
      'vat_rate', 25,
      'attachment_url', 'fixtures/kan63-year-end.pdf'
    )
  );
  v_year_end_invoice_id := (v_result->>'invoice_id')::uuid;

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'small_business_exempt');

  v_result := public.book_customer_invoice_year_end_receivable_atomic(
    v_year_end_invoice_id,
    v_year,
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '1510'), 2500::numeric, 'allowed year-end booking debits receivable');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '3010'), -2000::numeric, 'allowed year-end booking credits income');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '2611'), -500::numeric, 'allowed year-end booking credits output VAT');

  PERFORM pg_temp.set_profile(v_user_id, 'registered', 'small_business_exempt');

  v_result := public.settle_customer_invoice_receivable_atomic(
    v_year_end_invoice_id,
    make_date(v_year + 1, 1, 15),
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '1930'), 2500::numeric, 'settlement still debits bank');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '1510'), -2500::numeric, 'settlement still credits receivable');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_tx_id, '2611'), 0::numeric, 'settlement still creates no duplicate output VAT');
END;
$$;

\echo 'KAN-63 customer invoice VAT guard rollback test completed.'

ROLLBACK;
