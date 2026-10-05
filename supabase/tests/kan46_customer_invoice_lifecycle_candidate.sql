\set ON_ERROR_STOP on

-- KAN-46 rollback regression for external customer invoice lifecycle.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
-- Applies the candidate schema change unless skip_migration=1 is provided,
-- then creates synthetic users and fixture rows inside one transaction and
-- ends with ROLLBACK.

\if :{?skip_migration}
\else
  \ir ../migrations/20261005193000_kan46_customer_invoice_lifecycle.sql
\endif

BEGIN;

CREATE TEMP TABLE kan46_context (
  user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan46_context (user_id, run_tag, base_year)
VALUES (
  gen_random_uuid(),
  'kan46-' || replace(gen_random_uuid()::text, '-', ''),
  2090 + floor(random() * 100)::integer
);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-46 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-46 assertion failed: % (actual %, expected %)',
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

CREATE OR REPLACE FUNCTION pg_temp.expect_close_failure(
  p_year integer,
  p_message_like text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.close_year_atomic(p_year);
  RAISE EXCEPTION 'KAN-46 assertion failed: close_year_atomic unexpectedly succeeded';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE p_message_like THEN
      RAISE EXCEPTION 'KAN-46 assertion failed: close error mismatch (actual %, expected like %)',
        SQLERRM,
        p_message_like;
    END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_year integer;
  v_invoice_id uuid;
  v_unknown_invoice_id uuid;
  v_same_year_tx_id uuid;
  v_year_end_tx_id uuid;
  v_settlement_tx_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_key uuid;
  v_b7 numeric;
  v_2611 numeric;
BEGIN
  SELECT user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_year
  FROM kan46_context;

  INSERT INTO auth.users (id) VALUES (v_user_id);
  PERFORM pg_temp.set_auth(v_user_id);

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-same-year',
      'customer_name', 'KAN-46 svensk kund',
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
  v_invoice_id := (v_result->>'invoice_id')::uuid;

  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::integer FROM public.journal_entries WHERE user_id = v_user_id),
    0,
    'creating invoice facts creates no journal rows'
  );

  v_key := gen_random_uuid();
  v_result := public.record_customer_invoice_payment_atomic(
    v_invoice_id,
    make_date(v_year, 7, 2),
    v_key
  );
  v_same_year_tx_id := (v_result->>'transaction_id')::uuid;
  v_replay := public.record_customer_invoice_payment_atomic(
    v_invoice_id,
    make_date(v_year, 7, 2),
    v_key
  );

  PERFORM pg_temp.assert_true(
    (v_replay->>'idempotent_replay')::boolean,
    'same-year payment idempotency replays'
  );
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_same_year_tx_id, '1930'), 1250::numeric, 'same-year payment debits bank');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_same_year_tx_id, '3010'), -1000::numeric, 'same-year payment credits income');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_same_year_tx_id, '2611'), -250::numeric, 'same-year payment credits output VAT');
  PERFORM pg_temp.assert_eq(
    (SELECT payment_status FROM public.customer_invoices WHERE id = v_invoice_id),
    'paid',
    'same-year payment marks invoice paid'
  );

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-unknown-vat',
      'customer_name', 'KAN-46 osaker moms',
      'invoice_date', make_date(v_year, 12, 10),
      'service_date', make_date(v_year, 12, 10),
      'due_date', make_date(v_year + 1, 1, 10),
      'gross_amount', 500,
      'vat_treatment', 'unknown'
    )
  );
  v_unknown_invoice_id := (v_result->>'invoice_id')::uuid;

  PERFORM pg_temp.expect_close_failure(v_year, '%osäker momsstatus%');

  DELETE FROM public.customer_invoices WHERE id = v_unknown_invoice_id;

  v_result := public.create_customer_invoice_atomic(
    jsonb_build_object(
      'invoice_number', v_run_tag || '-year-end',
      'customer_name', 'KAN-46 julfoto',
      'invoice_date', make_date(v_year, 12, 20),
      'service_date', make_date(v_year, 12, 19),
      'due_date', make_date(v_year + 1, 1, 20),
      'gross_amount', 2500,
      'vat_treatment', 'taxable',
      'vat_rate', 25
    )
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;

  PERFORM pg_temp.expect_close_failure(v_year, '%inte bokförd som kundfordran%');

  v_key := gen_random_uuid();
  v_result := public.book_customer_invoice_year_end_receivable_atomic(
    v_invoice_id,
    v_year,
    v_key
  );
  v_year_end_tx_id := (v_result->>'transaction_id')::uuid;
  v_replay := public.book_customer_invoice_year_end_receivable_atomic(
    v_invoice_id,
    v_year,
    v_key
  );

  PERFORM pg_temp.assert_true(
    (v_replay->>'idempotent_replay')::boolean,
    'year-end receivable idempotency replays'
  );
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_year_end_tx_id, '1510'), 2500::numeric, 'year-end receivable debits 1510');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_year_end_tx_id, '3010'), -2000::numeric, 'year-end receivable credits income');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_year_end_tx_id, '2611'), -500::numeric, 'year-end receivable credits output VAT');
  PERFORM pg_temp.assert_eq(
    (SELECT payment_status FROM public.customer_invoices WHERE id = v_invoice_id),
    'unpaid',
    'year-end booking keeps invoice payment status unpaid'
  );

  SELECT coalesce(round(sum(debit - credit), 2), 0)
    INTO v_b7
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND account_number BETWEEN '1500' AND '1599'
    AND date <= make_date(v_year, 12, 31);

  PERFORM pg_temp.assert_eq(v_b7, 2500::numeric, '1510 contributes to NE B7 balance range');

  SELECT coalesce(round(sum(credit - debit), 2), 0)
    INTO v_2611
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND account_number = '2611'
    AND date BETWEEN make_date(v_year, 12, 1) AND make_date(v_year, 12, 31);

  PERFORM pg_temp.assert_eq(v_2611, 500::numeric, 'year-end output VAT is in final VAT period');

  v_key := gen_random_uuid();
  v_result := public.settle_customer_invoice_receivable_atomic(
    v_invoice_id,
    make_date(v_year + 1, 1, 15),
    v_key
  );
  v_settlement_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_settlement_tx_id, '1930'), 2500::numeric, 'settlement debits bank');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_settlement_tx_id, '1510'), -2500::numeric, 'settlement credits 1510');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_settlement_tx_id, '3010'), 0::numeric, 'settlement creates no duplicate income');
  PERFORM pg_temp.assert_eq(pg_temp.journal_balance(v_settlement_tx_id, '2611'), 0::numeric, 'settlement creates no duplicate output VAT');
  PERFORM pg_temp.assert_eq(
    (SELECT payment_status FROM public.customer_invoices WHERE id = v_invoice_id),
    'paid',
    'settlement marks invoice paid'
  );
END;
$$;

\echo 'KAN-46 customer invoice lifecycle rollback test completed.'

ROLLBACK;
