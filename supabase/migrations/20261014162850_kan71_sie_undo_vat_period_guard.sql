-- KAN-71: period-correct SIE undo. Based on read-only live definitions 2026-10-14.
-- No data repair/backfill; existing closed/declared periods are not rewritten.

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
  v_vat_row record;
  v_period_ok boolean;
  v_matching_vat_periods integer := 0;
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

  -- KAN-71: lock original JOURNAL months as well as correction months.
  -- All 26xx rows count here, including ambiguous 2645/other VAT accounts.
  SELECT coalesce(array_agg(DISTINCT d), ARRAY[]::date[])
    INTO v_locked_vat_dates
  FROM public.transactions t
  JOIN public.journal_entries e ON e.transaction_id = t.id AND e.user_id = v_user_id
  CROSS JOIN LATERAL unnest(ARRAY[e.date, greatest(current_date, t.date)]) AS dates(d)
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND e.account_number LIKE '26%';

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
  -- KAN-71: lock original JOURNAL months as well as correction months.
  -- All 26xx rows count here, including ambiguous 2645/other VAT accounts.
  SELECT coalesce(array_agg(DISTINCT d), ARRAY[]::date[])
    INTO v_actual_vat_dates
  FROM public.transactions t
  JOIN public.journal_entries e ON e.transaction_id = t.id AND e.user_id = v_user_id
  CROSS JOIN LATERAL unnest(ARRAY[e.date, greatest(current_date, t.date)]) AS dates(d)
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND e.account_number LIKE '26%';

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

  -- KAN-71: after all month, batch, transaction and journal locks,
  -- verify every original VAT row and its correction share ONE open period.
  -- Period rows are locked before checking state; close/declare use the same
  -- month lock domain. No original history or period state is rewritten.
  FOR v_vat_row IN
    SELECT e.date AS original_date, greatest(current_date, t.date) AS correction_date,
           e.account_number
    FROM public.transactions t
    JOIN public.journal_entries e ON e.transaction_id = t.id AND e.user_id = v_user_id
    WHERE t.user_id = v_user_id AND t.import_batch_id = p_import_batch_id
      AND t.source IN ('sie_import', 'sie_opening_balance')
      AND e.account_number LIKE '26%'
    ORDER BY e.date, t.id, e.id
  LOOP
    IF v_vat_row.original_date IS NULL
       OR extract(year FROM v_vat_row.original_date) <> extract(year FROM v_vat_row.correction_date)
       OR EXISTS (SELECT 1 FROM public.closed_years cy WHERE cy.user_id = v_user_id
         AND cy.year IN (extract(year FROM v_vat_row.original_date)::integer,
                         extract(year FROM v_vat_row.correction_date)::integer)) THEN
      RAISE EXCEPTION 'SIE-importen kan inte återställas automatiskt över ett årsskifte eller ett låst år. Historiska momsperioder kräver separat hantering.'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND (v_vat_row.original_date BETWEEN vp.period_start AND vp.period_end
        OR v_vat_row.correction_date BETWEEN vp.period_start AND vp.period_end)
    ORDER BY vp.id FOR UPDATE;

    SELECT count(*)::integer,
      bool_and(vp.source = 'sololedger' AND vp.status = 'open'
        AND v_vat_row.original_date BETWEEN vp.period_start AND vp.period_end
        AND v_vat_row.correction_date BETWEEN vp.period_start AND vp.period_end)
    INTO v_matching_vat_periods, v_period_ok
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND (v_vat_row.original_date BETWEEN vp.period_start AND vp.period_end
        OR v_vat_row.correction_date BETWEEN vp.period_start AND vp.period_end);

    IF v_matching_vat_periods <> 1 OR v_period_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'SIE-importen kan bara återställas automatiskt när original och rättelse hör till samma verifierade öppna momsperiod. Stängda, deklarerade eller historiska momsperioder kräver separat hantering.'
        USING ERRCODE = '23514';
    END IF;

    IF v_vat_row.account_number IN ('2614', '2624', '2634', '2645') THEN
      RAISE EXCEPTION 'SIE-importen innehåller osäker omvänd moms och kan inte återställas automatiskt. Momsunderlaget behöver kontrolleras; historiska momsperioder kräver separat hantering.'
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
$function$
;

CREATE OR REPLACE FUNCTION public.close_vat_period_atomic(p_vat_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  -- Read-only lock-domain discovery before any advisory lock.
  v_pre_user_id uuid;
  v_pre_period_start date;
  v_pre_period_end date;
  v_lock_dates date[] := ARRAY[]::date[];

  -- Authoritative row state after VAT advisory locks.
  v_period public.vat_periods%ROWTYPE;

  -- Protected activity/balance state.
  v_has_265_activity boolean := false;
  v_closing_scope_row_count integer := 0;
  v_nonzero_balance_count integer := 0;
  v_closing_amount numeric := 0;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;

  -- Closing write state.
  v_ver_nr integer;
  v_tx_id uuid;
  v_inserted_vat_rows integer := 0;
  v_inserted_total_rows integer := 0;
  v_written_debit numeric := 0;
  v_written_credit numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_vat_period_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiod saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ------------------------------------------------------------
  -- Read-only lock-domain discovery.
  --
  -- We must know the calendar months to lock before taking any
  -- vat_periods row lock. The row is revalidated after locks.
  -- ------------------------------------------------------------
  SELECT
    vp.user_id,
    vp.period_start,
    vp.period_end
  INTO
    v_pre_user_id,
    v_pre_period_start,
    v_pre_period_end
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(month_start::date ORDER BY month_start), ARRAY[]::date[])
    INTO v_lock_dates
  FROM generate_series(
    date_trunc('month', v_pre_period_start)::date,
    date_trunc('month', v_pre_period_end)::date,
    interval '1 month'
  ) AS month_start;

  -- Global lock order:
  -- 1. All VAT month advisory locks, chronologically inside lock_vat_months().
  -- 2. Any other advisory locks.
  -- 3. Row locks.
  -- 4. Protected reads/writes and get_next_ver_nr().
  PERFORM public.lock_vat_months(v_user_id, v_lock_dates);

  -- ------------------------------------------------------------
  -- Authoritative row lock + lock-domain revalidation.
  -- ------------------------------------------------------------
  SELECT *
    INTO v_period
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden ändrades under stängningen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  IF v_period.user_id IS DISTINCT FROM v_pre_user_id
     OR v_period.period_start IS DISTINCT FROM v_pre_period_start
     OR v_period.period_end IS DISTINCT FROM v_pre_period_end THEN
    RAISE EXCEPTION 'Momsperiodens datum ändrades under stängningen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ------------------------------------------------------------
  -- State and scope guards.
  -- ------------------------------------------------------------
  IF v_period.source = 'imported_history' THEN
    RAISE EXCEPTION 'Importerad historik kan inte stängas som en normal SoloLedger-momsperiod.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.source <> 'sololedger' THEN
    RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan stängas.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'declared' THEN
    RAISE EXCEPTION 'Momsperioden är redan deklarerad och kan inte stängas igen.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_closed', true,
      'vat_period_id', v_period.id,
      'status', v_period.status,
      'closing_amount', v_period.closing_amount,
      'closing_transaction_id', v_period.closing_transaction_id
    );
  END IF;

  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'Momsperioden har en okänd status: %.', v_period.status
      USING ERRCODE = '23514';
  END IF;

  IF v_period.period_end > current_date THEN
    RAISE EXCEPTION 'Framtida momsperioder kan inte stängas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from v_period.period_end)::integer
  ) THEN
    RAISE EXCEPTION 'Momsperioden kan inte stängas eftersom räkenskapsår % är låst.',
      extract(year from v_period.period_end)::integer
      USING ERRCODE = '23514';
  END IF;

  -- KAN-71: legacy cross-period undo is reconciliation evidence, not an
  -- automatic decision to move VAT between declarations. Closed periods
  -- returned above remain untouched. Block only new closing decisions.
  IF EXISTS (
    SELECT 1 FROM public.journal_entries je
    JOIN public.transactions tx ON tx.id = je.transaction_id AND tx.user_id = je.user_id
    JOIN public.import_batches b ON b.id = tx.import_batch_id AND b.user_id = v_user_id
    WHERE je.user_id = v_user_id AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND je.account_number LIKE '26%' AND b.status = 'undone'
      AND (
        NOT EXISTS (SELECT 1 FROM public.transactions c
          WHERE c.user_id = v_user_id AND c.import_batch_id = b.id AND c.source = 'sie_import_undo')
        OR EXISTS (
          SELECT 1 FROM public.transactions related
          JOIN public.journal_entries other_row ON other_row.transaction_id = related.id AND other_row.user_id = v_user_id
          WHERE related.user_id = v_user_id AND related.import_batch_id = b.id
            AND other_row.account_number LIKE '26%'
            AND (other_row.date IS NULL OR other_row.date NOT BETWEEN v_period.period_start AND v_period.period_end)
        )
      )
  ) THEN
    RAISE EXCEPTION 'En tidigare SIE-återställning berör olika momsperioder. Historiska momsperioder kräver separat hantering innan ett nytt momsavslut kan göras.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries je
    JOIN public.transactions tx ON tx.id = je.transaction_id AND tx.user_id = je.user_id
    WHERE je.user_id = v_user_id AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND tx.source IN ('sie_import', 'sie_opening_balance', 'sie_import_undo')
      AND je.account_number IN ('2614', '2624', '2634', '2645')
  ) THEN
    RAISE EXCEPTION 'SIE-underlaget innehåller osäker omvänd moms. Kontrollera momsunderlaget före momsavslut; historiska momsperioder kräver separat hantering.'
      USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------
  -- Protected activity/balance reads.
  --
  -- Period membership is based on journal_entries.date.
  -- 265x blocks normal auto-close/manual review, but never enters
  -- closing_amount.
  -- ------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    JOIN public.transactions tx
      ON tx.id = je.transaction_id
     AND tx.user_id = je.user_id
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.transaction_source_is_ordinary_vat_guard_activity(tx.source)
      AND public.vat_account_requires_close_manual_review(je.account_number)
  )
  INTO v_has_265_activity;

  IF v_has_265_activity THEN
    RAISE EXCEPTION 'Momsperioden innehåller aktivitet på 265x och behöver manuell kontroll före stängning.'
      USING ERRCODE = '23514';
  END IF;

  WITH per_account AS (
    SELECT
      je.account_number,
      sum(coalesce(je.debit, 0) - coalesce(je.credit, 0))::numeric AS balance,
      count(*)::integer AS row_count
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.vat_account_is_close_balance_participant(je.account_number)
    GROUP BY je.account_number
  )
  SELECT
    coalesce(sum(row_count), 0)::integer,
    coalesce(count(*) FILTER (WHERE balance <> 0), 0)::integer,
    coalesce(-sum(balance), 0)::numeric,
    coalesce(sum(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0)::numeric
      + greatest(-coalesce(-sum(balance), 0)::numeric, 0),
    coalesce(sum(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)::numeric
      + greatest(coalesce(-sum(balance), 0)::numeric, 0)
  INTO
    v_closing_scope_row_count,
    v_nonzero_balance_count,
    v_closing_amount,
    v_total_debit,
    v_total_credit
  FROM per_account;

  -- No closing-scope activity: close the state only. No transaction and no
  -- ver_nr consumption.
  IF v_closing_scope_row_count = 0 THEN
    UPDATE public.vat_periods
    SET status = 'closed',
        closing_amount = 0,
        closing_transaction_id = NULL,
        updated_at = now()
    WHERE id = v_period.id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_closed', false,
      'vat_period_id', v_period.id,
      'status', 'closed',
      'closing_amount', 0,
      'closing_transaction_id', NULL,
      'transaction_created', false
    );
  END IF;

  -- Activity exists, but all relevant account balances are already zero.
  -- This is not a normal closing candidate: creating fabricated 0/0 rows
  -- would hide the real history instead of documenting a closing.
  IF v_nonzero_balance_count = 0 THEN
    RAISE EXCEPTION 'Momsperioden har momsaktivitet men alla relevanta momskonton är redan noll. Kontrollera perioden manuellt.'
      USING ERRCODE = '23514';
  END IF;

  -- Internal accounting assertion before any ver_nr/write.
  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'Momsavslutet balanserar inte (debet %, kredit %).',
      v_total_debit, v_total_credit
      USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------
  -- Real VAT closing transaction.
  --
  -- transactions.amount follows the existing verification-summary
  -- pattern used by SIE import: total debit in the verification.
  -- ------------------------------------------------------------
  SELECT public.get_next_ver_nr(v_user_id)
    INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för momsavslutet.';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    v_user_id,
    v_period.period_end,
    'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    v_total_debit,
    NULL,
    NULL,
    true,
    'vat_closing'
  )
  RETURNING id INTO v_tx_id;

  WITH per_account AS (
    SELECT
      je.account_number,
      sum(coalesce(je.debit, 0) - coalesce(je.credit, 0))::numeric AS balance
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.vat_account_is_close_balance_participant(je.account_number)
    GROUP BY je.account_number
  )
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
    v_tx_id,
    v_ver_nr,
    account_number,
    CASE WHEN balance < 0 THEN -balance ELSE 0 END,
    CASE WHEN balance > 0 THEN balance ELSE 0 END,
    'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    v_period.period_end,
    v_user_id
  FROM per_account
  WHERE balance <> 0
  ORDER BY account_number;

  GET DIAGNOSTICS v_inserted_vat_rows = ROW_COUNT;

  IF v_inserted_vat_rows <> v_nonzero_balance_count THEN
    RAISE EXCEPTION 'Momsavslutet kunde inte skapa förväntade momsrader.'
      USING ERRCODE = '23514';
  END IF;

  IF v_closing_amount > 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    ) VALUES (
      v_tx_id,
      v_ver_nr,
      '2650',
      0,
      v_closing_amount,
      'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
      v_period.period_end,
      v_user_id
    );
  ELSIF v_closing_amount < 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    ) VALUES (
      v_tx_id,
      v_ver_nr,
      '2650',
      -v_closing_amount,
      0,
      'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
      v_period.period_end,
      v_user_id
    );
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(coalesce(je.debit, 0)), 0)::numeric,
    coalesce(sum(coalesce(je.credit, 0)), 0)::numeric
  INTO
    v_inserted_total_rows,
    v_written_debit,
    v_written_credit
  FROM public.journal_entries je
  WHERE je.transaction_id = v_tx_id
    AND je.user_id = v_user_id;

  IF v_inserted_total_rows = 0 THEN
    RAISE EXCEPTION 'Momsavslutet skapade inga journalrader.'
      USING ERRCODE = '23514';
  END IF;

  IF v_written_debit IS DISTINCT FROM v_written_credit THEN
    RAISE EXCEPTION 'Momsavslutets journalrader balanserar inte (debet %, kredit %).',
      v_written_debit, v_written_credit
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.vat_periods
  SET status = 'closed',
      closing_amount = v_closing_amount,
      closing_transaction_id = v_tx_id,
      updated_at = now()
  WHERE id = v_period.id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_closed', false,
    'vat_period_id', v_period.id,
    'status', 'closed',
    'closing_amount', v_closing_amount,
    'closing_transaction_id', v_tx_id,
    'transaction_created', true,
    'ver_nr', v_ver_nr
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.undo_sie_import_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_sie_import_atomic(uuid) TO authenticated, service_role, postgres;
REVOKE ALL ON FUNCTION public.close_vat_period_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO authenticated, service_role, postgres;
