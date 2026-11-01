// Test infrastructure only: an immutable accepted product baseline and a narrow
// allowlist for the reviewed KAN124 candidate. Never updates its own hashes.
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
 ['package.json','4ca03f1ee75499add0d5d18852249a035c1278fb681664806d3794834436bbce'],
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
  for(const file of ['src/lib/resultEngine.ts','src/components/NEBilaga.tsx',kan122,'src/lib/accountingService.ts',migration,'package.json'])assert.throws(()=>verifyProductIntegrity(altered(file,b=>Buffer.concat([b,Buffer.from('\n// unrelated edit\n')]))),/changed|Unapproved/)
  const unexpected='supabase/migrations/20990101000000_unapproved.sql'
  assert.throws(()=>verifyProductIntegrity({...context,currentFiles:new Set([...context.currentFiles,unexpected]),readWorkingFile:p=>{assert.notEqual(p,unexpected,'Must not read unknown file');return context.readWorkingFile(p)}}),/Unapproved new protected file/)
  assert.throws(()=>verifyProductIntegrity({...context,readWorkingFile:p=>{if(p===migration)throw Error('ENOENT');return context.readWorkingFile(p)}}),/Missing protected product file/)
  verifyProductIntegrity(altered('src/lib/resultEngine.ts',b=>Buffer.from(b.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n'))))
  console.log('PASS integrity negative controls: unrelated library/UI, KAN122, allowed-file drift, KAN124 migration, package, untracked migration and missing candidate rejected; ordinary CRLF accepted')
 }
 console.log(JSON.stringify(result))
}
