BEGIN;

-- ============================================================
-- ensure_vat_periods
--
-- Creates the SoloLedger-managed VAT periods that belong to the
-- authenticated user's current VAT profile configuration.
--
-- Important:
-- - This function creates PERIOD STATE only.
-- - It does not create accounting transactions.
-- - It never modifies existing VAT periods.
-- - It never manages imported_history.
-- - It never guesses across overlapping/conflicting periods.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_vat_periods(
  p_through_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;

  v_vat_status text;
  v_period_type text;
  v_management_from date;

  v_effective_through date;

  v_period_start date;
  v_period_end date;

  v_created_count integer := 0;
  v_existing_count integer := 0;

  v_existing_period record;
BEGIN
  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Du måste vara inloggad för att skapa momsperioder.';
  END IF;

  -- ----------------------------------------------------------
  -- Read and lock the VAT profile configuration.
  --
  -- Locking the profile row gives VAT-period management a stable
  -- configuration during this operation.
  -- ----------------------------------------------------------
  SELECT
    p.vat_status,
    p.vat_period_type,
    p.vat_management_from
  INTO
    v_vat_status,
    v_period_type,
    v_management_from
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Ingen profil hittades för användaren.';
  END IF;

  -- ----------------------------------------------------------
  -- VAT configuration must be complete.
  -- ----------------------------------------------------------
  IF v_vat_status <> 'registered' THEN
    RAISE EXCEPTION
      'Momsperioder kan bara skapas för ett momsregistrerat företag.';
  END IF;

  IF v_period_type IS NULL
     OR v_period_type NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION
      'Företagets momsperiod är inte korrekt inställd.';
  END IF;

  IF v_management_from IS NULL THEN
    RAISE EXCEPTION
      'Startdatum för SoloLedgers momshantering saknas.';
  END IF;

  IF p_through_date IS NULL THEN
    RAISE EXCEPTION
      'Slutdatum för generering av momsperioder saknas.';
  END IF;

  -- ----------------------------------------------------------
  -- Do not generate periods into the future.
  --
  -- A caller may ask SoloLedger to ensure periods through an
  -- earlier date, but not use this RPC to manufacture arbitrary
  -- future VAT periods.
  -- ----------------------------------------------------------
  v_effective_through := LEAST(p_through_date, current_date);

  -- Nothing belongs to SoloLedger yet.
  IF v_effective_through < v_management_from THEN
    RETURN jsonb_build_object(
      'success', true,
      'created_count', 0,
      'existing_count', 0,
      'period_type', v_period_type,
      'management_from', v_management_from,
      'through_date', v_effective_through
    );
  END IF;

  -- ----------------------------------------------------------
  -- Determine the first FULL VAT period whose start is on or
  -- after vat_management_from.
  --
  -- If management starts in the middle of a calendar VAT period,
  -- that partial period is intentionally skipped.
  -- ----------------------------------------------------------
  IF v_period_type = 'month' THEN

    v_period_start := date_trunc('month', v_management_from)::date;

    IF v_period_start < v_management_from THEN
      v_period_start :=
        (v_period_start + INTERVAL '1 month')::date;
    END IF;

  ELSIF v_period_type = 'quarter' THEN

    v_period_start := date_trunc('quarter', v_management_from)::date;

    IF v_period_start < v_management_from THEN
      v_period_start :=
        (v_period_start + INTERVAL '3 months')::date;
    END IF;

  ELSE
    -- year
    v_period_start := date_trunc('year', v_management_from)::date;

    IF v_period_start < v_management_from THEN
      v_period_start :=
        (v_period_start + INTERVAL '1 year')::date;
    END IF;

  END IF;

  -- The first full period may itself start after the requested
  -- through-date.
  IF v_period_start > v_effective_through THEN
    RETURN jsonb_build_object(
      'success', true,
      'created_count', 0,
      'existing_count', 0,
      'period_type', v_period_type,
      'management_from', v_management_from,
      'through_date', v_effective_through
    );
  END IF;

  -- ----------------------------------------------------------
  -- Generate all complete calendar definitions up to and
  -- including the VAT period containing v_effective_through.
  -- ----------------------------------------------------------
  WHILE v_period_start <= v_effective_through LOOP

    IF v_period_type = 'month' THEN
      v_period_end :=
        (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    ELSIF v_period_type = 'quarter' THEN
      v_period_end :=
        (v_period_start + INTERVAL '3 months' - INTERVAL '1 day')::date;

    ELSE
      v_period_end :=
        (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
    END IF;

    -- --------------------------------------------------------
    -- Never create a new VAT period whose closing transaction
    -- would belong to an already locked bookkeeping year.
    --
    -- VAT closing is booked on period_end.
    -- --------------------------------------------------------
    IF EXISTS (
      SELECT 1
      FROM public.closed_years cy
      WHERE cy.user_id = v_user_id
        AND cy.year = EXTRACT(YEAR FROM v_period_end)::integer
    ) THEN
      RAISE EXCEPTION
        'Momsperioden % – % kan inte skapas eftersom räkenskapsår % är låst.',
        v_period_start,
        v_period_end,
        EXTRACT(YEAR FROM v_period_end)::integer;
    END IF;

    -- --------------------------------------------------------
    -- Exact existing period:
    -- leave it completely untouched.
    --
    -- This applies regardless of source/status. We must never
    -- reset historical or already-closed state.
    -- --------------------------------------------------------
    SELECT
      vp.id,
      vp.period_start,
      vp.period_end,
      vp.period_type,
      vp.status,
      vp.source
    INTO v_existing_period
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.period_start = v_period_start
      AND vp.period_end = v_period_end
    LIMIT 1;

    IF FOUND THEN

      -- An exact date range with a different period type means
      -- the stored state conflicts with the current profile.
      IF v_existing_period.period_type <> v_period_type THEN
        RAISE EXCEPTION
          'Befintlig momsperiod % – % har en annan periodtyp än företagets nuvarande momsinställning.',
          v_period_start,
          v_period_end;
      END IF;

      v_existing_count := v_existing_count + 1;

    ELSE

      -- ------------------------------------------------------
      -- No exact match exists.
      --
      -- Any overlap is ambiguous and must block generation.
      -- This prevents e.g. monthly periods from being placed
      -- inside an already-existing quarterly period after a
      -- profile setting has changed.
      -- ------------------------------------------------------
      SELECT
        vp.id,
        vp.period_start,
        vp.period_end,
        vp.period_type,
        vp.status,
        vp.source
      INTO v_existing_period
      FROM public.vat_periods vp
      WHERE vp.user_id = v_user_id
        AND vp.period_start <= v_period_end
        AND vp.period_end >= v_period_start
      ORDER BY vp.period_start
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION
          'Befintlig momsperiod % – % överlappar perioden % – %. Kontrollera momsinställningarna innan nya perioder skapas.',
          v_existing_period.period_start,
          v_existing_period.period_end,
          v_period_start,
          v_period_end;
      END IF;

      -- ------------------------------------------------------
      -- Create a new SoloLedger-managed OPEN period.
      -- ------------------------------------------------------
      INSERT INTO public.vat_periods (
        user_id,
        period_start,
        period_end,
        period_type,
        status,
        source
      )
      VALUES (
        v_user_id,
        v_period_start,
        v_period_end,
        v_period_type,
        'open',
        'sololedger'
      );

      v_created_count := v_created_count + 1;

    END IF;

    -- --------------------------------------------------------
    -- Advance to next calendar VAT period.
    -- --------------------------------------------------------
    IF v_period_type = 'month' THEN
      v_period_start :=
        (v_period_start + INTERVAL '1 month')::date;

    ELSIF v_period_type = 'quarter' THEN
      v_period_start :=
        (v_period_start + INTERVAL '3 months')::date;

    ELSE
      v_period_start :=
        (v_period_start + INTERVAL '1 year')::date;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'existing_count', v_existing_count,
    'period_type', v_period_type,
    'management_from', v_management_from,
    'through_date', v_effective_through
  );
END;
$$;


-- ============================================================
-- Permissions
-- ============================================================

REVOKE ALL
ON FUNCTION public.ensure_vat_periods(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.ensure_vat_periods(date)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.ensure_vat_periods(date)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.ensure_vat_periods(date)
TO service_role;


COMMENT ON FUNCTION public.ensure_vat_periods(date) IS
  'Ensures SoloLedger-managed VAT periods for the authenticated user from vat_management_from through the requested date. Creates only full calendar VAT periods, never modifies existing periods, blocks overlaps and periods whose period_end belongs to a locked bookkeeping year.';

COMMIT;