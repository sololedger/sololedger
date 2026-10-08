BEGIN;

ALTER FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb)
  RENAME TO book_fixed_asset_acquisition_atomic_unchecked_kan54;

REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) TO postgres;

CREATE OR REPLACE FUNCTION public.assert_fixed_asset_vat_deduction_allowed(
  p_user_id uuid,
  p_vat_deduction_entitlement text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_default_deduction_entitlement text;
BEGIN
  IF p_vat_deduction_entitlement <> 'full' THEN
    RETURN;
  END IF;

  SELECT p.default_deduction_entitlement
    INTO v_default_deduction_entitlement
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR SHARE;

  IF v_default_deduction_entitlement IS DISTINCT FROM 'full' THEN
    RAISE EXCEPTION 'Företagsprofilen tillåter inte fullt momsavdrag för inventarieinköp. Välj Inget momsavdrag eller uppdatera Profil först.'
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_fixed_asset_vat_deduction_allowed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_fixed_asset_vat_deduction_allowed(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.assert_fixed_asset_vat_deduction_allowed(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_fixed_asset_vat_deduction_allowed(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.assert_fixed_asset_vat_deduction_allowed(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.book_fixed_asset_acquisition_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_idempotency_key uuid;
  v_has_existing_idempotency boolean := false;
  v_vat_deduction_entitlement text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Inventarieunderlaget är ogiltigt.'
      USING ERRCODE = '22023';
  END IF;

  IF nullif(p_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas för inventarieköpet.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltig idempotency-nyckel för inventarieköpet.'
      USING ERRCODE = '22023';
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.fixed_asset_acquisition_idempotency i
    WHERE i.user_id = v_user_id
      AND i.idempotency_key = v_idempotency_key
  ) INTO v_has_existing_idempotency;

  IF NOT v_has_existing_idempotency THEN
    v_vat_deduction_entitlement := btrim(coalesce(p_payload->>'vat_deduction_entitlement', ''));
    PERFORM public.assert_fixed_asset_vat_deduction_allowed(
      v_user_id,
      v_vat_deduction_entitlement
    );
  END IF;

  RETURN public.book_fixed_asset_acquisition_atomic_unchecked_kan54(p_payload);
END;
$function$;

REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) TO service_role;

COMMENT ON FUNCTION public.assert_fixed_asset_vat_deduction_allowed(uuid, text) IS
  'KAN-54 guard: full VAT deduction for fixed-asset acquisitions is allowed only when the company profile explicitly has full default input-VAT deduction entitlement.';

COMMENT ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) IS
  'Books K1 Swedish equipment purchases atomically and enforces KAN-54 company-profile input-VAT deduction entitlement before delegating to the KAN-36 acquisition implementation.';

COMMENT ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) IS
  'Internal KAN-36 fixed-asset acquisition implementation retained for KAN-54 wrapper delegation. Not executable by authenticated clients.';

COMMIT;
