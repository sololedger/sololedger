-- KAN-97 LOCAL CANDIDATE ONLY. Not executed in any database.
-- Advisory facts do not create or change journal entries, tax events or VAT periods.
BEGIN;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.delete_user_data_atomic(uuid)'::regprocedure))
     IS DISTINCT FROM '38dfeadd82b8e20179829ea465c9a1b0' THEN
    RAISE EXCEPTION 'Unexpected delete_user_data_atomic definition: inspect target before applying KAN-97.';
  END IF;
END;
$guard$;
CREATE TABLE public.withdrawal_assessment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  revision_no bigint NOT NULL CHECK (revision_no > 0),
  previous_revision_id uuid,
  as_of_date date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  source_signature text NOT NULL,
  UNIQUE (user_id, id), UNIQUE (user_id, revision_no),
  FOREIGN KEY (user_id, previous_revision_id)
    REFERENCES public.withdrawal_assessment_revisions(user_id, id)
);
CREATE TABLE public.withdrawal_assessment_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  fact_key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  observed_on date NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('user_checked','user_statement','user_estimate')),
  UNIQUE (revision_id, fact_key),
  FOREIGN KEY (user_id, revision_id)
    REFERENCES public.withdrawal_assessment_revisions(user_id, id) ON DELETE CASCADE
);
CREATE INDEX withdrawal_assessment_facts_owner ON public.withdrawal_assessment_facts(user_id);
ALTER TABLE public.withdrawal_assessment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_assessment_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_revisions_select ON public.withdrawal_assessment_revisions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY withdrawal_facts_select ON public.withdrawal_assessment_facts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.withdrawal_assessment_revisions, public.withdrawal_assessment_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.withdrawal_assessment_revisions, public.withdrawal_assessment_facts TO authenticated;
GRANT ALL ON public.withdrawal_assessment_revisions, public.withdrawal_assessment_facts TO service_role;

CREATE FUNCTION public.withdrawal_financial_signature(p_as_of date)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public
AS $fn$
  SELECT md5(jsonb_build_object(
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'transaction_id',e.transaction_id,'period',e.vat_period_id,'date',e.event_date,'kind',e.event_kind,'amount',e.amount) ORDER BY e.id) FROM public.tax_account_events e
      WHERE e.user_id = auth.uid() AND e.event_date <= p_as_of), '[]'::jsonb),
    'movements', coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'transaction_id',m.transaction_id,'period',m.vat_period_id,'date',m.movement_date,'kind',m.movement_kind,'account',m.counter_account_number,'amount',m.amount) ORDER BY m.id) FROM public.tax_account_movements m
      WHERE m.user_id = auth.uid() AND m.movement_date <= p_as_of), '[]'::jsonb),
    'journal', coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'transaction_id',j.transaction_id,'date',j.date,'account',j.account_number,'debit',j.debit,'credit',j.credit) ORDER BY j.id) FROM public.journal_entries j
      WHERE j.user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.journal_entries f
        WHERE f.user_id = auth.uid() AND f.transaction_id = j.transaction_id
          AND f.account_number = '2012' AND f.date <= p_as_of)), '[]'::jsonb)
  )::text);
$fn$;
REVOKE ALL ON FUNCTION public.withdrawal_financial_signature(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdrawal_financial_signature(date) TO authenticated, service_role;

CREATE FUNCTION public.get_withdrawal_context(p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public
AS $fn$
DECLARE
  u uuid := auth.uid(); data jsonb; revision jsonb; anchor date;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE = '28000'; END IF;
  IF p_as_of IS NULL OR p_as_of < DATE '1900-01-01' OR p_as_of > (now() AT TIME ZONE 'Europe/Stockholm')::date THEN
    RAISE EXCEPTION 'Ogiltigt värderingsdatum.' USING ERRCODE = '22023';
  END IF;
  -- One statement snapshot; no pagination truncation or ensure/setup writes.
  IF (SELECT count(*) FROM public.journal_entries WHERE user_id=u AND date<=p_as_of) > 100000 THEN
    RAISE EXCEPTION 'Underlaget är för stort för denna uttagsversion.';
  END IF;
  SELECT jsonb_build_object('id',r.id,'user_id',r.user_id,'as_of_date',r.as_of_date,'recorded_at',r.recorded_at,
    'facts',coalesce((SELECT jsonb_agg(jsonb_build_object('key',f.fact_key,'value',f.payload,'observed_on',f.observed_on,'source',f.source_kind) ORDER BY f.fact_key)
      FROM public.withdrawal_assessment_facts f WHERE f.revision_id=r.id AND f.user_id=u),'[]'::jsonb))
  INTO revision FROM public.withdrawal_assessment_revisions r
  WHERE r.user_id=u AND r.as_of_date<=p_as_of ORDER BY r.revision_no DESC LIMIT 1;
  SELECT (f->'value'->>'date')::date INTO anchor FROM jsonb_array_elements(revision->'facts') f WHERE f->>'key'='tax_account';
  SELECT jsonb_build_object('protocol',1,'user_id',u,'as_of',p_as_of,
    'transactions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'user_id',t.user_id,'date',t.date,'source',t.source,'booked',t.booked) ORDER BY t.id)
      FROM public.transactions t WHERE t.user_id=u AND (t.date<=p_as_of OR EXISTS
      (SELECT 1 FROM public.journal_entries j WHERE j.transaction_id=t.id AND j.user_id=u AND j.date<=p_as_of))),'[]'::jsonb),
    'journal',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'user_id',j.user_id,'transaction_id',j.transaction_id,'date',j.date,'account_number',j.account_number,'debit',coalesce(j.debit,0),'credit',coalesce(j.credit,0)) ORDER BY j.id)
      FROM public.journal_entries j WHERE j.user_id=u AND j.date<=p_as_of),'[]'::jsonb),
    'periods',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'user_id',v.user_id,'period_start',v.period_start,'period_end',v.period_end,'source',v.source,'status',v.status,'closing_amount',v.closing_amount) ORDER BY v.id)
      FROM public.vat_periods v WHERE v.user_id=u AND v.period_start<=p_as_of),'[]'::jsonb),
    'snapshots',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',v.user_id,'transaction_id',v.transaction_id,'snapshot',v.snapshot) ORDER BY v.transaction_id)
      FROM public.vat_audit_snapshots v JOIN public.transactions t ON t.id=v.transaction_id AND t.user_id=u WHERE v.user_id=u AND t.date<=p_as_of),'[]'::jsonb),
    'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.tax_account_events e WHERE e.user_id=u AND e.event_date<=p_as_of),'[]'::jsonb),
    'movements',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.tax_account_movements m WHERE m.user_id=u AND m.movement_date<=p_as_of),'[]'::jsonb),
    'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',c.user_id,'role',c.role,'account_number',c.account_number) ORDER BY c.role)
      FROM public.company_payment_account_roles c WHERE c.user_id=u),'[]'::jsonb)
  ) INTO data;
  RETURN data || jsonb_build_object('signature',md5(data::text),'revision',revision,
    'financial_signature',public.withdrawal_financial_signature(p_as_of),
    'anchor_financial_signature',CASE WHEN anchor IS NULL THEN NULL ELSE public.withdrawal_financial_signature(anchor) END);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_withdrawal_context(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_context(date) TO authenticated, service_role;

CREATE FUNCTION public.save_withdrawal_assessment(p_as_of date, p_previous uuid, p_signature text, p_facts jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $fn$
DECLARE
  u uuid := auth.uid(); head public.withdrawal_assessment_revisions%ROWTYPE;
  ctx jsonb; item jsonb; val jsonb; k text; allowed text[]; field text; num numeric; new_id uuid;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
  IF p_as_of IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Stockholm')::date THEN RAISE EXCEPTION 'En ny kontroll sparas för dagens datum.'; END IF;
  -- Same first lock domain as deletion, then a per-owner advisory-facts lock.
  PERFORM public.lock_accounting_year_boundary(u,false);
  PERFORM pg_advisory_xact_lock(hashtextextended('sololedger:withdrawal:'||u::text,0));
  SELECT * INTO head FROM public.withdrawal_assessment_revisions WHERE user_id=u ORDER BY revision_no DESC LIMIT 1;
  IF head.id IS DISTINCT FROM p_previous THEN RAISE EXCEPTION 'Avstämningen har ändrats. Ladda om.' USING ERRCODE='40001'; END IF;
  ctx := public.get_withdrawal_context(p_as_of);
  IF ctx->>'signature' IS DISTINCT FROM p_signature THEN RAISE EXCEPTION 'Bokföringsunderlaget har ändrats. Ladda om.' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_facts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_facts)>200 OR pg_column_size(p_facts)>1000000 THEN RAISE EXCEPTION 'Ogiltiga uppgifter.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_facts) f GROUP BY f->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Dubbla uppgifter.'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_facts) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item - ARRAY['key','value'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Ogiltig uppgift.'; END IF;
    k:=item->>'key'; val:=item->'value';
    IF k IS NULL OR jsonb_typeof(val) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Uppgift saknas.'; END IF;
    IF k='coverage' THEN
      allowed:=ARRAY['from','noEarlierObligations'];
      IF val->'noEarlierObligations' IS DISTINCT FROM 'true'::jsonb OR (val->>'from')::date>p_as_of OR (val->>'from')::date<DATE '1900-01-01' THEN RAISE EXCEPTION 'Ogiltig omfattning.'; END IF;
      IF NOT val ? 'from' THEN RAISE EXCEPTION 'Startdatum saknas.'; END IF;
    ELSIF k='tax_account' THEN
      allowed:=ARRAY['date','saldoOre','basis'];
      IF NOT (val ?& ARRAY['date','saldoOre','basis']) THEN RAISE EXCEPTION 'Skattekontouppgift saknas.'; END IF;
      -- A historical saved check may be retained unchanged. A new or corrected
      -- check must belong to this exact snapshot and financial fingerprint.
      IF NOT EXISTS (SELECT 1 FROM public.withdrawal_assessment_facts f WHERE f.revision_id=head.id AND f.fact_key=k AND f.payload=val) THEN
        IF (val->>'date')::date IS DISTINCT FROM p_as_of OR val->>'basis' IS DISTINCT FROM ctx->>'financial_signature' THEN RAISE EXCEPTION 'Kontrollera aktuellt skattekontosaldo.'; END IF;
      END IF;
    ELSIF k ~ '^income:[0-9]{4}$' THEN
      allowed:=ARRAY['rate','debitedOre','pendingOre','finalOre','basis','taxBasis'];
      IF NOT (val ?& allowed) THEN RAISE EXCEPTION 'Skatteunderlag saknas.'; END IF;
      IF val->'finalOre' <> 'null'::jsonb AND split_part(k,':',2)::integer>=extract(year FROM p_as_of) THEN RAISE EXCEPTION 'Slutskattebeskedet måste avse ett avslutat inkomstår.'; END IF;
    ELSIF k ~ '^rate:[0-9]{4}$' THEN
      allowed:=ARRAY['rate']; IF NOT val ? 'rate' THEN RAISE EXCEPTION 'Procent saknas.'; END IF;
    ELSIF k='other' THEN
      allowed:=ARRAY['amountOre','basis']; IF NOT (val ?& allowed) THEN RAISE EXCEPTION 'Betalningsunderlag saknas.'; END IF;
    ELSIF k='bank' THEN
      allowed:=ARRAY['date','amountOre','bookOre','signature']; IF NOT (val ?& allowed) THEN RAISE EXCEPTION 'Bankunderlag saknas.'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.withdrawal_assessment_facts f WHERE f.revision_id=head.id AND f.fact_key=k AND f.payload=val) THEN
        IF (val->>'date')::date IS DISTINCT FROM p_as_of OR val->>'signature' IS DISTINCT FROM p_signature THEN RAISE EXCEPTION 'Bankkontrollen gäller annat underlag.'; END IF;
        IF (val->>'bookOre')::numeric IS DISTINCT FROM (SELECT coalesce(sum((j->>'debit')::numeric-(j->>'credit')::numeric),0)*100 FROM jsonb_array_elements(ctx->'journal') j WHERE j->>'account_number'='1930') THEN RAISE EXCEPTION 'Bankkontrollens bokföringssaldo avviker.'; END IF;
      END IF;
    ELSIF k='buffer' THEN
      allowed:=ARRAY['amountOre']; IF NOT val ? 'amountOre' THEN RAISE EXCEPTION 'Buffert saknas.'; END IF;
    ELSE RAISE EXCEPTION 'Okänd uppgiftstyp.';
    END IF;
    IF val - allowed <> '{}'::jsonb THEN RAISE EXCEPTION 'Otillåtet fält.'; END IF;
    IF k ~ '^(income|rate):' AND (split_part(k,':',2)::integer<1900 OR split_part(k,':',2)::integer>extract(year FROM p_as_of)) THEN RAISE EXCEPTION 'Ogiltigt inkomstår.'; END IF;
    FOR field IN SELECT jsonb_object_keys(val) LOOP
      IF field IN ('amountOre','bookOre','saldoOre','debitedOre','pendingOre','finalOre','rate') AND NOT (field='finalOre' AND val->field='null'::jsonb) THEN
        IF jsonb_typeof(val->field) IS DISTINCT FROM 'number' OR NOT (val->>field ~ '^-?[0-9]+$') THEN RAISE EXCEPTION 'Ogiltigt belopp.'; END IF;
        num:=(val->>field)::numeric;
        IF abs(num)>9000000000000 OR (field NOT IN ('bookOre','saldoOre') AND NOT (k='bank' AND field='amountOre') AND num<0) THEN RAISE EXCEPTION 'Belopp utanför gränsen.'; END IF;
        IF field='rate' AND (num<25 OR num>55) THEN RAISE EXCEPTION 'Ogiltig procent.'; END IF;
      ELSIF field IN ('basis','taxBasis','signature','date','from') AND jsonb_typeof(val->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Ogiltigt källunderlag.';
      END IF;
    END LOOP;
  END LOOP;
  INSERT INTO public.withdrawal_assessment_revisions(user_id,revision_no,previous_revision_id,as_of_date,source_signature)
    VALUES(u,coalesce(head.revision_no,0)+1,head.id,p_as_of,p_signature) RETURNING id INTO new_id;
  INSERT INTO public.withdrawal_assessment_facts(user_id,revision_id,fact_key,payload,observed_on,source_kind)
    SELECT u,new_id,f->>'key',f->'value',
      coalesce((SELECT old.observed_on FROM public.withdrawal_assessment_facts old
        WHERE old.revision_id=head.id AND old.fact_key=f->>'key' AND old.payload=f->'value'),p_as_of),
      CASE WHEN f->>'key' LIKE 'rate:%' THEN 'user_estimate'
        WHEN f->>'key' IN ('coverage','tax_account','bank') THEN 'user_checked' ELSE 'user_statement' END
    FROM jsonb_array_elements(p_facts) f;
  RETURN new_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_withdrawal_assessment(date,uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_withdrawal_assessment(date,uuid,text,jsonb) TO authenticated;

-- delete_user_data_atomic below is the inspected live definition with only
-- explicit advisory-domain deletes/counts added. Existing ACL is preserved.

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
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
$function$
;
COMMIT;
