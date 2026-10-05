BEGIN;

-- KAN-42: Year closing must be protected server-side.
--
-- The UI already shows NE imbalance and KAN-40 negative 19xx warnings, but
-- close_year_atomic is the authoritative write boundary. This migration keeps
-- the existing open SoloLedger VAT period guard and adds a server-side NE
-- balance guard computed from the authenticated user's cumulative journal
-- balances through year-end.

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
  v_year_end date;
  v_unclassified_negative_bank numeric := 0;
  v_balance_diff numeric := 0;
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
  -- ----------------------------------------------------------
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.';
  END IF;

  v_year_end := make_date(p_year, 12, 31);

  -- ----------------------------------------------------------
  -- Idempotency / already closed
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
  -- NE / simplified annual accounts precondition
  --
  -- Mirrors the current authoritative balance-row model used by the app:
  -- cumulative debit-credit balances through year-end, positive 19xx only
  -- in B9, real 23xx debt in B13, tax accounts in B8/B14, and B10 from
  -- opening capital + cumulative result + owner deposits - withdrawals.
  --
  -- This deliberately does not try to reimplement every client result warning
  -- in SQL. The hard close invariant is that the balance sheet must balance
  -- and unresolved negative cash/bank must not be silently reclassified.
  -- ----------------------------------------------------------
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
          AND account_number !~ '^899[0-9]$'
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

  IF coalesce(v_unclassified_negative_bank, 0) > 1 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom kassa/bank har negativt oklassat saldo (% kr). Stäm av 19xx och bokför/klassificera eventuell kredit eller skuld först.',
      p_year,
      to_char(v_unclassified_negative_bank, 'FM999G999G999G990D00');
  END IF;

  IF abs(coalesce(v_balance_diff, 0)) > 1 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom balansräkningen inte balanserar (differens % kr).',
      p_year,
      to_char(v_balance_diff, 'FM999G999G999G990D00');
  END IF;

  -- ----------------------------------------------------------
  -- Create the year lock.
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

REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer)
  TO service_role;

COMMENT ON FUNCTION public.close_year_atomic(integer) IS
  'Atomically locks a bookkeeping year for the authenticated user. Blocks locking when a SoloLedger VAT period is open, NE balance does not balance, or 19xx has unresolved negative cash/bank balance.';

COMMIT;
