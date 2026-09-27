\set ON_ERROR_STOP on

-- KAN-19 candidate regression for company VAT profile runtime fields.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use against an isolated local database:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan19_vat_profile_runtime_fields_candidate.sql
--
-- The candidate migration and all fixture writes run inside one outer
-- transaction and end with ROLLBACK.

BEGIN;

CREATE TEMP TABLE kan19_vat_profile_runtime_context (
  user_id uuid PRIMARY KEY,
  other_user_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO kan19_vat_profile_runtime_context (user_id, other_user_id)
VALUES (gen_random_uuid(), gen_random_uuid());

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-19 VAT profile runtime assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-19 VAT profile runtime assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

\ir ../migrations/20260927070224_add_vat_profile_runtime_fields.sql

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_rejected boolean;
BEGIN
  SELECT user_id, other_user_id
    INTO v_user_id, v_other_user_id
  FROM kan19_vat_profile_runtime_context;

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'domestic_sales_vat_treatment'
        AND column_default = '''unknown''::text'
        AND is_nullable = 'NO'
    ),
    'domestic sales VAT treatment column exists with explicit unknown default'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'foreign_purchase_reporting'
        AND column_default = '''unknown''::text'
        AND is_nullable = 'NO'
    ),
    'foreign purchase reporting column exists with explicit unknown default'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'default_deduction_entitlement'
        AND column_default = '''unknown''::text'
        AND is_nullable = 'NO'
    ),
    'default deduction entitlement column exists with explicit unknown default'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'profiles_foreign_purchase_reporting_requires_registration_check'
        AND conrelid = 'public.profiles'::regclass
        AND contype = 'c'
        AND convalidated
    ),
    'foreign purchase reporting requires VAT registration constraint is validated'
  );

  INSERT INTO auth.users (id)
  VALUES (v_user_id), (v_other_user_id);

  INSERT INTO public.profiles (id, email)
  VALUES
    (v_user_id, 'kan19-vat-profile-runtime@example.invalid'),
    (v_other_user_id, 'kan19-vat-profile-runtime-other@example.invalid');

  PERFORM pg_temp.assert_eq(
    (
      SELECT domestic_sales_vat_treatment
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'unknown'::text,
    'new domestic sales treatment defaults to unknown'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT foreign_purchase_reporting
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'unknown'::text,
    'new foreign purchase reporting defaults to unknown'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT default_deduction_entitlement
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'unknown'::text,
    'new default deduction entitlement defaults to unknown'
  );

  UPDATE public.profiles
  SET
    vat_status = 'registered',
    vat_period_type = 'quarter',
    vat_management_from = '2026-01-01',
    domestic_sales_vat_treatment = 'taxable',
    foreign_purchase_reporting = 'required',
    default_deduction_entitlement = 'full'
  WHERE id = v_user_id;

  PERFORM pg_temp.assert_eq(
    (
      SELECT foreign_purchase_reporting
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'required'::text,
    'registered profile accepts required foreign purchase reporting'
  );

  v_rejected := false;
  BEGIN
    UPDATE public.profiles
    SET
      vat_status = 'not_registered',
      vat_period_type = NULL,
      vat_management_from = NULL,
      foreign_purchase_reporting = 'required'
    WHERE id = v_user_id;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;

  PERFORM pg_temp.assert_true(
    v_rejected,
    'not-registered profile rejects required foreign purchase reporting'
  );

  v_rejected := false;
  BEGIN
    UPDATE public.profiles
    SET default_deduction_entitlement = 'partial'
    WHERE id = v_user_id;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;

  PERFORM pg_temp.assert_true(
    v_rejected,
    'partial deduction is not persisted by this slice'
  );
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM kan19_vat_profile_runtime_context),
  true
);

SELECT set_config(
  'request.jwt.claims',
  (
    SELECT jsonb_build_object(
      'sub',
      user_id::text,
      'role',
      'authenticated'
    )::text
    FROM kan19_vat_profile_runtime_context
  ),
  true
);

SELECT set_config(
  'kan19.other_user_id',
  (SELECT other_user_id::text FROM kan19_vat_profile_runtime_context),
  true
);

-- Rollback-only test harness compatibility: local PostgreSQL fixtures may not
-- carry Supabase's standard authenticated access to auth.uid().
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

SET LOCAL ROLE authenticated;

WITH updated AS (
  UPDATE public.profiles
  SET
    domestic_sales_vat_treatment = 'mixed',
    foreign_purchase_reporting = 'required',
    default_deduction_entitlement = 'none'
  WHERE id = auth.uid()
  RETURNING 1
)
SELECT pg_temp.assert_eq(
  count(*)::integer,
  1,
  'authenticated owner can update the new VAT profile fields'
)
FROM updated;

WITH updated AS (
  UPDATE public.profiles
  SET default_deduction_entitlement = 'none'
  WHERE id = current_setting('kan19.other_user_id')::uuid
  RETURNING 1
)
SELECT pg_temp.assert_eq(
  count(*)::integer,
  0,
  'authenticated owner cannot update another profile through RLS'
)
FROM updated;

RESET ROLE;

SELECT pg_temp.assert_eq(
  (
    SELECT default_deduction_entitlement
    FROM public.profiles
    WHERE id = (SELECT other_user_id FROM kan19_vat_profile_runtime_context)
  ),
  'unknown'::text,
  'cross-profile authenticated update leaves other profile unchanged'
);

ROLLBACK;
