BEGIN;

-- ============================================================
-- Secure year closing
--
-- Year closing must go through one controlled server-side path.
--
-- Reasons:
-- 1. The previous client flow performed a direct INSERT into
--    closed_years.
-- 2. VAT closing is booked on vat_periods.period_end.
-- 3. A year must therefore not be locked while a SoloLedger-
--    managed VAT period whose closing belongs to that year is
--    still open.
--
-- The function is SECURITY DEFINER because authenticated users
-- will no longer receive direct INSERT permission on
-- public.closed_years.
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_year_atomic(
  p_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_closed_at timestamptz;
  v_open_vat_period record;
BEGIN
  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du måste vara inloggad för att låsa ett räkenskapsår.';
  END IF;

  -- ----------------------------------------------------------
  -- Basic year validation
  --
  -- SoloLedger currently works with normal calendar-year
  -- bookkeeping. Keep the validation deliberately broad here;
  -- the important invariant is that a real four-digit year is
  -- supplied.
  -- ----------------------------------------------------------
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.';
  END IF;

  -- ----------------------------------------------------------
  -- Idempotency / already closed
  --
  -- Lock an existing row if present so concurrent calls for the
  -- same existing year cannot race past this check.
  -- The UNIQUE(user_id, year) constraint remains the final
  -- protection for concurrent first-time inserts.
  -- ----------------------------------------------------------
  SELECT cy.closed_at
    INTO v_existing_closed_at
  FROM public.closed_years cy
  WHERE cy.user_id = v_user_id
    AND cy.year = p_year
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'År % är redan låst.', p_year;
  END IF;

  -- ----------------------------------------------------------
  -- VAT precondition
  --
  -- Only SoloLedger-managed VAT periods matter here.
  --
  -- Closing a VAT period creates its accounting closing entry
  -- on period_end. Therefore a year may not be locked while an
  -- OPEN SoloLedger VAT period has period_end inside that year.
  --
  -- imported_history is intentionally excluded: SoloLedger must
  -- never create normal VAT closing entries for imported history.
  -- ----------------------------------------------------------
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

  -- ----------------------------------------------------------
  -- Create the year lock.
  --
  -- closed_at uses the table default.
  -- UNIQUE(user_id, year) is also the final concurrency guard.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO public.closed_years (
      user_id,
      year
    )
    VALUES (
      v_user_id,
      p_year
    )
    RETURNING closed_at
      INTO v_existing_closed_at;

  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'År % är redan låst.', p_year;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'year', p_year,
    'closed_at', v_existing_closed_at
  );
END;
$$;

-- ============================================================
-- Direct client mutation is no longer allowed.
-- Reading remains unchanged so isYearClosed() can continue to
-- query closed_years directly.
-- ============================================================

REVOKE INSERT ON TABLE public.closed_years FROM authenticated;

-- Remove the now-obsolete direct INSERT RLS policy.
DROP POLICY IF EXISTS "Användare kan bara låsa sina egna år"
  ON public.closed_years;

-- Explicit function permissions.
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer)
  TO service_role;

COMMENT ON FUNCTION public.close_year_atomic(integer) IS
  'Atomically locks a bookkeeping year for the authenticated user. Blocks locking when an open SoloLedger-managed VAT period has its period_end in the year.';

COMMIT;