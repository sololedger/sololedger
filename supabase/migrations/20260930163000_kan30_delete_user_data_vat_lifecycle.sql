-- KAN-30: include VAT lifecycle/application data in atomic admin user deletion.
--
-- The public admin deletion contract is still:
--   delete_user_data_atomic(uuid) succeeds only after all known SoloLedger-owned
--   public application rows for the selected user are gone.
--
-- tax_account_events and tax_account_movements remain immutable for ordinary
-- application paths. Their DELETE triggers allow deletion only while the
-- authoritative delete_user_data_atomic RPC has registered the current backend
-- and target user in the private deletion context table below.

CREATE TABLE IF NOT EXISTS public.delete_user_data_atomic_lifecycle_context (
  backend_pid integer NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT delete_user_data_atomic_lifecycle_context_pkey
    PRIMARY KEY (backend_pid, user_id)
);

COMMENT ON TABLE public.delete_user_data_atomic_lifecycle_context IS
  'Private per-backend context used only by delete_user_data_atomic to let immutable VAT lifecycle metadata be removed during full admin user deletion.';

REVOKE ALL ON TABLE public.delete_user_data_atomic_lifecycle_context FROM PUBLIC;
REVOKE ALL ON TABLE public.delete_user_data_atomic_lifecycle_context FROM anon;
REVOKE ALL ON TABLE public.delete_user_data_atomic_lifecycle_context FROM authenticated;
REVOKE ALL ON TABLE public.delete_user_data_atomic_lifecycle_context FROM service_role;
GRANT ALL ON TABLE public.delete_user_data_atomic_lifecycle_context TO postgres;

CREATE OR REPLACE FUNCTION public.prevent_tax_account_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

COMMENT ON FUNCTION public.prevent_tax_account_event_mutation()
  IS 'Prevents in-place mutation of tax_account_events except during the private delete_user_data_atomic full-user deletion context.';

REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_event_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_event_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_tax_account_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

COMMENT ON FUNCTION public.prevent_tax_account_movement_mutation()
  IS 'Prevents in-place mutation of tax_account_movements except during the private delete_user_data_atomic full-user deletion context.';

REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_movement_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_movement_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_tax_account_movements integer := 0;
  v_tax_account_events integer := 0;
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

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

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
      'tax_account_movements', v_tax_account_movements,
      'tax_account_events', v_tax_account_events,
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
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;
