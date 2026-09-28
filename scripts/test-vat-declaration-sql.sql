\set ON_ERROR_STOP on

BEGIN;

\i supabase/migrations/20260928193000_add_vat_declaration_submission_date.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vat_periods'
      AND column_name = 'skv_submitted_on'
      AND data_type = 'date'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'skv_submitted_on date NULL column was not created.';
  END IF;

  IF to_regprocedure('public.declare_vat_period_atomic(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy one-argument declare_vat_period_atomic still exists.';
  END IF;

  IF to_regprocedure('public.declare_vat_period_atomic(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'New two-argument declare_vat_period_atomic is missing.';
  END IF;

  IF to_regprocedure('public.close_vat_period_atomic(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Existing close_vat_period_atomic disappeared.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'public.declare_vat_period_atomic(uuid,date)'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated cannot execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF NOT has_function_privilege(
    'postgres',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'postgres cannot execute declare_vat_period_atomic(uuid,date).';
  END IF;
END
$$;

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000202')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vat_periods (
  id,
  user_id,
  period_start,
  period_end,
  period_type,
  status,
  source,
  closing_amount,
  closing_transaction_id,
  declared_at,
  skv_submitted_on
) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    '2026-01-01',
    '2026-03-31',
    'quarter',
    'closed',
    'sololedger',
    4000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000101',
    '2026-04-01',
    '2026-06-30',
    'quarter',
    'closed',
    'sololedger',
    1000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000101',
    '2026-07-01',
    '2026-09-30',
    'quarter',
    'closed',
    'imported_history',
    1000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000101',
    '2026-10-01',
    '2026-12-31',
    'quarter',
    'open',
    'sololedger',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000202',
    '2026-01-01',
    '2026-03-31',
    'quarter',
    'closed',
    'sololedger',
    4000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000101',
    '2025-01-01',
    '2025-03-31',
    'quarter',
    'declared',
    'sololedger',
    3000,
    NULL,
    now(),
    NULL
  );

CREATE TEMP TABLE vat_declaration_counts_before AS
SELECT
  (SELECT count(*) FROM public.transactions) AS transaction_count,
  (SELECT count(*) FROM public.journal_entries) AS journal_count;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000001',
    '2026-04-12'
  );

  IF v_result->>'success' <> 'true' THEN
    RAISE EXCEPTION 'Declaration did not return success.';
  END IF;

  IF v_result->>'already_declared' <> 'false' THEN
    RAISE EXCEPTION 'New declaration was incorrectly marked already_declared.';
  END IF;

  IF v_result->>'skv_submitted_on' <> '2026-04-12' THEN
    RAISE EXCEPTION 'Returned submitted date was not stored correctly: %',
      v_result->>'skv_submitted_on';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vat_periods
    WHERE id = '20000000-0000-0000-0000-000000000001'
      AND status = 'declared'
      AND skv_submitted_on = '2026-04-12'
      AND declared_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'closed -> declared did not persist expected state.';
  END IF;

  IF (
    SELECT transaction_count
    FROM vat_declaration_counts_before
  ) <> (
    SELECT count(*)
    FROM public.transactions
  ) THEN
    RAISE EXCEPTION 'Declaration created a transaction.';
  END IF;

  IF (
    SELECT journal_count
    FROM vat_declaration_counts_before
  ) <> (
    SELECT count(*)
    FROM public.journal_entries
  ) THEN
    RAISE EXCEPTION 'Declaration created journal rows.';
  END IF;
END
$$;

CREATE TEMP TABLE declared_period_snapshot AS
SELECT id, status, declared_at, updated_at, skv_submitted_on
FROM public.vat_periods
WHERE id = '20000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000001',
    '2026-04-12'
  );

  IF v_result->>'already_declared' <> 'true' THEN
    RAISE EXCEPTION 'Retry with same date was not idempotent.';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vat_periods vp
    JOIN declared_period_snapshot s ON s.id = vp.id
    WHERE vp.id = '20000000-0000-0000-0000-000000000001'
      AND vp.status = s.status
      AND vp.declared_at = s.declared_at
      AND vp.updated_at = s.updated_at
      AND vp.skv_submitted_on = s.skv_submitted_on
  ) THEN
    RAISE EXCEPTION 'Same-date retry changed stored declaration state.';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000001',
    '2026-04-13'
  );

  RAISE EXCEPTION 'Retry with different submitted date was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vat_periods vp
    JOIN declared_period_snapshot s ON s.id = vp.id
    WHERE vp.id = '20000000-0000-0000-0000-000000000001'
      AND vp.status = s.status
      AND vp.declared_at = s.declared_at
      AND vp.updated_at = s.updated_at
      AND vp.skv_submitted_on = s.skv_submitted_on
  ) THEN
    RAISE EXCEPTION 'Conflicting retry changed stored declaration state.';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000002',
    NULL::date
  );

  RAISE EXCEPTION 'NULL submitted date was accepted for a new closed period.';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000002',
    current_date + 1
  );

  RAISE EXCEPTION 'Future submitted date was accepted.';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000002',
    '2026-06-29'
  );

  RAISE EXCEPTION 'Submitted date before period end was accepted.';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000005',
    '2026-04-12'
  );

  RAISE EXCEPTION 'Cross-user declaration was accepted.';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000003',
    '2026-10-12'
  );

  RAISE EXCEPTION 'Imported-history declaration was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000004',
    '2027-01-12'
  );

  RAISE EXCEPTION 'Open-period declaration was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000006',
    '2025-04-12'
  );

  IF v_result->>'already_declared' <> 'true' THEN
    RAISE EXCEPTION 'Legacy declared row did not return idempotent success.';
  END IF;

  IF v_result ? 'skv_submitted_on'
     AND v_result->>'skv_submitted_on' IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy declared row invented a submitted date.';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vat_periods
    WHERE id = '20000000-0000-0000-0000-000000000006'
      AND skv_submitted_on IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy declared row was silently backfilled.';
  END IF;
END
$$;

ROLLBACK;
