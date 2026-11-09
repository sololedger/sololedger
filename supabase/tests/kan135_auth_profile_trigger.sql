-- psql test for a disposable database named kan135_fixture.
-- Load the pre-KAN-135 schema first, with no profile trigger.
\set ON_ERROR_STOP on
SELECT current_database() = 'kan135_fixture' AS approved_fixture \gset
\if :approved_fixture
\else
  DO $$ BEGIN RAISE EXCEPTION 'KAN-135 tests require kan135_fixture'; END $$;
\endif

BEGIN;

CREATE TEMP TABLE original_function AS
SELECT oid, proowner, prosrc
FROM pg_catalog.pg_proc
WHERE oid = 'public.handle_new_user()'::regprocedure;

\ir ../migrations/20261108161158_kan135_auth_profile_trigger.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN original_function original USING (oid, proowner, prosrc)
    WHERE p.prosecdef
      AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp']
      AND p.proacl = ARRAY['postgres=X/postgres'::aclitem]
  ) THEN
    RAISE EXCEPTION 'KAN-135: unexpected handler after migration';
  END IF;
  IF (
    SELECT count(*) FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgfoid = 'public.handle_new_user()'::regprocedure
  ) <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND tgfoid = 'public.handle_new_user()'::regprocedure
      AND tgtype = 5 AND tgenabled = 'O' AND tgqual IS NULL
  ) THEN
    RAISE EXCEPTION 'KAN-135: expected exactly one active profile trigger';
  END IF;
END $$;

SELECT pg_catalog.gen_random_uuid() AS user_id \gset
SET LOCAL ROLE supabase_auth_admin;
INSERT INTO auth.users (id, email)
VALUES (:'user_id', :'user_id' || '@kan135.example.test');
RESET ROLE;

CREATE TEMP TABLE original_profile AS
SELECT id, email, role, subscription_type
FROM public.profiles WHERE id = :'user_id';

DO $$
BEGIN
  IF (SELECT count(*) FROM original_profile
      WHERE email = id::text || '@kan135.example.test'
        AND role = 'user' AND subscription_type = 'free') <> 1 THEN
    RAISE EXCEPTION 'KAN-135: Auth-role insert did not create the expected profile';
  END IF;
END $$;

CREATE TEMP TABLE original_trigger AS
SELECT oid FROM pg_catalog.pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created';

\ir ../migrations/20261108161158_kan135_auth_profile_trigger.sql
ALTER TRIGGER on_auth_user_created ON auth.users RENAME TO kan135_existing_trigger;
\ir ../migrations/20261108161158_kan135_auth_profile_trigger.sql

DO $$
BEGIN
  IF (
    SELECT count(*) FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgfoid = 'public.handle_new_user()'::regprocedure
  ) <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t JOIN original_trigger o USING (oid)
    WHERE t.tgname = 'kan135_existing_trigger' AND t.tgenabled = 'O'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles JOIN original_profile USING (id, email, role, subscription_type)
  ) THEN
    RAISE EXCEPTION 'KAN-135: rerun altered the existing trigger or profile';
  END IF;
END $$;

-- Force a failure after ALTER/REVOKE using inherited effective EXECUTE.
-- The direct grant is to an allowed role, so the initial grant check passes.
ALTER FUNCTION public.handle_new_user() RESET search_path;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT postgres TO supabase_auth_admin;
SAVEPOINT before_conflict;
\set ON_ERROR_STOP off
\ir ../migrations/20261108161158_kan135_auth_profile_trigger.sql
\set conflict_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT before_conflict;
SELECT :'conflict_state' = 'P0001' AS conflict_rejected \gset
\if :conflict_rejected
\else
  DO $$ BEGIN RAISE EXCEPTION 'KAN-135: expected ACL conflict'; END $$;
\endif
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
    WHERE p.oid = 'public.handle_new_user()'::regprocedure
      AND p.proconfig IS NULL AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'KAN-135: function settings or rights changed on failure';
  END IF;
END $$;

REVOKE postgres FROM supabase_auth_admin;
ALTER TABLE auth.users DISABLE TRIGGER kan135_existing_trigger;
SAVEPOINT before_conflict;
\set ON_ERROR_STOP off
\ir ../migrations/20261108161158_kan135_auth_profile_trigger.sql
\set conflict_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT before_conflict;
SELECT :'conflict_state' = 'P0001' AS conflict_rejected \gset
\if :conflict_rejected
\else
  DO $$ BEGIN RAISE EXCEPTION 'KAN-135: expected disabled-trigger conflict'; END $$;
\endif

ROLLBACK;
\echo KAN135_SQL_FIXTURE_PASS
