-- KAN-100 formal local candidate. CLI-created 2026-10-23; NOT applied.
-- Four unchanged drafts follow in dependency order. Their original draft-only
-- comments describe historical provenance, not permission to execute this file.
-- No baseline, historical replay, migration repair, seed, or user-data backfill.
-- Apply only through the separately approved official CLI migration workflow.
DO $kan100_preflight$
BEGIN
  IF md5(pg_get_functiondef('public.lock_accounting_year_boundary(uuid,boolean)'::regprocedure))
      IS DISTINCT FROM '11282f888e3bc863ab03f69813c83750'
    OR md5(pg_get_functiondef('public.delete_user_data_atomic(uuid)'::regprocedure))
      IS DISTINCT FROM '057f055f97fba9da12ceaea482be924e'
    OR md5(pg_get_functiondef('public.delete_user_data_atomic_pre_kan98(uuid)'::regprocedure))
      IS DISTINCT FROM 'f0d2d45da653170037fb89fae2167d2c' THEN
    RAISE EXCEPTION 'KAN100 dependency changed; inspect target before applying.';
  END IF;
  IF has_table_privilege('anon','public.delete_user_data_atomic_lifecycle_context','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('authenticated','public.delete_user_data_atomic_lifecycle_context','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('service_role','public.delete_user_data_atomic_lifecycle_context','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_function_privilege('anon','public.lock_accounting_year_boundary(uuid,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','public.lock_accounting_year_boundary(uuid,boolean)','EXECUTE')
    OR has_function_privilege('service_role','public.lock_accounting_year_boundary(uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'KAN100 private lifecycle/lock boundary changed; inspect target.';
  END IF;
END;
$kan100_preflight$;
-- BEGIN UNCHANGED KAN-100 DRAFTS
-- KAN-100 step 2 DRAFT ONLY. Not an active CLI migration; never applied hosted.
-- Promote through `supabase migration new` only after the next approval.
-- SELECT-only STABLE SPI commands all use the calling query's MVCC snapshot.
CREATE FUNCTION public.get_ne_source_snapshot(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  u uuid := auth.uid();
  year_start date;
  year_end date;
  result jsonb;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9998 THEN
    RAISE EXCEPTION 'Ogiltigt inkomstår.' USING ERRCODE='22023';
  END IF;
  year_start := make_date(p_year,1,1);
  year_end := make_date(p_year,12,31);
  -- Fail closed rather than silently truncate a response. No LIMIT/pagination.
  IF (SELECT count(*) FROM public.journal_entries WHERE user_id=u) > 50000
    OR (SELECT count(*) FROM public.transactions WHERE user_id=u) > 50000 THEN
    RAISE EXCEPTION 'Underlaget överskrider läsvägens storleksgräns.' USING ERRCODE='54000';
  END IF;
  -- Own journal rows without an own parent must not silently disappear in JOIN.
  IF EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id=u
    AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id=j.transaction_id AND t.user_id=u)) THEN
    RAISE EXCEPTION 'Journalens ägarkoppling kunde inte verifieras.' USING ERRCODE='23514';
  END IF;

  WITH RECURSIVE
  own_tx AS MATERIALIZED (SELECT t.* FROM public.transactions t WHERE t.user_id=u),
  parent_links AS MATERIALIZED (
    SELECT DISTINCT child.id child_id, parent.id parent_id
    FROM own_tx child JOIN public.journal_entries j
      ON j.user_id=u AND j.ver_nr=child.corrects_ver_nr
    JOIN own_tx parent ON parent.id=j.transaction_id
    WHERE child.is_correction IS TRUE
  ),
  scope(id) AS (
    SELECT id FROM own_tx WHERE date<=year_end
    UNION -- distinct terminates cycles; ambiguous/cyclic links remain evidence.
    SELECT l.parent_id FROM parent_links l JOIN scope s ON l.child_id=s.id
  ),
  tx AS MATERIALIZED (SELECT t.* FROM own_tx t JOIN scope s ON s.id=t.id),
  journal AS MATERIALIZED (
    SELECT j.*,t.date transaction_date FROM public.journal_entries j
    JOIN tx t ON t.id=j.transaction_id AND t.user_id=j.user_id WHERE j.user_id=u
  ),
  decisions AS MATERIALIZED (
    SELECT c.* FROM public.ne_sales_classifications c
    WHERE c.user_id=u AND EXISTS (SELECT 1 FROM journal j WHERE j.id=c.journal_entry_id)
  ),
  batches AS MATERIALIZED (
    SELECT b.* FROM public.import_batches b WHERE b.user_id=u
      AND (b.fiscal_year IS NULL OR b.fiscal_year<=p_year OR EXISTS (SELECT 1 FROM tx t WHERE t.import_batch_id=b.id))
  ),
  periods AS (
    SELECT 'annual' period, account_number,
      round(sum(coalesce(debit,0)-coalesce(credit,0)),2)::text balance
    FROM journal WHERE transaction_date>=year_start AND transaction_date<=year_end GROUP BY account_number
    UNION ALL
    SELECT 'opening',account_number,round(sum(coalesce(debit,0)-coalesce(credit,0)),2)::text
    FROM journal WHERE transaction_date<year_start GROUP BY account_number
    UNION ALL
    SELECT 'closing',account_number,round(sum(coalesce(debit,0)-coalesce(credit,0)),2)::text
    FROM journal WHERE transaction_date<=year_end GROUP BY account_number
  )
  SELECT jsonb_build_object(
    'version',1,'owner',u,'income_year',p_year,
    'period_start',year_start,'period_end',year_end,
    'captured_at',statement_timestamp(),
    'company',(SELECT jsonb_build_object('name',company_name,'org_nr',org_nr) FROM public.profiles WHERE id=u),
    'year_lock',(SELECT jsonb_build_object('id',id,'closed_at',closed_at) FROM public.closed_years WHERE user_id=u AND year=p_year),
    'transactions',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'user_id',user_id,'date',date,'description',description,'booked',booked,
      'vat_rate',vat_rate::text,'source',source,'import_batch_id',import_batch_id,
      'source_ver_series',source_ver_series,'source_ver_number',source_ver_number,
      'is_correction',is_correction,'corrects_ver_nr',corrects_ver_nr,
      'is_periodized',is_periodized,'is_periodized_reversal',is_periodized_reversal,
      'periodization_group_id',periodization_group_id,'periodized_future_date',periodized_future_date
    ) ORDER BY id) FROM tx),'[]'::jsonb),
    'journal',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'user_id',user_id,'transaction_id',transaction_id,'ver_nr',ver_nr,
      'account_number',account_number,'debit',debit::text,'credit',credit::text,
      'date',date,'description',description
    ) ORDER BY id) FROM journal),'[]'::jsonb),
    'decisions',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY journal_entry_id) FROM decisions c),'[]'::jsonb),
    -- Include prior/undated batches even without linked rows; undone != safe.
    'imports',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'user_id',b.user_id,'fiscal_year',b.fiscal_year,'status',b.status,
      'file_hash',b.file_hash,'created_at',b.created_at,'completed_at',b.completed_at,'undone_at',b.undone_at
    ) ORDER BY b.id) FROM batches b),'[]'::jsonb),
    'balances',jsonb_build_object(
      'annual',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account_number,'balance',balance) ORDER BY account_number) FROM periods WHERE period='annual'),'[]'::jsonb),
      'opening',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account_number,'balance',balance) ORDER BY account_number) FROM periods WHERE period='opening'),'[]'::jsonb),
      'closing',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account_number,'balance',balance) ORDER BY account_number) FROM periods WHERE period='closing'),'[]'::jsonb)
    ),
    'counts',jsonb_build_object('transactions',(SELECT count(*) FROM tx),'journal',(SELECT count(*) FROM journal),
      'decisions',(SELECT count(*) FROM decisions),'imports',(SELECT count(*) FROM batches)),
    'integrity',jsonb_build_object('mislinked_decisions',(SELECT count(*) FROM decisions c JOIN journal j ON j.id=c.journal_entry_id WHERE c.transaction_id<>j.transaction_id))
  ) INTO result;
  IF pg_column_size(result)>33554432 THEN
    RAISE EXCEPTION 'Underlaget överskrider läsvägens storleksgräns.' USING ERRCODE='54000';
  END IF;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_ne_source_snapshot(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_ne_source_snapshot(integer) TO authenticated;
COMMENT ON FUNCTION public.get_ne_source_snapshot(integer) IS
  'KAN-100 v1 read-only source snapshot. No archive, locks, tax verification or write operation.';

-- KAN-100 private owner helper. Identical read body to approved step 2; no API grants.
CREATE FUNCTION public.kan100_ne_source_for_owner(p_owner uuid,p_year integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  u uuid := p_owner;
  year_start date;
  year_end date;
  result jsonb;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9998 THEN
    RAISE EXCEPTION 'Ogiltigt inkomstår.' USING ERRCODE='22023';
  END IF;
  year_start := make_date(p_year,1,1);
  year_end := make_date(p_year,12,31);
  -- Fail closed rather than silently truncate a response. No LIMIT/pagination.
  IF (SELECT count(*) FROM public.journal_entries WHERE user_id=u) > 50000
    OR (SELECT count(*) FROM public.transactions WHERE user_id=u) > 50000 THEN
    RAISE EXCEPTION 'Underlaget överskrider läsvägens storleksgräns.' USING ERRCODE='54000';
  END IF;
  -- Own journal rows without an own parent must not silently disappear in JOIN.
  IF EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id=u
    AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id=j.transaction_id AND t.user_id=u)) THEN
    RAISE EXCEPTION 'Journalens ägarkoppling kunde inte verifieras.' USING ERRCODE='23514';
  END IF;

  WITH RECURSIVE
  own_tx AS MATERIALIZED (SELECT t.* FROM public.transactions t WHERE t.user_id=u),
  parent_links AS MATERIALIZED (
    SELECT DISTINCT child.id child_id, parent.id parent_id
    FROM own_tx child JOIN public.journal_entries j
      ON j.user_id=u AND j.ver_nr=child.corrects_ver_nr
    JOIN own_tx parent ON parent.id=j.transaction_id
    WHERE child.is_correction IS TRUE
  ),
  scope(id) AS (
    SELECT id FROM own_tx WHERE date<=year_end
    UNION -- distinct terminates cycles; ambiguous/cyclic links remain evidence.
    SELECT l.parent_id FROM parent_links l JOIN scope s ON l.child_id=s.id
  ),
  tx AS MATERIALIZED (SELECT t.* FROM own_tx t JOIN scope s ON s.id=t.id),
  journal AS MATERIALIZED (
    SELECT j.*,t.date transaction_date FROM public.journal_entries j
    JOIN tx t ON t.id=j.transaction_id AND t.user_id=j.user_id WHERE j.user_id=u
  ),
  decisions AS MATERIALIZED (
    SELECT c.* FROM public.ne_sales_classifications c
    WHERE c.user_id=u AND EXISTS (SELECT 1 FROM journal j WHERE j.id=c.journal_entry_id)
  ),
  batches AS MATERIALIZED (
    SELECT b.* FROM public.import_batches b WHERE b.user_id=u
      AND (b.fiscal_year IS NULL OR b.fiscal_year<=p_year OR EXISTS (SELECT 1 FROM tx t WHERE t.import_batch_id=b.id))
  ),
  periods AS (
    SELECT 'annual' period, account_number,
      round(sum(coalesce(debit,0)-coalesce(credit,0)),2)::text balance
    FROM journal WHERE transaction_date>=year_start AND transaction_date<=year_end GROUP BY account_number
    UNION ALL
    SELECT 'opening',account_number,round(sum(coalesce(debit,0)-coalesce(credit,0)),2)::text
    FROM journal WHERE transaction_date<year_start GROUP BY account_number
    UNION ALL
    SELECT 'closing',account_number,round(sum(coalesce(debit,0)-coalesce(credit,0)),2)::text
    FROM journal WHERE transaction_date<=year_end GROUP BY account_number
  )
  SELECT jsonb_build_object(
    'version',1,'owner',u,'income_year',p_year,
    'period_start',year_start,'period_end',year_end,
    'captured_at',statement_timestamp(),
    'company',(SELECT jsonb_build_object('name',company_name,'org_nr',org_nr) FROM public.profiles WHERE id=u),
    'year_lock',(SELECT jsonb_build_object('id',id,'closed_at',closed_at) FROM public.closed_years WHERE user_id=u AND year=p_year),
    'transactions',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'user_id',user_id,'date',date,'description',description,'booked',booked,
      'vat_rate',vat_rate::text,'source',source,'import_batch_id',import_batch_id,
      'source_ver_series',source_ver_series,'source_ver_number',source_ver_number,
      'is_correction',is_correction,'corrects_ver_nr',corrects_ver_nr,
      'is_periodized',is_periodized,'is_periodized_reversal',is_periodized_reversal,
      'periodization_group_id',periodization_group_id,'periodized_future_date',periodized_future_date
    ) ORDER BY id) FROM tx),'[]'::jsonb),
    'journal',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'user_id',user_id,'transaction_id',transaction_id,'ver_nr',ver_nr,
      'account_number',account_number,'debit',debit::text,'credit',credit::text,
      'date',date,'description',description
    ) ORDER BY id) FROM journal),'[]'::jsonb),
    'decisions',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY journal_entry_id) FROM decisions c),'[]'::jsonb),
    -- Include prior/undated batches even without linked rows; undone != safe.
    'imports',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'user_id',b.user_id,'fiscal_year',b.fiscal_year,'status',b.status,
      'file_hash',b.file_hash,'created_at',b.created_at,'completed_at',b.completed_at,'undone_at',b.undone_at
    ) ORDER BY b.id) FROM batches b),'[]'::jsonb),
    'balances',jsonb_build_object(
      'annual',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account_number,'balance',balance) ORDER BY account_number) FROM periods WHERE period='annual'),'[]'::jsonb),
      'opening',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account_number,'balance',balance) ORDER BY account_number) FROM periods WHERE period='opening'),'[]'::jsonb),
      'closing',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account_number,'balance',balance) ORDER BY account_number) FROM periods WHERE period='closing'),'[]'::jsonb)
    ),
    'counts',jsonb_build_object('transactions',(SELECT count(*) FROM tx),'journal',(SELECT count(*) FROM journal),
      'decisions',(SELECT count(*) FROM decisions),'imports',(SELECT count(*) FROM batches)),
    'integrity',jsonb_build_object('mislinked_decisions',(SELECT count(*) FROM decisions c JOIN journal j ON j.id=c.journal_entry_id WHERE c.transaction_id<>j.transaction_id))
  ) INTO result;
  IF pg_column_size(result)>33554432 THEN
    RAISE EXCEPTION 'Underlaget överskrider läsvägens storleksgräns.' USING ERRCODE='54000';
  END IF;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.kan100_ne_source_for_owner(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;

-- KAN-100 step 3 LOCAL DRAFT. No hosted execution, no migration ledger entry.
-- Install together with step-2 source reader and generated owner/deletion draft.
CREATE TABLE public.declaration_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  income_year integer NOT NULL CHECK (income_year BETWEEN 1900 AND 9998),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  calculation_version text NOT NULL,
  app_revision text NOT NULL CHECK (app_revision ~ '^[a-f0-9]{40}$'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  source_payload jsonb NOT NULL CHECK (jsonb_typeof(source_payload)='object'),
  computed_payload jsonb NOT NULL CHECK (jsonb_typeof(computed_payload)='object'),
  risk_payload jsonb NOT NULL CHECK (jsonb_typeof(risk_payload)='object'
    AND risk_payload->>'verification'='not_verified'),
  UNIQUE (user_id,income_year,id)
);
-- No FK to live journal/import/closed-year rows: their historical identity and
-- values are frozen inside source_payload, independent of subsequent corrections.
CREATE TABLE public.declaration_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  income_year integer NOT NULL CHECK (income_year BETWEEN 1900 AND 9998),
  revision_no integer NOT NULL CHECK (revision_no > 0),
  previous_revision_id uuid,
  source_snapshot_id uuid,
  submission_source_snapshot_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by uuid NOT NULL CHECK (recorded_by=user_id),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  change_kind text NOT NULL CHECK (change_kind IN ('initial','documentation_correction','new_calculation','declaration_amendment')),
  reason text NOT NULL CHECK (length(reason)<=4000),
  manual_payload jsonb NOT NULL CHECK (jsonb_typeof(manual_payload)='object'),
  submission_payload jsonb NOT NULL CHECK (jsonb_typeof(submission_payload)='object'
    AND submission_payload->>'status' IN ('not_recorded','submitted_by_user')),
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload)='object'),
  UNIQUE (user_id,income_year,id), UNIQUE (user_id,income_year,revision_no), UNIQUE (user_id,request_id),
  FOREIGN KEY (user_id,income_year,previous_revision_id)
    REFERENCES public.declaration_revisions(user_id,income_year,id),
  FOREIGN KEY (user_id,income_year,source_snapshot_id)
    REFERENCES public.declaration_source_snapshots(user_id,income_year,id),
  FOREIGN KEY (user_id,income_year,submission_source_snapshot_id)
    REFERENCES public.declaration_source_snapshots(user_id,income_year,id),
  CHECK ((revision_no=1)=(previous_revision_id IS NULL)),
  CHECK ((revision_no=1)=(change_kind='initial')),
  CHECK (revision_no=1 OR length(btrim(reason))>0)
);
CREATE INDEX declaration_revisions_source ON public.declaration_revisions(user_id,income_year,source_snapshot_id);
CREATE INDEX declaration_revisions_submitted_source ON public.declaration_revisions(user_id,income_year,submission_source_snapshot_id);
CREATE INDEX declaration_revisions_previous ON public.declaration_revisions(user_id,income_year,previous_revision_id);
ALTER TABLE public.declaration_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declaration_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY declaration_sources_read ON public.declaration_source_snapshots
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY declaration_revisions_read ON public.declaration_revisions
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
-- Remove inherited/default privileges, including service-role direct writes.
REVOKE ALL ON public.declaration_source_snapshots,public.declaration_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.declaration_source_snapshots,public.declaration_revisions TO authenticated,service_role;

CREATE FUNCTION public.guard_declaration_archive_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF TG_OP='DELETE' AND EXISTS (SELECT 1 FROM public.delete_user_data_atomic_lifecycle_context
    WHERE backend_pid=pg_backend_pid() AND user_id=OLD.user_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Deklarationshistorik kan bara rättas med en ny version.' USING ERRCODE='42501';
END;$fn$;
REVOKE ALL ON FUNCTION public.guard_declaration_archive_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER declaration_source_immutable BEFORE UPDATE OR DELETE ON public.declaration_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_declaration_archive_immutable();
CREATE TRIGGER declaration_revision_immutable BEFORE UPDATE OR DELETE ON public.declaration_revisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_declaration_archive_immutable();
CREATE TRIGGER declaration_source_no_truncate BEFORE TRUNCATE ON public.declaration_source_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_declaration_archive_immutable();
CREATE TRIGGER declaration_revision_no_truncate BEFORE TRUNCATE ON public.declaration_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_declaration_archive_immutable();

CREATE FUNCTION public.save_declaration_revision_atomic(p_user_id uuid,p_request_id uuid,p_request jsonb,p_candidate jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE
  y integer; mode text; previous uuid; source_id uuid; submitted_source uuid;
  latest public.declaration_revisions%ROWTYPE; receipt public.declaration_revisions%ROWTYPE;
  fresh jsonb; risk jsonb; result_id uuid; next_no integer;
BEGIN
  -- Same first lock domain as close/correction/import/delete. READ COMMITTED is
  -- enforced by this helper. Never acquire a source/profile lock before it.
  PERFORM public.lock_accounting_year_boundary(p_user_id,true);
  IF p_request_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object'
    OR (p_request->>'schema_version') IS DISTINCT FROM '1' OR pg_column_size(p_request)>262144 THEN
    RAISE EXCEPTION 'Ogiltig arkivbegäran.' USING ERRCODE='22023'; END IF;
  SELECT * INTO receipt FROM public.declaration_revisions WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.request_payload IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'Begäransnyckeln har redan använts för andra uppgifter.' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('status','replayed','id',receipt.id,'revision_no',receipt.revision_no,'source_snapshot_id',receipt.source_snapshot_id);
  END IF;
  -- Profile writes do not all use the accounting gate. Lock this row before
  -- fresh source read so its company metadata cannot change through commit.
  PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Användaren finns inte.' USING ERRCODE='P0002'; END IF;
  y:=(p_request->>'income_year')::integer; mode:=p_request#>>'{source,mode}';
  previous:=(p_request->>'expected_previous_id')::uuid;
  IF y IS NULL OR y NOT BETWEEN 1900 AND 9998 OR mode IS NULL OR mode NOT IN ('capture','reuse','none')
    OR jsonb_typeof(p_request->'manual') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_request->'submission') IS DISTINCT FROM 'object'
    OR (p_request#>>'{submission,status}') IS NULL OR (p_request#>>'{submission,status}') NOT IN ('not_recorded','submitted_by_user') THEN
    RAISE EXCEPTION 'Ogiltigt arkivinnehåll.' USING ERRCODE='22023'; END IF;
  SELECT * INTO latest FROM public.declaration_revisions WHERE user_id=p_user_id AND income_year=y ORDER BY revision_no DESC LIMIT 1;
  IF previous IS DISTINCT FROM latest.id THEN RAISE EXCEPTION 'Arkivet har en senare version.' USING ERRCODE='40001'; END IF;
  next_no:=coalesce(latest.revision_no,0)+1;
  IF (next_no=1) IS DISTINCT FROM (p_request->>'change_kind'='initial')
    OR (next_no>1 AND coalesce(length(btrim(p_request->>'reason')),0)=0) THEN
    RAISE EXCEPTION 'Ändringsorsak/version saknas.' USING ERRCODE='22023'; END IF;
  IF p_request->>'change_kind'='documentation_correction' AND
    (mode='capture' OR (p_request#>>'{source,snapshot_id}')::uuid IS DISTINCT FROM latest.source_snapshot_id) THEN
    RAISE EXCEPTION 'Dokumentationsrättelse ska behålla det frysta underlaget.' USING ERRCODE='23514'; END IF;
  IF p_request->>'change_kind'='new_calculation' AND (mode<>'capture'
    OR p_request->'manual' IS DISTINCT FROM latest.manual_payload
    OR p_request->'submission' IS DISTINCT FROM latest.submission_payload) THEN
    RAISE EXCEPTION 'Nytt beräkningsunderlag ska bevara tidigare användaruppgifter och deklarationskälla.' USING ERRCODE='23514'; END IF;
  IF p_request->>'change_kind'='declaration_amendment' AND
    ((p_request#>>'{submission,status}') IS DISTINCT FROM 'submitted_by_user'
      OR (p_request#>>'{submission,kind}') IS DISTINCT FROM 'amendment') THEN
    RAISE EXCEPTION 'Deklarationsrättelse kräver en dokumenterad ändringsinlämning.' USING ERRCODE='23514'; END IF;
  IF mode='capture' THEN
    IF p_request#>>'{source,snapshot_id}' IS NOT NULL THEN RAISE EXCEPTION 'Ogiltig källkoppling.' USING ERRCODE='22023'; END IF;
    -- Probe allows replay before any current-source read; it writes nothing.
    IF p_candidate IS NULL THEN RETURN jsonb_build_object('status','needs_source'); END IF;
    IF jsonb_typeof(p_candidate)<>'object' OR pg_column_size(p_candidate)>40000000
      OR jsonb_typeof(p_candidate->'source') IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_candidate->'computed') IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_candidate->'risk') IS DISTINCT FROM 'object'
      OR (p_candidate->>'source_fingerprint') IS DISTINCT FROM (p_request#>>'{source,expected_fingerprint}')
      OR coalesce(length(p_candidate->>'calculation_version'),0)=0 THEN
      RAISE EXCEPTION 'Ogiltigt serverunderlag.' USING ERRCODE='22023'; END IF;
    -- A new SQL command after all waits gets a fresh MVCC snapshot. Private
    -- owner reader has identical body to step 2, never a JWT rewrite.
    fresh:=public.kan100_ne_source_for_owner(p_user_id,y);
    IF fresh-'captured_at' IS DISTINCT FROM (p_candidate->'source')-'captured_at' THEN
      RAISE EXCEPTION 'Bokföringsunderlaget har ändrats.' USING ERRCODE='40001'; END IF;
    IF jsonb_typeof(fresh->'year_lock') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Ett fryst bokföringsunderlag kräver låst år.' USING ERRCODE='23514'; END IF;
    risk:=p_candidate->'risk';
    IF risk->>'verification' IS DISTINCT FROM 'not_verified'
      OR risk->>'assessment' IS NULL OR risk->>'assessment' NOT IN ('limited','not_assessed')
      OR risk->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(risk->'reasons') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Ogiltig riskmärkning.' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(risk->'reasons')>0 THEN risk:=jsonb_set(risk,'{assessment}','"limited"'); END IF;
    -- Independent fail-closed DB backstop. No dependence on today's NE warnings.
    IF jsonb_array_length(fresh->'imports')>0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(fresh->'transactions') t
      WHERE t->>'source' IS NULL OR t->>'source' NOT IN ('manual','vat_closing','vat_v2','vat_settlement','tax_account_movement','customer_invoice','fixed_asset','fixed_asset_reclassification','fixed_asset_depreciation','supplier_invoice')
        OR t->>'import_batch_id' IS NOT NULL OR t->>'source_ver_series' IS NOT NULL OR t->>'source_ver_number' IS NOT NULL) THEN
      risk:=risk || jsonb_build_object('assessment','limited','db_import_or_unknown_source',true,
        'affected_sections',jsonb_build_array('NE','result','balance'),
        'reasons',CASE WHEN (risk->'reasons') ? 'db_import_or_unknown_source' THEN risk->'reasons'
          ELSE (risk->'reasons') || '["db_import_or_unknown_source"]'::jsonb END);
    END IF;
    INSERT INTO public.declaration_source_snapshots(user_id,income_year,schema_version,calculation_version,app_revision,source_fingerprint,source_payload,computed_payload,risk_payload)
      VALUES(p_user_id,y,1,p_candidate->>'calculation_version',p_candidate->>'app_revision',p_candidate->>'source_fingerprint',fresh,p_candidate->'computed',risk) RETURNING id INTO source_id;
  ELSIF mode='reuse' THEN
    source_id:=(p_request#>>'{source,snapshot_id}')::uuid;
    IF source_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.declaration_source_snapshots WHERE user_id=p_user_id AND income_year=y AND id=source_id) THEN
      RAISE EXCEPTION 'Underlaget hör inte till detta arkiv.' USING ERRCODE='23503'; END IF;
  ELSE
    IF p_request#>>'{source,snapshot_id}' IS NOT NULL THEN RAISE EXCEPTION 'Ogiltig källkoppling.' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_request#>>'{submission,source_snapshot_id}'='current' THEN submitted_source:=source_id;
  ELSE submitted_source:=(p_request#>>'{submission,source_snapshot_id}')::uuid; END IF;
  IF p_request#>>'{submission,source_snapshot_id}'='current' AND submitted_source IS NULL THEN
    RAISE EXCEPTION 'Deklarationens underlag saknas.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.declaration_revisions(user_id,income_year,revision_no,previous_revision_id,source_snapshot_id,submission_source_snapshot_id,
    recorded_by,schema_version,change_kind,reason,manual_payload,submission_payload,request_id,request_payload)
    VALUES(p_user_id,y,next_no,previous,source_id,submitted_source,p_user_id,1,p_request->>'change_kind',p_request->>'reason',p_request->'manual',
      jsonb_set(p_request->'submission','{source_snapshot_id}',coalesce(to_jsonb(submitted_source),'null'::jsonb)),p_request_id,p_request) RETURNING id INTO result_id;
  RETURN jsonb_build_object('status','saved','id',result_id,'revision_no',next_no,'source_snapshot_id',source_id);
END;$fn$;
REVOKE ALL ON FUNCTION public.save_declaration_revision_atomic(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_declaration_revision_atomic(uuid,uuid,jsonb,jsonb) TO service_role;

-- KAN-100 local DRAFT. Exact live preimage read 2026-10-23.
-- Preserve KAN-98 wrapper and all existing deletion authorization/order.
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.delete_user_data_atomic_pre_kan98(uuid)'::regprocedure)) IS DISTINCT FROM 'f0d2d45da653170037fb89fae2167d2c' THEN
 RAISE EXCEPTION 'Deletion preimage mismatch; inspect target before applying.'; END IF;
END;$guard$;
CREATE OR REPLACE FUNCTION public.delete_user_data_atomic_pre_kan98(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_declaration_revisions integer := 0;
  v_declaration_sources integer := 0;
  v_withdrawal_assessment_facts integer := 0;
  v_withdrawal_assessment_revisions integer := 0;
  v_standard_booking_idempotency integer := 0;
  v_ne_sales_classifications integer := 0;
  v_fixed_asset_depreciation_runs integer := 0;
  v_fixed_asset_events integer := 0;
  v_fixed_asset_acquisition_idempotency integer := 0;
  v_fixed_assets integer := 0;
  v_fixed_asset_acquisition_groups integer := 0;
  v_customer_invoice_bookings integer := 0;
  v_customer_invoices integer := 0;
  v_tax_account_movements integer := 0;
  v_tax_account_events integer := 0;
  v_vat_v2_booking_idempotency integer := 0;
  v_vat_audit_snapshots integer := 0;
  v_vat_periods integer := 0;
  v_company_payment_account_roles integer := 0;
  v_journal_entries integer := 0;
  v_transactions integer := 0;
  v_favorites integer := 0;
  v_import_batches integer := 0;
  v_accounts integer := 0;
  v_closed_years integer := 0;
  v_ver_nr_sequences integer := 0;
  v_profiles integer := 0;
  v_sie_import_inputs integer := 0;
BEGIN
  PERFORM public.lock_accounting_year_boundary(p_user_id, true); -- KAN-75: first lock domain
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id krävs.' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Användaren hittades inte.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin-konton kan inte raderas här.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (
    backend_pid,
    user_id
  ) VALUES (
    pg_backend_pid(),
    p_user_id
  )
  ON CONFLICT (backend_pid, user_id)
  DO UPDATE SET created_at = excluded.created_at;

  DELETE FROM public.declaration_revisions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_declaration_revisions = ROW_COUNT;
  DELETE FROM public.declaration_source_snapshots WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_declaration_sources = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.declaration_revisions WHERE user_id=p_user_id)
    OR EXISTS (SELECT 1 FROM public.declaration_source_snapshots WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'Deklarationsarkiv finns kvar; raderingen rullas tillbaka.'; END IF;

  DELETE FROM public.withdrawal_assessment_facts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_withdrawal_assessment_facts = ROW_COUNT;
  DELETE FROM public.withdrawal_assessment_revisions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_withdrawal_assessment_revisions = ROW_COUNT;

  DELETE FROM public.sie_import_inputs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_sie_import_inputs = ROW_COUNT;

  DELETE FROM public.ne_sales_classifications WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ne_sales_classifications = ROW_COUNT;

  DELETE FROM public.fixed_asset_depreciation_runs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_depreciation_runs = ROW_COUNT;

  DELETE FROM public.fixed_asset_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_events = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_idempotency = ROW_COUNT;

  DELETE FROM public.fixed_assets WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_assets = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_groups WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_groups = ROW_COUNT;

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

  DELETE FROM public.customer_invoices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoices = ROW_COUNT;

  DELETE FROM public.vat_v2_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_v2_booking_idempotency = ROW_COUNT;

  DELETE FROM public.vat_audit_snapshots WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_audit_snapshots = ROW_COUNT;

  DELETE FROM public.vat_periods WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_periods = ROW_COUNT;

  DELETE FROM public.company_payment_account_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_company_payment_account_roles = ROW_COUNT;

  DELETE FROM public.standard_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_standard_booking_idempotency = ROW_COUNT;

  DELETE FROM public.journal_entries WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_journal_entries = ROW_COUNT;

  DELETE FROM public.transactions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  DELETE FROM public.favorites WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_favorites = ROW_COUNT;

  DELETE FROM public.import_batches WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_import_batches = ROW_COUNT;

  DELETE FROM public.accounts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  DELETE FROM public.closed_years WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_closed_years = ROW_COUNT;

  DELETE FROM public.ver_nr_sequences WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ver_nr_sequences = ROW_COUNT;

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  IF v_profiles <> 1 THEN
    RAISE EXCEPTION 'Profilraderingen gav oväntat resultat.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted', jsonb_build_object(
      'declaration_revisions', v_declaration_revisions,
      'declaration_source_snapshots', v_declaration_sources,
      'withdrawal_assessment_facts', v_withdrawal_assessment_facts,
      'withdrawal_assessment_revisions', v_withdrawal_assessment_revisions,
      'ne_sales_classifications', v_ne_sales_classifications,
      'fixed_asset_depreciation_runs', v_fixed_asset_depreciation_runs,
      'fixed_asset_events', v_fixed_asset_events,
      'fixed_asset_acquisition_idempotency', v_fixed_asset_acquisition_idempotency,
      'fixed_assets', v_fixed_assets,
      'fixed_asset_acquisition_groups', v_fixed_asset_acquisition_groups,
      'customer_invoice_bookings', v_customer_invoice_bookings,
      'customer_invoices', v_customer_invoices,
      'tax_account_movements', v_tax_account_movements,
      'tax_account_events', v_tax_account_events,
      'vat_v2_booking_idempotency', v_vat_v2_booking_idempotency,
      'vat_audit_snapshots', v_vat_audit_snapshots,
      'vat_periods', v_vat_periods,
      'company_payment_account_roles', v_company_payment_account_roles,
      'standard_booking_idempotency', v_standard_booking_idempotency,
      'journal_entries', v_journal_entries,
      'transactions', v_transactions,
      'favorites', v_favorites,
      'import_batches', v_import_batches,
      'accounts', v_accounts,
      'closed_years', v_closed_years,
      'ver_nr_sequences', v_ver_nr_sequences,
      'sie_import_inputs', v_sie_import_inputs,
      'profiles', v_profiles
    )
  );
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic_pre_kan98(uuid) FROM PUBLIC,anon,authenticated,service_role;
