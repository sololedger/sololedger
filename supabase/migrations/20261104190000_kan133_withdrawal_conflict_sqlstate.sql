-- A stale revision or source is an application conflict, not a serialization failure.
-- Keep the verified function definition, owner and grants apart from the two error codes.
DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'public.save_withdrawal_assessment(date,uuid,text,jsonb)'::regprocedure
  );
BEGIN
  IF md5(definition) IS DISTINCT FROM '38236b10e5afcc47204c556314d8f038' THEN
    RAISE EXCEPTION 'KAN-133 withdrawal save definition changed; inspect before applying.';
  END IF;

  EXECUTE replace(definition, 'ERRCODE=''40001''', 'ERRCODE=''PT409''');
END;
$migration$;
