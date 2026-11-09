-- KAN-135. Review candidate for a new migration. Apply only after approval.
DO $migration$
DECLARE
  profile_function regprocedure := pg_catalog.to_regprocedure('public.handle_new_user()');
  expected_body constant text := $body$
BEGIN
  INSERT INTO public.profiles (id, email, subscription_type, role)
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    'user'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$body$;
  correct_count integer;
  conflicting_names text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KAN-135: Apply as the verified function owner postgres.';
  END IF;

  -- Serialize the inspection and installation against Auth writes and trigger DDL.
  LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = profile_function::oid
      AND p.proowner = 'postgres'::regrole::oid
      AND p.prorettype = 'pg_catalog.trigger'::regtype
      AND l.lanname = 'plpgsql'
      AND p.prosecdef
      AND (p.proconfig IS NULL OR p.proconfig = ARRAY['search_path=pg_catalog, pg_temp'])
      AND pg_catalog.btrim(pg_catalog.replace(p.prosrc, E'\r', ''), E'\n')
        = pg_catalog.btrim(expected_body, E'\n')
  ) THEN
    RAISE EXCEPTION 'KAN-135: public.handle_new_user() differs from the reviewed definition, owner, or settings.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) AS grant_entry
    WHERE p.oid = profile_function::oid
      AND (
        grant_entry.grantor <> p.proowner
        OR grant_entry.grantee NOT IN (
          0::oid, p.proowner, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid
        )
      )
  ) THEN
    RAISE EXCEPTION 'KAN-135: Unrecognized grant on public.handle_new_user().';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgfoid = profile_function::oid AND tgrelid <> 'auth.users'::regclass
  ) THEN
    RAISE EXCEPTION 'KAN-135: public.handle_new_user() is also attached to another table.';
  END IF;

  WITH candidates AS (
    SELECT tgname,
      tgfoid = profile_function::oid
        AND tgtype = 5 -- AFTER INSERT FOR EACH ROW only
        AND tgenabled = 'O' -- normal origin firing mode
        AND tgnargs = 0
        AND tgqual IS NULL
        AND tgconstraint = 0
        AND tgoldtable IS NULL
        AND tgnewtable IS NULL AS is_correct
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
      AND (
        (tgtype & 4) <> 0 -- any INSERT trigger, including a multi-event trigger
        OR tgfoid = profile_function::oid
        OR tgname = 'on_auth_user_created'
      )
  )
  SELECT count(*) FILTER (WHERE is_correct),
    string_agg(quote_ident(tgname), ', ' ORDER BY tgname) FILTER (WHERE NOT is_correct)
  INTO correct_count, conflicting_names
  FROM candidates;

  IF conflicting_names IS NOT NULL OR correct_count > 1 THEN
    RAISE EXCEPTION 'KAN-135: Conflicting or unknown auth.users trigger setup (correct: %, unrecognized: %).',
      correct_count, coalesce(conflicting_names, 'none');
  END IF;

  -- Keep the existing body and function identity, including existing dependencies.
  ALTER FUNCTION public.handle_new_user() SET search_path TO pg_catalog, pg_temp;
  REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) AS roles(role_name)
    WHERE pg_catalog.has_function_privilege(roles.role_name, profile_function::oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'KAN-135: A non-owner Auth or API role still has effective EXECUTE.';
  END IF;

  IF correct_count = 0 THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$migration$;
