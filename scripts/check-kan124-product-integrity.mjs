// Test infrastructure only: an immutable accepted product baseline and a narrow
// allowlists for KAN124 and the locally reviewed KAN128 candidate. Never updates
// its own hashes. Unknown files and drift in allowed files still fail closed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'

export const productionRevision='de30bf7a302087ea4b3c605426ec44fdd75d16f7'
const kan122='supabase/migrations/20261031133758_kan122_closed_year_boundary.sql'
const kan122Hash='ccea0bda6cad36470d81a1dfcf8613933eaf2c123525240ec5970863b0cf01de'
const migration='supabase/migrations/20261031204304_kan124_generic_vat_correction_guard.sql'
const approved=new Map([
 ['src/lib/accountingService.ts','e8e16a863e7b487045c79f66fb86a1d31f70686c441a81c2b66032a2b20b14ab'],
 ['src/app/page.tsx','378b957122885378c424b257082ba98b0df3034e1814ca02db878e38af5dab76'],
 [migration,'b7bef556583827457303d6a129e0c618ef2de984378645b7e38d03f2d97d5e90'],
 ['package.json','6329be8d527ef8145156756cf3e3cd9fdf3375d2bf4b493f82d0ef952fa105e8'],
 // KAN128: explicit local implementation scope; no publication approval implied.
 ['src/components/AccountingAttachmentHistory.tsx','20fe04cf2891a27b4e40205fd1562542b29440f0b369a139605061645b8fa093'],
 ['src/components/TransactionForm.tsx','04d48a87cfe2a40a04c45fda116d94cfd7283386a902c2b803b8882acac33064'],
 ['src/components/CustomerInvoicesPanel.tsx','3e75bcaaf6543fb3e6e03b0e971244702d2078233ba9ffbbbf0a613228a2fa0e'],
 ['src/components/SupplierYearEndPanel.tsx','26138a63c7ee3ef3ffa84007f85893620d9ba6454d61561e3dc61ca28fddedcb'],
 ['src/components/TransactionTable.tsx','dc8cc7e6498d59f436b0e444da41be02dce38a7eec5da381a9698fedc324e383'],
 ['src/app/page.tsx','e6c1b3a37de2b83738e74e01280d3fdee0e7f6ca70fb63e9aeddbb7919bf88b1'],
 ['src/lib/adminDeleteDryRun.ts','bc523f546c9531ccc4e2408c4a0608e64789a6add90a2d17e4bd059db9bb55a7'],
 ['supabase/functions/delete-user/index.ts','d18751108084b8a4cf10bf6a0d9835eb2b7b90fad224dc63b9e5d503c84d7475'],
 ['supabase/migrations/20261101213818_kan128_attachment_history.sql','4b50eb38fbe7eef380760486e4468707cc0e8dd93b615477ad679e9db8bab9a2'],
])
const scopes=['src','supabase','package.json','package-lock.json','next.config.ts','next.config.js','next.config.mjs','tsconfig.json','eslint.config.mjs','.gitignore']
const hash=b=>createHash('sha256').update(b).digest('hex')
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'))
const paths=b=>b.toString('utf8').split('\0').filter(Boolean)

export function loadIntegrityContext(){
 const baselinePaths=paths(execFileSync('git',['ls-tree','-r','-z','--name-only',productionRevision,'--',...scopes]))
 assert(baselinePaths.length>0,'Production Git baseline is missing')
 assert(baselinePaths.every(p=>!/[\r\n]/.test(p)),'Unexpected baseline pathname')
 const batch=spawnSync('git',['cat-file','--batch'],{input:baselinePaths.map(p=>productionRevision+':'+p+'\n').join(''),maxBuffer:80e6,windowsHide:true})
 assert.equal(batch.status,0,'Cannot read accepted baseline')
 const baselineFiles=new Map();let offset=0
 for(const p of baselinePaths){const end=batch.stdout.indexOf(10,offset);const header=batch.stdout.subarray(offset,end).toString();assert.match(header,/^[a-f0-9]+ blob \d+$/);const size=Number(header.split(' ')[2]);baselineFiles.set(p,batch.stdout.subarray(end+1,end+1+size));offset=end+size+2}
 assert.equal(offset,batch.stdout.length)
 return {baselineFiles,currentFiles:new Set(paths(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--',...scopes]))),readWorkingFile:p=>fs.readFileSync(p)}
}

export function verifyProductIntegrity({baselineFiles,currentFiles,readWorkingFile}){
 assert.equal(hash(baselineFiles.get(kan122)),kan122Hash,'KAN122 differs in accepted Git baseline')
 const all=new Set([...baselineFiles.keys(),...currentFiles,...approved.keys()])
 // Reject unknown new files BEFORE reading them; local secret/CLI state is not
 // a source fixture. Git ignores generated .temp state, never baseline SQL.
 for(const p of all)assert(baselineFiles.has(p)||approved.has(p),'Unapproved new protected file: '+p)
 for(const p of all){
  let actual;try{actual=readWorkingFile(p)}catch{assert.fail('Missing protected product file: '+p)}
  if(approved.has(p))assert.equal(hash(p===migration?actual:normalized(actual)),approved.get(p),'Unapproved KAN124 candidate content: '+p)
  else assert(actual.equals(baselineFiles.get(p))||normalized(actual).equals(normalized(baselineFiles.get(p))),'Protected product file changed: '+p)
  if(p===kan122)assert.equal(hash(actual),kan122Hash,'KAN122 migration bytes changed')
 }
 return {productionRevision,protectedFiles:all.size,approvedChanges:[...approved.keys()],kan122Unchanged:true}
}
export function checkProductIntegrity(){return verifyProductIntegrity(loadIntegrityContext())}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const context=loadIntegrityContext(),result=verifyProductIntegrity(context)
 if(process.argv.includes('--self-test')){
  const altered=(file,change)=>({...context,readWorkingFile:p=>p===file?change(context.readWorkingFile(p)):context.readWorkingFile(p)})
  for(const file of new Set(['src/lib/resultEngine.ts','src/components/NEBilaga.tsx',kan122,...approved.keys()]))assert.throws(()=>verifyProductIntegrity(altered(file,b=>Buffer.concat([b,Buffer.from('\n// unrelated edit\n')]))),/changed|Unapproved/)
  const unexpected='supabase/migrations/20990101000000_unapproved.sql'
  assert.throws(()=>verifyProductIntegrity({...context,currentFiles:new Set([...context.currentFiles,unexpected]),readWorkingFile:p=>{assert.notEqual(p,unexpected,'Must not read unknown file');return context.readWorkingFile(p)}}),/Unapproved new protected file/)
  assert.throws(()=>verifyProductIntegrity({...context,readWorkingFile:p=>{if(p===migration)throw Error('ENOENT');return context.readWorkingFile(p)}}),/Missing protected product file/)
  verifyProductIntegrity(altered('src/lib/resultEngine.ts',b=>Buffer.from(b.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n'))))
  console.log('PASS integrity negative controls: unrelated library/UI, KAN122, allowed-file drift, KAN124 migration, package, untracked migration and missing candidate rejected; ordinary CRLF accepted')
 }
 console.log(JSON.stringify(result))
}
