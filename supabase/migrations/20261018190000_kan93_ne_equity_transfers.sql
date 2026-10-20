-- KAN-93: B10 includes the signed technical closing-account net, while
-- R rows/business result continue to exclude 899x. No journal/data changes.
-- Captured live Production definition reviewed 2026-10-18; change only the
-- cumulative_result filter. Preserve all other year-close guards and ACLs.
BEGIN;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure)) <> 'eac15b59cc82aaff12df88929fbd046d' THEN
    RAISE EXCEPTION 'KAN-93: unexpected close_year_atomic definition; inspect target before applying.';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.close_year_atomic(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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


COMMIT;
