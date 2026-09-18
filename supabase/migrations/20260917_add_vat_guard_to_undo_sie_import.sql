-- KAN-5 migration candidate — reviewed and rollback-tested; do not run permanently without explicit approval.
-- 3B.5a: VAT concurrency/state guard for undo_sie_import_atomic().
-- Built from the exact live pg_get_functiondef retrieved on 2026-09-17.
--
-- Intended global lock order:
--   all VAT month advisory locks -> other advisory locks -> row locks -> protected reads/writes.
--
-- This draft moves the existing import_batches/transactions row locks behind a
-- read-only pre-scan that discovers every VAT-relevant undo month. It then
-- revalidates authoritative batch/transaction state after row locking.
--
-- Hold for adversarial review before live execution.

CREATE OR REPLACE FUNCTION public.undo_sie_import_atomic(p_import_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.import_batches%ROWTYPE;
  v_original public.transactions%ROWTYPE;

  v_original_ver_nr integer;
  v_next_ver_nr integer;
  v_correction_date date;
  v_corr_tx_id uuid;

  v_entry_count integer;
  v_distinct_ver_count integer;
  v_linked_tx_count integer;
  v_normal_import_count integer;
  v_opening_balance_count integer;
  v_correction_count integer := 0;

  -- 3B.5a: read-only pre-scan + VAT concurrency state
  v_pre_batch public.import_batches%ROWTYPE;
  v_pre_linked_tx_count integer := 0;
  v_pre_transaction_fingerprint jsonb := '[]'::jsonb;
  v_actual_transaction_fingerprint jsonb := '[]'::jsonb;
  v_locked_vat_dates date[] := ARRAY[]::date[];
  v_actual_vat_dates date[] := ARRAY[]::date[];
  v_guard_date date;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_import_batch_id IS NULL THEN
    RAISE EXCEPTION 'Import-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ── READ-ONLY PRE-SCAN ───────────────────────────────────────
  -- Discover every VAT-relevant undo month before taking any row lock.
  -- Global order:
  -- VAT advisory locks -> other advisory locks -> row locks -> protected writes.
  SELECT *
    INTO v_pre_batch
  FROM public.import_batches
  WHERE id = p_import_batch_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIE-importen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)
    INTO v_pre_linked_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance');

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'date', t.date,
               'source', t.source,
               'import_batch_id', t.import_batch_id
             )
             ORDER BY t.id
           ),
           '[]'::jsonb
         )
    INTO v_pre_transaction_fingerprint
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance');

  SELECT coalesce(array_agg(DISTINCT greatest(current_date, t.date)), ARRAY[]::date[])
    INTO v_locked_vat_dates
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries e
      WHERE e.transaction_id = t.id
        AND e.user_id = v_user_id
        AND public.vat_concurrency_account(e.account_number)
    );

  IF coalesce(array_length(v_locked_vat_dates, 1), 0) > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, v_locked_vat_dates);
  END IF;

  -- ── AUTHORITATIVE ROW LOCKS ──────────────────────────────────
  -- Batch row lock comes only after every required VAT month lock.
  SELECT *
    INTO v_batch
  FROM public.import_batches
  WHERE id = p_import_batch_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIE-importen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  -- Fail closed if batch identity/state used during pre-scan changed.
  IF v_batch.status IS DISTINCT FROM v_pre_batch.status
     OR v_batch.imported_count IS DISTINCT FROM v_pre_batch.imported_count
     OR v_batch.file_hash IS DISTINCT FROM v_pre_batch.file_hash THEN
    RAISE EXCEPTION
      'SIE-importens status eller innehåll ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  IF v_batch.status = 'undone' THEN
    RAISE EXCEPTION 'SIE-importen är redan ångrad.'
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status <> 'completed' THEN
    RAISE EXCEPTION 'Endast en slutförd SIE-import kan ångras (status: %).', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- A previous/partial undo must never be hidden behind batch status.
  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source = 'sie_import_undo'
  ) THEN
    RAISE EXCEPTION 'Importen har redan automatiska rättelser och kan inte ångras igen.'
      USING ERRCODE = '23514';
  END IF;

  -- Lock every imported original deterministically, after the batch row lock.
  PERFORM 1
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance')
  ORDER BY id
  FOR UPDATE;

  -- Revalidate the authoritative transaction set after row locking.
  SELECT count(*)
    INTO v_linked_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance');

  IF v_linked_tx_count IS DISTINCT FROM v_pre_linked_tx_count THEN
    RAISE EXCEPTION
      'SIE-importens transaktioner ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'date', t.date,
               'source', t.source,
               'import_batch_id', t.import_batch_id
             )
             ORDER BY t.id
           ),
           '[]'::jsonb
         )
    INTO v_actual_transaction_fingerprint
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance');

  IF v_actual_transaction_fingerprint IS DISTINCT FROM v_pre_transaction_fingerprint THEN
    RAISE EXCEPTION
      'SIE-importens transaktionsuppsättning ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- Stabilize original journal rows after transaction row locks and before protected VAT reads/writes.
  PERFORM 1
  FROM public.journal_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND e.user_id = v_user_id
  ORDER BY e.transaction_id, e.id
  FOR UPDATE OF e;

  -- Recompute every VAT-relevant undo date from authoritative data.
  SELECT coalesce(array_agg(DISTINCT greatest(current_date, t.date)), ARRAY[]::date[])
    INTO v_actual_vat_dates
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries e
      WHERE e.transaction_id = t.id
        AND e.user_id = v_user_id
        AND public.vat_concurrency_account(e.account_number)
    );

  -- Never acquire a new VAT lock after row locks. If authoritative data would
  -- require a month absent from pre-scan, fail closed and let the caller retry.
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
      'Momsrelevant importdata ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ── VAT PERIOD STATE GUARD ───────────────────────────────────
  FOR v_guard_date IN
    SELECT DISTINCT d
    FROM unnest(v_actual_vat_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY d
  LOOP
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE vp.status IN ('closed', 'declared'))::integer
    INTO v_matching_vat_periods, v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_guard_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar ångringens bokföringsdatum %. Ångringen stoppades för manuell kontroll.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för ångringens bokföringsdatum % är redan stängd eller deklarerad. SIE-importen kan inte ångras.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── EXISTING FULL-BATCH VALIDATION ───────────────────────────
  -- Keep the existing all-or-nothing checks before the first correction write.
  SELECT count(*)
    INTO v_normal_import_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source = 'sie_import'
    AND NOT (
      description = 'Öppningsbalans'
      AND source_ver_series IS NULL
      AND source_ver_number IS NULL
    );

  IF v_normal_import_count <> v_batch.imported_count THEN
    RAISE EXCEPTION
      'Importen kan inte ångras automatiskt eftersom dess importerade verifikationer inte längre är kompletta (% av % hittades).',
      v_normal_import_count, v_batch.imported_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_opening_balance_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND (
      source = 'sie_opening_balance'
      OR (
        source = 'sie_import'
        AND description = 'Öppningsbalans'
        AND source_ver_series IS NULL
        AND source_ver_number IS NULL
      )
    );

  IF v_opening_balance_count > 1 THEN
    RAISE EXCEPTION 'Importen innehåller fler än en ingående balans och kan inte ångras automatiskt.'
      USING ERRCODE = '23514';
  END IF;

  IF v_linked_tx_count = 0 THEN
    RAISE EXCEPTION 'Importen saknar bokförda transaktioner och kan inte ångras automatiskt.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validate the entire authoritative batch before the first correction write.
  FOR v_original IN
    SELECT *
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source IN ('sie_import', 'sie_opening_balance')
    ORDER BY date, id
  LOOP
    SELECT
      count(*),
      count(DISTINCT ver_nr),
      min(ver_nr)
    INTO
      v_entry_count,
      v_distinct_ver_count,
      v_original_ver_nr
    FROM public.journal_entries
    WHERE transaction_id = v_original.id
      AND user_id = v_user_id;

    IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom en importerad verifikation saknar journalposter.'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_distinct_ver_count <> 1 THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom en importerad transaktion har inkonsekventa verifikationsnummer.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.transactions c
      WHERE c.user_id = v_user_id
        AND coalesce(c.is_correction, false) = true
        AND c.corrects_ver_nr = v_original_ver_nr
    ) THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom VER-% redan har korrigerats.',
        v_original_ver_nr
        USING ERRCODE = '23514';
    END IF;

    v_correction_date := greatest(current_date, v_original.date);

    IF EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year = extract(year from v_correction_date)::int
    ) THEN
      RAISE EXCEPTION
        'Importen kan inte ångras eftersom korrigeringsåret % är låst (VER-%).',
        extract(year from v_correction_date)::int,
        v_original_ver_nr
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── Skapa rättelser ────────────────────────────────────────
  -- Först när hela batchen är validerad skapar vi en spegelverifikation
  -- per importerad transaktion.
  FOR v_original IN
    SELECT *
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source IN ('sie_import', 'sie_opening_balance')
    ORDER BY date, id
  LOOP
    SELECT min(ver_nr)
      INTO v_original_ver_nr
    FROM public.journal_entries
    WHERE transaction_id = v_original.id
      AND user_id = v_user_id;

    v_correction_date := greatest(current_date, v_original.date);

    SELECT public.get_next_ver_nr(v_user_id)
      INTO v_next_ver_nr;

    IF v_next_ver_nr IS NULL THEN
      RAISE EXCEPTION 'Kunde inte generera verifikationsnummer vid ångring av SIE-import.';
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
      user_id,
      source,
      import_batch_id
    ) VALUES (
      v_correction_date,
      '↩ Ångrad SIE-import: ' || v_batch.filename || ' – korrigering av VER-' || v_original_ver_nr,
      v_original.amount,
      v_original.type,
      v_original.vat_rate,
      true,
      true,
      v_original_ver_nr,
      v_user_id,
      'sie_import_undo',
      p_import_batch_id
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
      'Ångrad SIE-import ' || v_batch.filename || ' – korrigering av VER-' || v_original_ver_nr || ': ' || coalesce(e.description, ''),
      v_correction_date,
      v_user_id
    FROM public.journal_entries e
    WHERE e.transaction_id = v_original.id
      AND e.user_id = v_user_id;

    v_correction_count := v_correction_count + 1;
  END LOOP;

  UPDATE public.import_batches
  SET status = 'undone',
      undone_at = now()
  WHERE id = p_import_batch_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'import_batch_id', p_import_batch_id,
    'filename', v_batch.filename,
    'status', 'undone',
    'correction_count', v_correction_count,
    'undone_at', now()
  );
END;
$function$;
