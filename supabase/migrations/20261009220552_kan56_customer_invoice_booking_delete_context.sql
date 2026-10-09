-- KAN-56 follow-up: allow customer invoice booking history to be deleted only
-- inside the private, atomic admin user-deletion lifecycle.
--
-- Normal customer invoice booking UPDATE/DELETE remains blocked. The only
-- exception is DELETE in the same backend and tenant-specific context that
-- delete_user_data_atomic creates for full-user deletion.

CREATE OR REPLACE FUNCTION public.prevent_customer_invoice_booking_mutation()
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

  RAISE EXCEPTION 'Kundfakturabokningar är låsta historikposter och kan inte ändras eller raderas.'
    USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_customer_invoice_booking_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_customer_invoice_booking_mutation() TO service_role;

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

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

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

COMMENT ON FUNCTION public.prevent_customer_invoice_booking_mutation() IS
  'Prevents in-place customer invoice booking mutation except DELETE during the private delete_user_data_atomic full-user deletion context.';

COMMENT ON FUNCTION public.delete_user_data_atomic(uuid) IS
  'Atomically deletes all known SoloLedger-owned application data for a non-admin user through the admin deletion flow, preserving private lifecycle trigger context through protected history deletes and returning per-table counts.';
