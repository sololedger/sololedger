\set ON_ERROR_STOP on

BEGIN;

-- Reproduce the production precondition inside this rollback-only test:
-- public tables created by postgres inherit broad default table privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20260927151231_add_payment_account_roles.sql

DO $$
DECLARE
  v_role text;
  v_privilege text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN'
    ] LOOP
      IF NOT has_table_privilege(
        v_role,
        'public.company_payment_account_roles',
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'Expected broad inherited pre-hardening privilege %.% missing.',
          v_role,
          v_privilege;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

\i supabase/migrations/20260927174627_harden_payment_account_roles_acl.sql

DO $$
DECLARE
  v_privilege text;
BEGIN
  FOREACH v_privilege IN ARRAY ARRAY[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ] LOOP
    IF has_table_privilege(
      'anon',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION 'Anon retained %. privilege after hardening.', v_privilege;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) AS a
    WHERE n.nspname = 'public'
      AND c.relname = 'company_payment_account_roles'
      AND a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC retained table privileges after hardening.';
  END IF;

  FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege(
      'authenticated',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION
        'Authenticated missing required %. privilege after hardening.',
        v_privilege;
    END IF;
  END LOOP;

  FOREACH v_privilege IN ARRAY ARRAY[
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ] LOOP
    IF has_table_privilege(
      'authenticated',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION
        'Authenticated retained unexpected %. privilege after hardening.',
        v_privilege;
    END IF;
  END LOOP;

  FOREACH v_privilege IN ARRAY ARRAY[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ] LOOP
    IF NOT has_table_privilege(
      'service_role',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION
        'Service role missing administrative %. privilege after hardening.',
        v_privilege;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.company_payment_account_roles'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS was disabled by ACL hardening.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_payment_account_roles'
      AND policyname = 'payment_account_roles_self_access'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'ALL'
      AND qual LIKE '%auth.uid%'
      AND qual LIKE '%user_id%'
      AND with_check LIKE '%auth.uid%'
      AND with_check LIKE '%user_id%'
  ) <> 1 THEN
    RAISE EXCEPTION 'Owner-scoped RLS policy changed unexpectedly.';
  END IF;
END
$$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_payment_account_roles'
      AND (
        (
          column_name = 'user_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
          AND column_default = 'auth.uid()'
        )
        OR (
          column_name = 'role'
          AND data_type = 'text'
          AND is_nullable = 'NO'
        )
        OR (
          column_name = 'account_number'
          AND data_type = 'text'
          AND is_nullable = 'NO'
        )
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'Payment role table columns changed unexpectedly.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.company_payment_account_roles'::regclass
      AND (
        (
          conname = 'company_payment_account_roles_pkey'
          AND contype = 'p'
          AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, role)'
        )
        OR (
          conname = 'company_payment_account_roles_user_id_fkey'
          AND contype = 'f'
          AND pg_get_constraintdef(oid) =
            'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
        )
        OR (
          conname = 'company_payment_account_roles_role_check'
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE
            '%business_payment_account%'
          AND pg_get_constraintdef(oid) LIKE
            '%owner_private_payment%'
        )
        OR (
          conname = 'company_payment_account_roles_account_number_check'
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%^\\d{4}$%'
        )
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Payment role table constraints changed unexpectedly.';
  END IF;
END
$$;

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
  INSERT INTO public.company_payment_account_roles (
    role,
    account_number
  ) VALUES (
    'owner_private_payment',
    '2018'
  );

  UPDATE public.company_payment_account_roles
  SET account_number = '2017'
  WHERE role = 'owner_private_payment';

  IF (
    SELECT account_number
    FROM public.company_payment_account_roles
    WHERE role = 'owner_private_payment'
  ) <> '2017' THEN
    RAISE EXCEPTION 'Authenticated user could not update own mapping.';
  END IF;

  DELETE FROM public.company_payment_account_roles
  WHERE role = 'owner_private_payment';

  IF EXISTS (
    SELECT 1
    FROM public.company_payment_account_roles
    WHERE role = 'owner_private_payment'
  ) THEN
    RAISE EXCEPTION 'Authenticated user could not delete own mapping.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
  ) <> 1 THEN
    RAISE EXCEPTION 'RLS SELECT leaked another user mapping or own CRUD failed.';
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
