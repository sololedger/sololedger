import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import ts from 'typescript'

// Actual parser, adapter, handler, route wiring and browser client. SQL tests
// cover the real database; only network/Auth boundaries are replaced here.
const base = new URL('../src/lib/', import.meta.url)
const cache = new Map(), stubs = new Map()
async function load(file) {
  if (cache.has(file)) return cache.get(file)
  const code = ts.transpileModule(readFileSync(new URL(file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  const compiledModule = new SourceTextModule(code, { identifier: file })
  cache.set(file, compiledModule)
  await compiledModule.link(async specifier => {
    if (stubs.has(specifier)) {
      const exports = stubs.get(specifier)
      return new SyntheticModule(Object.keys(exports), function () { for (const [k,v] of Object.entries(exports)) this.setExport(k,v) })
    }
    return load(new URL(specifier + '.ts', file).href)
  })
  await compiledModule.evaluate()
  return compiledModule
}
const parser = (await load(new URL('sieParser.ts', base).href)).namespace
const { createSieImportHandler } = (await load(new URL('sieImportServer.ts', base).href)).namespace
const owner='00000000-0000-4000-8000-000000000074'
const receipt='00000000-0000-4000-8000-000000000075'
const raw = (rar='#RAR 0 20240101 20241231', extra='', date='20241001') => [
  '#FNAMN "KAN74 SYNTHETIC"','#ORGNR "000000-0000"',rar,'#KONTO 1930 "Bank"','#KONTO 2018 "Equity"',extra,
  '#VER A 1 '+date+' "KAN74 synthetic deposit"','{','#TRANS 1930 {} 100','#TRANS 2018 {} -100','}',
].join('\n')
let calls, authValid, dbError, registerError, captured
const admin = {
  auth: { getUser: async token => ({data:{user: authValid && token==='valid' ? {id:owner}:null},error:null}) },
  rpc: async (name,args) => { calls.push({name,args}); captured=args;return {data:receipt,error:registerError} },
}
const user = token => ({ rpc: async(name,args) => {
  assert.equal(token,'valid');assert.equal(name,'import_sie_batch');assert.deepEqual(args,{p_payload:{receipt_id:receipt}})
  calls.push({name,args});return {data:{success:true,import_batch_id:'batch',verification_count:1,imported_count:1,opening_balance_imported:false},error:dbError}
} })
const handler=createSieImportHandler({admin:()=>admin,user})
function request(input, token='valid', extra) {
  const form = new FormData();form.set('file',new File([input],'synthetic.se'))
  if(extra)form.set(extra,'tamper')
  return new Request('http://local/api/sie/import',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:form})
}
async function run(input, status=200, token='valid', extra) {
  calls=[];authValid=true;dbError=null;registerError=null
  const response=await handler(request(input,token,extra));const result=await response.json()
  assert.equal(response.status,status,JSON.stringify(result));assert(!JSON.stringify(result).includes('RAW_SECRET'))
  if(status!==200)assert.equal(calls.length,0,'Invalid source must not create receipt or accounting data')
  return result
}
await run(raw())
assert.equal(captured.p_user_id,owner);assert.equal(captured.p_period_start,'2024-01-01');assert.equal(captured.p_period_end,'2024-12-31')
assert.equal(captured.p_payload.file_hash,'c7e63ab0d4e18332008900f15b4435b907fe8b5d850a7f759cabe9e11c498b45')
assert.equal(captured.p_payload.verifications[0].rows[0].date,'2024-10-01')
await run(raw('#RAR 0 20240701 20251231'),400)
await run(raw(''),400)
await run(raw().replace('#FNAMN "KAN74 SYNTHETIC"','#FNAMN "RAW_SECRET'),400)
await run(raw().replace('{} 100','{ 100'),400)
await run(raw(undefined,'#IB 00 1930 100'),400)
await run(raw(undefined,'#ORGNR "111111-1111"'),400)
await run(raw().replace('#TRANS 1930 {} 100','#TRANS 1930 {} 100 2024-10-01'),400)
await run(raw('#RAR 0 20240101 20241231\n#RAR 0 20240101 20241231'),400)
await run(raw('#RAR 0 20240230 20241231'),400)
await run(raw('#RAR 0 20241231 20240101'),400)
await run(raw('#RAR 0 20240701 20241231','#IB 0 1930 100\n#IB 0 2010 -100'),400)
await run(raw('#RAR 0 20240701 20241231'),200)
await run(raw(undefined,'','20250101'),400)
await run(raw().replace('#TRANS 1930 {} 100','#TRANS 1930 {} 100 20250101'),400)
await run(raw(undefined,'#IB 0 1930 RAW_SECRET'),400)
await run(raw(undefined,'#UB 0 1930 RAW_SECRET'),400)
await run(raw(undefined,'#UB -999999999999999999999999 1930 1'),400)
await run(raw(undefined,'#UB 0 " " 1'),400)
await run(raw().replace('#TRANS 1930 {} 100','#TRANS 1930 {} Infinity'),400)
await run(raw().replace('#TRANS 1930 {} 100','#BTRANS 1930 {} 100'),400)
await run(raw().replace('#TRANS 1930 {} 100','#RAR 0 20240701 20251231'),400)
await run(raw(),401,'')
await run(raw(),401,'expired')
await run(raw(),400,'valid','user_id')
await run(raw(undefined,'#UB 0 1930 500\n#IB -1 1930 999'))
assert.deepEqual(captured.p_payload.closing_balances,[{yearIndex:0,accountNumber:'1930',amount:500}]);assert.equal(captured.p_payload.opening_balances.length,0)
const withIB=raw(undefined,'#IB 0 1930 10000\n#IB 0 2010 -10000')
await run(withIB);assert.equal(captured.p_payload.opening_balances.length,2)
const bridge=raw(undefined,'#IB 0 1930 10000\n#IB 0 2010 -8000\n#RES -1 3010 -2000')
await run(bridge);assert.equal(captured.p_payload.previous_year_result_balances[0].amount,-2000)
for(const [format,byte,expected] of [['PC8',0x8f,'Å'],['PC850',0x9b,'ø']]){
  const text=raw().replace('KAN74 SYNTHETIC','X')+'\n#FORMAT '+format
  const bytes=new TextEncoder().encode(text);bytes[bytes.indexOf('X'.charCodeAt(0))]=byte
  await run(bytes);assert.equal(captured.p_payload.company_name,expected)
}
await run(raw().replace('KAN74 SYNTHETIC','ÅÄÖ'));assert.equal(captured.p_payload.company_name,'ÅÄÖ')
const pair='#TRANS 1930 {} 1\n#TRANS 2018 {} -1\n'
const rows=count=>raw().replace('#TRANS 1930 {} 100\n#TRANS 2018 {} -100',pair.repeat(count/2).trimEnd())
await run(rows(50000));const rowBoundary=structuredClone(captured);await run(rows(50002),400)
assert.equal(parser.MAX_SIE_FILE_BYTES,4_000_000,'File limit uses decimal 4 MB')
assert.equal(parser.MAX_SIE_ROWS,50_000,'Journal-row limit unchanged')
const valid=raw()+'\n'
const exactFile=valid+' '.repeat(parser.MAX_SIE_FILE_BYTES-new TextEncoder().encode(valid).length)
const encodedRequestBytes=(await request(exactFile).arrayBuffer()).byteLength
assert(encodedRequestBytes>parser.MAX_SIE_FILE_BYTES,'Multipart overhead measured on actual browser request')
assert(encodedRequestBytes<=4_065_536,'Normal 4 MB upload fits server multipart allowance')
assert(4_065_536<4_500_000,'Total server request limit leaves Vercel headroom')
await run(exactFile)
const oversized=await run(exactFile+' ',413)
assert.equal(oversized.error,'Filen får vara högst 4 MB.')
// Actual stream cap, including dishonest/absent Content-Length and multipart
// overhead. At the cap malformed multipart reaches parsing (400); +1 is 413.
for(const [size,length,status] of [[4_065_536,undefined,400],[4_065_537,undefined,413],[4_065_537,'0',413]]) {
  const headers={authorization:'Bearer valid','content-type':'multipart/form-data; boundary=test'}
  if(length!==undefined)headers['content-length']=length
  const req=new Request('http://local/api/sie/import',{method:'POST',duplex:'half',headers,body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(size));controller.close()}})})
  calls=[];const response=await handler(req)
  assert.equal(response.status,status);assert.equal(calls.length,0)
  if(status===413)assert.equal((await response.json()).error,'Filen får vara högst 4 MB.')
}
const declaredOversize=request(raw());declaredOversize.headers.set('content-length','4065537')
calls=[];assert.equal((await handler(declaredOversize)).status,413);assert.equal(calls.length,0)

const malformed = new Request('http://local/api/sie/import',{method:'POST',headers:{authorization:'Bearer valid','content-type':'multipart/form-data; boundary=bad'},body:'RAW_SECRET'})
calls=[];const malformedResponse=await handler(malformed);assert.equal(malformedResponse.status,400);assert(!(await malformedResponse.text()).includes('RAW_SECRET'));assert.equal(calls.length,0)
for(const code of ['23505','P2001','P2074','P2075','23514','22023','unknown']){
  calls=[];dbError={code,message:'RAW_SECRET'};registerError=null
  const response=await handler(request(raw()));const result=await response.json()
  assert(!JSON.stringify(result).includes('RAW_SECRET'));assert.equal(response.status,code==='unknown'?500:400)
}
dbError=null;registerError={code:'unknown',message:'RAW_SECRET'};calls=[]
assert.equal((await handler(request(raw()))).status,503);assert.equal(calls.length,1)
registerError=null
// Optional synthetic fixtures let the local SQL harness use REAL server output.
if(process.env.KAN74_PAYLOAD_OUTPUT){
  const fixtures={row_boundary:rowBoundary}
  for(const [name,text] of [['normal',raw()],['ib',withIB],['bridge',bridge],['ub',raw(undefined,'#UB 0 1930 500')]]){
    await run(text);fixtures[name]=structuredClone(captured)
  }
  writeFileSync(process.env.KAN74_PAYLOAD_OUTPUT,JSON.stringify(fixtures,null,2))
}
let sent
stubs.set('./supabaseClient',{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'valid'}}})}}})
const browser=(await load(new URL('sieImport.ts',base).href)).namespace
const originalFetch=globalThis.fetch
try{
  globalThis.fetch=async(url,options)=>{sent={url,options};return Response.json({success:true,importBatchId:'batch',verificationCount:1,importedCount:1,openingBalanceImported:false})}
  const file=new File([raw()],'original.se');await browser.importSieBatch(file)
  assert.equal(sent.url,'/api/sie/import');assert.equal(sent.options.headers.Authorization,'Bearer valid');assert(sent.options.body instanceof FormData)
  assert.equal(await sent.options.body.get('file').text(),raw())
  globalThis.fetch=async()=>Response.json({success:false,code:'P2074',error:'Flerårig SIE-import stöds ännu inte.'},{status:400})
  await assert.rejects(browser.importSieBatch(file),e=>e instanceof browser.SieImportError&&e.code==='OPENING_BALANCE_CONFLICT')
  globalThis.fetch=async()=>Response.json({success:false,code:'22023',error:'Filen får vara högst 4 MB.'},{status:413})
  await assert.rejects(browser.importSieBatch(file),e=>e instanceof browser.SieImportError&&e.message==='Filen får vara högst 4 MB.')
}finally{globalThis.fetch=originalFetch}
const clients=[]
stubs.set('@supabase/supabase-js',{createClient:(url,key,options)=>{clients.push({url,key,options});return options.global?user('valid'):admin}})
stubs.set('@/lib/sieImportServer',{createSieImportHandler})
const route=(await load(new URL('../app/api/sie/import/route.ts',base).href)).namespace
const names=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY'];const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]))
try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='server-placeholder';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-placeholder'
  calls=[];dbError=null;registerError=null;assert.equal((await route.POST(request(raw()))).status,200)
  assert.equal(route.runtime,'nodejs');assert.equal(clients[0].key,'server-placeholder');assert.equal(clients[0].options.global,undefined)
  assert.equal(clients[1].key,'public-placeholder');assert.equal(clients[1].options.global.headers.Authorization,'Bearer valid')
}finally{for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n]}}
assert(parser.parseSieFile(raw('#RAR 0 20240701 20251231'),{strictImport:true}).errors.length>0)
console.log('PASS KAN-74 real server route/parser/client: P2, period rules, UB/IB/RES, 4 MB/4,065,536-byte request/50k boundaries, encoding, auth, sanitized errors and historical hash')
