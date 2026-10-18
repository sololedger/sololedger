// KAN-93: empty schema-only LOCAL clone; real SIE/correction/close RPCs.
// No hosted target is accepted, no source data is copied or modified.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { equityCases, sumEntries } from './fixtures/ne-equity-cases.mjs'
import { checkReport } from './test-ne-equity.mjs'
import { parseSieFile } from '../src/lib/sieParser.ts'
import { buildSieImportPayload } from '../src/lib/sieImportPayload.ts'

const db='sololedger_kan93_disposable_20261018',source='sololedger_kan84_operator_20261015'
if(process.env.SOLOLEDGER_KAN93_TEST_DB!==db || !process.env.PGPASSFILE || !process.env.KAN93_LIVE_DEFINITIONS) throw Error('Explicit local DB allowlist, local passfile and reviewed definitions required')
const env={...process.env,PGSSLMODE:'disable',PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'5'}
for(const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','DATABASE_URL'])delete env[k]
const bin='C:/Program Files/PostgreSQL/17/bin/',local=['-w','-h','localhost','-p','5432','-U','postgres']
function run(tool,args,input){const r=spawnSync(bin+tool+'.exe',args,{env,input,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:20*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
const q=(database,input)=>run('psql',[...local,'-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-d',database],input)
const ident=JSON.parse(q(source,"select json_build_object('db',current_database(),'host',host(inet_server_addr()))"))
assert.equal(ident.db,source);assert(['127.0.0.1','::1'].includes(ident.host))
assert.equal(q('postgres',`select count(*) from pg_database where datname='${db}'`),'0','Never overwrite an existing database')
const schema=run('pg_dump',[...local,'-d',source,'--schema-only','--no-owner'])
const live=JSON.parse(readFileSync(process.env.KAN93_LIVE_DEFINITIONS,'utf8'))
assert.equal(live.readonly,'on');assert.equal(live.tls,true)
const before=live.functions.find(f=>f.name==='close_year_atomic').definition.trim()+';'
const migration=readFileSync('supabase/migrations/20261018190000_kan93_ne_equity_transfers.sql','utf8')
const after=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'),migration.lastIndexOf('\nCOMMIT;')).trim()
assert.equal(after,before.replace("          AND account_number !~ '^899[0-9]$'\n",'').trim(),'Only B10 technical-account exclusion removed')
const lit=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb"
const uid='00000000-0093-4000-8000-000000000001'
const identity=`SET LOCAL request.jwt.claim.sub='${uid}'; SET LOCAL ROLE authenticated;`
const createUser=`INSERT INTO auth.users(id) VALUES('${uid}'); INSERT INTO profiles(id,email) VALUES('${uid}','kan93@example.invalid');`
// A successful close is rolled back inside a subtransaction too; no case hides
// a second close behind an already-closed-year error.
const tryClose=`CREATE FUNCTION pg_temp.try_close(y integer) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM public.close_year_atomic(y);
  RAISE EXCEPTION USING ERRCODE='Z0093';
EXCEPTION WHEN SQLSTATE 'Z0093' THEN RETURN 'ok'; WHEN OTHERS THEN RETURN SQLSTATE;
END;$f$;`
async function importSQL(entries, extra='') {
  let sql=''
  const years=[...new Set(entries.map(e=>Number(e.date.slice(0,4))))]
  for(const year of years) {
    // KAN-74 permits one imported year per owner. Subsequent-year synthetic
    // manual journals exercise carry-forward without weakening that boundary.
    if(year!==years[0]) {
      for(const e of entries.filter(e=>Number(e.date.slice(0,4))===year)) {
        const debit=Object.values(e.rows).reduce((s,n)=>s+Math.max(0,n),0)
        sql+=`RESET ROLE; DO $manual$ DECLARE tx uuid; nr integer; BEGIN SELECT get_next_ver_nr('${uid}') INTO nr; INSERT INTO transactions(user_id,date,description,amount,booked,source) VALUES('${uid}','${e.date}','KAN93 synthetic manual',${debit},true,'manual') RETURNING id INTO tx; `
        for(const [a,n] of Object.entries(e.rows)) sql+=`INSERT INTO journal_entries(transaction_id,ver_nr,account_number,debit,credit,date,user_id) VALUES(tx,nr,'${a}',${Math.max(0,n)},${Math.max(0,-n)},'${e.date}','${uid}');`
        sql+=`END;$manual$;${identity}`
      }
      continue
    }
    const text=`#FLAGGA 0\n#SIETYP 4\n#RAR 0 ${year}0101 ${year}1231\n${extra}\n`+entries.filter(e=>Number(e.date.slice(0,4))===year).map((e,i)=>`#VER A ${i+1} ${e.date.replaceAll('-','')} "KAN93 synthetic"\n{\n${Object.entries(e.rows).map(([a,n])=>`#TRANS ${a} {} ${n}`).join('\n')}\n}\n`).join('')
    const parsed=parseSieFile(text,{strictImport:true});assert.deepEqual(parsed.errors,[])
    const payload=await buildSieImportPayload(parsed,'synthetic-kan93.se'),receipt=randomUUID()
    sql+=`RESET ROLE; INSERT INTO sie_import_inputs(id,user_id,period_start,period_end,payload,raw_sha256,expires_at) VALUES('${receipt}','${uid}','${year}-01-01','${year}-12-31',${lit(payload)},'${createHash('sha256').update(text).digest('hex')}',clock_timestamp()+interval '5 minutes'); ${identity} DO $do$ BEGIN PERFORM import_sie_batch(${lit({receipt_id:receipt})}); END;$do$;\n`
  }
  return sql
}
const rowsSQL=year=>`SELECT json_build_object('annual',(select json_object_agg(account_number,balance) from get_period_account_balances('${year}-01-01','${year}-12-31')),'cumulative',(select json_object_agg(account_number,balance) from get_cumulative_account_balances('${year}-12-31')),'close',pg_temp.try_close(${year}));`
let created=false
try {
  run('createdb',[...local,db]);created=true
  q(db,schema)
  assert.equal(q(db,'select count(*) from auth.users'),'0','Schema clone must contain no users/data')
  // Restore only the reviewed affected live definitions, retaining source schema.
  q(db,live.functions.map(f=>f.definition.trim()+';').join('\n'))
  const metadata=()=>q(db,"select json_build_object('functions',(select json_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))||coalesce(proacl::text,'')) from pg_proc where pronamespace='public'::regnamespace and proname<>'close_year_atomic'),'closeACL',(select proacl::text from pg_proc where oid='public.close_year_atomic(integer)'::regprocedure))")
  const unchanged=metadata()
  q(db,migration)
  assert.equal(metadata(),unchanged,'Other functions and close ACL unchanged')
  assert.equal(q(db,"select has_function_privilege('authenticated','public.close_year_atomic(integer)','EXECUTE') and not has_function_privilege('anon','public.close_year_atomic(integer)','EXECUTE')"),'t')
  const repeat=spawnSync(bin+'psql.exe',[...local,'-X','-Atq','-v','ON_ERROR_STOP=1','-d',db],{env,input:migration,encoding:'utf8',windowsHide:true,timeout:10000})
  assert.notEqual(repeat.status,0);assert.match(repeat.stderr,/unexpected close_year_atomic definition/,'Unexpected target must fail closed')
  for(const c of equityCases) {
    const year=c.year??2026
    const result=q(db,`BEGIN;${createUser}${tryClose}${before}${identity}${await importSQL(c.entries)}${rowsSQL(year)}RESET ROLE;${after}${identity}${rowsSQL(year)}ROLLBACK;`)
    const [old,current]=result.split('\n').map(x=>JSON.parse(x))
    const technical=Object.entries(sumEntries(c.entries,year)).filter(([a])=>/^899\d$/.test(a)).reduce((s,[,n])=>s+n,0)
    assert.equal(old.close,c.oldClose??(technical!==0?'23514':'ok'),c.name+' pre-fix close')
    assert.equal(current.close,c.blocked?'23514':'ok',c.name+' fixed close')
    assert.deepEqual(current.annual,old.annual,'No journal changes by close')
    assert.deepEqual(current.cumulative,old.cumulative)
    await checkReport(c,current.annual??{},current.cumulative??{})
    console.log('PASS SQL '+c.name)
  }
  // Actual server-side IB bridge (#IB + #RES -1), not a synthetic client sum.
  const ibEntries=[{date:'2026-10-01',rows:{1930:100,2018:-100}}]
  const ib=q(db,`BEGIN;${createUser}${tryClose}${identity}${await importSQL(ibEntries,'#IB 0 1930 1000\n#RES -1 3010 -1000')}${rowsSQL(2026)}ROLLBACK;`)
  const bridge=JSON.parse(ib);assert.equal(bridge.cumulative['2019'],-1000);assert.equal(bridge.close,'ok')
  await checkReport({name:'actual-server-IB-bridge',equity:1100},bridge.annual,bridge.cumulative)
  // Actual correction and import undo must cancel technical and capital nets together.
  const base=equityCases.find(c=>c.name==='profit-transfer')
  for(const kind of ['correction','undo']) {
    const action=kind==='correction'?"create_correction_transaction_atomic((select id from transactions where description='KAN93 synthetic' and source_ver_number='2'))":"undo_sie_import_atomic((select id from import_batches where user_id='"+uid+"'))"
    const result=q(db,`BEGIN;${createUser}${tryClose}${identity}${await importSQL(base.entries)}DO $do$ BEGIN PERFORM ${action};END;$do$;${rowsSQL(2026)}ROLLBACK;`)
    const current=JSON.parse(result);assert.equal(current.close,'ok',kind+' year-close')
    await checkReport({name:'actual-'+kind,equity:kind==='correction'?1000:0},current.annual,current.cumulative)
  }
  assert.equal(q(db,'select count(*) from auth.users'),'0','Every fixture rolled back')
  console.log(`PASS SQL: ${equityCases.length} SIE/NE/close parity cases + actual IB bridge/correction/undo; reviewed migration, ACL and definition guard; fixtures rolled back`)
} finally {
  // Literal allowlisted database, created by this invocation; never the source.
  if(created){assert.equal(db,'sololedger_kan93_disposable_20261018');run('dropdb',[...local,db]);console.log('PASS disposable local DB removed; source schema/data untouched')}
}
