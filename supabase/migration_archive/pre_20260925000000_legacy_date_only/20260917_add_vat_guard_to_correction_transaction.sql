-- 3B.5a
-- Add VAT month concurrency locking and SoloLedger VAT-period state guard
-- to create_correction_transaction_atomic().
--
-- Built from the exact live pg_get_functiondef retrieved on 2026-09-17,
-- then revised after adversarial concurrency review.
--
-- Lock order:
--   all VAT month advisory locks -> transaction row locks -> protected reads/writes.
--
-- Existing correction writes are retained. A read-only pre-scan discovers every
-- VAT-relevant correction month before any row lock is taken; authoritative data
-- is then revalidated after row locking. Closed/declared SoloLedger VAT periods
-- block only corrections that actually write VAT-concurrency accounts.

CREATE OR REPLACE FUNCTION public.create_correction_transaction_atomic(p_original_tx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  v_original public.transactions%ROWTYPE;
  v_reversal public.transactions%ROWTYPE;

  v_original_ver_nr integer;
  v_reversal_ver_nr integer;

  v_correction_date date;
  v_next_ver_nr integer;
  v_next_reversal_ver_nr integer;

  v_corr_tx_id uuid;
  v_corr_reversal_tx_id uuid;

  v_entry_count integer;
  v_distinct_ver_count integer;
  v_reversal_found boolean := false;

  -- 3B.5a: read-only pre-scan + VAT concurrency state
  v_pre_original public.transactions%ROWTYPE;
  v_pre_reversal public.transactions%ROWTYPE;
  v_pre_reversal_found boolean := false;
  v_pre_original_vat_relevant boolean := false;
  v_pre_reversal_vat_relevant boolean := false;
  v_original_vat_relevant boolean := false;
  v_reversal_vat_relevant boolean := false;
  v_guard_date date;
  v_locked_vat_dates date[] := ARRAY[]::date[];
  v_actual_vat_dates date[] := ARRAY[]::date[];
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_original_tx_id IS NULL THEN
    RAISE EXCEPTION 'Originaltransaktion saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ── READ-ONLY PRE-SCAN ───────────────────────────────────────
  -- We must know every VAT-relevant correction month before taking any
  -- transaction row lock. Global order:
  -- VAT advisory locks -> other advisory locks -> row locks -> writes.
  SELECT *
    INTO v_pre_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  v_correction_date := greatest(current_date, v_pre_original.date);

  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_pre_original_vat_relevant;

  IF v_pre_original_vat_relevant THEN
    v_locked_vat_dates := array_append(v_locked_vat_dates, v_correction_date);
  END IF;

  IF v_pre_original.periodization_group_id IS NOT NULL
     AND coalesce(v_pre_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_pre_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_pre_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1;

    v_pre_reversal_found := FOUND;

    IF v_pre_reversal_found THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_pre_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_pre_reversal_vat_relevant;

      IF v_pre_reversal_vat_relevant THEN
        v_locked_vat_dates := array_append(v_locked_vat_dates, v_pre_reversal.date);
      END IF;
    END IF;
  END IF;

  -- Acquire all VAT month locks in one call. lock_vat_months() deduplicates
  -- calendar months and acquires them in chronological order.
  IF coalesce(array_length(v_locked_vat_dates, 1), 0) > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, v_locked_vat_dates);
  END IF;

  -- ── AUTHORITATIVE ROW LOCKS + REVALIDATION ───────────────────
  -- Only after VAT advisory locks are held may we take transaction row locks.
  SELECT *
    INTO v_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Fields that determine correction date / linked reversal must still match
  -- the pre-scan. If not, fail closed rather than acquiring a new VAT lock
  -- after a row lock.
  IF v_original.date IS DISTINCT FROM v_pre_original.date
     OR v_original.periodization_group_id IS DISTINCT FROM v_pre_original.periodization_group_id
     OR coalesce(v_original.is_periodized_reversal, false)
        IS DISTINCT FROM coalesce(v_pre_original.is_periodized_reversal, false) THEN
    RAISE EXCEPTION
      'Originaltransaktionen ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  v_correction_date := greatest(current_date, v_original.date);

  -- Server-side year lock for the actual correction date.
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_correction_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_correction_date)::int
      USING ERRCODE = '23514';
  END IF;

  -- Original journal must still be complete and unambiguous.
  SELECT
    count(*),
    count(DISTINCT ver_nr),
    min(ver_nr)
  INTO
    v_entry_count,
    v_distinct_ver_count,
    v_original_ver_nr
  FROM public.journal_entries
  WHERE transaction_id = p_original_tx_id
    AND user_id = v_user_id;

  IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte hämta originalbokföringen.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_distinct_ver_count <> 1 THEN
    RAISE EXCEPTION
      'Originaltransaktionen har inkonsekventa verifikationsnummer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  -- Friendly post-lock duplicate guard. The unique partial index
  -- transactions_one_correction_per_original remains the final DB invariant.
  -- This check runs only after the original transaction row is locked, so two
  -- concurrent corrections of the same original serialize before this read.
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND coalesce(t.is_correction, false) = true
      AND t.corrects_ver_nr = v_original_ver_nr
  ) THEN
    RAISE EXCEPTION
      'VER-% har redan korrigerats och kan inte korrigeras igen.',
      v_original_ver_nr
      USING ERRCODE = '23514';
  END IF;

  -- Recompute VAT relevance after the authoritative row lock.
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_original_vat_relevant;

  IF v_original_vat_relevant THEN
    v_actual_vat_dates := array_append(v_actual_vat_dates, v_correction_date);
  END IF;

  -- If original is the first half of a periodization, lock and correct the
  -- linked reversal in the same DB transaction, preserving existing behavior.
  IF v_original.periodization_group_id IS NOT NULL
     AND coalesce(v_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1
    FOR UPDATE;

    v_reversal_found := FOUND;

    IF v_reversal_found IS DISTINCT FROM v_pre_reversal_found
       OR (
         v_reversal_found
         AND (
           v_reversal.id IS DISTINCT FROM v_pre_reversal.id
           OR v_reversal.date IS DISTINCT FROM v_pre_reversal.date
         )
       ) THEN
      RAISE EXCEPTION
        'Periodiseringens vändningsverifikation ändrades under korrigeringen. Försök igen.'
        USING ERRCODE = '40001';
    END IF;

    IF v_reversal_found THEN
      IF EXISTS (
        SELECT 1
        FROM public.closed_years
        WHERE user_id = v_user_id
          AND year = extract(year from v_reversal.date)::int
      ) THEN
        RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
          extract(year from v_reversal.date)::int
          USING ERRCODE = '23514';
      END IF;

      SELECT
        count(*),
        count(DISTINCT ver_nr),
        min(ver_nr)
      INTO
        v_entry_count,
        v_distinct_ver_count,
        v_reversal_ver_nr
      FROM public.journal_entries
      WHERE transaction_id = v_reversal.id
        AND user_id = v_user_id;

      IF v_entry_count = 0 OR v_reversal_ver_nr IS NULL THEN
        RAISE EXCEPTION 'Kunde inte hämta vändningsverifikatets journalposter.'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_distinct_ver_count <> 1 THEN
        RAISE EXCEPTION
          'Vändningsverifikationen har inkonsekventa verifikationsnummer och kan inte korrigeras.'
          USING ERRCODE = '23514';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_reversal_vat_relevant;

      IF v_reversal_vat_relevant THEN
        v_actual_vat_dates := array_append(v_actual_vat_dates, v_reversal.date);
      END IF;
    END IF;
  END IF;

  -- The authoritative scan must not require any VAT month that was absent
  -- from the pre-scan. If it does, fail closed instead of violating lock order.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_actual_vat_dates) AS x(d)
      WHERE d IS NOT NULL
      EXCEPT
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_locked_vat_dates) AS x(d)
      WHERE d IS NOT NULL
    ) missing
  ) THEN
    RAISE EXCEPTION
      'Momsrelevant bokföringsdata ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ── VAT PERIOD STATE GUARD ───────────────────────────────────
  -- Only dates whose correction will actually write a VAT concurrency
  -- account are checked. imported_history does not block this guard.
  FOR v_guard_date IN
    SELECT DISTINCT d
    FROM unnest(v_actual_vat_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY d
  LOOP
    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_guard_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar korrigeringsdatum %. Korrigeringen stoppades för manuell kontroll.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för korrigeringsdatum % är redan stängd eller deklarerad. Korrigeringen kan inte genomföras.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── KORRIGERING AV ORIGINALVERIFIKATION ─────────────────────
  SELECT public.get_next_ver_nr(v_user_id) INTO v_next_ver_nr;

  IF v_next_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer.';
  END IF;

  INSERT INTO public.transactions (
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    is_correction,
    corrects_ver_nr,
    user_id
  ) VALUES (
    v_correction_date,
    '↩ Korrigering av VER-' || v_original_ver_nr || ' (' || coalesce(v_original.description, '') || ')',
    v_original.amount,
    v_original.type,
    v_original.vat_rate,
    true,
    true,
    v_original_ver_nr,
    v_user_id
  )
  RETURNING id INTO v_corr_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_corr_tx_id,
    v_next_ver_nr,
    e.account_number,
    e.credit,
    e.debit,
    'Korrigering av VER-' || v_original_ver_nr || ': ' || coalesce(e.description, ''),
    v_correction_date,
    v_user_id
  FROM public.journal_entries e
  WHERE e.transaction_id = p_original_tx_id
    AND e.user_id = v_user_id;

  -- ── PERIODISERINGENS VÄNDNINGSVERIFIKATION ──────────────────
  IF v_reversal_found THEN
    SELECT public.get_next_ver_nr(v_user_id) INTO v_next_reversal_ver_nr;

    IF v_next_reversal_ver_nr IS NULL THEN
      RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för reversalkorrigering.';
    END IF;

    INSERT INTO public.transactions (
      date,
      description,
      amount,
      type,
      vat_rate,
      booked,
      is_correction,
      corrects_ver_nr,
      user_id
    ) VALUES (
      v_reversal.date,
      '↩ Korrigering av VER-' || v_reversal_ver_nr || ' (' || coalesce(v_reversal.description, '') || ')',
      v_reversal.amount,
      v_reversal.type,
      v_reversal.vat_rate,
      true,
      true,
      v_reversal_ver_nr,
      v_user_id
    )
    RETURNING id INTO v_corr_reversal_tx_id;

    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    )
    SELECT
      v_corr_reversal_tx_id,
      v_next_reversal_ver_nr,
      e.account_number,
      e.credit,
      e.debit,
      'Korrigering av VER-' || v_reversal_ver_nr || ': ' || coalesce(e.description, ''),
      v_reversal.date,
      v_user_id
    FROM public.journal_entries e
    WHERE e.transaction_id = v_reversal.id
      AND e.user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_corr_tx_id,
    'ver_nr', v_next_ver_nr,
    'corrects_ver_nr', v_original_ver_nr,
    'reversal_correction_transaction_id', v_corr_reversal_tx_id,
    'reversal_correction_ver_nr', v_next_reversal_ver_nr
  );
END;
$function$;
