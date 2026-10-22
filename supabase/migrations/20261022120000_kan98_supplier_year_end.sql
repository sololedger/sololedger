-- KAN-98: one atomic year-end expense and its later full bank settlement.
-- No drafts, import, equipment, foreign VAT, partial payments or credit notes.
CREATE TABLE public.supplier_year_end_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  supplier_name text NOT NULL CHECK (length(btrim(supplier_name)) BETWEEN 1 AND 160),
  supplier_identity text NOT NULL CHECK (supplier_identity ~ '^[0-9]{10}$'),
  invoice_number text NOT NULL CHECK (length(btrim(invoice_number)) BETWEEN 1 AND 80),
  invoice_key text GENERATED ALWAYS AS (lower(btrim(invoice_number))) STORED,
  invoice_date date NOT NULL,
  received_date date NOT NULL,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2025 AND 9998),
  gross_amount numeric(16,2) NOT NULL CHECK (gross_amount > 0),
  vat_rate numeric NOT NULL CHECK (vat_rate IN (0,6,12,25)),
  invoice_vat numeric(16,2) NOT NULL CHECK (invoice_vat >= 0 AND invoice_vat < gross_amount),
  deductible_vat numeric(16,2) NOT NULL CHECK (deductible_vat >= 0 AND deductible_vat <= invoice_vat),
  deduction text NOT NULL CHECK (deduction IN ('full','none')),
  expense_account text NOT NULL CHECK (expense_account IN ('6110','6212','6310','6540','5910','5420')),
  attachment_path text NOT NULL,
  year_end_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,user_id),
  CHECK (invoice_date <= make_date(fiscal_year,12,31) AND received_date <= make_date(fiscal_year,12,31)),
  CHECK ((deduction='none' AND deductible_vat=0) OR (deduction='full' AND deductible_vat=invoice_vat))
);
CREATE UNIQUE INDEX supplier_year_end_active_identity ON public.supplier_year_end_invoices
  (user_id,supplier_identity,invoice_key) WHERE status <> 'cancelled';
CREATE INDEX supplier_year_end_owner_year ON public.supplier_year_end_invoices(user_id,fiscal_year);
CREATE TABLE public.supplier_year_end_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  invoice_id uuid NOT NULL,
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('year_end','payment','payment_reversal','year_end_reversal')),
  event_date date NOT NULL,
  request_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  reverses_event_id uuid UNIQUE REFERENCES public.supplier_year_end_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(invoice_id,user_id) REFERENCES public.supplier_year_end_invoices(id,user_id) ON DELETE CASCADE,
  UNIQUE(user_id,request_key)
);
CREATE INDEX supplier_year_end_events_owner ON public.supplier_year_end_events(user_id,invoice_id);
CREATE UNIQUE INDEX supplier_year_end_one_origin ON public.supplier_year_end_events(invoice_id) WHERE kind='year_end';
ALTER TABLE public.supplier_year_end_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_year_end_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_year_end_invoices,public.supplier_year_end_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.supplier_year_end_invoices,public.supplier_year_end_events TO authenticated,service_role;
CREATE POLICY supplier_year_end_own ON public.supplier_year_end_invoices FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY supplier_year_end_events_own ON public.supplier_year_end_events FOR SELECT TO authenticated USING(user_id=auth.uid());

-- Preserve the inspected source contract; fail instead of silently editing another version.
DO $source$
DECLARE d text; c text;
BEGIN
  d:=pg_get_functiondef('public.transaction_source_classification(text)'::regprocedure);
  IF position('''fixed_asset_depreciation''' in d)=0 OR position('supplier_invoice' in d)>0 THEN
    RAISE EXCEPTION 'KAN98: inspect transaction source contract before migration';
  END IF;
  d:=replace(d,'''fixed_asset_depreciation''', '''fixed_asset_depreciation'', ''supplier_invoice''');
  d:=replace(d,'WHEN ''fixed_asset'' THEN true','WHEN ''fixed_asset'' THEN true WHEN ''supplier_invoice'' THEN true');
  EXECUTE d;
  SELECT pg_get_constraintdef(oid) INTO STRICT c FROM pg_constraint
    WHERE conrelid='public.transactions'::regclass AND conname='transactions_source_check';
  IF position('''fixed_asset_depreciation''::text' in c)=0 THEN RAISE EXCEPTION 'KAN98: unexpected source constraint'; END IF;
  c:=replace(c,'''fixed_asset_depreciation''::text','''fixed_asset_depreciation''::text, ''supplier_invoice''::text');
  ALTER TABLE public.transactions DROP CONSTRAINT transactions_source_check;
  EXECUTE 'ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check '||c;
END $source$;

-- Single entry point: commands and their receipts share the same owner/key lock.
CREATE FUNCTION public.manage_supplier_year_end_invoice(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  u uuid:=auth.uid(); k uuid; action text; existing public.supplier_year_end_events;
  inv public.supplier_year_end_invoices; original public.supplier_year_end_events;
  invoice_id uuid; tx uuid; ver integer; original_ver integer; d date; yr integer;
  gross numeric; rate numeric; vat numeric; deductible numeric; cost text; bank text;
  supplier_id text; invoice_no text; supplier text; attachment text; deduction text;
  v_description text; event_kind text; reverse_id uuid;
BEGIN
  PERFORM public.lock_accounting_year_boundary(u,false);
  IF u IS NULL THEN RAISE EXCEPTION 'Du måste vara inloggad.' USING ERRCODE='28000'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ofullständigt underlag.' USING ERRCODE='22023'; END IF;
  k:=(p_payload->>'request_key')::uuid;
  IF k IS NULL THEN RAISE EXCEPTION 'Bokningsnyckel saknas.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier_year_end:'||u::text||':'||k::text,0));
  SELECT * INTO existing FROM public.supplier_year_end_events WHERE user_id=u AND request_key=k;
  IF FOUND THEN
    IF existing.request_payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Bokningsnyckeln har annat underlag. Återuppta det ursprungliga försöket.' USING ERRCODE='22023';
    END IF;
    SELECT je.ver_nr INTO ver FROM public.journal_entries je WHERE je.transaction_id=existing.transaction_id AND je.user_id=u LIMIT 1;
    RETURN jsonb_build_object('success',true,'invoice_id',existing.invoice_id,'transaction_id',existing.transaction_id,'ver_nr',ver,'idempotent_replay',true);
  END IF;
  action:=p_payload->>'action';
  IF action='book' THEN
    IF p_payload->>'country' IS DISTINCT FROM 'SE' OR p_payload->>'currency' IS DISTINCT FROM 'SEK'
      OR p_payload->>'invoice_kind' IS DISTINCT FROM 'ordinary_expense'
      OR p_payload->>'deduction' IS NULL OR p_payload->>'deduction' NOT IN ('full','none')
      OR p_payload->>'wholly_unpaid' IS DISTINCT FROM 'true'
      OR p_payload->>'delivered_in_year' IS DISTINCT FROM 'true'
      OR p_payload->>'not_previously_booked' IS DISTINCT FROM 'true'
      OR p_payload->>'not_credit_or_partial' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Endast svenska kostnadsfakturor i SEK, helt obetalda och inte tidigare bokförda, stöds. Delbetalning, kredit, inventarier och osäker moms stoppas.' USING ERRCODE='23514';
    END IF;
    yr:=(p_payload->>'fiscal_year')::integer;
    IF yr IS NULL OR yr NOT BETWEEN 2025 AND 9998 THEN RAISE EXCEPTION 'Ogiltigt bokslutsår.' USING ERRCODE='22023'; END IF;
    d:=make_date(yr,12,31);
    IF (p_payload->>'invoice_date')::date IS NULL OR (p_payload->>'received_date')::date IS NULL
      OR (p_payload->>'invoice_date')::date NOT BETWEEN make_date(yr,1,1) AND d
      OR (p_payload->>'received_date')::date NOT BETWEEN (p_payload->>'invoice_date')::date AND d THEN
      RAISE EXCEPTION 'Ange faktura- och mottagningsdatum inom bokslutsåret. Äldre eller framtida underlag kräver separat kontroll.' USING ERRCODE='23514';
    END IF;
    gross:=(p_payload->>'gross_amount')::numeric; rate:=(p_payload->>'vat_rate')::numeric;
    IF gross IS NULL OR gross::text IN ('NaN','Infinity','-Infinity') OR gross<=0 OR gross>999999999999.99 OR gross<>round(gross,2)
      OR rate IS NULL OR rate NOT IN (0,6,12,25) THEN RAISE EXCEPTION 'Kontrollera belopp och fakturans momssats.' USING ERRCODE='22023'; END IF;
    vat:=round(gross-gross/(1+rate/100),2);
    IF (p_payload->>'invoice_vat')::numeric IS DISTINCT FROM vat THEN
      RAISE EXCEPTION 'Fakturamomsen stämmer inte med underlaget. Blandade momssatser eller avvikande faktura behöver separat kontroll.' USING ERRCODE='23514';
    END IF;
    deduction:=public.resolve_purchase_input_vat_deduction(u,p_payload->>'deduction');
    deductible:=CASE WHEN deduction='full' THEN vat ELSE 0 END;
    cost:=p_payload->>'expense_account';
    IF cost IS NULL OR cost NOT IN ('6110','6212','6310','6540','5910','5420') THEN
      RAISE EXCEPTION 'Välj en stödd vanlig kostnad. Inventarier, lager och förskott bokförs inte här.' USING ERRCODE='23514'; END IF;
    supplier_id:=regexp_replace(coalesce(p_payload->>'supplier_identity',''),'[ -]','','g');
    supplier:=btrim(p_payload->>'supplier_name'); invoice_no:=btrim(p_payload->>'invoice_number');
    attachment:=p_payload->>'attachment_path';
    IF supplier_id !~ '^[0-9]{10}$' OR coalesce(length(supplier),0) NOT BETWEEN 1 AND 160
      OR coalesce(length(invoice_no),0) NOT BETWEEN 1 AND 80
      OR attachment IS NULL OR split_part(attachment,'/',1)<>u::text OR attachment LIKE '%..%' THEN
      RAISE EXCEPTION 'Ange leverantörens identitet, namn, fakturanummer och en egen uppladdad faktura.' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='attachments' AND name=attachment) THEN
      RAISE EXCEPTION 'Fakturabilagan kunde inte verifieras. Ladda upp underlaget först.' USING ERRCODE='23514'; END IF;
    -- Serialize duplicate identity even with different request keys.
    PERFORM pg_advisory_xact_lock(hashtextextended('supplier_identity:'||u::text||':'||supplier_id||':'||lower(invoice_no),0));
    IF EXISTS(SELECT 1 FROM public.supplier_year_end_invoices WHERE user_id=u AND supplier_identity=supplier_id
      AND invoice_key=lower(invoice_no) AND status<>'cancelled') THEN
      RAISE EXCEPTION 'Fakturan är redan bokslutsförd. Öppna den befintliga skulden.' USING ERRCODE='23514'; END IF;
    event_kind:='year_end'; invoice_id:=gen_random_uuid(); v_description:='Leverantörsskuld vid bokslut: '||supplier||' '||invoice_no;
  ELSE
    invoice_id:=(p_payload->>'invoice_id')::uuid;
    SELECT * INTO inv FROM public.supplier_year_end_invoices WHERE id=invoice_id AND user_id=u FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Leverantörsskulden saknas eller tillhör inte dig.' USING ERRCODE='42501'; END IF;
    gross:=inv.gross_amount; vat:=inv.invoice_vat; deductible:=inv.deductible_vat; cost:=inv.expense_account;
    attachment:=inv.attachment_path; rate:=inv.vat_rate;
    IF action='pay' THEN
      IF inv.status<>'booked' THEN RAISE EXCEPTION 'Skulden är redan betald eller rättad.' USING ERRCODE='23514'; END IF;
      d:=(p_payload->>'payment_date')::date;
      IF d IS NULL OR d<=make_date(inv.fiscal_year,12,31) OR (p_payload->>'paid_amount')::numeric IS DISTINCT FROM gross THEN
        RAISE EXCEPTION 'Ange senare betalningsdatum och fakturans hela belopp. Delbetalning stöds inte.' USING ERRCODE='23514'; END IF;
      SELECT account_number INTO bank FROM public.company_payment_account_roles WHERE user_id=u AND role='business_payment_account' FOR SHARE;
      IF bank IS DISTINCT FROM '1930' THEN RAISE EXCEPTION 'Bekräfta företagets bankkonto 1930 i Profil innan betalningen bokförs.' USING ERRCODE='23514'; END IF;
      event_kind:='payment'; v_description:='Betald bokslutsskuld: '||inv.supplier_name||' '||inv.invoice_number;
    ELSIF action IN ('undo_payment','cancel') THEN
      IF coalesce(length(btrim(p_payload->>'reason')),0) NOT BETWEEN 5 AND 300 THEN
        RAISE EXCEPTION 'Beskriv orsaken till rättelsen (5–300 tecken).' USING ERRCODE='22023'; END IF;
      IF (action='undo_payment' AND inv.status<>'paid') OR (action='cancel' AND inv.status<>'booked') THEN
        RAISE EXCEPTION 'Rättelsen är inte möjlig i skuldens aktuella status.' USING ERRCODE='23514'; END IF;
      SELECT e.* INTO original FROM public.supplier_year_end_events e WHERE e.invoice_id=inv.id AND e.user_id=u
        AND e.kind=CASE WHEN action='cancel' THEN 'year_end' ELSE 'payment' END
        AND NOT EXISTS(SELECT 1 FROM public.supplier_year_end_events r WHERE r.reverses_event_id=e.id) ORDER BY e.created_at DESC LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'Ursprungsbokningen kunde inte verifieras.' USING ERRCODE='23514'; END IF;
      d:=original.event_date; reverse_id:=original.id;
      event_kind:=CASE WHEN action='cancel' THEN 'year_end_reversal' ELSE 'payment_reversal' END;
      v_description:='Rättelse '||inv.invoice_number||': '||btrim(p_payload->>'reason');
    ELSE RAISE EXCEPTION 'Okänd åtgärd. Ingen vanlig kostnadsbokning görs.' USING ERRCODE='22023'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.closed_years WHERE user_id=u AND year=extract(year from d)::int) THEN
    RAISE EXCEPTION 'Räkenskapsåret är låst. Historiken ändras inte; rättelse kräver separat bedömning.' USING ERRCODE='23514'; END IF;
  -- Acquisition and its reversal affect the year's VAT facts; settlement never does.
  IF event_kind IN ('year_end','year_end_reversal') THEN
    PERFORM public.lock_vat_months(u,ARRAY[d]);
    IF (SELECT count(*) FROM public.vat_periods WHERE user_id=u AND source='sololedger' AND d BETWEEN period_start AND period_end)>1
      OR EXISTS(SELECT 1 FROM public.vat_periods WHERE user_id=u AND source='sololedger' AND d BETWEEN period_start AND period_end AND status IN ('closed','declared')) THEN
      RAISE EXCEPTION 'Årets sista momsperiod är stängd, deklarerad eller överlappar. Kontrollera momsen före bokslutsposten.' USING ERRCODE='23514'; END IF;
  END IF;
  ver:=public.get_next_ver_nr(u); tx:=gen_random_uuid();
  INSERT INTO public.transactions(id,user_id,date,description,amount,type,vat_rate,file_url,booked,source)
    VALUES(tx,u,d,v_description,gross,'supplier_invoice',CASE WHEN event_kind LIKE 'year_end%' THEN rate ELSE 0 END,attachment,true,'supplier_invoice');
  IF reverse_id IS NOT NULL THEN
    INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id)
      SELECT tx,ver,account_number,credit,debit,v_description,d,u FROM public.journal_entries WHERE transaction_id=original.transaction_id AND user_id=u;
  ELSIF event_kind='year_end' THEN
    INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id) VALUES
      (tx,ver,cost,gross-deductible,0,v_description,d,u),(tx,ver,'2440',0,gross,v_description,d,u);
    IF deductible>0 THEN INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id)
      VALUES(tx,ver,'2641',deductible,0,v_description,d,u); END IF;
  ELSE
    INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id) VALUES
      (tx,ver,'2440',gross,0,v_description,d,u),(tx,ver,bank,0,gross,v_description,d,u);
  END IF;
  IF (SELECT sum(debit-credit) FROM public.journal_entries WHERE transaction_id=tx AND user_id=u) IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Journalen balanserar inte. Hela försöket avbröts.' USING ERRCODE='23514'; END IF;
  IF action='book' THEN
    INSERT INTO public.supplier_year_end_invoices(id,user_id,supplier_name,supplier_identity,invoice_number,invoice_date,received_date,
      fiscal_year,gross_amount,vat_rate,invoice_vat,deductible_vat,deduction,expense_account,attachment_path,year_end_transaction_id)
    VALUES(invoice_id,u,supplier,supplier_id,invoice_no,(p_payload->>'invoice_date')::date,(p_payload->>'received_date')::date,
      yr,gross,rate,vat,deductible,deduction,cost,attachment,tx);
  ELSE
    UPDATE public.supplier_year_end_invoices SET status=CASE WHEN action='pay' THEN 'paid' WHEN action='cancel' THEN 'cancelled' ELSE 'booked' END WHERE id=invoice_id AND user_id=u;
  END IF;
  INSERT INTO public.supplier_year_end_events(user_id,invoice_id,transaction_id,kind,event_date,request_key,request_payload,reverses_event_id)
    VALUES(u,invoice_id,tx,event_kind,d,k,p_payload,reverse_id);
  RETURN jsonb_build_object('success',true,'invoice_id',invoice_id,'transaction_id',tx,'ver_nr',ver,'idempotent_replay',false);
END $fn$;
REVOKE ALL ON FUNCTION public.manage_supplier_year_end_invoice(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.manage_supplier_year_end_invoice(jsonb) TO authenticated;

-- ON DELETE CASCADE deliberately follows the authoritative transaction deletion.
-- Keep authorization and deletion ordering in the inspected existing function.
DO $delete$
BEGIN
  IF md5(pg_get_functiondef('public.delete_user_data_atomic(uuid)'::regprocedure))<>'f2bcb7dd499b25630c8a51dfbad99b67' THEN
    RAISE EXCEPTION 'KAN98: inspect current atomic deletion definition'; END IF;
END $delete$;
ALTER FUNCTION public.delete_user_data_atomic(uuid) RENAME TO delete_user_data_atomic_pre_kan98;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic_pre_kan98(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.delete_user_data_atomic(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $delete$
DECLARE r jsonb; invoices integer; events integer;
BEGIN
  PERFORM public.lock_accounting_year_boundary(p_user_id,true);
  SELECT count(*) INTO invoices FROM public.supplier_year_end_invoices WHERE user_id=p_user_id;
  SELECT count(*) INTO events FROM public.supplier_year_end_events WHERE user_id=p_user_id;
  r:=public.delete_user_data_atomic_pre_kan98(p_user_id);
  IF EXISTS(SELECT 1 FROM public.supplier_year_end_invoices WHERE user_id=p_user_id)
    OR EXISTS(SELECT 1 FROM public.supplier_year_end_events WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'Leverantörsdata finns kvar; raderingen rullas tillbaka.'; END IF;
  RETURN jsonb_set(r,'{deleted}',(r->'deleted')||jsonb_build_object('supplier_year_end_invoices',invoices,'supplier_year_end_events',events));
END $delete$;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;
