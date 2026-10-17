// Fail-closed local-only migration/test runner. All DDL and fixture writes are rolled back.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'
const database='sololedger_kan84_operator_20261015'
if(process.env.SOLOLEDGER_KAN88_TEST_DB!==database) throw Error('Explicit isolated local test database allowlist required')
if(!process.env.PGPASSFILE) throw Error('Local PGPASSFILE required; never read its contents')
const env={...process.env,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'}
for(const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD']) delete env[k]
const args=['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1']
function query(input){const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',args,{input,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
const destination=JSON.parse(query("select jsonb_build_object('database',current_database(),'address',host(inet_server_addr()))"))
assert.equal(destination.database,database);assert(['127.0.0.1','::1'].includes(destination.address))
const census="select jsonb_build_object('users',(select count(*) from auth.users),'transactions',(select count(*) from transactions),'journals',(select count(*) from journal_entries),'classifications',to_regclass('public.ne_sales_classifications'),'book_definition',md5(pg_get_functiondef('public.book_transaction_atomic(jsonb)'::regprocedure)))"
const before=query(census)
const migration=readFileSync('supabase/migrations/20261017122027_kan88_ne_sales_classification.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
const tests=readFileSync('supabase/tests/kan88_ne_sales_classification.sql','utf8')
const evidence=JSON.parse(query("BEGIN; SET LOCAL statement_timeout='40s';\n"+migration+'\n'+tests+'\nROLLBACK;'))
assert.equal(query(census),before,'DDL, definitions and fixture census restored after rollback')
console.log('PASS local destination, rollback and unchanged database census/definitions')

// Exercise the real report consumer and rendered warning using exactly the local SQL evidence.
const bundle=await build({stdin:{contents:"export {getNEData} from './src/lib/accountingService'; export {default as NEBilaga} from './src/components/NEBilaga'",resolveDir:process.cwd(),loader:'ts'},tsconfig:'tsconfig.json',bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'local-evidence',setup(b){
 b.onResolve({filter:/supabaseClient$/},()=>({path:'evidence',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={rpc:async(name)=>{const d=globalThis.__kan88Evidence;if(name==='get_ne_sales_summary')return globalThis.__kan88Missing?{data:null,error:{code:'PGRST202'}}:{data:d.summary,error:null};if(name==='get_period_account_balances')return {data:d.summary.balances,error:null};if(name==='get_cumulative_account_balances')return {data:d.cumulative,error:null};throw Error('Unexpected RPC '+name)}}`}))
}}]})
const mod={exports:{}};const require=createRequire(import.meta.url)
new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,require)
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server')
const reports={}
for(const label of ['before_review','after_review']){
 globalThis.__kan88Evidence=evidence[label]
 const report=await mod.exports.getNEData(2026);reports[label]=report
 const balances=Object.fromEntries(evidence[label].summary.balances.map(r=>[r.account_number,Number(r.balance)]))
 assert.equal(report.R1+report.R2,calculateBusinessResult(balances).neRows.R1+calculateBusinessResult(balances).neRows.R2)
 assert.equal(report.bokfortResultat,calculateBusinessResult(balances).bokfortResultat)
 const html=renderToStaticMarkup(React.createElement(mod.exports.NEBilaga,{neData:report,selectedYear:2026,isYearLocked:false,onLockYear:async()=>{}}))
 assert.match(html,new RegExp('R1/R2 behöver kontrolleras före deklaration'))
 assert.match(html,/role="alert"/)
}
const {R1:oldR1,R2:oldR2,neSalesClassification:oldStatus,...unchangedBefore}=reports.before_review
const {R1:newR1,R2:newR2,neSalesClassification:newStatus,...unchangedAfter}=reports.after_review
assert.equal(newR1,oldR1-2000);assert.equal(newR2,oldR2+2000)
assert.deepEqual(unchangedAfter,unchangedBefore,'all other NE rows, result and balance unchanged')
assert.deepEqual(evidence.before_review.summary.balances,evidence.after_review.summary.balances,'VAT and every account balance unchanged')
assert.equal(oldStatus.unresolvedCount-newStatus.unresolvedCount,2)
globalThis.__kan88Missing=true
const missing=await mod.exports.getNEData(2026)
assert.equal(missing.neSalesClassification.reviewRequired,true)
assert.equal(missing.R1,calculateBusinessResult(Object.fromEntries(evidence.after_review.summary.balances.map(r=>[r.account_number,Number(r.balance)]))).neRows.R1)
const unavailableHtml=renderToStaticMarkup(React.createElement(mod.exports.NEBilaga,{neData:missing,selectedYear:2026,isYearLocked:false,onLockYear:async()=>{}}))
assert.match(unavailableHtml,/inte färdigverifierade/)
const checkedHtml=renderToStaticMarkup(React.createElement(mod.exports.NEBilaga,{neData:{...reports.after_review,neSalesClassification:{...newStatus,reviewRequired:false,unresolvedCount:0}},selectedYear:2026,isYearLocked:false,onLockYear:async()=>{}}))
assert.doesNotMatch(checkedHtml,new RegExp('R1/R2 behöver kontrolleras'))
console.log('PASS actual NE consumer, legacy invoice R1/R2-only difference, unchanged result/VAT/balance and rendered warnings')
