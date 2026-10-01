\set ON_ERROR_STOP on

\echo '=== KAN-33 account balance RPC regression ==='

BEGIN;

\i supabase/migrations/20261001120000_kan33_account_balance_rpcs.sql

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');

WITH generated_transactions AS (
  SELECT
    gs,
    ('10000000-0000-0000-0001-' || lpad(gs::text, 12, '0'))::uuid AS tx_id
  FROM generate_series(1, 1001) AS gs
)
INSERT INTO public.transactions (
  id,
  user_id,
  date,
  description,
  amount,
  type,
  booked,
  source
)
SELECT
  tx_id,
  '10000000-0000-0000-0000-000000000001'::uuid,
  '2026-06-30'::date,
  'KAN-33 period aggregation user A',
  1,
  'test',
  true,
  'manual'
FROM generated_transactions;

WITH generated_transactions AS (
  SELECT
    gs,
    ('10000000-0000-0000-0001-' || lpad(gs::text, 12, '0'))::uuid AS tx_id
  FROM generate_series(1, 1001) AS gs
)
INSERT INTO public.journal_entries (
  user_id,
  transaction_id,
  ver_nr,
  account_number,
  debit,
  credit,
  description,
  date
)
SELECT
  '10000000-0000-0000-0000-000000000001'::uuid,
  tx_id,
  gs,
  account_number,
  debit,
  credit,
  'KAN-33 period aggregation user A',
  '2026-06-30'::date
FROM generated_transactions
CROSS JOIN LATERAL (
  VALUES
    ('1930'::text, 1::numeric, 0::numeric),
    ('3010'::text, 0::numeric, 1::numeric)
) AS rows(account_number, debit, credit);

INSERT INTO public.transactions (
  id,
  user_id,
  date,
  description,
  amount,
  type,
  booked,
  source
)
VALUES (
  '10000000-0000-0000-0002-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '2025-12-31',
  'KAN-33 cumulative opening user A',
  50,
  'test',
  true,
  'manual'
);

INSERT INTO public.journal_entries (
  user_id,
  transaction_id,
  ver_nr,
  account_number,
  debit,
  credit,
  description,
  date
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0002-000000000001',
    2001,
    '1930',
    50,
    0,
    'KAN-33 cumulative opening user A',
    '2025-12-31'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0002-000000000001',
    2001,
    '2010',
    0,
    50,
    'KAN-33 cumulative opening user A',
    '2025-12-31'
  );

WITH generated_transactions AS (
  SELECT
    gs,
    ('20000000-0000-0000-0001-' || lpad(gs::text, 12, '0'))::uuid AS tx_id
  FROM generate_series(1, 1001) AS gs
)
INSERT INTO public.transactions (
  id,
  user_id,
  date,
  description,
  amount,
  type,
  booked,
  source
)
SELECT
  tx_id,
  '20000000-0000-0000-0000-000000000002'::uuid,
  '2026-06-30'::date,
  'KAN-33 isolation user B',
  999,
  'test',
  true,
  'manual'
FROM generated_transactions;

WITH generated_transactions AS (
  SELECT
    gs,
    ('20000000-0000-0000-0001-' || lpad(gs::text, 12, '0'))::uuid AS tx_id
  FROM generate_series(1, 1001) AS gs
)
INSERT INTO public.journal_entries (
  user_id,
  transaction_id,
  ver_nr,
  account_number,
  debit,
  credit,
  description,
  date
)
SELECT
  '20000000-0000-0000-0000-000000000002'::uuid,
  tx_id,
  gs,
  '3010',
  0,
  999,
  'KAN-33 isolation user B',
  '2026-06-30'::date
FROM generated_transactions;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

CREATE TEMP TABLE kan33_period_result AS
SELECT * FROM public.get_period_account_balances('2026-01-01', '2026-12-31');

CREATE TEMP TABLE kan33_cumulative_result AS
SELECT * FROM public.get_cumulative_account_balances('2026-12-31');

DO $$
DECLARE
  v_period_1930 numeric;
  v_period_3010 numeric;
  v_cumulative_1930 numeric;
  v_cumulative_2010 numeric;
  v_cumulative_3010 numeric;
  v_999_leak_count integer;
BEGIN
  SELECT balance INTO v_period_1930
  FROM kan33_period_result
  WHERE account_number = '1930';

  SELECT balance INTO v_period_3010
  FROM kan33_period_result
  WHERE account_number = '3010';

  SELECT balance INTO v_cumulative_1930
  FROM kan33_cumulative_result
  WHERE account_number = '1930';

  SELECT balance INTO v_cumulative_2010
  FROM kan33_cumulative_result
  WHERE account_number = '2010';

  SELECT balance INTO v_cumulative_3010
  FROM kan33_cumulative_result
  WHERE account_number = '3010';

  SELECT count(*) INTO v_999_leak_count
  FROM kan33_period_result
  WHERE abs(balance) >= 999999;

  IF v_period_1930 <> 1001 THEN
    RAISE EXCEPTION 'Expected period 1930 balance 1001, got %', v_period_1930;
  END IF;

  IF v_period_3010 <> -1001 THEN
    RAISE EXCEPTION 'Expected period 3010 balance -1001, got %', v_period_3010;
  END IF;

  IF v_cumulative_1930 <> 1051 THEN
    RAISE EXCEPTION 'Expected cumulative 1930 balance 1051, got %', v_cumulative_1930;
  END IF;

  IF v_cumulative_2010 <> -50 THEN
    RAISE EXCEPTION 'Expected cumulative 2010 balance -50, got %', v_cumulative_2010;
  END IF;

  IF v_cumulative_3010 <> -1001 THEN
    RAISE EXCEPTION 'Expected cumulative 3010 balance -1001, got %', v_cumulative_3010;
  END IF;

  IF v_999_leak_count <> 0 THEN
    RAISE EXCEPTION 'Other user balance leaked into current user result.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_period_account_balances(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not be able to execute get_period_account_balances.';
  END IF;

  IF has_function_privilege('anon', 'public.get_cumulative_account_balances(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not be able to execute get_cumulative_account_balances.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_period_account_balances(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must be able to execute get_period_account_balances.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_cumulative_account_balances(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must be able to execute get_cumulative_account_balances.';
  END IF;
END;
$$;

ROLLBACK;

\echo 'KAN-33 account balance RPC regression passed.'
