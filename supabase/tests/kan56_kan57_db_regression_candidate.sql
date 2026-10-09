\set ON_ERROR_STOP on

-- KAN-56/KAN-57 rollback regression for the repaired critical DB functions.
--
-- Intended for the isolated local PostgreSQL regression database after the
-- current migration chain and 20261009203900 repair migration have been
-- applied. It creates only synthetic users and fixture rows and ends with
-- ROLLBACK.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-56/KAN-57 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-56/KAN-57 assertion failed: % (actual %, expected %)',
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

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects_like(
  p_sql text,
  p_message_like text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE p_message_like THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'KAN-56/KAN-57 assertion failed: % (actual error %, expected like %)',
      p_message,
      SQLERRM,
      p_message_like;
  END;

  RAISE EXCEPTION 'KAN-56/KAN-57 assertion failed: % (statement unexpectedly succeeded)', p_message;
END;
$$;

DO $$
DECLARE
  v_delete_def text;
  v_close_def text;
  v_fixed_asset_trigger_def text;
  v_tax_event_trigger_def text;
  v_tax_movement_trigger_def text;
  v_admin_user_id uuid := gen_random_uuid();
  v_missing_user_id uuid := gen_random_uuid();
  v_delete_user_id uuid := gen_random_uuid();
  v_asset_delete_user_id uuid := gen_random_uuid();
  v_invoice_delete_user_id uuid := gen_random_uuid();
  v_other_invoice_user_id uuid := gen_random_uuid();
  v_invoice_user_id uuid := gen_random_uuid();
  v_fixed_asset_user_id uuid := gen_random_uuid();
  v_both_user_id uuid := gen_random_uuid();
  v_future_service_user_id uuid := gen_random_uuid();
  v_tx_id uuid := gen_random_uuid();
  v_asset_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_other_invoice_id uuid := gen_random_uuid();
  v_invoice_tx_id uuid := gen_random_uuid();
  v_invoice_settlement_tx_id uuid := gen_random_uuid();
  v_invoice_reversal_tx_id uuid := gen_random_uuid();
  v_other_invoice_tx_id uuid := gen_random_uuid();
  v_invoice_booking_id uuid;
  v_invoice_settlement_booking_id uuid;
  v_invoice_reversal_booking_id uuid;
  v_other_invoice_booking_id uuid;
  v_result jsonb;
BEGIN
  SELECT pg_get_functiondef('public.delete_user_data_atomic(uuid)'::regprocedure)
    INTO v_delete_def;
  SELECT pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure)
    INTO v_close_def;
  SELECT pg_get_functiondef('public.prevent_fixed_asset_event_mutation()'::regprocedure)
    INTO v_fixed_asset_trigger_def;
  SELECT pg_get_functiondef('public.prevent_tax_account_event_mutation()'::regprocedure)
    INTO v_tax_event_trigger_def;
  SELECT pg_get_functiondef('public.prevent_tax_account_movement_mutation()'::regprocedure)
    INTO v_tax_movement_trigger_def;

  PERFORM pg_temp.assert_true(v_delete_def LIKE '%backend_pid%', 'delete RPC uses backend_pid');
  PERFORM pg_temp.assert_true(v_delete_def NOT LIKE '%ctx.pid%', 'delete RPC does not reference ctx.pid');
  PERFORM pg_temp.assert_true(v_delete_def NOT LIKE '%ON CONFLICT (pid, user_id)%', 'delete RPC does not use pid conflict target');
  PERFORM pg_temp.assert_true(v_delete_def LIKE '%v_role = ''admin''%', 'delete RPC keeps admin guard');
  PERFORM pg_temp.assert_true(v_delete_def LIKE '%GET DIAGNOSTICS v_profiles = ROW_COUNT%', 'delete RPC counts profile deletion');
  PERFORM pg_temp.assert_true(v_fixed_asset_trigger_def LIKE '%backend_pid%', 'fixed-asset lifecycle trigger uses backend_pid');
  PERFORM pg_temp.assert_true(v_fixed_asset_trigger_def NOT LIKE '%ctx.pid%', 'fixed-asset lifecycle trigger does not use ctx.pid');
  PERFORM pg_temp.assert_true(v_tax_event_trigger_def LIKE '%backend_pid%', 'tax-account event trigger uses backend_pid');
  PERFORM pg_temp.assert_true(v_tax_event_trigger_def LIKE '%TG_OP = ''DELETE''%', 'tax-account event trigger only allows delete lifecycle bypass');
  PERFORM pg_temp.assert_true(v_tax_movement_trigger_def LIKE '%backend_pid%', 'tax-account movement trigger uses backend_pid');
  PERFORM pg_temp.assert_true(v_tax_movement_trigger_def LIKE '%TG_OP = ''DELETE''%', 'tax-account movement trigger only allows delete lifecycle bypass');
  PERFORM pg_temp.assert_true(
    pg_get_functiondef('public.prevent_customer_invoice_booking_mutation()'::regprocedure) LIKE '%TG_OP = ''DELETE''%',
    'customer invoice booking trigger only allows delete lifecycle bypass'
  );
  PERFORM pg_temp.assert_true(
    pg_get_functiondef('public.prevent_customer_invoice_booking_mutation()'::regprocedure) LIKE '%ctx.backend_pid = pg_backend_pid()%',
    'customer invoice booking trigger uses backend_pid'
  );
  PERFORM pg_temp.assert_true(v_close_def LIKE '%customer_invoice_year_end_fiscal_year%', 'year close uses invoice fiscal-year helper');
  PERFORM pg_temp.assert_true(v_close_def LIKE '%fixed_asset_depreciation_runs%', 'year close keeps fixed-asset depreciation guard');

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', 'public.delete_user_data_atomic(uuid)', 'EXECUTE'),
    'authenticated cannot execute delete_user_data_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.delete_user_data_atomic(uuid)', 'EXECUTE'),
    'service_role can execute delete_user_data_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.close_year_atomic(integer)', 'EXECUTE'),
    'authenticated can execute close_year_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'public.delete_user_data_atomic_lifecycle_context', 'INSERT'),
    'authenticated cannot create delete lifecycle context'
  );
  PERFORM pg_temp.assert_true(
    NOT has_table_privilege('service_role', 'public.delete_user_data_atomic_lifecycle_context', 'INSERT'),
    'service_role cannot create delete lifecycle context outside SECURITY DEFINER function privileges'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'fixed_asset_events'
        AND t.tgname = 'prevent_fixed_asset_event_mutation'
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
    ),
    'fixed-asset event mutation trigger is installed and enabled'
  );

  INSERT INTO auth.users (id)
  VALUES
    (v_admin_user_id),
    (v_delete_user_id),
    (v_asset_delete_user_id),
    (v_invoice_delete_user_id),
    (v_other_invoice_user_id),
    (v_invoice_user_id),
    (v_fixed_asset_user_id),
    (v_both_user_id),
    (v_future_service_user_id);

  INSERT INTO public.profiles (id, email, role, default_deduction_entitlement)
  VALUES
    (v_admin_user_id, 'kan56-admin@example.invalid', 'admin', 'full'),
    (v_delete_user_id, 'kan56-delete@example.invalid', 'user', 'full'),
    (v_asset_delete_user_id, 'kan56-asset-delete@example.invalid', 'user', 'full'),
    (v_invoice_delete_user_id, 'kan56-invoice-delete@example.invalid', 'user', 'full'),
    (v_other_invoice_user_id, 'kan56-other-invoice@example.invalid', 'user', 'full'),
    (v_invoice_user_id, 'kan57-invoice@example.invalid', 'user', 'full'),
    (v_fixed_asset_user_id, 'kan57-asset@example.invalid', 'user', 'full'),
    (v_both_user_id, 'kan57-both@example.invalid', 'user', 'full'),
    (v_future_service_user_id, 'kan57-future-service@example.invalid', 'user', 'full');

  PERFORM pg_temp.assert_rejects_like(
    format('select public.delete_user_data_atomic(%L::uuid)', v_admin_user_id),
    '%Admin-konton%',
    'admin profile deletion is rejected'
  );

  PERFORM pg_temp.assert_rejects_like(
    format('select public.delete_user_data_atomic(%L::uuid)', v_missing_user_id),
    '%hittades inte%',
    'missing target profile deletion is rejected'
  );

  v_result := public.delete_user_data_atomic(v_delete_user_id);

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary synthetic user deletion succeeds');
  PERFORM pg_temp.assert_eq(
    (v_result->'deleted'->>'profiles')::integer,
    1,
    'ordinary synthetic user deletion reports exactly one profile'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_delete_user_id),
    'ordinary synthetic profile is deleted'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.delete_user_data_atomic_lifecycle_context
      WHERE backend_pid = pg_backend_pid()
        AND user_id = v_delete_user_id
    ),
    'delete lifecycle context is cleaned after success'
  );

  INSERT INTO public.transactions (
    id,
    user_id,
    date,
    description,
    amount,
    type,
    booked,
    source
  ) VALUES (
    v_tx_id,
    v_asset_delete_user_id,
    date '2091-06-01',
    'KAN-56 inventariehändelse för radering',
    1000,
    'expense',
    true,
    'manual'
  );

  INSERT INTO public.fixed_assets (
    id,
    user_id,
    name,
    acquisition_date,
    fiscal_year,
    supplier_country,
    connection_assessment,
    naturally_connected,
    threshold_basis_amount,
    taxable_base_amount,
    supplier_vat_amount,
    deductible_vat_amount,
    non_deductible_vat_amount,
    expensed_amount,
    capitalized_amount,
    payment_account_role,
    payment_account_number,
    vat_deduction_entitlement,
    useful_life_answer,
    decision_type,
    status,
    acquisition_transaction_id,
    rule_year,
    rule_version,
    price_base_amount,
    half_price_base_amount,
    audit_snapshot
  ) VALUES (
    v_asset_id,
    v_asset_delete_user_id,
    'KAN-56 inventariehändelse för radering',
    date '2091-06-01',
    2091,
    'SE',
    'standalone',
    false,
    1000,
    1000,
    0,
    0,
    0,
    0,
    1000,
    'business_payment_account',
    '1930',
    'none',
    'more_than_three_years_or_unknown',
    'capitalized',
    'active',
    v_tx_id,
    2091,
    'kan56-test',
    60000,
    30000,
    '{}'::jsonb
  );

  INSERT INTO public.fixed_asset_events (
    user_id,
    asset_id,
    transaction_id,
    event_type,
    event_date,
    fiscal_year,
    amount,
    audit_snapshot
  ) VALUES (
    v_asset_delete_user_id,
    v_asset_id,
    v_tx_id,
    'acquisition',
    date '2091-06-01',
    2091,
    1000,
    '{}'::jsonb
  );

  v_result := public.delete_user_data_atomic(v_asset_delete_user_id);

  PERFORM pg_temp.assert_eq(
    (v_result->'deleted'->>'fixed_asset_events')::integer,
    1,
    'delete lifecycle removes fixed asset events through backend_pid context'
  );

  INSERT INTO public.transactions (
    id,
    user_id,
    date,
    description,
    amount,
    type,
    booked,
    source,
    is_correction
  ) VALUES
    (
      v_invoice_tx_id,
      v_invoice_delete_user_id,
      date '2091-12-31',
      'KAN-56 kundfakturabokning for radering',
      1250,
      'income',
      true,
      'customer_invoice',
      false
    ),
    (
      v_invoice_settlement_tx_id,
      v_invoice_delete_user_id,
      date '2092-01-15',
      'KAN-56 kundfakturabetalning for radering',
      1250,
      'income',
      true,
      'customer_invoice',
      false
    ),
    (
      v_invoice_reversal_tx_id,
      v_invoice_delete_user_id,
      date '2092-01-16',
      'KAN-56 kundfaktura reversal for radering',
      1250,
      'income',
      true,
      'customer_invoice',
      true
    ),
    (
      v_other_invoice_tx_id,
      v_other_invoice_user_id,
      date '2091-12-31',
      'KAN-56 annan anvandares kundfaktura',
      1250,
      'income',
      true,
      'customer_invoice',
      false
    );

  INSERT INTO public.customer_invoices (
    id,
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
    payment_status
  ) VALUES
    (
      v_invoice_id,
      v_invoice_delete_user_id,
      'KAN56-DELETE-INVOICE',
      'KAN-56 raderingskund',
      'SE',
      'SEK',
      date '2091-12-20',
      date '2091-12-20',
      date '2092-01-20',
      1250,
      1000,
      250,
      25,
      'taxable',
      'unpaid'
    ),
    (
      v_other_invoice_id,
      v_other_invoice_user_id,
      'KAN56-OTHER-INVOICE',
      'KAN-56 annan kund',
      'SE',
      'SEK',
      date '2091-12-20',
      date '2091-12-20',
      date '2092-01-20',
      1250,
      1000,
      250,
      25,
      'taxable',
      'unpaid'
    );

  INSERT INTO public.customer_invoice_bookings (
    user_id,
    invoice_id,
    transaction_id,
    booking_kind,
    booking_date,
    fiscal_year,
    gross_amount,
    net_amount,
    vat_amount,
    idempotency_key
  ) VALUES (
    v_invoice_delete_user_id,
    v_invoice_id,
    v_invoice_tx_id,
    'year_end_receivable',
    date '2091-12-31',
    2091,
    1250,
    1000,
    250,
    gen_random_uuid()
  )
  RETURNING id INTO v_invoice_booking_id;

  INSERT INTO public.customer_invoice_bookings (
    user_id,
    invoice_id,
    transaction_id,
    booking_kind,
    booking_date,
    fiscal_year,
    gross_amount,
    net_amount,
    vat_amount,
    idempotency_key
  ) VALUES (
    v_invoice_delete_user_id,
    v_invoice_id,
    v_invoice_settlement_tx_id,
    'receivable_settlement',
    date '2092-01-15',
    2092,
    1250,
    1000,
    250,
    gen_random_uuid()
  )
  RETURNING id INTO v_invoice_settlement_booking_id;

  INSERT INTO public.customer_invoice_bookings (
    user_id,
    invoice_id,
    transaction_id,
    booking_kind,
    booking_date,
    fiscal_year,
    gross_amount,
    net_amount,
    vat_amount,
    idempotency_key,
    reverses_booking_id
  ) VALUES (
    v_invoice_delete_user_id,
    v_invoice_id,
    v_invoice_reversal_tx_id,
    'receivable_settlement_reversal',
    date '2092-01-16',
    2092,
    1250,
    1000,
    250,
    gen_random_uuid(),
    v_invoice_settlement_booking_id
  )
  RETURNING id INTO v_invoice_reversal_booking_id;

  INSERT INTO public.customer_invoice_bookings (
    user_id,
    invoice_id,
    transaction_id,
    booking_kind,
    booking_date,
    fiscal_year,
    gross_amount,
    net_amount,
    vat_amount,
    idempotency_key
  ) VALUES (
    v_other_invoice_user_id,
    v_other_invoice_id,
    v_other_invoice_tx_id,
    'year_end_receivable',
    date '2091-12-31',
    2091,
    1250,
    1000,
    250,
    gen_random_uuid()
  )
  RETURNING id INTO v_other_invoice_booking_id;

  PERFORM pg_temp.assert_rejects_like(
    format('delete from public.customer_invoice_bookings where id = %L::uuid', v_invoice_reversal_booking_id),
    '%låsta historikposter%',
    'normal customer invoice booking delete remains blocked'
  );

  PERFORM pg_temp.assert_rejects_like(
    format('update public.customer_invoice_bookings set gross_amount = gross_amount where id = %L::uuid', v_invoice_reversal_booking_id),
    '%låsta historikposter%',
    'normal customer invoice booking update remains blocked'
  );

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (backend_pid, user_id)
  VALUES (pg_backend_pid(), v_invoice_delete_user_id);

  PERFORM pg_temp.assert_rejects_like(
    format('delete from public.customer_invoice_bookings where id = %L::uuid', v_other_invoice_booking_id),
    '%låsta historikposter%',
    'delete lifecycle context cannot delete another user customer invoice booking'
  );

  PERFORM pg_temp.assert_rejects_like(
    format('update public.customer_invoice_bookings set gross_amount = gross_amount where id = %L::uuid', v_invoice_reversal_booking_id),
    '%låsta historikposter%',
    'customer invoice booking update remains blocked even with matching lifecycle context'
  );

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = v_invoice_delete_user_id;

  v_result := public.delete_user_data_atomic(v_invoice_delete_user_id);

  PERFORM pg_temp.assert_eq(
    (v_result->'deleted'->>'customer_invoice_bookings')::integer,
    3,
    'delete lifecycle removes customer invoice bookings including self-FK reversal'
  );
  PERFORM pg_temp.assert_eq(
    (v_result->'deleted'->>'customer_invoices')::integer,
    1,
    'delete lifecycle removes customer invoice after bookings'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.customer_invoice_bookings
      WHERE user_id = v_invoice_delete_user_id
    ),
    'deleted user customer invoice bookings are gone'
  );
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.customer_invoice_bookings
      WHERE id = v_other_invoice_booking_id
        AND user_id = v_other_invoice_user_id
    ),
    'other user customer invoice booking remains'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.delete_user_data_atomic_lifecycle_context
      WHERE backend_pid = pg_backend_pid()
        AND user_id = v_invoice_delete_user_id
    ),
    'customer invoice delete lifecycle context is cleaned after success'
  );

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
    vat_treatment,
    payment_status
  ) VALUES (
    v_invoice_user_id,
    'KAN57-UNKNOWN',
    'KAN-57 okand moms',
    'SE',
    'SEK',
    date '2092-12-10',
    date '2092-12-10',
    date '2093-01-10',
    500,
    'unknown',
    'unpaid'
  );

  PERFORM pg_temp.set_auth(v_invoice_user_id);
  PERFORM pg_temp.assert_rejects_like(
    'select public.close_year_atomic(2092)',
    '%osäker momsstatus%',
    'year close rejects unpaid invoice with unknown VAT'
  );

  DELETE FROM public.customer_invoices WHERE user_id = v_invoice_user_id;

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
    payment_status
  ) VALUES (
    v_invoice_user_id,
    'KAN57-UNBOOKED',
    'KAN-57 obokad kundfordran',
    'SE',
    'SEK',
    date '2092-12-20',
    date '2092-12-20',
    date '2093-01-20',
    1250,
    1000,
    250,
    25,
    'taxable',
    'unpaid'
  );

  PERFORM pg_temp.assert_rejects_like(
    'select public.close_year_atomic(2092)',
    '%inte bokförd som kundfordran%',
    'year close rejects unpaid invoice without year-end receivable'
  );

  v_tx_id := gen_random_uuid();
  v_asset_id := gen_random_uuid();

  INSERT INTO public.transactions (
    id,
    user_id,
    date,
    description,
    amount,
    type,
    booked,
    source
  ) VALUES (
    v_tx_id,
    v_fixed_asset_user_id,
    date '2093-06-01',
    'KAN-57 inventarie',
    1000,
    'expense',
    true,
    'manual'
  );

  INSERT INTO public.journal_entries (
    user_id,
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date
  ) VALUES
    (v_fixed_asset_user_id, v_tx_id, 1, '1220', 1000, 0, 'KAN-57 inventarie', date '2093-06-01'),
    (v_fixed_asset_user_id, v_tx_id, 1, '1930', 0, 1000, 'KAN-57 inventarie', date '2093-06-01');

  INSERT INTO public.fixed_assets (
    id,
    user_id,
    name,
    acquisition_date,
    fiscal_year,
    supplier_country,
    connection_assessment,
    naturally_connected,
    threshold_basis_amount,
    taxable_base_amount,
    supplier_vat_amount,
    deductible_vat_amount,
    non_deductible_vat_amount,
    expensed_amount,
    capitalized_amount,
    payment_account_role,
    payment_account_number,
    vat_deduction_entitlement,
    useful_life_answer,
    decision_type,
    status,
    acquisition_transaction_id,
    rule_year,
    rule_version,
    price_base_amount,
    half_price_base_amount,
    audit_snapshot
  ) VALUES (
    v_asset_id,
    v_fixed_asset_user_id,
    'KAN-57 inventarie',
    date '2093-06-01',
    2093,
    'SE',
    'standalone',
    false,
    1000,
    1000,
    0,
    0,
    0,
    0,
    1000,
    'business_payment_account',
    '1930',
    'none',
    'more_than_three_years_or_unknown',
    'capitalized',
    'active',
    v_tx_id,
    2093,
    'kan57-test',
    60000,
    30000,
    '{}'::jsonb
  );

  PERFORM pg_temp.set_auth(v_fixed_asset_user_id);
  PERFORM pg_temp.assert_rejects_like(
    'select public.close_year_atomic(2093)',
    '%inventarier behöver årsavskrivning%',
    'year close keeps fixed-asset depreciation blocker'
  );

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
    payment_status
  ) VALUES (
    v_both_user_id,
    'KAN57-BOTH',
    'KAN-57 bade faktura och inventarie',
    'SE',
    'SEK',
    date '2094-12-20',
    date '2094-12-20',
    date '2095-01-20',
    1250,
    1000,
    250,
    25,
    'taxable',
    'unpaid'
  );

  INSERT INTO public.transactions (
    id,
    user_id,
    date,
    description,
    amount,
    type,
    booked,
    source
  ) VALUES (
    gen_random_uuid(),
    v_both_user_id,
    date '2094-06-01',
    'KAN-57 inventarie och faktura',
    1000,
    'expense',
    true,
    'manual'
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    user_id,
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date
  ) VALUES
    (v_both_user_id, v_tx_id, 1, '1220', 1000, 0, 'KAN-57 inventarie och faktura', date '2094-06-01'),
    (v_both_user_id, v_tx_id, 1, '1930', 0, 1000, 'KAN-57 inventarie och faktura', date '2094-06-01');

  INSERT INTO public.fixed_assets (
    user_id,
    name,
    acquisition_date,
    fiscal_year,
    supplier_country,
    connection_assessment,
    naturally_connected,
    threshold_basis_amount,
    taxable_base_amount,
    supplier_vat_amount,
    deductible_vat_amount,
    non_deductible_vat_amount,
    expensed_amount,
    capitalized_amount,
    payment_account_role,
    payment_account_number,
    vat_deduction_entitlement,
    useful_life_answer,
    decision_type,
    status,
    acquisition_transaction_id,
    rule_year,
    rule_version,
    price_base_amount,
    half_price_base_amount,
    audit_snapshot
  ) VALUES (
    v_both_user_id,
    'KAN-57 inventarie och faktura',
    date '2094-06-01',
    2094,
    'SE',
    'standalone',
    false,
    1000,
    1000,
    0,
    0,
    0,
    0,
    1000,
    'business_payment_account',
    '1930',
    'none',
    'more_than_three_years_or_unknown',
    'capitalized',
    'active',
    v_tx_id,
    2094,
    'kan57-test',
    60000,
    30000,
    '{}'::jsonb
  );

  PERFORM pg_temp.set_auth(v_both_user_id);
  PERFORM pg_temp.assert_rejects_like(
    'select public.close_year_atomic(2094)',
    '%kundfaktura%',
    'year close still blocks customer invoice when invoice and fixed-asset blockers coexist'
  );

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
    payment_status
  ) VALUES (
    v_future_service_user_id,
    'KAN57-FUTURE-SERVICE',
    'KAN-57 framtida tjanstedatum',
    'SE',
    'SEK',
    date '2095-12-20',
    date '2096-01-05',
    date '2096-01-20',
    1250,
    1000,
    250,
    25,
    'taxable',
    'unpaid'
  );

  PERFORM pg_temp.set_auth(v_future_service_user_id);
  v_result := public.close_year_atomic(2095);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'future-service invoice does not block previous fiscal year');

  PERFORM pg_temp.assert_rejects_like(
    'select public.close_year_atomic(2096)',
    '%inte bokförd som kundfordran%',
    'future-service invoice blocks helper-selected fiscal year'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-56/KAN-57 DB regression rollback test completed.'
