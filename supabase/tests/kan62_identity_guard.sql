-- READ-ONLY identity check, before even temporary helper DDL.
DO $identity$
BEGIN
  IF current_database()<>'sololedger_kan62_disposable_20261021'
    OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5432
    OR current_setting('server_version_num')::integer/10000<>17 OR session_user<>'postgres' OR current_user<>'postgres'
    OR current_setting('sololedger.kan62_test_approved',true) IS DISTINCT FROM 'yes'
    OR coalesce(current_setting('sololedger.kan62_expected_oid',true),'') !~ '^[1-9][0-9]*$'
    OR coalesce(current_setting('sololedger.kan62_expected_marker',true),'') !~ '^KAN62 disposable synthetic only [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM current_setting('sololedger.kan62_expected_oid',true)
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM current_setting('sololedger.kan62_expected_marker',true)
  THEN RAISE EXCEPTION 'KAN62 isolated database identity mismatch' USING ERRCODE='42501'; END IF;
END $identity$;
