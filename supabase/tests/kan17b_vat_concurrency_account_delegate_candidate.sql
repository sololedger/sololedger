\set ON_ERROR_STOP on

-- KAN-17B rollback/equivalence test for the VAT concurrency compatibility helper.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- This script does not create persistent data. It installs the local KAN-17A
-- classifier/wrappers and KAN-17B compatibility-helper candidate inside one
-- outer transaction, verifies P1 equivalence, and then rolls everything back.
--
-- Intended use, only against an isolated/local/staging database:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan17b_vat_concurrency_account_delegate_candidate.sql

BEGIN;

-- Install the local foundations inside the rollback transaction.
\ir ../migrations/20260925_add_vat_account_classification.sql
\ir ../migrations/20260925_delegate_vat_concurrency_account.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-17B assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-17B assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE TEMP TABLE kan17b_expected_accounts (
  account_number text,
  expected_period_guard boolean,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan17b_expected_accounts (
  account_number,
  expected_period_guard,
  note
) VALUES
  ('2610', true,  '261x lower representative'),
  ('2611', true,  '261x canonical 25 percent output VAT'),
  ('2619', true,  '261x upper representative'),
  ('2620', true,  '262x lower representative'),
  ('2621', true,  '262x canonical 12 percent output VAT'),
  ('2629', true,  '262x upper representative'),
  ('2630', true,  '263x lower representative'),
  ('2631', true,  '263x canonical 6 percent output VAT'),
  ('2639', true,  '263x upper representative'),
  ('2640', false, 'other 264x below exact 2641'),
  ('2641', true,  'exact deductible input VAT account'),
  ('2642', false, 'other 264x above exact 2641'),
  ('2649', false, 'other 264x upper representative'),
  ('2650', true,  'canonical VAT settlement account'),
  ('2651', true,  'other 265x representative'),
  ('2659', true,  'other 265x upper representative'),
  ('1930', false, 'ordinary bank account'),
  ('3010', false, 'ordinary sales account'),
  ('5410', false, 'ordinary expense account'),
  (NULL,   NULL,  'NULL preserves SQL predicate NULL behavior'),
  ('',     false, 'empty string'),
  ('26',   false, 'prefix boundary before supported ranges'),
  ('261',  true,  'LIKE prefix boundary'),
  ('26100', true, 'five-character prefix match'),
  ('261ABC', true, 'nonnumeric text preserving prefix behavior'),
  ('26410', false, 'exact 2641 does not match longer account text'),
  ('265', true,  '265 prefix boundary'),
  ('265ABC', true, 'nonnumeric 265 prefix behavior'),
  ('nonnumeric text', false, 'unrelated nonnumeric text');

DO $$
DECLARE
  v_mismatch_count integer;
  v_definition text;
  v_consumer_name text;
  v_consumer_arg_types text;
BEGIN
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_concurrency_account(text)') IS NOT NULL,
    'compatibility helper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_is_period_guard_relevant(text)') IS NOT NULL,
    'period guard semantic wrapper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_classification(text)') IS NOT NULL,
    'central classifier exists'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17b_expected_accounts e
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM e.expected_period_guard
     OR public.vat_account_is_period_guard_relevant(e.account_number)
          IS DISTINCT FROM e.expected_period_guard
     OR (
          e.account_number LIKE '261%'
       OR e.account_number LIKE '262%'
       OR e.account_number LIKE '263%'
       OR e.account_number = '2641'
       OR e.account_number LIKE '265%'
        ) IS DISTINCT FROM e.expected_period_guard;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'legacy P1 predicate, compatibility helper, and semantic wrapper match expected outputs'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17b_expected_accounts e
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM public.vat_account_is_period_guard_relevant(e.account_number);

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'compatibility helper delegates to the period guard semantic wrapper'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17b_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'compatibility helper matches central classifier P1 output'
  );

  SELECT pg_get_functiondef('public.vat_concurrency_account(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%RETURNS boolean%'
    AND v_definition LIKE '%LANGUAGE sql%'
    AND v_definition LIKE '%IMMUTABLE PARALLEL SAFE%'
    AND v_definition LIKE '%SET search_path TO ''public''%'
    AND v_definition LIKE '%public.vat_account_is_period_guard_relevant(p_account_number)%'
    AND v_definition NOT LIKE '%p_account_number LIKE ''261%''%',
    'compatibility helper signature/properties are preserved and implementation delegates'
  );

  FOR v_consumer_name, v_consumer_arg_types IN
    VALUES
      ('book_transaction_atomic', 'jsonb'),
      ('book_periodized_transaction_atomic', 'jsonb'),
      ('create_correction_transaction_atomic', 'uuid'),
      ('import_sie_batch', 'jsonb'),
      ('undo_sie_import_atomic', 'uuid')
  LOOP
    SELECT pg_get_functiondef(
             (format('public.%I(%s)', v_consumer_name, v_consumer_arg_types))::regprocedure
           )
      INTO v_definition;

    PERFORM pg_temp.assert_true(
      v_definition LIKE '%vat_concurrency_account%'
      AND v_definition NOT LIKE '%vat_account_is_period_guard_relevant%'
      AND v_definition NOT LIKE '%vat_account_classification%',
      format('%s continues to call only the compatibility helper', v_consumer_name)
    );
  END LOOP;

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%je.account_number LIKE ''265%''%'
    AND v_definition LIKE '%je.account_number LIKE ''261%''%'
    AND v_definition LIKE '%je.account_number LIKE ''262%''%'
    AND v_definition LIKE '%je.account_number LIKE ''263%''%'
    AND v_definition LIKE '%je.account_number = ''2641''%'
    AND v_definition NOT LIKE '%vat_account_is_period_guard_relevant%'
    AND v_definition NOT LIKE '%vat_account_classification%',
    'P2/P3 close_vat_period_atomic predicates remain embedded and unchanged'
  );

  RAISE NOTICE 'KAN-17B VAT concurrency helper delegation tests passed for % account cases.',
    (SELECT count(*) FROM kan17b_expected_accounts);
END;
$$;

-- This must stay ROLLBACK so the candidate function install is discarded.
ROLLBACK;
