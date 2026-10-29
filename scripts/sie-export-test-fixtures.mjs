import { build } from 'esbuild'
import { createRequire } from 'node:module'

export async function loadSieTestApi() {
  const bundle = await build({stdin:{contents:"export {exportSIEForUserFromDb} from './src/lib/sieExport.ts';export {parseSieFile} from './src/lib/sieParser.ts';export {buildSieImportPayload} from './src/lib/sieImportPayload';export {calculateNeReport} from './src/lib/neCalculation';export {parseNeSalesSummary} from './src/lib/neSalesClassification';",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
  const mod={exports:{}}
  new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url))
  return mod.exports
}

export function book(owner='synthetic-KAN108') {
  const transactions=[],journal_entries=[]
  const tables={transactions,journal_entries,accounts:[],profiles:[{id:owner,company_name:'KAN108 synthetic',org_nr:'000000-0000'}]}
  function add(year,rows,options={}) {
    const id=String(transactions.length+1), date=options.date??`${year}-06-01`
    transactions.push({id,user_id:owner,date,description:'KAN108 synthetic',is_correction:false,corrects_ver_nr:null,source:'manual',...options})
    for(const [account_number,amount] of Object.entries(rows)) journal_entries.push({id:String(journal_entries.length+1),transaction_id:id,user_id:owner,ver_nr:transactions.length,date,account_number,debit:Math.max(amount,0),credit:Math.max(-amount,0),description:'KAN108 synthetic'})
  }
  return {owner,tables,add}
}

export function normalBook(owner) {
  const b=book(owner)
  b.add(2026,{1930:1000,2018:-1000});b.add(2026,{1930:1000,3010:-1000});b.add(2026,{5420:200,1930:-200});b.add(2026,{2013:100,1930:-100})
  b.add(2027,{1930:100,3010:-100});b.add(2027,{5420:400,1930:-400});b.add(2027,{1930:50,2018:-50});b.add(2027,{2013:20,1930:-20})
  b.add(2028,{1930:600,3010:-600});b.add(2028,{5420:100,1930:-100})
  return b
}

export function balances(b,year,annual=false) {
  const ids=new Set(b.tables.transactions.filter(t=>t.user_id===b.owner&&Number(t.date.slice(0,4))<=year&&(!annual||Number(t.date.slice(0,4))===year)).map(t=>t.id)),out={}
  for(const j of b.tables.journal_entries)if(j.user_id===b.owner&&ids.has(j.transaction_id))out[j.account_number]=(out[j.account_number]??0)+Number(j.debit)-Number(j.credit)
  return Object.fromEntries(Object.entries(out).map(([a,n])=>[a,Math.round(n*100)/100]))
}
export const balanceSheet=(b,year)=>Object.fromEntries(Object.entries(balances(b,year)).filter(([a])=>/^[12]/.test(a)))

export function fakeDb(tables) {
  return {from(table){let rows=[...tables[table]],lo=0,hi=Infinity
    const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q},range(a,b){lo=a;hi=b;return q},maybeSingle(){return Promise.resolve({data:rows[0]??null,error:null})},then(ok,fail){return Promise.resolve({data:rows.slice(lo,hi===Infinity?undefined:hi+1),count:rows.length,error:null}).then(ok,fail)}}
    return q
  }}
}

export function economicContent(parsed) {
  const balances=rows=>Object.fromEntries(rows.filter(r=>r.amount!==0).map(r=>[r.accountNumber,r.amount]).sort(([a],[b])=>a.localeCompare(b)))
  return {opening:balances(parsed.openingBalances),closing:balances(parsed.closingBalances),rows:parsed.verifications.map(v=>({date:v.date,description:v.description,rows:v.transactions.map(t=>[t.accountNumber,t.amount,t.transDate??v.date]).sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}
}
