// Fail closed: only a new empty/synthetic local DB with this exact name is eligible.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
const db='sololedger_kan89_disposable_20261017'
if(process.env.SOLOLEDGER_KAN89_TEST_DB!==db || !process.env.PGPASSFILE) throw Error('Explicit disposable local DB and local PGPASSFILE required')
const bin='C:/Program Files/PostgreSQL/17/bin/'
const env={...process.env,PGSSLMODE:'disable',PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'5'}
for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','DATABASE_URL'])delete env[key]
const args=['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',db,'-Atq','-v','ON_ERROR_STOP=1']
function query(input){const r=spawnSync(bin+'psql.exe',args,{input,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:12*1024*1024});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
const destination=JSON.parse(query("select jsonb_build_object('database',current_database(),'address',host(inet_server_addr()))"))
assert.equal(destination.database,db);assert(['127.0.0.1','::1'].includes(destination.address))
assert.equal(query('select count(*) from auth.users'),'0','schema-only local clone required, no pre-existing user data')
const preMigration=JSON.parse(query("select json_agg(json_build_object('name',proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('book_transaction_atomic','book_periodized_transaction_atomic')"))
const migration=readFileSync('supabase/migrations/20261017164431_kan89_category_visibility.sql','utf8')
query(migration)
const postMigration=JSON.parse(query("select json_agg(json_build_object('name',proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('book_transaction_atomic','book_periodized_transaction_atomic')"))
for(const original of preMigration){
 let changed=postMigration.find(x=>x.name===original.name).definition.replace(/\r\n/g,'\n')
 changed=changed.replace('  v_hidden_from_new_booking boolean;\n','')
 changed=changed.replace('  -- SHARE permits concurrent bookings but serializes visibility UPDATE/DELETE.\n  -- The row lock is retained through journal creation and transaction end.\n','')
 changed=changed.replace('SELECT debit_account, credit_account, hidden_from_new_booking','SELECT debit_account, credit_account').replace('INTO v_debit_account, v_credit_account, v_hidden_from_new_booking','INTO v_debit_account, v_credit_account').replace('    AND user_id = v_user_id\n  FOR SHARE;','    AND user_id = v_user_id;')
 changed=changed.replace("  IF v_hidden_from_new_booking IS DISTINCT FROM false THEN\n    RAISE EXCEPTION 'Kategorin är dold för ny bokföring. Visa den igen i Kontoplan eller välj en annan kategori.'\n      USING ERRCODE = '23514';\n  END IF;\n\n",'')
 assert.equal(changed,original.definition.replace(/\r\n/g,'\n'),'every existing accounting rule preserved: '+original.name)
}
const census=()=>query("select jsonb_build_object('users',(select count(*) from auth.users),'transactions',(select count(*) from transactions),'journals',(select count(*) from journal_entries))")
const before=census()
console.log(query("BEGIN; SET LOCAL statement_timeout='40s';\n"+readFileSync('supabase/tests/kan89_category_visibility.sql','utf8')+'\nROLLBACK;'))
assert.equal(census(),before,'all fixture writes rolled back')
// Cross-session tests use only a fresh synthetic fixture in this disposable DB.
const uid='00000000-0089-4000-8000-000000000001'
query("INSERT INTO auth.users(id) VALUES ('"+uid+"'); INSERT INTO profiles(id,email,vat_status,domestic_sales_vat_treatment,vat_period_type,vat_management_from,foreign_purchase_reporting,default_deduction_entitlement) VALUES ('"+uid+"','kan89-race@example.invalid','registered','taxable','quarter','2026-01-01','required','full'); INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES ('race','"+uid+"','Synthetic race','5420','1930',25);")
const identity="SELECT set_config('request.jwt.claim.sub','"+uid+"',true); SET LOCAL ROLE authenticated; "
const hide="UPDATE accounts SET hidden_from_new_booking=true WHERE user_id='"+uid+"' AND id='race';"
const book=(periodized)=>'SELECT '+(periodized?'book_periodized_transaction_atomic':'book_transaction_atomic')+"(jsonb_build_object('date','2026-10-01','future_date','2027-01-01','description','Synthetic race','amount',1250,'type','race','vat_rate',25));"
function start(sql,application){
 const child=spawn(bin+'psql.exe',args,{env:{...env,PGAPPNAME:application},windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d)
 const done=new Promise(resolve=>child.on('close',code=>resolve({code,out,err})));child.stdin.write(sql+'\n');return {child,done}
}
async function waitBlocked(application){for(let n=0;n<100;n++){if(query("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+application+"' AND wait_event_type='Lock'")==='1')return;await new Promise(r=>setTimeout(r,30))}throw Error('Expected cross-session blocking: '+application)}
async function waitIdle(application){for(let n=0;n<100;n++){if(query("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+application+"' AND state='idle in transaction'")==='1')return;await new Promise(r=>setTimeout(r,30))}throw Error('Holder did not reach transaction boundary')}
for(const periodized of [false,true]){
 query("UPDATE accounts SET hidden_from_new_booking=false WHERE id='race'")
 // Hide wins: booking waits, then reads the committed hidden state and rejects.
 const h=start('BEGIN; '+identity+hide,'kan89-hide-holder');await waitIdle('kan89-hide-holder')
 const b=start('BEGIN; '+identity+book(periodized)+' COMMIT;','kan89-book-waiter');b.child.stdin.end()
 await waitBlocked('kan89-book-waiter');h.child.stdin.end('COMMIT;\n')
 assert.equal((await h.done).code,0);const denied=await b.done;assert.notEqual(denied.code,0);assert.match(denied.err,/dold/)
 assert.equal(query("SELECT count(*) FROM transactions WHERE user_id='"+uid+"'"),periodized?'1':'0')
 query("UPDATE accounts SET hidden_from_new_booking=false WHERE id='race'")
 // Booking wins: hide waits until all journal writes have committed.
 const booking=start('BEGIN; '+identity+book(periodized),'kan89-book-holder');await waitIdle('kan89-book-holder')
 const hiding=start('BEGIN; '+identity+hide+' COMMIT;','kan89-hide-waiter');hiding.child.stdin.end()
 await waitBlocked('kan89-hide-waiter');booking.child.stdin.end('COMMIT;\n')
 assert.equal((await booking.done).code,0);assert.equal((await hiding.done).code,0)
 assert.equal(query("SELECT bool_and(hidden_from_new_booking) FROM accounts WHERE id='race'"),'t')
 console.log('PASS KAN-89 concurrency '+(periodized?'periodized':'ordinary')+': both orderings verified using real session blocking')
}
mkdirSync('test-results/kan89',{recursive:true})
writeFileSync('test-results/kan89/db-result.json',JSON.stringify({result:'PASS',destination,fixtures:'synthetic only',concurrency:'both orderings, ordinary and periodized',accountingDefinitions:'unchanged except visibility and row locks'},null,2))
console.log('PASS KAN-89 local SQL and concurrency; disposable DB may now be removed by operator')
