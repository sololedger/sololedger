import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {LocalSession,loadApprovedManifest,json,literal} from './kan62-local-db-guard.mjs'

// Explicit local-only gate; imported transport pins host/port/DB/OID/marker and strips remote env.
assert.equal(process.env.SOLOLEDGER_KAN98_LOCAL_APPROVAL,'implementation-and-tests','KAN98 local approval missing')
const env={...process.env,SOLOLEDGER_KAN62_TEST_DB:'sololedger_kan62_disposable_20261021',
  SOLOLEDGER_KAN62_APPROVED_OPERATION:'concurrency',PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf'}
const manifest=loadApprovedManifest('concurrency',env)
const migration=readFileSync(new URL('../supabase/migrations/20261022120000_kan98_supplier_year_end.sql',import.meta.url),'utf8')
const sha=createHash('sha256').update(migration).digest('hex')
const evidence=new URL('../coverage/kan98-local/',import.meta.url);mkdirSync(evidence,{recursive:true})
const ids=Array.from({length:9},()=>randomUUID()), sessions=[], snapshots=[]; let checks=0
const pass=label=>{checks++;console.log('PASS '+label)}
const open=async label=>{const s=await new LocalSession(manifest,env,'kan98-'+label).open();sessions.push(s);return s}
const admin=await open('admin')
const one=async(s,sql)=>(await s.run(sql))[0]
const state=async u=>one(admin,`SELECT json_build_object('tx',(SELECT count(*) FROM transactions WHERE user_id=${literal(u)}),
  'rows',(SELECT count(*) FROM journal_entries WHERE user_id=${literal(u)}),
  'hash',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'')) FROM journal_entries e WHERE user_id=${literal(u)}),
  'debt',(SELECT coalesce(sum(credit-debit),0) FROM journal_entries WHERE user_id=${literal(u)} AND account_number='2440'));`)
const payload=(u,extra={})=>({action:'book',request_key:randomUUID(),supplier_name:'Syntetisk Leverantör',supplier_identity:'5560000000',
  invoice_number:randomUUID(),invoice_date:'2026-12-20',received_date:'2026-12-21',fiscal_year:2026,country:'SE',currency:'SEK',
  invoice_kind:'ordinary_expense',gross_amount:1250,vat_rate:25,invoice_vat:250,deduction:'full',expense_account:'6110',
  wholly_unpaid:true,delivered_in_year:true,not_previously_booked:true,not_credit_or_partial:true,attachment_path:u+'/kan98.pdf',...extra})
const call=async(s,p)=>one(s,`SELECT public.manage_supplier_year_end_invoice(${json(p)});`)
const journal=async(tx)=>one(admin,`SELECT json_build_object('rows',jsonb_agg(jsonb_build_array(account_number,debit,credit) ORDER BY account_number),
  'balanced',sum(debit)=sum(credit),'dates',count(DISTINCT date),'booked_on',min(date),'owners',count(DISTINCT user_id)) FROM journal_entries WHERE transaction_id=${literal(tx)};`)
const retained=()=>one(admin,'SELECT json_build_object('+['profiles','accounts','transactions','journal_entries','vat_periods','closed_years'].map(table=>
  `${literal(table)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${table} t WHERE ${table==='profiles'?'id':'user_id'} NOT IN (${ids.map(literal).join(',')}))`).join(',')+');')
async function reject(s,p,code,pattern='') {
  await s.run(`DO $reject$ DECLARE msg text; BEGIN
    BEGIN PERFORM public.manage_supplier_year_end_invoice(${json(p)});
    EXCEPTION WHEN SQLSTATE '${code}' THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
      IF msg !~ ${literal(pattern)} THEN RAISE EXCEPTION 'wrong rejection: %',msg; END IF; RETURN; END;
    RAISE EXCEPTION 'Expected rejection ${code}'; END $reject$;`)
}
try {
  // Fingerprint existing owners, never delete/reset fixtures; only new owners are excluded later.
  const before=await retained()
  await admin.run('BEGIN;')
  const installed=await one(admin,`SELECT json_build_object('installed',to_regprocedure('public.manage_supplier_year_end_invoice(jsonb)') IS NOT NULL);`)
  if(!installed.installed)await admin.run(migration)
  else assert.equal(readFileSync(new URL('migration-sha.txt',evidence),'utf8'),sha,'local installed candidate differs; inspect, never replay blindly')
  for(const u of ids)await admin.run(`INSERT INTO auth.users(id) VALUES(${literal(u)});
    INSERT INTO profiles(id,email,default_deduction_entitlement) VALUES(${literal(u)},'kan98-${u}@example.test','full');
    INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${literal(u)},'business_payment_account','1930');
    INSERT INTO storage.objects(bucket_id,name) VALUES('attachments',${literal(u+'/kan98.pdf')});`)
  // The real API uses one transaction per call. Never upgrade a writer's shared gate.
  await admin.run('COMMIT;');writeFileSync(new URL('migration-sha.txt',evidence),sha)
  const a=admin
  for(const [u,deduction,rate,gross,vat] of [[ids[0],'full',25,1250,250],[ids[1],'none',25,1250,250],[ids[2],'none',0,1000,0]]) {
    await a.asUser(u)
    const p=payload(u,{deduction,vat_rate:rate,gross_amount:gross,invoice_vat:vat}), r=await call(a,p)
    const again=await call(a,p);assert.equal(again.transaction_id,r.transaction_id);assert.equal(again.idempotent_replay,true)
    await reject(a,{...p,gross_amount:10},'22023','annat underlag')
    await reject(a,{...p,request_key:randomUUID()},'23514','redan')
    await a.run('RESET ROLE;')
    const j=await journal(r.transaction_id);assert.equal(j.balanced,true)
    assert.equal(j.booked_on,'2026-12-31');assert.equal(j.owners,1);snapshots.push({phase:'year_end',deduction,rate,journal:j})
    assert.deepEqual(j.rows, deduction==='full'?[['2440',0,gross],['2641',vat,0],['6110',gross-vat,0]]:[['2440',0,gross],['6110',gross,0]])
    pass(`exact year-end journal ${deduction}/${rate}, retry and changed-key duplicate rejection`)
    // Lock the previous year through the real guard. Balance is valid without an artificial bank deposit.
    await a.asUser(u)
    const yearBalance=await one(a,"SELECT json_build_object('balances',(SELECT jsonb_object_agg(account_number,balance) FROM get_cumulative_account_balances('2026-12-31')));")
    assert.equal(yearBalance.balances['2440'],-gross)
    await a.run('SELECT public.close_year_atomic(2026);')
    await a.run(`RESET ROLE; UPDATE profiles SET default_deduction_entitlement='none' WHERE id=${literal(u)};`)
    await a.asUser(u)
    const payment={action:'pay',invoice_id:r.invoice_id,request_key:randomUUID(),payment_date:'2027-01-15',paid_amount:gross}
    const paid=await call(a,payment);assert.equal((await call(a,payment)).transaction_id,paid.transaction_id)
    await reject(a,{...payment,request_key:randomUUID()},'23514','redan')
    await reject(a,{action:'cancel',invoice_id:r.invoice_id,request_key:randomUUID(),reason:'Fel i underlag'},'23514','status')
    await a.run('RESET ROLE;')
    const pj=await journal(paid.transaction_id);assert.equal(pj.booked_on,'2027-01-15')
    assert.deepEqual(pj.rows,[['1930',0,gross],['2440',gross,0]]);snapshots.push({phase:'payment',deduction,rate,journal:pj})
    assert.equal((await state(u)).debt,0)
    const frozen=await one(a,`SELECT json_build_object('rows',count(*),'vat',sum(CASE WHEN account_number='2641' THEN debit-credit ELSE 0 END)) FROM journal_entries WHERE user_id=${literal(u)} AND date='2026-12-31';`)
    assert.equal(frozen.rows,deduction==='full'?3:2);assert.equal(frozen.vat,deduction==='full'?vat:0)
    pass('2026 UB/2027 IB, actual year lock, January settlement without new expense/VAT, old journal unchanged')
  }
  await a.asUser(ids[3]);const correction=await call(a,payload(ids[3]))
  const pay={action:'pay',invoice_id:correction.invoice_id,payment_date:'2027-01-15',paid_amount:1250,request_key:randomUUID()}
  await reject(a,{...pay,paid_amount:100},'23514','Delbetalning')
  await call(a,pay)
  await call(a,{action:'undo_payment',invoice_id:correction.invoice_id,request_key:randomUUID(),reason:'Felaktig betalningsdag'})
  await call(a,{...pay,request_key:randomUUID(),payment_date:'2027-01-16'})
  await call(a,{action:'undo_payment',invoice_id:correction.invoice_id,request_key:randomUUID(),reason:'Hela underlaget var fel'})
  await call(a,{action:'cancel',invoice_id:correction.invoice_id,request_key:randomUUID(),reason:'Felaktigt bokslutsunderlag'})
  await a.run('RESET ROLE;');assert.equal((await state(ids[3])).debt,0)
  pass('auditable undo, repay and cancel; partial payment rejects without a journal')
  await a.asUser(ids[4]);const base=payload(ids[4])
  for(const patch of [{country:'DK'},{currency:'EUR'},{invoice_kind:'equipment'},{wholly_unpaid:false},{not_credit_or_partial:false},
    {not_previously_booked:false},{delivered_in_year:false},{deduction:'partial'},{expense_account:'1220'},
    {invoice_vat:249},{attachment_path:ids[0]+'/kan98.pdf'},{received_date:'2027-01-01'}]) {
    await reject(a,{...base,...patch},'23514');checks++
  }
  await a.run('RESET ROLE;');assert.equal((await state(ids[4])).tx,0);pass('all unsupported input rejects atomically')
  await a.asUser(ids[4]);const identity=payload(ids[4]);await call(a,identity)
  await call(a,{...identity,request_key:randomUUID(),supplier_identity:'5560000001'})
  const ownRows=await one(a,"SELECT json_build_object('n',count(*)) FROM supplier_year_end_invoices;");assert.equal(ownRows.n,2)
  pass('same invoice number from different suppliers accepted, positive own RLS control')
  // Real RLS and grants, not service-role simulations.
  await a.asUser(ids[4]);const foreign=await one(a,`SELECT json_build_object('n',count(*)) FROM supplier_year_end_invoices WHERE user_id=${literal(ids[0])};`)
  assert.equal(foreign.n,0)
  await reject(a,{action:'pay',invoice_id:correction.invoice_id,request_key:randomUUID()},'42501')
  await a.run('RESET ROLE;')
  const acl=await one(a,`SELECT json_build_object('unsafe',count(*)) FROM pg_class WHERE relname IN ('supplier_year_end_invoices','supplier_year_end_events') AND
    (NOT relrowsecurity OR has_table_privilege('authenticated',oid,'INSERT') OR has_table_privilege('authenticated',oid,'UPDATE') OR has_table_privilege('authenticated',oid,'DELETE') OR has_table_privilege('anon',oid,'SELECT'));`)
  assert.equal(acl.unsafe,0);pass('owner isolation and explicit denial of direct/anon writes')
  const functionAcl=await one(a,`SELECT json_build_object('anon',has_function_privilege('anon','public.manage_supplier_year_end_invoice(jsonb)','EXECUTE'),
    'oldDelete',has_function_privilege('service_role','public.delete_user_data_atomic_pre_kan98(uuid)','EXECUTE'));
    `)
  assert.equal(functionAcl.anon,false);assert.equal(functionAcl.oldDelete,false);pass('anon RPC and private deletion bypass denied')
  const classification=await one(a,"SELECT row_to_json(c) FROM transaction_source_classification('supplier_invoice') c;")
  assert.equal(classification.is_system_managed,true);assert.equal(classification.is_ordinary_vat_guard_activity,true)
  assert.equal(classification.allows_generic_correction,false);assert.equal(classification.allows_generic_update,false)
  pass('new source is explicitly current/system-managed/VAT-guarded, never generically edited')
  // Genuine service-only atomic deletion in a savepoint, retain evidence after rollback.
  await a.run('BEGIN; SAVEPOINT lifecycle; SET ROLE service_role;')
  const deleted=await one(a,`SELECT public.delete_user_data_atomic(${literal(ids[3])});`)
  assert.equal(deleted.deleted.supplier_year_end_invoices,1);assert.equal(deleted.deleted.supplier_year_end_events,6)
  await a.run('RESET ROLE; ROLLBACK TO SAVEPOINT lifecycle; COMMIT;');pass('atomic deletion counts, FK cascade and zero residual check; fixture retained')
  // Additional sessions see the committed local-only candidate. New cohort only.
  const b=await open('b'), c=await open('c');await b.asUser(ids[5]);await c.asUser(ids[5])
  const concurrent=payload(ids[5]);await b.run('BEGIN;');const first=await call(b,concurrent)
  const waiting=call(c,{...concurrent,request_key:randomUUID()}).then(()=>{throw Error('duplicate allowed')},e=>e)
  const block=await one(admin,`SELECT json_build_object('blocked',${b.pid}=ANY(pg_blocking_pids(${c.pid})));`)
  // Give the second backend time to reach its actual advisory wait, bounded observation only.
  if(!block.blocked) {await new Promise(r=>setTimeout(r,100));assert.equal((await one(admin,`SELECT json_build_object('blocked',${b.pid}=ANY(pg_blocking_pids(${c.pid})));`)).blocked,true)}
  await b.run('COMMIT;');const duplicateError=await waiting;assert.match(String(duplicateError),/23514|redan/)
  assert.equal((await state(ids[5])).tx,1);pass('real concurrent duplicate identities serialize; exactly one posting')
  // Failed psql process above is deliberately closed; use a fresh verified session.
  const c2=await open('c2');await c2.asUser(ids[5])
  const paidConcurrent={action:'pay',invoice_id:first.invoice_id,request_key:randomUUID(),payment_date:'2027-01-15',paid_amount:1250}
  await b.run('BEGIN;');await call(b,paidConcurrent)
  const replayWait=call(c2,paidConcurrent);await new Promise(r=>setTimeout(r,100))
  assert.equal((await one(admin,`SELECT json_build_object('blocked',${b.pid}=ANY(pg_blocking_pids(${c2.pid})));`)).blocked,true)
  await b.run('COMMIT;');assert.equal((await replayWait).idempotent_replay,true);assert.equal((await state(ids[5])).tx,2)
  pass('concurrent payment/replay gives one payment and one receipt')
  await b.asUser(ids[6]);const c3=await open('year-race');await c3.asUser(ids[6])
  await b.run('BEGIN; SELECT public.close_year_atomic(2026);')
  const deniedYear=call(c3,payload(ids[6])).then(()=>{throw Error('closed year accepted')},e=>e)
  await new Promise(r=>setTimeout(r,100))
  assert.equal((await one(admin,`SELECT json_build_object('blocked',${b.pid}=ANY(pg_blocking_pids(${c3.pid})));`)).blocked,true)
  await b.run('COMMIT;');assert.match(String(await deniedYear),/23514|låst/);assert.equal((await state(ids[6])).tx,0)
  pass('year-close first: genuine waiting acquisition rejects atomically after commit')
  await b.asUser(ids[7]);const c4=await open('book-first');await c4.asUser(ids[7])
  await b.run('BEGIN;');const finalPayload=payload(ids[7],{deduction:'none'});const finalOrigin=await call(b,finalPayload)
  const closing=c4.run('SELECT public.close_year_atomic(2026);');await new Promise(r=>setTimeout(r,100))
  assert.equal((await one(admin,`SELECT json_build_object('blocked',${b.pid}=ANY(pg_blocking_pids(${c4.pid})));`)).blocked,true)
  await b.run('COMMIT;');await closing
  assert.equal((await call(b,finalPayload)).transaction_id,finalOrigin.transaction_id)
  pass('acquisition first: close waits and includes liability; exact replay survives year lock')
  await c4.run('SELECT public.close_year_atomic(2027);')
  const lockedBefore=await state(ids[7])
  await reject(b,{action:'pay',invoice_id:finalOrigin.invoice_id,request_key:randomUUID(),payment_date:'2027-01-15',paid_amount:1250},'23514','låst')
  assert.deepEqual(await state(ids[7]),lockedBefore);pass('locked payment year rejects without journal, status or sequence changes')
  // Current date is before the end of 2026. Keep the actual future-period guard intact.
  // Use the same path in completed 2025 for a genuine closing, while 2026 report maths is tested separately.
  await admin.run(`UPDATE profiles SET vat_status='registered',domestic_sales_vat_treatment='taxable',vat_management_from='2025-01-01',vat_period_type='year' WHERE id=${literal(ids[8])};`)
  await b.asUser(ids[8]);await b.run("SELECT public.ensure_vat_periods('2025-12-31');")
  const vatOriginPayload=payload(ids[8],{fiscal_year:2025,invoice_date:'2025-12-20',received_date:'2025-12-21'}), vatOrigin=await call(b,vatOriginPayload)
  const period=await one(admin,`SELECT json_build_object('id',id) FROM vat_periods WHERE user_id=${literal(ids[8])} AND period_start='2025-01-01';`)
  await b.run(`SELECT public.close_vat_period_atomic(${literal(period.id)});`)
  const closedVat=await one(admin,`SELECT json_build_object('amount',closing_amount,'status',status) FROM vat_periods WHERE id=${literal(period.id)};`)
  assert.equal(closedVat.amount,-250);assert.equal(closedVat.status,'closed')
  const vatBefore=await state(ids[8])
  await reject(b,payload(ids[8],{fiscal_year:2025,invoice_date:'2025-12-20',received_date:'2025-12-21'}),'23514','momsperiod')
  await reject(b,{action:'cancel',invoice_id:vatOrigin.invoice_id,request_key:randomUUID(),reason:'Felaktigt underlag'},'23514','momsperiod')
  assert.deepEqual(await state(ids[8]),vatBefore)
  assert.equal((await call(b,vatOriginPayload)).transaction_id,vatOrigin.transaction_id)
  await call(b,{action:'pay',invoice_id:vatOrigin.invoice_id,request_key:randomUUID(),payment_date:'2026-01-15',paid_amount:1250})
  pass('real VAT closing -250, immutable closed-period basis, safe replay and later VAT-free settlement')
  const after=await retained()
  assert.deepEqual(after,before);pass('all previous owners profiles/accounts/journal/transactions/VAT/locks fingerprints unchanged')
  writeFileSync(new URL('result-'+Date.now()+'.json',evidence),JSON.stringify({checks,owners:ids,manifest,migrationSha:sha,snapshots,retainedBefore:before,retainedAfter:after,status:'PASS'},null,2))
  console.log(`KAN98 DB PASS ${checks} checks`)
} finally {for(const s of sessions)await s.close()}
