// KAN-128: existing identified synthetic database only. ALL DDL and fixtures
// roll back. Storage metadata/RLS fixture is NOT the Storage HTTP service.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { query, Session, auth, literal as q, json, database, marker } from './kan122-local-db.mjs'

assert.equal(process.env.SOLOLEDGER_KAN128_LOCAL_GO, 'implementation-and-verification')
const migrationName = '20261101213818_kan128_attachment_history.sql'
const migration = fs.readFileSync('supabase/migrations/' + migrationName, 'utf8')
const contract = JSON.parse(fs.readFileSync('tests/fixtures/kan128-live-contract.json', 'utf8'))
const installed = query(`SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (${contract.functions.map(f=>q(f.name)).join(',')});`)[0]
for(const f of contract.functions) {
  const actual=installed.find(x=>x.signature===f.signature)
  assert(actual,'Missing verified local prerequisite: '+f.signature)
  assert.equal(createHash('sha256').update(actual.definition.replaceAll('\r','')).digest('hex'),f.sha256,'Local prerequisite drift: '+f.signature)
}
const run = path.resolve('coverage/kan128-local-20261101', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
fs.mkdirSync(run, { recursive: true })
const save = (name, data) => fs.writeFileSync(path.join(run, name + '.json'), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
const checks = []
const tables = query("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';")[0]
// Fingerprint existing public fixtures plus auth identities, without logging rows.
const fingerprint = `SELECT jsonb_build_object('public',(SELECT jsonb_object_agg(name,hash) FROM (` +
  tables.map(t => `SELECT ${q(t)} name,md5(coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text FROM public."${t}" x),'')) hash`).join(' UNION ALL ') +
  `) s),'auth',(SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY id)::text,'')) FROM auth.users u),'functions',(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND prokind='f'),'history',to_regclass('public.accounting_attachment_history'),'storage',to_regnamespace('storage'));`
const before = query(fingerprint)[0]
assert.equal(before.history, null, 'Never replay on an existing candidate')
assert.equal(before.storage, null, 'Inspect changed local Storage environment before testing')
save('before', before)
const u = randomUUID(), v = randomUUID(), tx = randomUUID(), ci = randomUUID(), si = randomUUID(), supplementOnly = randomUUID()
const file = (n, owner = u) => owner + '/' + n + '.pdf'
const attempt = `CREATE FUNCTION pg_temp.attempt(command text) RETURNS jsonb LANGUAGE plpgsql AS $try$
 DECLARE r jsonb; BEGIN EXECUTE command INTO r; RETURN jsonb_build_object('ok',true,'value',r);
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $try$;`
const seed = `
 INSERT INTO auth.users(id,email) VALUES(${q(u)},${q('kan128-'+u+'@example.invalid')}),(${q(v)},${q('kan128-'+v+'@example.invalid')});
 INSERT INTO profiles(id,email,company_name,vat_status,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement,vat_management_from,vat_period_type)
 VALUES(${q(u)},${q('kan128-'+u+'@example.invalid')},'KAN128 synthetic only','registered','taxable','not_required','full','2025-01-01','month'),
 (${q(v)},${q('kan128-'+v+'@example.invalid')},'KAN128 synthetic only','registered','taxable','not_required','full','2025-01-01','month')
 ON CONFLICT(id) DO UPDATE SET company_name=EXCLUDED.company_name,vat_status=EXCLUDED.vat_status,domestic_sales_vat_treatment=EXCLUDED.domestic_sales_vat_treatment,foreign_purchase_reporting=EXCLUDED.foreign_purchase_reporting,default_deduction_entitlement=EXCLUDED.default_deduction_entitlement,vat_management_from=EXCLUDED.vat_management_from,vat_period_type=EXCLUDED.vat_period_type;
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES
 ('kan128-capital',${q(u)},'KAN128 capital','1930','2018',0),('kan128-cost',${q(u)},'KAN128 expense','6110','1930',25);
 INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${q(u)},'business_payment_account','1930');
 INSERT INTO vat_periods(user_id,period_start,period_end,period_type,source)
 SELECT ${q(u)},d,(d+interval '1 month -1 day')::date,'month','sololedger'
 FROM (SELECT '2026-04-01'::date d UNION SELECT date_trunc('month',current_date)::date) months;
 INSERT INTO transactions(id,user_id,date,description,amount,type,booked,file_url) VALUES(${q(tx)},${q(u)},'2026-04-15','KAN128 observed fixture',1250,'kan128-cost',true,${q(file('original'))});
 INSERT INTO customer_invoices(id,user_id,invoice_number,customer_name,invoice_date,service_date,due_date,gross_amount,attachment_url)
 VALUES(${q(ci)},${q(u)},'KAN128-001','Synthetic customer','2026-04-15','2026-04-15','2026-05-15',1250,${q(file('original'))});
 INSERT INTO supplier_year_end_invoices(id,user_id,supplier_name,supplier_identity,invoice_number,invoice_date,received_date,fiscal_year,gross_amount,vat_rate,invoice_vat,deductible_vat,deduction,expense_account,attachment_path,year_end_transaction_id)
 VALUES(${q(si)},${q(u)},'Synthetic supplier','1234567890','KAN128-S1','2026-04-15','2026-04-15',2026,1250,25,250,250,'full','6110',${q(file('original'))},${q(tx)});`
const storage = `CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean NOT NULL DEFAULT false);
 INSERT INTO storage.buckets(id) VALUES('attachments');
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,metadata jsonb,owner_id text,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon,service_role;
 ${contract.storage.foldername};
 ${contract.storage.policies.map(p => `CREATE POLICY "${p.policyname.replaceAll('"','""')}" ON storage.objects AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.join(',')} ${p.qual ? 'USING ('+p.qual+')' : ''} ${p.with_check ? 'WITH CHECK ('+p.with_check+')' : ''};`).join('\n')}
 INSERT INTO storage.objects(bucket_id,name) SELECT 'attachments',n FROM unnest(ARRAY[${['original','replacement','extra','customer','supplier','locked','future'].map(n => q(file(n))).concat(q(file('foreign',v))).join(',')}]) n;`
// Existing local functions match the freshly inspected deployed definitions.
// Do not replace prerequisites, create roles, reset or persist any schema.
const setup = 'BEGIN;' + attempt + seed + storage + migration
const call = sql => `SELECT pg_temp.attempt(${q(sql)});`
const add = (kind, id, p, note='Synthetic supporting evidence') => `SELECT public.add_accounting_attachment(${q(kind)},${q(id)},${q(p)},${q(note)})`
const update = p => `SELECT public.update_transaction_safe(${q(tx)},${json(p)})`
const success = r => { assert.equal(r.ok,true,JSON.stringify(r)); assert.notEqual(r.value?.success,false); return r.value }
const denied = (r, code) => { assert.equal(r.ok,false,JSON.stringify(r)); if(code) assert.equal(r.code,code); return r }
const s = await new Session().open()
async function check(name, sql, verify) {
  const results = await s.run(sql); verify(results)
  checks.push({name,status:'PASS'}); save('case-'+checks.length,{name,results}); console.log('PASS '+name)
}
const rowsSQL = `SELECT jsonb_build_object('userId',${q(u)},'transactions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'date',date,'source',source) ORDER BY id),'[]') FROM transactions WHERE user_id=${q(u)}),'journalRows',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'transaction_id',transaction_id,'date',date,'account_number',account_number,'debit',debit,'credit',credit) ORDER BY id),'[]') FROM journal_entries WHERE user_id=${q(u)}),'vatPeriods',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM vat_periods p WHERE user_id=${q(u)}),'vatV2Snapshots','[]'::jsonb);`
const balanceSQL = `SELECT jsonb_build_object('annual',(SELECT jsonb_object_agg(account_number,balance) FROM get_period_account_balances('2026-01-01','2026-12-31')),'balances',(SELECT jsonb_object_agg(account_number,balance) FROM get_cumulative_account_balances('2026-12-31')),'ne',get_ne_sales_summary(2026));`
try {
  const preflight=migration.match(/DO \$preflight\$[\s\S]*?END \$preflight\$;/)?.[0]
  assert(preflight,'Candidate must have fail-closed installation prerequisites')
  for(const [name,change] of [
    ['Public bucket rejected before installation','UPDATE storage.buckets SET public=true;'],
    ['Disabled Storage RLS rejected before installation','ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;'],
    ['Changed deletion function rejected before installation',"CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;"],
  ]) {
    await s.run('BEGIN;'+attempt+seed+storage+change)
    await check(name,call(preflight),r=>denied(r[0],'P0001'))
    await s.run('ROLLBACK;')
  }
  await s.run(setup)
  await check('Existing references are observations, not invented uploads', `SELECT jsonb_agg(to_jsonb(h)) FROM accounting_attachment_history h WHERE user_id=${q(u)};`, r => {
    assert.equal(r[0].length,3); for(const h of r[0]) {assert.equal(h.action,'observed_existing');assert.equal(h.actor_id,null);assert.equal(h.path,file('original'))}
  })
  await s.run(auth(u))
  await s.run('RESET ROLE;CREATE POLICY kan128_future_permissive_update ON storage.objects FOR UPDATE TO authenticated USING(true) WITH CHECK(true);'+auth(u))
  await check('Ordinary direct Storage DELETE leaves referenced and unreferenced files', `WITH d AS(DELETE FROM storage.objects WHERE bucket_id='attachments' RETURNING name) SELECT jsonb_build_object('n',count(*)) FROM d;`,r=>assert.equal(r[0].n,0))
  await check('Ordinary direct Storage UPDATE leaves bytes metadata and path unchanged', `WITH d AS(UPDATE storage.objects SET metadata='{"changed":true}',name=name||'.changed' WHERE bucket_id='attachments' RETURNING name) SELECT jsonb_build_object('n',count(*)) FROM d;`,r=>assert.equal(r[0].n,0))
  await check('Upsert cannot overwrite existing file',call(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('attachments',${q(file('original'))},'{"overwrite":true}') ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=excluded.metadata RETURNING '{}'::jsonb`),r=>denied(r[0],'42501'))
  await check('Fresh own upload allowed; foreign upload denied',call(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments',${q(file('new-upload'))}) RETURNING '{}'::jsonb`)+call(`INSERT INTO storage.objects(bucket_id,name) VALUES('attachments',${q(file('forged-upload',v))}) RETURNING '{}'::jsonb`),r=>{success(r[0]);denied(r[1],'42501')})
  await check('Only own original and historical files are readable',`SELECT jsonb_build_object('own',(SELECT count(*) FROM storage.objects WHERE name=${q(file('original'))}),'foreign',(SELECT count(*) FROM storage.objects WHERE name=${q(file('foreign',v))}));`,r=>{assert.equal(r[0].own,1);assert.equal(r[0].foreign,0)})
  await check('Generic legacy reference replacement atomically preserves original',call(update({file_url:file('replacement')}))+`SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM accounting_attachment_history h WHERE transaction_id=${q(tx)};`,r=>{success(r[0]);assert.equal(r[1].length,2);assert.equal(r[1][1].original_path,file('original'));assert.equal(r[1][1].previous_path,file('original'));assert.equal(r[1][1].actor_id,u);assert.equal(r[1][1].action,'replacement')})
  for(const value of [null,''])await check('Reference removal denied: '+JSON.stringify(value),call(update({file_url:value})),r=>denied(r[0],'42501'))
  await check('Missing file rejected atomically',call(update({file_url:file('missing')})),r=>denied(r[0],'23503'))
  await check('Another user file rejected',call(update({file_url:file('foreign',v)})),r=>denied(r[0],'42501'))
  await check('Traversal rejected',call(update({file_url:u+'/../foreign.pdf'})),r=>denied(r[0],'42501'))
  await check('Addition is replay-safe without replacing original pointer',call(add('transaction',tx,file('extra')))+call(add('transaction',tx,file('extra')))+`SELECT jsonb_build_object('path',(SELECT file_url FROM transactions WHERE id=${q(tx)}),'n',(SELECT count(*) FROM accounting_attachment_history WHERE transaction_id=${q(tx)} AND action='addition'));`,r=>{assert.equal(success(r[0]).replayed,false);assert.equal(success(r[1]).replayed,true);assert.equal(r[2].path,file('replacement'));assert.equal(r[2].n,1)})
  await check('Changed replay description rejected',call(add('transaction',tx,file('extra'),'Changed note')),r=>denied(r[0],'22023'))
  await check('Direct history INSERT UPDATE DELETE and helper calls denied',[
    `INSERT INTO accounting_attachment_history(user_id,transaction_id,path,original_path,action,note) VALUES(${q(u)},${q(tx)},'fake','fake','initial','fake') RETURNING '{}'::jsonb`,
    "UPDATE accounting_attachment_history SET note='tampered' RETURNING '{}'::jsonb",
    "DELETE FROM accounting_attachment_history RETURNING '{}'::jsonb",
    `SELECT public.validate_accounting_attachment(${q(u)},${q(file('original'))})`,
    `SELECT public.delete_user_data_atomic(${q(u)})`,
  ].map(call).join(''),r=>{assert.equal(r.length,5);r.forEach(x=>denied(x,'42501'))})
  await check('Customer invoice addition and legacy replacement retain both files',call(add('customer_invoice',ci,file('customer')))+call(`SELECT public.update_customer_invoice_unbooked_atomic(${q(ci)},${json({attachment_url:file('replacement')})})`)+`SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM accounting_attachment_history h WHERE customer_invoice_id=${q(ci)};`,r=>{success(r[0]);success(r[1]);assert.equal(r[2].length,3);assert.equal(r[2][2].original_path,file('original'))})
  await check('Customer null update cannot remove preserved reference',call(`SELECT public.update_customer_invoice_unbooked_atomic(${q(ci)},${json({attachment_url:null})})`)+`SELECT jsonb_build_object('path',(SELECT attachment_url FROM customer_invoices WHERE id=${q(ci)}));`,r=>{success(r[0]);assert.equal(r[1].path,file('replacement'))})
  await check('Supplier invoice addition retains original',call(add('supplier_invoice',si,file('supplier')))+`SELECT jsonb_build_object('original',(SELECT attachment_path FROM supplier_year_end_invoices WHERE id=${q(si)}),'n',(SELECT count(*) FROM accounting_attachment_history WHERE supplier_invoice_id=${q(si)}));`,r=>{success(r[0]);assert.equal(r[1].original,file('original'));assert.equal(r[1].n,2)})
  await check('Real supplier booking creates history for invoice and voucher',call(`SELECT public.manage_supplier_year_end_invoice(${json({action:'book',request_key:randomUUID(),supplier_name:'KAN128 synthetic supplier',supplier_identity:'5560000000',invoice_number:'KAN128-REAL-S2',invoice_date:'2026-04-15',received_date:'2026-04-15',fiscal_year:2026,country:'SE',currency:'SEK',invoice_kind:'ordinary_expense',gross_amount:1250,vat_rate:25,invoice_vat:250,deduction:'full',expense_account:'6110',wholly_unpaid:true,delivered_in_year:true,not_previously_booked:true,not_credit_or_partial:true,attachment_path:file('supplier')})})`)+`SELECT jsonb_agg(to_jsonb(h)) FROM accounting_attachment_history h WHERE user_id=${q(u)} AND action='initial' AND path=${q(file('supplier'))};`,r=>{const value=success(r[0]);assert.equal(r[1].length,2);assert(r[1].some(h=>h.supplier_invoice_id===value.invoice_id));assert(r[1].some(h=>h.transaction_id===value.transaction_id))})
  await check('Real customer invoice creation validates and records own file',call(`SELECT public.create_customer_invoice_atomic(${json({invoice_number:'KAN128-REAL-C2',customer_name:'KAN128 synthetic customer',invoice_date:'2026-04-15',service_date:'2026-04-15',due_date:'2026-05-15',gross_amount:1250,vat_treatment:'taxable',vat_rate:25,attachment_url:file('customer')})})`)+`SELECT jsonb_agg(to_jsonb(h)) FROM accounting_attachment_history h WHERE user_id=${q(u)} AND action='initial' AND path=${q(file('customer'))};`,r=>{success(r[0]);assert.equal(r[1].length,1);assert.equal(r[1][0].actor_id,u)})
  await s.run(auth(v))
  await check('Foreign history hidden and all three foreign writes denied',`SELECT jsonb_build_object('n',(SELECT count(*) FROM accounting_attachment_history));`+[['transaction',tx],['customer_invoice',ci],['supplier_invoice',si]].map(([kind,id])=>call(add(kind,id,file('foreign',v)))).join('')+call(update({file_url:file('foreign',v)})),r=>{assert.equal(r[0].n,0);r.slice(1).forEach(x=>denied(x,'42501'))})
  // Two real connections, existing accounting lock helper. The second backend
  // needs no visibility of uncommitted fixtures to take this exact year gate.
  const concurrentTx=randomUUID(),gateSession=await new Session().open()
  try {
    await s.run(`RESET ROLE;INSERT INTO transactions(id,user_id,date,description,amount,type,booked) VALUES(${q(concurrentTx)},${q(v)},'2026-04-15','KAN128 concurrent fixture',100,'kan128-cost',false);${auth(v)}`)
    await gateSession.run(`BEGIN;SELECT public.lock_accounting_year_boundary(${q(v)},true);`)
    await check('Concurrent exclusive year gate blocks addition without partial history',`SET LOCAL lock_timeout='300ms';`+call(add('transaction',concurrentTx,file('foreign',v)))+`SELECT jsonb_build_object('n',(SELECT count(*) FROM accounting_attachment_history WHERE transaction_id=${q(concurrentTx)}));SET LOCAL lock_timeout='10s';`,r=>{denied(r[0],'55P03');assert.equal(r[1].n,0)})
    await gateSession.run('ROLLBACK;')
    await check('Addition succeeds after concurrent gate releases',call(add('transaction',concurrentTx,file('foreign',v))),r=>success(r[0]))
    const gateResult=await gateSession.run('BEGIN;'+attempt+`SET LOCAL lock_timeout='300ms';`+call(`SELECT public.lock_accounting_year_boundary(${q(v)},true)`))
    denied(gateResult[0],'55P03');save('concurrent-year-gate',gateResult);checks.push({name:'Successful addition holds shared gate against concurrent year close/deletion',status:'PASS'})
  } finally { await gateSession.close() }
  await s.run('RESET ROLE; SET LOCAL ROLE anon;')
  await check('Anon has no history access or attachment RPC permission',call("SELECT count(*)::text::jsonb FROM accounting_attachment_history")+call(add('transaction',tx,file('extra'))),r=>r.forEach(x=>denied(x,'42501')))
  await s.run('RESET ROLE;')
  await check('Even server mutation of immutable history is denied outside deletion context',call("UPDATE accounting_attachment_history SET note='bad' RETURNING '{}'::jsonb")+call("DELETE FROM accounting_attachment_history RETURNING '{}'::jsonb"),r=>r.forEach(x=>denied(x,'42501')))
  await check('FKs prevent reference-bearing source deletion',call(`DELETE FROM transactions WHERE id=${q(tx)} RETURNING '{}'::jsonb`)+call(`DELETE FROM customer_invoices WHERE id=${q(ci)} RETURNING '{}'::jsonb`),r=>r.forEach(x=>denied(x,'23503')))
  await s.run(auth(u))
  await s.run(`DO $book$ BEGIN PERFORM book_transaction_atomic(${json({idempotency_key:randomUUID(),date:'2026-04-15',type:'kan128-capital',amount:5000,vat_rate:0,description:'KAN128 capital'})});PERFORM book_transaction_atomic(${json({idempotency_key:randomUUID(),date:'2026-04-15',type:'kan128-cost',amount:1250,vat_rate:25,description:'KAN128 report fixture',file_url:file('original')})});END $book$;`)
  const reportBefore = await s.run(rowsSQL + balanceSQL)
  await check('Initial new reference records actor and timestamp',`SELECT jsonb_agg(to_jsonb(h)) FROM accounting_attachment_history h WHERE user_id=${q(u)} AND action='initial';`,r=>{assert(r[0].length>=1);r[0].forEach(h=>{assert.equal(h.actor_id,u);assert(h.recorded_at)})})
  const economicTx = `(SELECT id FROM transactions WHERE user_id=auth.uid() AND description='KAN128 report fixture')`
  await check('Booked economic transaction attachment-only edit',call(`SELECT update_transaction_safe(${economicTx},${json({file_url:file('future')})})`),r=>success(r[0]))
  const reportAfter = await s.run(rowsSQL + balanceSQL)
  const bundled = await build({stdin:{contents:"export {calculateVatReportFromLoadedRows} from './src/lib/vatReportService.ts';export {calculateNeReport} from './src/lib/neCalculation';export {parseNeSalesSummary} from './src/lib/neSalesClassification';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'})
  const mod={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports)
  const reports = r => {
    const vat=mod.exports.calculateVatReportFromLoadedRows({userId:u,startDate:'2026-01-01',endDate:'2026-12-31',rows:r[0]});assert.equal(vat.status,'ready')
    const b=r[1];const ne=mod.exports.calculateNeReport({annualBalances:b.annual,cumulativeBalances:b.balances,balanceSheetBalances:Object.fromEntries(Object.entries(b.balances).filter(([a])=>/^[12]/.test(a))),neSalesClassification:mod.exports.parseNeSalesSummary(b.ne)})
    return {vat:vat.report,ne,balances:b,rows:r[0]}
  }
  assert.deepEqual(reports(reportAfter),reports(reportBefore));save('reports',{before:reports(reportBefore),after:reports(reportAfter)});checks.push({name:'Real journal, VAT, NE and bank balances unchanged by attachment changes',status:'PASS'})
  await check('Real correction leaves original file and history readable',call(`SELECT create_correction_transaction_atomic(${economicTx})`)+`SELECT jsonb_build_object('path',(SELECT file_url FROM transactions WHERE id=${economicTx}),'history',(SELECT count(*) FROM accounting_attachment_history WHERE transaction_id=${economicTx}),'readable',(SELECT count(*) FROM storage.objects WHERE name=${q(file('original'))}));`,r=>{success(r[0]);assert.equal(r[1].path,file('future'));assert.equal(r[1].history,2);assert.equal(r[1].readable,1)})
  await s.run(`RESET ROLE;INSERT INTO transactions(id,user_id,date,description,amount,type,booked) VALUES(${q(supplementOnly)},${q(u)},'2025-04-15','KAN128 supplement-only fixture',100,'kan128-cost',false);${auth(u)}`)
  await check('Supplementation works without inventing an original pointer',call(add('transaction',supplementOnly,file('extra')))+`SELECT jsonb_build_object('path',(SELECT file_url FROM transactions WHERE id=${q(supplementOnly)}));`,r=>{success(r[0]);assert.equal(r[1].path,null)})
  await s.run(`RESET ROLE;INSERT INTO closed_years(user_id,year) VALUES(${q(u)},2026);${auth(u)}`)
  await check('Closed boundary protects supplement-only older source date',call(`SELECT update_transaction_safe(${q(supplementOnly)},${json({date:'2027-04-15'})})`),r=>denied(r[0]))
  for(const [kind,id] of [['transaction',tx],['customer_invoice',ci],['supplier_invoice',si]])await check('Year lock blocks addition: '+kind,call(add(kind,id,file('locked'))),r=>denied(r[0]))
  await check('Year lock blocks replacement',call(update({file_url:file('locked')})),r=>denied(r[0]))
  await check('Locked original and history still readable',`SELECT jsonb_build_object('files',(SELECT count(*) FROM storage.objects WHERE name=${q(file('original'))}),'history',(SELECT count(*) FROM accounting_attachment_history WHERE user_id=auth.uid()));`,r=>{assert.equal(r[0].files,1);assert(r[0].history>0)})
  await s.run('ROLLBACK;')
  // New independent transactions: never upgrade a shared year gate. The seed is
  // created before the candidate triggers. Only these fresh owners can be deleted.
  await s.run(setup)
  await s.run('SET LOCAL ROLE service_role;')
  await check('Service role sees count but cannot bypass history immutability with direct DELETE',`SELECT jsonb_build_object('n',(SELECT count(*) FROM accounting_attachment_history WHERE user_id=${q(u)}));`+call(`DELETE FROM accounting_attachment_history WHERE user_id=${q(u)} RETURNING '{}'::jsonb`),r=>{assert.equal(r[0].n,3);denied(r[1],'42501')})
  await check('Atomic account deletion counts and removes new history with no other owner effects',call(`SELECT delete_user_data_atomic(${q(u)})`)+`RESET ROLE;SELECT jsonb_build_object('history',(SELECT count(*) FROM accounting_attachment_history WHERE user_id=${q(u)}),'owner',(SELECT count(*) FROM profiles WHERE id=${q(u)}),'other',(SELECT count(*) FROM profiles WHERE id=${q(v)}),'contexts',(SELECT count(*) FROM delete_user_data_atomic_lifecycle_context WHERE user_id=${q(u)}));`,r=>{assert.equal(success(r[0]).deleted.accounting_attachment_history,3);assert.deepEqual(r[1],{history:0,owner:0,other:1,contexts:0})})
  await s.run('ROLLBACK;')
  await s.run(setup+`CREATE FUNCTION pg_temp.fail_profile_delete() RETURNS trigger LANGUAGE plpgsql AS $fail$ BEGIN IF OLD.id=${q(u)}::uuid THEN RAISE EXCEPTION 'KAN128 synthetic injected deletion failure';END IF;RETURN OLD;END $fail$;CREATE TRIGGER kan128_inject BEFORE DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_profile_delete();SET LOCAL ROLE service_role;`)
  await check('Late deletion failure rolls back history and lifecycle context',call(`SELECT delete_user_data_atomic(${q(u)})`)+`RESET ROLE;SELECT jsonb_build_object('history',(SELECT count(*) FROM accounting_attachment_history WHERE user_id=${q(u)}),'owner',(SELECT count(*) FROM profiles WHERE id=${q(u)}),'contexts',(SELECT count(*) FROM delete_user_data_atomic_lifecycle_context WHERE user_id=${q(u)}));`,r=>{denied(r[0]);assert.deepEqual(r[1],{history:3,owner:1,contexts:0})})
  await s.run('ROLLBACK;')
} finally { await s.close() }
const after=query(fingerprint)[0];assert.deepEqual(after,before,'All original rows, definitions and schema must survive unchanged');save('after',after)
save('summary',{status:'PASS',database,marker,migration:migrationName,migrationSha256:createHash('sha256').update(migration).digest('hex'),checks,limitations:['Transactional Storage metadata/RLS fixture, no Storage HTTP server or file bytes','No persistent migration or fixtures installed','No hosted writes or user data used','Two-session accounting gate tested; full Storage API and cross-service provider behavior remain untested'],originalStatePreserved:true})
console.log(JSON.stringify({status:'PASS',tests:checks.length,evidence:run,originalStatePreserved:true}))
