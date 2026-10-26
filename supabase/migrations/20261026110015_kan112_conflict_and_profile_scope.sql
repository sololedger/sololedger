-- KAN-112: intentional conflicts are HTTP 409; economic checks exclude company name.
-- Forward-only, guarded against the live Staging definitions read 2026-10-26.
-- No grants, RLS, signatures, accounting writes or lock behavior change.
DO $fix$
DECLARE
 basis_definition text;
 save_definition text;
 prior_sub text:=current_setting('request.jwt.claim.sub',true);
 owner_id uuid; year_number integer; snapshot jsonb; old_basis jsonb; fresh_basis jsonb;
 snapshots jsonb:='[]'::jsonb;
BEGIN
 basis_definition:=pg_get_functiondef('public.kan112_checklist_basis(integer)'::regprocedure);
 save_definition:=pg_get_functiondef('public.save_year_end_checklist(integer,text,boolean,integer,text,uuid)'::regprocedure);
 IF md5(basis_definition)<>'0bf62069b71769697e267cb36f300df4'
 OR md5(save_definition)<>'72b62cca232695077528cc7697d7fccb' THEN
  RAISE EXCEPTION 'KAN112 definitions changed; inspect before applying.';
 END IF;

 -- Only translate previously current economic confirmations. Never re-confirm
 -- stale/unknown bases or erase a user's answer. Acquire the existing owner gate
 -- before profile locks, exactly as application writes do. All locks last to commit.
 FOR owner_id IN SELECT DISTINCT user_id FROM public.year_end_checklist
  WHERE confirmed AND check_key IN ('vat','statements','tax') ORDER BY user_id
 LOOP
  PERFORM public.lock_accounting_year_boundary(owner_id,true);
  PERFORM 1 FROM public.profiles WHERE id=owner_id FOR SHARE;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  FOR year_number IN SELECT DISTINCT fiscal_year FROM public.year_end_checklist
   WHERE user_id=owner_id AND confirmed AND check_key IN ('vat','statements','tax') ORDER BY fiscal_year
  LOOP
   old_basis:=public.kan112_checklist_basis(year_number);
   snapshots:=snapshots||jsonb_build_array(jsonb_build_object('owner',owner_id,'year',year_number,'basis',old_basis));
  END LOOP;
 END LOOP;

 -- Preserve original profile digest for the documents/company-details point.
 basis_definition:=replace(basis_definition,
  $old$SELECT jsonb_build_object('profile',$old$,
  $new$SELECT jsonb_build_object('economic_profile',md5(coalesce((SELECT jsonb_build_array(org_nr,vat_number,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement) FROM public.profiles WHERE id=u)::text,'[]')),'profile',$new$);
 basis_definition:=replace(basis_definition,$old$sources->'profile',sources->'vat_journal'$old$,$new$sources->'economic_profile',sources->'vat_journal'$new$);
 basis_definition:=replace(basis_definition,$old$sources->'classifications',sources->'profile'$old$,$new$sources->'classifications',sources->'economic_profile'$new$);
 EXECUTE basis_definition;
 -- PostgREST retries 40001 as a transient serialization failure. These two
 -- deliberate business conflicts need user reload, not transaction retries.
 EXECUTE replace(save_definition,$old$ERRCODE='40001'$old$,$new$ERRCODE='PT409'$new$);

 FOR snapshot IN SELECT value FROM jsonb_array_elements(snapshots)
 LOOP
  owner_id:=(snapshot->>'owner')::uuid; year_number:=(snapshot->>'year')::integer;
  old_basis:=snapshot->'basis';
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  fresh_basis:=public.kan112_checklist_basis(year_number);
  UPDATE public.year_end_checklist c
   SET basis_fingerprint=fresh_basis->>c.check_key,
       revision=c.revision+1,updated_at=statement_timestamp()
   WHERE c.user_id=owner_id AND c.fiscal_year=year_number AND c.confirmed
    AND c.check_key IN ('vat','statements','tax')
    AND old_basis IS NOT NULL AND fresh_basis IS NOT NULL
    AND c.basis_fingerprint=old_basis->>c.check_key
    AND c.basis_fingerprint IS DISTINCT FROM fresh_basis->>c.check_key;
 END LOOP;
 -- Restore caller context; no persistent JWT/session/configuration change.
 PERFORM set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
END $fix$;
