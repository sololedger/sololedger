\set ON_ERROR_STOP on

BEGIN;

\i supabase/migrations/20260927151231_add_payment_account_roles.sql

INSERT INTO auth.users (id)
VALUES
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202');

-- Constraint checks.
INSERT INTO public.company_payment_account_roles (
  user_id,
  role,
  account_number
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  'business_payment_account',
  '1930'
);

INSERT INTO public.company_payment_account_roles (
  user_id,
  role,
  account_number
) VALUES (
  '00000000-0000-0000-0000-000000000202',
  'business_payment_account',
  '1930'
);

INSERT INTO public.company_payment_account_roles (
  user_id,
  role,
  account_number
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  'business_payment_account',
  '1940'
)
ON CONFLICT (user_id, role)
DO UPDATE SET account_number = excluded.account_number;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
    WHERE user_id = '00000000-0000-0000-0000-000000000101'
      AND role = 'business_payment_account'
  ) <> 1 THEN
    RAISE EXCEPTION 'Duplicate role mapping was created for one user.';
  END IF;

  IF (
    SELECT account_number
    FROM public.company_payment_account_roles
    WHERE user_id = '00000000-0000-0000-0000-000000000101'
      AND role = 'business_payment_account'
  ) <> '1940' THEN
    RAISE EXCEPTION 'Upsert did not update the role mapping safely.';
  END IF;
END
$$;

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    user_id,
    role,
    account_number
  ) VALUES (
    '00000000-0000-0000-0000-000000000101',
    'supplier_payable',
    '2440'
  );

  RAISE EXCEPTION 'Invalid payment role was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    user_id,
    role,
    account_number
  ) VALUES (
    '00000000-0000-0000-0000-000000000101',
    'owner_private_payment',
    'bank'
  );

  RAISE EXCEPTION 'Malformed account number was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

-- RLS checks as authenticated users.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
  ) <> 1 THEN
    RAISE EXCEPTION 'RLS SELECT leaked another user mapping.';
  END IF;
END
$$;

DO $$
DECLARE
  v_updated_rows integer;
BEGIN
  UPDATE public.company_payment_account_roles
  SET account_number = '2018'
  WHERE user_id = '00000000-0000-0000-0000-000000000202'
    AND role = 'business_payment_account';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows <> 0 THEN
    RAISE EXCEPTION 'Cross-user UPDATE affected % row(s).', v_updated_rows;
  END IF;
END
$$;

DO $$
BEGIN
  IF (
    SELECT account_number
    FROM public.company_payment_account_roles
    WHERE user_id = '00000000-0000-0000-0000-000000000101'
      AND role = 'business_payment_account'
  ) <> '1940' THEN
    RAISE EXCEPTION 'Cross-user UPDATE affected the wrong mapping.';
  END IF;
END
$$;

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    user_id,
    role,
    account_number
  ) VALUES (
    '00000000-0000-0000-0000-000000000202',
    'owner_private_payment',
    '2018'
  )
  ON CONFLICT DO NOTHING;

  RAISE EXCEPTION 'Cross-user INSERT was accepted.';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
  WHEN check_violation THEN
    NULL;
END
$$;

DELETE FROM public.company_payment_account_roles
WHERE role = 'business_payment_account';

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
  ) <> 0 THEN
    RAISE EXCEPTION 'Clearing own mapping did not return role to unconfigured.';
  END IF;
END
$$;

ROLLBACK;
