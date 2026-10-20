-- KAN-97: evidence-only invoice context, protocol 3. No booking/formula/ACL changes.
-- All evidence is part of data and therefore the existing source signature.
-- New clients require protocol 3; earlier clients fail closed. Reload after release.
BEGIN;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure)) <> '4e20435092d5c1ef563f1a2f9800765e' THEN
    RAISE EXCEPTION 'Unexpected get_withdrawal_context definition; inspect target before KAN-97 invoice context.';
  END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.get_withdrawal_context(p_as_of date)
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
  SELECT jsonb_build_object('protocol',3,'user_id',u,'as_of',p_as_of,
    'invoices',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',i.id,'user_id',i.user_id,'invoice_date',i.invoice_date,'service_date',i.service_date,
      'customer_country',i.customer_country,'currency',i.currency,'payment_status',i.payment_status,
      'gross_amount',i.gross_amount,'net_amount',i.net_amount,'vat_amount',i.vat_amount,'vat_rate',i.vat_rate,'vat_treatment',i.vat_treatment,
      'vat_policy_snapshot_status',i.vat_policy_snapshot_status,'vat_policy_vat_status',i.vat_policy_vat_status,
      'vat_policy_domestic_sales_vat_treatment',i.vat_policy_domestic_sales_vat_treatment,
      'vat_policy_captured_at',i.vat_policy_captured_at,'vat_policy_source',i.vat_policy_source) ORDER BY i.id)
      FROM public.customer_invoices i WHERE i.user_id=u AND (i.invoice_date<=p_as_of OR EXISTS
      (SELECT 1 FROM public.customer_invoice_bookings b WHERE b.user_id=u AND b.invoice_id=i.id AND b.booking_date<=p_as_of))),'[]'::jsonb),
    'invoice_bookings',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'user_id',b.user_id,'invoice_id',b.invoice_id,'transaction_id',b.transaction_id,
      'booking_kind',b.booking_kind,'booking_date',b.booking_date,'fiscal_year',b.fiscal_year,
      'gross_amount',b.gross_amount,'net_amount',b.net_amount,'vat_amount',b.vat_amount,'reverses_booking_id',b.reverses_booking_id) ORDER BY b.id)
      FROM public.customer_invoice_bookings b WHERE b.user_id=u AND b.booking_date<=p_as_of),'[]'::jsonb),
    -- Proof only: all owned rows of each linked verification, without date truncation.
    -- The separate 'journal' below remains the sole economic date-scoped input.
    'invoice_journal',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',j.id,'user_id',j.user_id,'transaction_id',j.transaction_id,'date',j.date,
      'account_number',j.account_number,'ver_nr',j.ver_nr,'debit',coalesce(j.debit,0),'credit',coalesce(j.credit,0)) ORDER BY j.id)
      FROM public.journal_entries j WHERE j.user_id=u AND EXISTS
      (SELECT 1 FROM public.customer_invoice_bookings b WHERE b.user_id=u
        AND b.transaction_id=j.transaction_id AND b.booking_date<=p_as_of)),'[]'::jsonb),
    'transactions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'user_id',t.user_id,'date',t.date,'source',t.source,'booked',t.booked,'amount',t.amount,'type',t.type,'vat_rate',t.vat_rate,'is_correction',coalesce(t.is_correction,false),'corrects_ver_nr',t.corrects_ver_nr,'is_periodized',coalesce(t.is_periodized,false),'is_periodized_reversal',coalesce(t.is_periodized_reversal,false),'import_batch_id',t.import_batch_id,'periodization_group_id',t.periodization_group_id) ORDER BY t.id)
      FROM public.transactions t WHERE t.user_id=u AND (t.date<=p_as_of OR EXISTS
      (SELECT 1 FROM public.journal_entries j WHERE j.transaction_id=t.id AND j.user_id=u AND j.date<=p_as_of))),'[]'::jsonb),
    'journal',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'user_id',j.user_id,'transaction_id',j.transaction_id,'date',j.date,'account_number',j.account_number,'ver_nr',j.ver_nr,'debit',coalesce(j.debit,0),'credit',coalesce(j.credit,0)) ORDER BY j.id)
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
COMMIT;
