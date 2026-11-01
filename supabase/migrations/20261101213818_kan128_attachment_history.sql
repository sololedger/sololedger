-- KAN-128 / A5. No file bytes are changed. Existing pointers remain compatible.
-- Ordinary orphan cleanup is deliberately disabled too: there is no safe
-- cross-service reference/delete transaction. Service-role deletion is KAN-127.
DO $preflight$
BEGIN
  IF md5(replace(pg_get_functiondef('public.delete_user_data_atomic(uuid)'::regprocedure),chr(13),''))
    <> 'f5f30e0a29e2d5f927d016890fc3f1f9' THEN
    RAISE EXCEPTION 'KAN128: kontoraderingens verifierade utgångsläge har ändrats. Granska före installation.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='attachments' AND public=false)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass) THEN
    RAISE EXCEPTION 'KAN128 kräver privat attachments-bucket och aktiv Storage-RLS.';
  END IF;
END $preflight$;

CREATE POLICY attachments_preserve_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated, anon USING (bucket_id <> 'attachments');
CREATE POLICY attachments_preserve_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon USING (bucket_id <> 'attachments')
  WITH CHECK (bucket_id <> 'attachments');

CREATE TABLE public.accounting_attachment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE RESTRICT,
  customer_invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE RESTRICT,
  supplier_invoice_id uuid REFERENCES public.supplier_year_end_invoices(id) ON DELETE RESTRICT,
  path text NOT NULL CHECK (length(path) > 0),
  original_path text NOT NULL CHECK (length(original_path) > 0),
  previous_path text,
  action text NOT NULL CHECK (action IN ('observed_existing','initial','replacement','addition')),
  actor_id uuid, -- historical observation has no fabricated actor/upload time
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
  CHECK (num_nonnulls(transaction_id,customer_invoice_id,supplier_invoice_id)=1)
);
CREATE INDEX attachment_history_owner ON public.accounting_attachment_history(user_id,id);
CREATE INDEX attachment_history_transaction ON public.accounting_attachment_history(transaction_id,id) WHERE transaction_id IS NOT NULL;
CREATE INDEX attachment_history_customer ON public.accounting_attachment_history(customer_invoice_id,id) WHERE customer_invoice_id IS NOT NULL;
CREATE INDEX attachment_history_supplier ON public.accounting_attachment_history(supplier_invoice_id,id) WHERE supplier_invoice_id IS NOT NULL;
ALTER TABLE public.accounting_attachment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_attachment_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.accounting_attachment_history_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.accounting_attachment_history TO authenticated, service_role;
CREATE POLICY attachment_history_owner_read ON public.accounting_attachment_history
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY attachment_history_server_count ON public.accounting_attachment_history
  FOR SELECT TO service_role USING (true);

-- Only an observation at installation, not a claim about any earlier versions.
INSERT INTO public.accounting_attachment_history(user_id,transaction_id,path,original_path,action,note)
SELECT user_id,id,file_url,file_url,'observed_existing','Befintlig referens observerad vid införandet; tidigare bilagehistorik är okänd.'
FROM public.transactions WHERE nullif(file_url,'') IS NOT NULL;
INSERT INTO public.accounting_attachment_history(user_id,customer_invoice_id,path,original_path,action,note)
SELECT user_id,id,attachment_url,attachment_url,'observed_existing','Befintlig referens observerad vid införandet; tidigare bilagehistorik är okänd.'
FROM public.customer_invoices WHERE nullif(attachment_url,'') IS NOT NULL;
INSERT INTO public.accounting_attachment_history(user_id,supplier_invoice_id,path,original_path,action,note)
SELECT user_id,id,attachment_path,attachment_path,'observed_existing','Befintlig referens observerad vid införandet; tidigare bilagehistorik är okänd.'
FROM public.supplier_year_end_invoices WHERE nullif(attachment_path,'') IS NOT NULL;

CREATE FUNCTION public.protect_accounting_attachment_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
BEGIN
  IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.delete_user_data_atomic_lifecycle_context
    WHERE backend_pid=pg_backend_pid() AND user_id=OLD.user_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Bilagehistorik kan bara tas bort genom godkänd kontoradering.' USING ERRCODE='42501';
END $body$;
REVOKE ALL ON FUNCTION public.protect_accounting_attachment_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER preserve_attachment_history BEFORE UPDATE OR DELETE ON public.accounting_attachment_history
  FOR EACH ROW EXECUTE FUNCTION public.protect_accounting_attachment_history();

CREATE FUNCTION public.validate_accounting_attachment(p_owner uuid,p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
BEGIN
  IF p_owner IS NULL OR p_path IS NULL OR p_path='' OR split_part(p_path,'/',1)<>p_owner::text
    OR p_path !~ '^[^/]+/.+' OR p_path ~ '(^|/)(\.|\.\.)?(/|$)' OR position(chr(92) IN p_path)>0 THEN
    RAISE EXCEPTION 'Bilagan måste vara en egen fil i bilagelagringen.' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS DISTINCT FROM p_owner AND NOT(auth.uid() IS NULL AND
    (session_user='postgres' OR auth.role()='service_role')) THEN
    RAISE EXCEPTION 'Bilagan tillhör inte den inloggade användaren.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM storage.objects WHERE bucket_id='attachments' AND name=p_path FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bilagan finns inte i bilagelagringen.' USING ERRCODE='23503'; END IF;
END $body$;
REVOKE ALL ON FUNCTION public.validate_accounting_attachment(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Existing safe RPCs remain authoritative. This trigger also covers old clients;
-- source reference and history commit or roll back together.
CREATE FUNCTION public.record_accounting_attachment_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb; field text:=TG_ARGV[0]; kind text:=TG_ARGV[1];
  owner_id uuid:=NEW.user_id; target uuid:=NEW.id; old_path text; new_path text;
  original text; d date; old_d date; tx uuid; ci uuid; si uuid;
BEGIN
  new_path:=nullif(n->>field,'');
  IF TG_OP='UPDATE' THEN
    o:=to_jsonb(OLD); old_path:=nullif(o->>field,'');
    IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'Underlagets ägare och identitet får inte ändras.' USING ERRCODE='42501'; END IF;
    IF old_path IS NOT NULL AND new_path IS NULL THEN
      RAISE EXCEPTION 'En bevarad bilagereferens får inte tas bort. Lägg till eller byt bilaga med historik.' USING ERRCODE='42501'; END IF;
  END IF;
  IF new_path IS NULL AND NOT EXISTS(SELECT 1 FROM public.accounting_attachment_history h
    WHERE h.user_id=owner_id AND (h.transaction_id=target OR h.customer_invoice_id=target OR h.supplier_invoice_id=target))
    THEN RETURN NEW; END IF;
  IF kind='transaction' THEN
    tx:=target; d:=NEW.date; IF TG_OP='UPDATE' THEN old_d:=OLD.date; END IF;
  ELSIF kind='customer_invoice' THEN
    ci:=target; d:=make_date(public.customer_invoice_year_end_fiscal_year(NEW.invoice_date,NEW.service_date),12,31);
    IF TG_OP='UPDATE' THEN old_d:=make_date(public.customer_invoice_year_end_fiscal_year(OLD.invoice_date,OLD.service_date),12,31); END IF;
  ELSE
    si:=target; d:=make_date(NEW.fiscal_year,12,31);
    IF TG_OP='UPDATE' THEN old_d:=make_date(OLD.fiscal_year,12,31); END IF;
  END IF;
  IF TG_OP='UPDATE' AND old_path IS NOT DISTINCT FROM new_path AND old_d IS NOT DISTINCT FROM d THEN RETURN NEW; END IF;
  PERFORM public.assert_accounting_dates_open(owner_id,array_remove(ARRAY[old_d,d],NULL));
  IF old_path IS NOT DISTINCT FROM new_path THEN RETURN NEW; END IF;
  PERFORM public.validate_accounting_attachment(owner_id,new_path);
  SELECT h.original_path INTO original FROM public.accounting_attachment_history h
    WHERE h.user_id=owner_id AND (h.transaction_id=tx OR h.customer_invoice_id=ci OR h.supplier_invoice_id=si) ORDER BY id LIMIT 1;
  original:=coalesce(original,old_path,new_path);
  INSERT INTO public.accounting_attachment_history(user_id,transaction_id,customer_invoice_id,supplier_invoice_id,
    path,original_path,previous_path,action,actor_id,note)
  VALUES(owner_id,tx,ci,si,new_path,original,old_path,CASE WHEN old_path IS NULL THEN 'initial' ELSE 'replacement' END,
    auth.uid(),CASE WHEN old_path IS NULL THEN 'Första bilagereferens registrerad.' ELSE 'Bilagereferens bytt; tidigare underlag bevarat.' END);
  RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION public.record_accounting_attachment_reference() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER record_transaction_attachment AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_accounting_attachment_reference('file_url','transaction');
CREATE TRIGGER record_customer_attachment AFTER INSERT OR UPDATE ON public.customer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.record_accounting_attachment_reference('attachment_url','customer_invoice');
CREATE TRIGGER record_supplier_attachment AFTER INSERT OR UPDATE ON public.supplier_year_end_invoices
  FOR EACH ROW EXECUTE FUNCTION public.record_accounting_attachment_reference('attachment_path','supplier_invoice');

-- Supplementation never edits the original pointer or any accounting values.
CREATE FUNCTION public.add_accounting_attachment(p_entity_type text,p_entity_id uuid,p_path text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE owner_id uuid:=auth.uid(); d date; current_path text; original text;
  tx uuid; ci uuid; si uuid; existing_id bigint; existing_note text; history_id bigint;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Beskriv bilagetillägget med 1–500 tecken.' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_accounting_year_boundary(owner_id,false);
  IF p_entity_type='transaction' THEN
    tx:=p_entity_id;
    SELECT date,file_url INTO d,current_path FROM public.transactions WHERE id=tx AND user_id=owner_id FOR UPDATE;
  ELSIF p_entity_type='customer_invoice' THEN
    ci:=p_entity_id;
    SELECT make_date(public.customer_invoice_year_end_fiscal_year(invoice_date,service_date),12,31),attachment_url
      INTO d,current_path FROM public.customer_invoices WHERE id=ci AND user_id=owner_id FOR UPDATE;
  ELSIF p_entity_type='supplier_invoice' THEN
    si:=p_entity_id;
    SELECT make_date(fiscal_year,12,31),attachment_path INTO d,current_path
      FROM public.supplier_year_end_invoices WHERE id=si AND user_id=owner_id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Okänd underlagstyp.' USING ERRCODE='22023'; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'Underlaget hittades inte för användaren.' USING ERRCODE='42501'; END IF;
  PERFORM public.assert_accounting_dates_open(owner_id,ARRAY[d]);
  PERFORM public.validate_accounting_attachment(owner_id,p_path);
  SELECT id,note INTO existing_id,existing_note FROM public.accounting_attachment_history
    WHERE user_id=owner_id AND (transaction_id=tx OR customer_invoice_id=ci OR supplier_invoice_id=si)
      AND path=p_path AND action='addition' ORDER BY id LIMIT 1;
  IF existing_id IS NOT NULL THEN
    IF existing_note<>btrim(p_note) THEN RAISE EXCEPTION 'Filen är redan registrerad med en annan beskrivning.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'history_id',existing_id,'replayed',true);
  END IF;
  SELECT original_path INTO original FROM public.accounting_attachment_history
    WHERE user_id=owner_id AND (transaction_id=tx OR customer_invoice_id=ci OR supplier_invoice_id=si) ORDER BY id LIMIT 1;
  INSERT INTO public.accounting_attachment_history(user_id,transaction_id,customer_invoice_id,supplier_invoice_id,
    path,original_path,previous_path,action,actor_id,note)
  VALUES(owner_id,tx,ci,si,p_path,coalesce(original,nullif(current_path,''),p_path),current_path,'addition',owner_id,btrim(p_note))
  RETURNING id INTO history_id;
  RETURN jsonb_build_object('success',true,'history_id',history_id,'replayed',false);
END $body$;
REVOKE ALL ON FUNCTION public.add_accounting_attachment(text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_accounting_attachment(text,uuid,text,text) TO authenticated;

-- Extend the verified current atomic boundary only. No Edge/Stripe/Storage
-- orchestration change (KAN-127 remains separate). Old delegate is untouched.
CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE r jsonb; invoices integer; events integer; checklist_count integer; history_count integer; target_role text;
BEGIN
  PERFORM public.lock_accounting_year_boundary(p_user_id,true);
  SELECT role INTO target_role FROM public.profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Användaren hittades inte.' USING ERRCODE='P0002'; END IF;
  IF target_role='admin' THEN RAISE EXCEPTION 'Admin-konton kan inte raderas här.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.delete_user_data_atomic_lifecycle_context(backend_pid,user_id) VALUES(pg_backend_pid(),p_user_id)
    ON CONFLICT(backend_pid,user_id) DO UPDATE SET created_at=excluded.created_at;
  DELETE FROM public.accounting_attachment_history WHERE user_id=p_user_id;
  GET DIAGNOSTICS history_count=ROW_COUNT;
  SELECT count(*) INTO invoices FROM public.supplier_year_end_invoices WHERE user_id=p_user_id;
  SELECT count(*) INTO events FROM public.supplier_year_end_events WHERE user_id=p_user_id;
  SELECT count(*) INTO checklist_count FROM public.year_end_checklist WHERE user_id=p_user_id;
  DELETE FROM public.year_end_checklist WHERE user_id=p_user_id;
  r:=public.delete_user_data_atomic_pre_kan98(p_user_id);
  IF EXISTS(SELECT 1 FROM public.year_end_checklist WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.supplier_year_end_invoices WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.supplier_year_end_events WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.accounting_attachment_history WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'Underlagsdata finns kvar; raderingen rullas tillbaka.'; END IF;
  RETURN jsonb_set(r,'{deleted}',(r->'deleted')||jsonb_build_object('year_end_checklist',checklist_count,
    'supplier_year_end_invoices',invoices,'supplier_year_end_events',events,'accounting_attachment_history',history_count));
END $body$;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;
