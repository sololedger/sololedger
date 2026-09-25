\set ON_ERROR_STOP on

-- KAN-17A rollback/equivalence test for central VAT account classification.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- This script does not create persistent data. It installs the local KAN-17A
-- classification candidate inside one outer transaction, verifies signatures,
-- capability outputs, equivalence with current V1 predicates, and then rolls
-- everything back.
--
-- Intended use, only against an isolated/local/staging database:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan17a_vat_account_classification_candidate.sql

BEGIN;

-- Install the exact local KAN-17A candidate inside the rollback transaction.
\ir ../migrations/20260925_add_vat_account_classification.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-17A assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-17A assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE TEMP TABLE kan17a_expected_accounts (
  account_number text,
  expected_period_guard boolean,
  expected_close_balance boolean,
  expected_close_manual_review boolean,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan17a_expected_accounts (
  account_number,
  expected_period_guard,
  expected_close_balance,
  expected_close_manual_review,
  note
) VALUES
  ('2610', true,  true,  false, '261x lower representative'),
  ('2611', true,  true,  false, '261x canonical 25 percent output VAT'),
  ('2619', true,  true,  false, '261x upper representative'),
  ('2620', true,  true,  false, '262x lower representative'),
  ('2621', true,  true,  false, '262x canonical 12 percent output VAT'),
  ('2629', true,  true,  false, '262x upper representative'),
  ('2630', true,  true,  false, '263x lower representative'),
  ('2631', true,  true,  false, '263x canonical 6 percent output VAT'),
  ('2639', true,  true,  false, '263x upper representative'),
  ('2640', false, false, false, 'other 264x below exact 2641'),
  ('2641', true,  true,  false, 'exact deductible input VAT account'),
  ('2642', false, false, false, 'other 264x above exact 2641'),
  ('2649', false, false, false, 'other 264x upper representative'),
  ('2650', true,  false, true,  'canonical VAT settlement account'),
  ('2651', true,  false, true,  'other 265x representative'),
  ('2659', true,  false, true,  'other 265x upper representative'),
  ('1930', false, false, false, 'ordinary bank account'),
  ('3010', false, false, false, 'ordinary sales account'),
  ('5410', false, false, false, 'ordinary expense account'),
  (NULL,   NULL,  NULL,  NULL,  'NULL preserves SQL predicate NULL behavior'),
  ('',     false, false, false, 'empty string'),
  ('26',   false, false, false, 'prefix boundary before supported ranges'),
  ('261',  true,  true,  false, 'LIKE prefix boundary'),
  ('26100', true, true,  false, 'five-character prefix match'),
  ('261ABC', true, true, false, 'nonnumeric text preserving prefix behavior'),
  ('26410', false, false, false, 'exact 2641 does not match longer account text'),
  ('265', true,  false, true,  '265 prefix boundary'),
  ('265ABC', true, false, true, 'nonnumeric 265 prefix behavior'),
  ('vat', false, false, false, 'unrelated nonnumeric text');

DO $$
DECLARE
  v_mismatch_count integer;
  v_definition text;
BEGIN
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_classification(text)') IS NOT NULL,
    'central classification function exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_is_period_guard_relevant(text)') IS NOT NULL,
    'period guard wrapper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_is_close_balance_participant(text)') IS NOT NULL,
    'close balance wrapper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_requires_close_manual_review(text)') IS NOT NULL,
    'close manual-review wrapper exists'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_period_guard_relevant IS DISTINCT FROM e.expected_period_guard
     OR c.vat_close_balance_participant IS DISTINCT FROM e.expected_close_balance
     OR c.vat_close_manual_review_relevant IS DISTINCT FROM e.expected_close_manual_review;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'explicit capability output matrix matches expected V1 semantics'
  );

  -- P1 equivalence: existing live helper semantics must equal the new
  -- period-guard capability for every representative account.
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_period_guard_relevant
        IS DISTINCT FROM public.vat_concurrency_account(e.account_number);

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P1 equivalence with public.vat_concurrency_account(text)'
  );

  -- P2 equivalence: current close balance participant predicate embedded in
  -- close_vat_period_atomic(uuid), derived from fresh pg_get_functiondef().
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_close_balance_participant
        IS DISTINCT FROM (
             e.account_number LIKE '261%'
          OR e.account_number LIKE '262%'
          OR e.account_number LIKE '263%'
          OR e.account_number = '2641'
        );

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P2 equivalence with current close balance predicate'
  );

  -- P3 equivalence: current close manual-review predicate embedded in
  -- close_vat_period_atomic(uuid).
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_close_manual_review_relevant
        IS DISTINCT FROM (e.account_number LIKE '265%');

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P3 equivalence with current close manual-review predicate'
  );

  -- Thin wrappers must consume the central classifier, not duplicate their own
  -- independent predicate behavior.
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE public.vat_account_is_period_guard_relevant(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant
     OR public.vat_account_is_close_balance_participant(e.account_number)
          IS DISTINCT FROM c.vat_close_balance_participant
     OR public.vat_account_requires_close_manual_review(e.account_number)
          IS DISTINCT FROM c.vat_close_manual_review_relevant;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'semantic wrappers match central classifier outputs'
  );

  SELECT pg_get_functiondef('public.vat_concurrency_account(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%p_account_number LIKE ''261%''%'
    AND v_definition LIKE '%p_account_number LIKE ''262%''%'
    AND v_definition LIKE '%p_account_number LIKE ''263%''%'
    AND v_definition LIKE '%p_account_number = ''2641''%'
    AND v_definition LIKE '%p_account_number LIKE ''265%''%'
    AND v_definition NOT LIKE '%vat_account_classification%',
    'existing vat_concurrency_account definition remains unchanged'
  );

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%je.account_number LIKE ''265%''%'
    AND v_definition LIKE '%je.account_number LIKE ''261%''%'
    AND v_definition LIKE '%je.account_number LIKE ''262%''%'
    AND v_definition LIKE '%je.account_number LIKE ''263%''%'
    AND v_definition LIKE '%je.account_number = ''2641''%'
    AND v_definition NOT LIKE '%vat_account_classification%'
    AND v_definition NOT LIKE '%vat_account_is_close_balance_participant%'
    AND v_definition NOT LIKE '%vat_account_requires_close_manual_review%',
    'existing close_vat_period_atomic definition remains unchanged'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_classification(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute central classifier directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_is_period_guard_relevant(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute period guard wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_is_close_balance_participant(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute close balance wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_requires_close_manual_review(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute close manual-review wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_classification(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute central classifier directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_is_period_guard_relevant(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute period guard wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_is_close_balance_participant(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute close balance wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_requires_close_manual_review(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute close manual-review wrapper directly'
  );

  RAISE NOTICE 'KAN-17A VAT account classification equivalence tests passed for % account cases.',
    (SELECT count(*) FROM kan17a_expected_accounts);
END;
$$;

-- This must stay ROLLBACK so the candidate function install is discarded.
ROLLBACK;
