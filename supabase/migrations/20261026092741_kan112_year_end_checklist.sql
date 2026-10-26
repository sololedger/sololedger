-- KAN-112: manual work checklist only. No accounting/report/lock changes.
CREATE TABLE public.year_end_checklist (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 fiscal_year integer NOT NULL CHECK(fiscal_year BETWEEN 1900 AND 9998),
 check_key text NOT NULL CHECK(check_key IN ('documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year')),
 confirmed boolean NOT NULL,
 confirmed_at timestamptz,
 confirmation_version integer NOT NULL DEFAULT 1 CHECK(confirmation_version=1),
 basis_fingerprint text,
 basis_version integer NOT NULL DEFAULT 1 CHECK(basis_version=1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL CHECK(revision>0),
 last_request_id uuid NOT NULL,
 last_request jsonb NOT NULL,
 PRIMARY KEY(user_id,fiscal_year,check_key),
 CHECK((confirmed AND confirmed_at IS NOT NULL) OR
       (NOT confirmed AND confirmed_at IS NULL AND basis_fingerprint IS NULL))
);
ALTER TABLE public.year_end_checklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.year_end_checklist FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.year_end_checklist TO authenticated,service_role;
CREATE POLICY year_end_checklist_own_read ON public.year_end_checklist FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()));

-- Private helper: bounded, sorted source digests, never report approval.
CREATE FUNCTION public.kan112_checklist_basis(p_year integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $basis$
DECLARE u uuid:=auth.uid(); b date; e date; sources jsonb; t text; n bigint;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
 IF p_year IS NULL OR p_year NOT BETWEEN 1900 AND 9998 THEN RAISE EXCEPTION 'Ogiltigt år.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u) THEN RAISE EXCEPTION 'Profil saknas.' USING ERRCODE='28000'; END IF;
 b:=make_date(p_year,1,1); e:=make_date(p_year,12,31);
 FOREACH t IN ARRAY ARRAY['transactions','journal_entries','customer_invoices','customer_invoice_bookings','supplier_year_end_invoices','supplier_year_end_events','fixed_assets','fixed_asset_events','vat_audit_snapshots','ne_sales_classifications','vat_periods','tax_account_events','tax_account_movements','company_payment_account_roles','declaration_revisions'] LOOP
 EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',t) INTO n USING u;
 IF n>50000 THEN RETURN NULL; END IF;
 END LOOP;
 SELECT jsonb_build_object('profile',md5(coalesce((SELECT jsonb_build_array(company_name,org_nr,vat_number,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement) FROM public.profiles WHERE id=u)::text,'[]')),
'documents',md5(coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text) FROM public.transactions x WHERE x.user_id=u AND (x.date<=e AND (x.date>=b)))::text,'[]')),
'bank',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.journal_entries x WHERE x.user_id=u AND (x.date<=e AND (x.account_number BETWEEN '1900' AND '1999')))::text,'[]')),
'customers',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.customer_invoices x WHERE x.user_id=u AND (x.invoice_date<=e AND x.service_date<=e))::text,'[]')),
'customer_bookings',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.customer_invoice_bookings x WHERE x.user_id=u AND (EXISTS(SELECT 1 FROM public.customer_invoices i WHERE i.id=x.invoice_id AND i.user_id=u AND i.invoice_date<=e AND i.service_date<=e)))::text,'[]')),
'suppliers',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.supplier_year_end_invoices x WHERE x.user_id=u AND (x.fiscal_year<=p_year))::text,'[]')),
'supplier_events',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.supplier_year_end_events x WHERE x.user_id=u AND (EXISTS(SELECT 1 FROM public.supplier_year_end_invoices i WHERE i.id=x.invoice_id AND i.user_id=u AND i.fiscal_year<=p_year)))::text,'[]')),
'inventory',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.fixed_assets x WHERE x.user_id=u AND (x.acquisition_date<=e))::text,'[]')),
'inventory_events',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.fixed_asset_events x WHERE x.user_id=u AND (x.fiscal_year<=p_year))::text,'[]')),
'inventory_journal',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.journal_entries x WHERE x.user_id=u AND (x.date<=e AND (x.account_number BETWEEN '1200' AND '1299' OR (x.date>=b AND x.account_number BETWEEN '7800' AND '7899'))))::text,'[]')),
'vat_journal',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.journal_entries x WHERE x.user_id=u AND (x.date<=e AND (x.date>=b AND x.account_number LIKE '26%')))::text,'[]')),
'vat_facts',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.vat_audit_snapshots x WHERE x.user_id=u AND (EXISTS(SELECT 1 FROM public.transactions t WHERE t.id=x.transaction_id AND t.user_id=u AND t.date BETWEEN b AND e)))::text,'[]')),
'journal',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.journal_entries x WHERE x.user_id=u AND (x.date<=e AND (true)))::text,'[]')),
'classifications',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.ne_sales_classifications x WHERE x.user_id=u AND (EXISTS(SELECT 1 FROM public.journal_entries j WHERE j.id=x.journal_entry_id AND j.user_id=u AND j.date<=e)))::text,'[]')),
'periods',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.vat_periods x WHERE x.user_id=u AND (x.period_start<=e AND x.period_end>=b))::text,'[]')),
'payments',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.tax_account_events x WHERE x.user_id=u AND (EXISTS(SELECT 1 FROM public.vat_periods v WHERE v.id=x.vat_period_id AND v.user_id=u AND v.period_start<=e AND v.period_end>=b)))::text,'[]')),
'movements',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.tax_account_movements x WHERE x.user_id=u AND (EXISTS(SELECT 1 FROM public.vat_periods v WHERE v.id=x.vat_period_id AND v.user_id=u AND v.period_start<=e AND v.period_end>=b)))::text,'[]')),
'roles',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.company_payment_account_roles x WHERE x.user_id=u AND (true))::text,'[]')),
'declarations',md5(coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'updated_at' ORDER BY to_jsonb(x)::text) FROM public.declaration_revisions x WHERE x.user_id=u AND (x.income_year=p_year))::text,'[]'))) INTO sources;
 RETURN jsonb_build_object('documents',md5(jsonb_build_array(sources->'profile',sources->'documents')::text),
'bank',md5(jsonb_build_array(sources->'bank',sources->'roles')::text),
'customers',md5(jsonb_build_array(sources->'customers',sources->'customer_bookings')::text),
'suppliers',md5(jsonb_build_array(sources->'suppliers',sources->'supplier_events')::text),
'inventory',md5(jsonb_build_array(sources->'inventory',sources->'inventory_events',sources->'inventory_journal')::text),
'vat',md5(jsonb_build_array(sources->'profile',sources->'vat_journal',sources->'vat_facts')::text),
'statements',md5(jsonb_build_array(sources->'journal',sources->'classifications',sources->'profile')::text),
'tax',md5(jsonb_build_array(sources->'journal',sources->'classifications',sources->'profile')::text),
'submission',md5(jsonb_build_array(sources->'declarations')::text),
'payments',md5(jsonb_build_array(sources->'payments',sources->'movements',sources->'periods')::text),
'next_year',md5(jsonb_build_array(sources->'customers',sources->'customer_bookings',sources->'suppliers',sources->'supplier_events',sources->'bank')::text));
END $basis$;
REVOKE ALL ON FUNCTION public.kan112_checklist_basis(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_year_end_checklist(p_year integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $read$
DECLARE u uuid:=auth.uid(); basis jsonb;
BEGIN
 basis:=public.kan112_checklist_basis(p_year);
 RETURN jsonb_build_object('owner',u,'year',p_year,'basis',basis,'basis_version',1,
 'checks',(SELECT coalesce(jsonb_agg(to_jsonb(c)-'last_request'-'last_request_id' ORDER BY check_key),'[]') FROM public.year_end_checklist c WHERE user_id=u AND fiscal_year=p_year),
 'system',jsonb_build_object('locked',EXISTS(SELECT 1 FROM public.closed_years WHERE user_id=u AND year=p_year),
 'periods',(SELECT coalesce(jsonb_agg(jsonb_build_object('start',period_start,'end',period_end,'status',status) ORDER BY period_start),'[]') FROM public.vat_periods WHERE user_id=u AND period_start<=make_date(p_year,12,31) AND period_end>=make_date(p_year,1,1)),
 'declaration_versions',(SELECT count(*) FROM public.declaration_revisions WHERE user_id=u AND income_year=p_year)));
END $read$;
REVOKE ALL ON FUNCTION public.get_year_end_checklist(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_year_end_checklist(integer) TO authenticated;

CREATE FUNCTION public.save_year_end_checklist(p_year integer,p_key text,p_confirmed boolean,p_expected_revision integer,p_expected_basis text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $save$
DECLARE u uuid:=auth.uid(); c public.year_end_checklist%ROWTYPE; basis jsonb; request jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
 IF p_key IS NULL OR p_key NOT IN ('documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year') OR p_confirmed IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
 RAISE EXCEPTION 'Ogiltig checklistebegäran.' USING ERRCODE='22023'; END IF;
 PERFORM public.lock_accounting_year_boundary(u,true);
 request:=jsonb_build_array(p_confirmed,p_expected_revision,p_expected_basis);
 SELECT * INTO c FROM public.year_end_checklist WHERE user_id=u AND fiscal_year=p_year AND check_key=p_key FOR UPDATE;
 IF FOUND AND c.last_request_id=p_request_id THEN
  IF c.last_request<>request THEN RAISE EXCEPTION 'Sparbegäran har ändrats.' USING ERRCODE='22023'; END IF;
  RETURN public.get_year_end_checklist(p_year);
 END IF;
 IF coalesce(c.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Checklistan har ändrats i ett annat fönster. Läs om innan du ändrar igen.' USING ERRCODE='40001'; END IF;
 basis:=public.kan112_checklist_basis(p_year);
 IF p_confirmed AND (p_expected_basis IS DISTINCT FROM basis->>p_key) THEN
 RAISE EXCEPTION 'Underlaget har ändrats. Läs om och kontrollera innan du bekräftar.' USING ERRCODE='40001'; END IF;
 INSERT INTO public.year_end_checklist(user_id,fiscal_year,check_key,confirmed,confirmed_at,basis_fingerprint,revision,last_request_id,last_request)
 VALUES(u,p_year,p_key,p_confirmed,CASE WHEN p_confirmed THEN statement_timestamp() END,CASE WHEN p_confirmed THEN basis->>p_key END,1,p_request_id,request)
 ON CONFLICT(user_id,fiscal_year,check_key) DO UPDATE SET confirmed=excluded.confirmed,confirmed_at=excluded.confirmed_at,basis_fingerprint=excluded.basis_fingerprint,revision=year_end_checklist.revision+1,updated_at=statement_timestamp(),last_request_id=p_request_id,last_request=request;
 RETURN public.get_year_end_checklist(p_year);
END $save$;
REVOKE ALL ON FUNCTION public.save_year_end_checklist(integer,text,boolean,integer,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_year_end_checklist(integer,text,boolean,integer,text,uuid) TO authenticated;

DO $preimage$ BEGIN IF md5(replace(pg_get_functiondef('public.delete_user_data_atomic(uuid)'::regprocedure),E'\r',''))<>'057f055f97fba9da12ceaea482be924e' THEN RAISE EXCEPTION 'KAN112 deletion preimage mismatch'; END IF; END $preimage$;
CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r jsonb; invoices integer; events integer; checklist_count integer;
BEGIN
  PERFORM public.lock_accounting_year_boundary(p_user_id,true);
  SELECT count(*) INTO invoices FROM public.supplier_year_end_invoices WHERE user_id=p_user_id;
  SELECT count(*) INTO events FROM public.supplier_year_end_events WHERE user_id=p_user_id;
  SELECT count(*) INTO checklist_count FROM public.year_end_checklist WHERE user_id=p_user_id;
  DELETE FROM public.year_end_checklist WHERE user_id=p_user_id;
  r:=public.delete_user_data_atomic_pre_kan98(p_user_id);
  IF EXISTS(SELECT 1 FROM public.year_end_checklist WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'Checklistdata finns kvar; raderingen rullas tillbaka.'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_year_end_invoices WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.supplier_year_end_events WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'Leverantörsdata finns kvar; raderingen rullas tillbaka.'; END IF;
  RETURN jsonb_set(r,'{deleted}',(r->'deleted')||jsonb_build_object('year_end_checklist',checklist_count,'supplier_year_end_invoices',invoices,'supplier_year_end_events',events));
END $function$
;
