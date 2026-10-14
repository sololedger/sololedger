-- KAN-71: legacy manual-source SIE chains, without import_batch_id.
-- Read-only history classification; no repair, backfill or historical writes.
-- Reuses the reviewed correction RPC's tenant-scoped ver_nr lineage helper.
CREATE OR REPLACE FUNCTION public.sie_vat_history_requires_review(
  p_user_id uuid, p_start_date date, p_end_date date
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE
  v_correction record;
  v_ids uuid[];
  v_row record;
  v_period_ids uuid[];
  v_chain_period uuid;
  v_chain_year integer;
BEGIN
  IF p_user_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Användare och giltig rapportperiod krävs.' USING ERRCODE = '22023';
  END IF;
  -- Scan descendants as well as period candidates: viewing Q2 must detect a
  -- later Q3 correction, even if Q2's journal still matches its stored close.
  FOR v_correction IN
    SELECT t.id FROM public.transactions t
    WHERE t.user_id = p_user_id AND t.is_correction
      AND EXISTS (SELECT 1 FROM public.journal_entries j
        WHERE j.user_id = p_user_id AND j.transaction_id = t.id AND j.account_number LIKE '26%')
  LOOP
    BEGIN
      v_ids := public.sie_correction_lineage(p_user_id, v_correction.id);
    EXCEPTION WHEN check_violation THEN
      -- Broken/ambiguous provenance is NOT classified as SIE. Without a
      -- verifiable origin a VAT correction cannot establish safe history.
      -- Fail closed for this user's reports; no cross-tenant lookup/guess.
      RETURN true;
    END;
    IF cardinality(v_ids) = 0 THEN CONTINUE; END IF; -- verified ordinary manual chain
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries j
      WHERE j.user_id = p_user_id AND j.transaction_id = ANY(v_ids)
        AND j.account_number LIKE '26%' AND j.date BETWEEN p_start_date AND p_end_date)
    THEN CONTINUE; END IF;
    v_chain_period := NULL;
    v_chain_year := NULL;
    FOR v_row IN SELECT j.date, j.account_number FROM public.journal_entries j
      WHERE j.user_id = p_user_id AND j.transaction_id = ANY(v_ids) AND j.account_number LIKE '26%'
    LOOP
      IF v_row.date IS NULL OR v_row.account_number IN ('2614','2624','2634','2645') THEN RETURN true; END IF;
      IF v_chain_year IS NOT NULL AND v_chain_year <> extract(year FROM v_row.date)::integer THEN RETURN true; END IF;
      v_chain_year := extract(year FROM v_row.date)::integer;
      SELECT array_agg(vp.id) INTO v_period_ids FROM public.vat_periods vp
      WHERE vp.user_id = p_user_id AND v_row.date BETWEEN vp.period_start AND vp.period_end;
      IF coalesce(cardinality(v_period_ids),0) <> 1 THEN RETURN true; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.vat_periods vp
        WHERE vp.id = v_period_ids[1] AND vp.user_id = p_user_id AND vp.source = 'sololedger')
      THEN RETURN true; END IF;
      IF v_chain_period IS NOT NULL AND v_chain_period <> v_period_ids[1] THEN RETURN true; END IF;
      v_chain_period := v_period_ids[1];
    END LOOP;
  END LOOP;
  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION public.sie_vat_history_requires_review(uuid,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sie_vat_history_requires_review(uuid,date,date) TO postgres, service_role;

-- One authenticated read boundary shared by VAT report and dashboard. No
-- user_id argument: callers cannot request another tenant's history verdict.
CREATE OR REPLACE FUNCTION public.get_sie_vat_history_review(p_start_date date, p_end_date date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE = '28000'; END IF;
  RETURN public.sie_vat_history_requires_review(v_user_id, p_start_date, p_end_date);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_sie_vat_history_review(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sie_vat_history_review(date,date) TO authenticated, service_role, postgres;

-- close_vat_period_atomic below retains the complete preceding KAN-71
-- candidate definition, adding only a post-lock guard for NEW closings.
-- Live deployed definition/ACL inspected read-only on 2026-10-14.

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

  -- Existing month locks serialize this read with undo/correction writes.
  -- Already closed/declared periods return/reject above, without recalculation.
  IF public.sie_vat_history_requires_review(v_user_id, v_period.period_start, v_period.period_end) THEN
    RAISE EXCEPTION 'Tidigare återställningar eller rättelser har osäker momshistorik. Historiska momsperioder och deklarationer kräver separat hantering före nytt momsavslut.'
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

REVOKE ALL ON FUNCTION public.close_vat_period_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO authenticated, service_role, postgres;
