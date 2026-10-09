-- KAN-56/KAN-57: repair confirmed DB regressions introduced by KAN-36.
--
-- This migration intentionally redefines only the affected public RPC/trigger
-- functions. It preserves KAN-36 fixed-asset year-close guards and restores
-- KAN-30/KAN-46/KAN-52 deletion and customer-invoice year-close safeguards.

DO $kan56_lifecycle_context_column$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delete_user_data_atomic_lifecycle_context'
      AND column_name = 'pid'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delete_user_data_atomic_lifecycle_context'
      AND column_name = 'backend_pid'
  ) THEN
    ALTER TABLE public.delete_user_data_atomic_lifecycle_context
      RENAME COLUMN pid TO backend_pid;
  END IF;
END;
$kan56_lifecycle_context_column$;

CREATE OR REPLACE FUNCTION public.prevent_tax_account_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND EXISTS (
       SELECT 1
       FROM public.delete_user_data_atomic_lifecycle_context ctx
       WHERE ctx.backend_pid = pg_backend_pid()
         AND ctx.user_id = OLD.user_id
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Tax-account events are immutable. Create a new settlement event instead.'
    USING ERRCODE = '25006';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_tax_account_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND EXISTS (
       SELECT 1
       FROM public.delete_user_data_atomic_lifecycle_context ctx
       WHERE ctx.backend_pid = pg_backend_pid()
         AND ctx.user_id = OLD.user_id
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Tax-account movements are immutable. Create a future semantic reversal instead.'
    USING ERRCODE = '25006';
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_event_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_event_mutation() TO service_role;

REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_movement_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_movement_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_fixed_asset_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.delete_user_data_atomic_lifecycle_context ctx
    WHERE ctx.backend_pid = pg_backend_pid()
      AND ctx.user_id = OLD.user_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Inventariehändelser är låsta och kan bara ändras genom kontrollerade SoloLedger-flöden.'
    USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_fixed_asset_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_fixed_asset_event_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_fixed_asset_event_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_fixed_asset_event_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_fixed_asset_event_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.close_year_atomic(
  p_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_existing_closed_at timestamptz;
  v_open_vat_period record;
  v_unhandled_invoice record;
  v_year_end date;
  v_unhandled_fixed_asset_count integer := 0;
  v_fixed_asset_basis numeric := 0;
  v_unclassified_negative_bank numeric := 0;
  v_balance_diff numeric := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du måste vara inloggad för att låsa ett räkenskapsår.';
  END IF;

  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.';
  END IF;

  v_year_end := make_date(p_year, 12, 31);

  SELECT cy.closed_at
    INTO v_existing_closed_at
  FROM public.closed_years cy
  WHERE cy.user_id = v_user_id
    AND cy.year = p_year
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'År % är redan låst.', p_year;
  END IF;

  SELECT
    vp.id,
    vp.period_start,
    vp.period_end,
    vp.period_type
    INTO v_open_vat_period
  FROM public.vat_periods vp
  WHERE vp.user_id = v_user_id
    AND vp.source = 'sololedger'
    AND vp.status = 'open'
    AND vp.period_end >= make_date(p_year, 1, 1)
    AND vp.period_end < make_date(p_year + 1, 1, 1)
  ORDER BY vp.period_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom momsperioden % – % fortfarande är öppen.',
      p_year,
      v_open_vat_period.period_start,
      v_open_vat_period.period_end;
  END IF;

  SELECT
    ci.id,
    ci.invoice_number,
    ci.vat_treatment
    INTO v_unhandled_invoice
  FROM public.customer_invoices ci
  WHERE ci.user_id = v_user_id
    AND ci.payment_status = 'unpaid'
    AND public.customer_invoice_year_end_fiscal_year(ci.invoice_date, ci.service_date) = p_year
    AND ci.invoice_date <= v_year_end
    AND ci.service_date <= v_year_end
    AND ci.vat_treatment = 'unknown'
  ORDER BY ci.invoice_date, ci.invoice_number
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom kundfaktura % har osäker momsstatus. Slutför momsfakta eller hantera fakturan innan årslås.',
      p_year,
      v_unhandled_invoice.invoice_number;
  END IF;

  SELECT
    ci.id,
    ci.invoice_number,
    ci.vat_treatment
    INTO v_unhandled_invoice
  FROM public.customer_invoices ci
  WHERE ci.user_id = v_user_id
    AND ci.payment_status = 'unpaid'
    AND public.customer_invoice_year_end_fiscal_year(ci.invoice_date, ci.service_date) = p_year
    AND ci.invoice_date <= v_year_end
    AND ci.service_date <= v_year_end
    AND ci.vat_treatment <> 'unknown'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_invoice_bookings cib
      WHERE cib.user_id = ci.user_id
        AND cib.invoice_id = ci.id
        AND cib.booking_kind = 'year_end_receivable'
        AND cib.fiscal_year = p_year
    )
  ORDER BY ci.invoice_date, ci.invoice_number
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom kundfaktura % är obetald och ännu inte bokförd som kundfordran per 31/12.',
      p_year,
      v_unhandled_invoice.invoice_number;
  END IF;

  SELECT count(*)::integer
    INTO v_unhandled_fixed_asset_count
  FROM public.fixed_assets fa
  WHERE fa.user_id = v_user_id
    AND fa.decision_type = 'capitalized'
    AND fa.status = 'active'
    AND fa.acquisition_date <= v_year_end;

  SELECT round(coalesce(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 0), 2)
    INTO v_fixed_asset_basis
  FROM public.journal_entries je
  WHERE je.user_id = v_user_id
    AND je.date <= v_year_end
    AND je.account_number BETWEEN '1220' AND '1249';

  IF v_unhandled_fixed_asset_count > 0
     AND coalesce(v_fixed_asset_basis, 0) > 0
     AND NOT EXISTS (
       SELECT 1
       FROM public.fixed_asset_depreciation_runs r
       WHERE r.user_id = v_user_id
         AND r.fiscal_year = p_year
     ) THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom inventarier behöver årsavskrivning.',
      p_year
      USING ERRCODE = '23514';
  END IF;

  WITH account_balances AS (
    SELECT
      je.account_number,
      round(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 2)::numeric AS balance,
      substring(je.account_number from 1 for 1) AS account_class,
      CASE
        WHEN je.account_number ~ '^[0-9]{4}$' THEN je.account_number::integer
        ELSE NULL
      END AS account_number_int
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date <= v_year_end
    GROUP BY je.account_number
  ),
  sums AS (
    SELECT
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1000 AND 1099), 0) AS raw_b1,
      coalesce(sum(balance) FILTER (
        WHERE account_number_int BETWEEN 1110 AND 1119
           OR account_number_int BETWEEN 1150 AND 1159
      ), 0) AS raw_b2,
      coalesce(sum(balance) FILTER (
        WHERE account_number_int BETWEEN 1130 AND 1139
           OR account_number_int BETWEEN 1180 AND 1189
      ), 0) AS raw_b3,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1220 AND 1249), 0) AS raw_b4,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1300 AND 1399), 0) AS raw_b5,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1400 AND 1499), 0) AS raw_b6,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1500 AND 1599), 0) AS raw_b7,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1600 AND 1899), 0) AS raw_b8,
      coalesce(sum(greatest(balance, 0)) FILTER (WHERE account_number_int BETWEEN 1900 AND 1999), 0) AS b9,
      coalesce(sum(-balance) FILTER (
        WHERE account_number_int BETWEEN 1900 AND 1999
          AND balance < -0.005
      ), 0) AS unclassified_negative_bank,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 2300 AND 2399), 0) AS raw_b13,
      coalesce(sum(balance) FILTER (
        WHERE account_number LIKE '261%'
           OR account_number LIKE '262%'
           OR account_number LIKE '263%'
           OR account_number LIKE '264%'
           OR account_number LIKE '265%'
           OR account_number LIKE '266%'
           OR account_number LIKE '271%'
           OR account_number LIKE '273%'
      ), 0) AS tax_raw,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 2440 AND 2449), 0) AS raw_b15,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 2900 AND 2999), 0) AS raw_b16,
      coalesce(sum(balance) FILTER (WHERE account_number = '2010'), 0) AS balance_2010,
      coalesce(sum(balance) FILTER (WHERE account_number = '2019'), 0) AS balance_2019,
      coalesce(sum(balance) FILTER (WHERE account_number IN ('2011', '2012', '2013', '2014')), 0) AS withdrawals,
      coalesce(sum(balance) FILTER (WHERE account_number IN ('2017', '2018')), 0) AS owner_deposits_raw,
      coalesce(sum(-balance) FILTER (
        WHERE account_class IN ('3', '4', '5', '6', '7', '8')
          AND account_number !~ '^899[0-9]$'
      ), 0) AS cumulative_result
    FROM account_balances
  ),
  ne_rows AS (
    SELECT
      round(greatest(raw_b1, 0), 2) AS b1,
      round(greatest(raw_b2, 0), 2) AS b2,
      round(greatest(raw_b3, 0), 2) AS b3,
      round(greatest(raw_b4, 0), 2) AS b4,
      round(greatest(raw_b5, 0), 2) AS b5,
      round(greatest(raw_b6, 0), 2) AS b6,
      round(greatest(raw_b7, 0), 2) AS b7,
      round(greatest(raw_b8 + greatest(tax_raw, 0), 0), 2) AS b8,
      round(greatest(b9, 0), 2) AS b9,
      round(
        (-balance_2010 - balance_2019)
        + cumulative_result
        + (-owner_deposits_raw)
        - withdrawals,
        2
      ) AS b10_total,
      round(greatest(-raw_b13, 0), 2) AS b13,
      round(greatest(-tax_raw, 0), 2) AS b14,
      round(greatest(-raw_b15, 0), 2) AS b15,
      round(greatest(-raw_b16, 0), 2) AS b16,
      round(unclassified_negative_bank, 2) AS unclassified_negative_bank
    FROM sums
  )
  SELECT
    coalesce(unclassified_negative_bank, 0),
    round(
      coalesce(b1, 0) + coalesce(b2, 0) + coalesce(b3, 0) + coalesce(b4, 0)
      + coalesce(b5, 0) + coalesce(b6, 0) + coalesce(b7, 0)
      + coalesce(b8, 0) + coalesce(b9, 0)
      - (
        coalesce(b10_total, 0) + coalesce(b13, 0) + coalesce(b14, 0)
        + coalesce(b15, 0) + coalesce(b16, 0)
      ),
      2
    )
    INTO v_unclassified_negative_bank, v_balance_diff
  FROM ne_rows;

  IF coalesce(v_unclassified_negative_bank, 0) > 0 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom ett eller flera 19xx-konton har negativt saldo som inte kan placeras säkert i förenklat årsbokslut.',
      p_year
      USING ERRCODE = '23514';
  END IF;

  IF abs(coalesce(v_balance_diff, 0)) > 0.01 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom förenklat årsbokslut inte balanserar (diff % kr).',
      p_year,
      v_balance_diff
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    INSERT INTO public.closed_years (
      user_id,
      year
    ) VALUES (
      v_user_id,
      p_year
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'År % är redan låst.', p_year;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'year', p_year,
    'closed_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role text;
  v_fixed_asset_depreciation_runs integer := 0;
  v_fixed_asset_events integer := 0;
  v_fixed_asset_acquisition_idempotency integer := 0;
  v_fixed_assets integer := 0;
  v_fixed_asset_acquisition_groups integer := 0;
  v_customer_invoice_bookings integer := 0;
  v_customer_invoices integer := 0;
  v_tax_account_movements integer := 0;
  v_tax_account_events integer := 0;
  v_vat_v2_booking_idempotency integer := 0;
  v_vat_audit_snapshots integer := 0;
  v_vat_periods integer := 0;
  v_company_payment_account_roles integer := 0;
  v_journal_entries integer := 0;
  v_transactions integer := 0;
  v_favorites integer := 0;
  v_import_batches integer := 0;
  v_accounts integer := 0;
  v_closed_years integer := 0;
  v_ver_nr_sequences integer := 0;
  v_profiles integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id krävs.' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Användaren hittades inte.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin-konton kan inte raderas här.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (
    backend_pid,
    user_id
  ) VALUES (
    pg_backend_pid(),
    p_user_id
  )
  ON CONFLICT (backend_pid, user_id)
  DO UPDATE SET created_at = excluded.created_at;

  DELETE FROM public.fixed_asset_depreciation_runs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_depreciation_runs = ROW_COUNT;

  DELETE FROM public.fixed_asset_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_events = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_idempotency = ROW_COUNT;

  DELETE FROM public.fixed_assets WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_assets = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_groups WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_groups = ROW_COUNT;

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.customer_invoices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoices = ROW_COUNT;

  DELETE FROM public.vat_v2_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_v2_booking_idempotency = ROW_COUNT;

  DELETE FROM public.vat_audit_snapshots WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_audit_snapshots = ROW_COUNT;

  DELETE FROM public.vat_periods WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_periods = ROW_COUNT;

  DELETE FROM public.company_payment_account_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_company_payment_account_roles = ROW_COUNT;

  DELETE FROM public.journal_entries WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_journal_entries = ROW_COUNT;

  DELETE FROM public.transactions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  DELETE FROM public.favorites WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_favorites = ROW_COUNT;

  DELETE FROM public.import_batches WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_import_batches = ROW_COUNT;

  DELETE FROM public.accounts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  DELETE FROM public.closed_years WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_closed_years = ROW_COUNT;

  DELETE FROM public.ver_nr_sequences WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ver_nr_sequences = ROW_COUNT;

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  IF v_profiles <> 1 THEN
    RAISE EXCEPTION 'Profilraderingen gav oväntat resultat.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted', jsonb_build_object(
      'fixed_asset_depreciation_runs', v_fixed_asset_depreciation_runs,
      'fixed_asset_events', v_fixed_asset_events,
      'fixed_asset_acquisition_idempotency', v_fixed_asset_acquisition_idempotency,
      'fixed_assets', v_fixed_assets,
      'fixed_asset_acquisition_groups', v_fixed_asset_acquisition_groups,
      'customer_invoice_bookings', v_customer_invoice_bookings,
      'customer_invoices', v_customer_invoices,
      'tax_account_movements', v_tax_account_movements,
      'tax_account_events', v_tax_account_events,
      'vat_v2_booking_idempotency', v_vat_v2_booking_idempotency,
      'vat_audit_snapshots', v_vat_audit_snapshots,
      'vat_periods', v_vat_periods,
      'company_payment_account_roles', v_company_payment_account_roles,
      'journal_entries', v_journal_entries,
      'transactions', v_transactions,
      'favorites', v_favorites,
      'import_batches', v_import_batches,
      'accounts', v_accounts,
      'closed_years', v_closed_years,
      'ver_nr_sequences', v_ver_nr_sequences,
      'profiles', v_profiles
    )
  );
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;

COMMENT ON FUNCTION public.prevent_fixed_asset_event_mutation() IS
  'Prevents in-place fixed-asset event mutation except during the private delete_user_data_atomic full-user deletion context.';

COMMENT ON FUNCTION public.prevent_tax_account_event_mutation() IS
  'Prevents in-place mutation of tax_account_events except during the private delete_user_data_atomic full-user deletion context.';

COMMENT ON FUNCTION public.prevent_tax_account_movement_mutation() IS
  'Prevents in-place mutation of tax_account_movements except during the private delete_user_data_atomic full-user deletion context.';

COMMENT ON FUNCTION public.close_year_atomic(integer) IS
  'Atomically locks a bookkeeping year for the authenticated user. Blocks open SoloLedger VAT periods, unhandled unpaid customer invoices, mandatory fixed-asset depreciation, NE imbalance, or unresolved negative 19xx balances.';

COMMENT ON FUNCTION public.delete_user_data_atomic(uuid) IS
  'Atomically deletes all known SoloLedger-owned application data for a non-admin user through the admin deletion flow, preserving private lifecycle trigger context and returning per-table counts.';
