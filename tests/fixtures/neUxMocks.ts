// Offline design fixtures only. The existing pure report/review functions are unchanged.
import {calculateNeReport} from '../../src/lib/neCalculation'
import {buildNeReview,type NeReviewEntry} from '../../src/lib/neReview'
type Line=NeReviewEntry&{account:string}
const row=(account:string,delta:number,verNr:number,year:number,description:string,extra:Partial<Line>={}):Line=>({id:`synthetic-${year}-${verNr}-${account}`,transactionId:`synthetic-${year}-${verNr}`,account,date:`${year}-03-01`,journalDate:`${year}-03-01`,description,verNr,debit:Math.max(0,delta),credit:Math.max(0,-delta),vatRate:null,...extra})
export function fixture(scene='open',year=2026){
 const lines:Line[]=[]
 function entry(ver:number,description:string,items:[string,number][],date=`${year}-03-01`,extra:Partial<Line>={}){for(const[a,v]of items)lines.push(row(a,v,ver,year,description,{date,journalDate:date,...extra}))}
 entry(1,'Syntetisk försäljning · faktura 1001',[['3010',-240000],['2611',-60000],['1930',300000]],`${year}-02-10`)
 entry(2,'Syntetiska materialinköp',[['4010',60000],['2641',15000],['1930',-75000]],`${year}-02-15`)
 entry(3,'Syntetisk lokalhyra · ursprunglig felaktig bokning',[['5010',40000],['2641',10000],['1930',-50000]],`${year}-03-01`)
 entry(4,'Syntetisk rättelse av VER-3 · originalet bevaras',[['5010',-40000],['2641',-10000],['1930',50000]],`${year}-03-02`)
 entry(5,'Syntetisk lokalhyra · rätt belopp efter rättelsen',[['5010',30000],['2641',7500],['1930',-37500]],`${year}-03-02`,{rowDescription:'Lokalhyra efter rättelse; underlag Hyra mars'})
 entry(6,'Syntetiskt inventarieinköp',[['1220',50000],['2641',12500],['1930',-62500]],`${year}-03-03`)
 entry(7,'Syntetisk avskrivning',[['7832',10000],['1229',-10000]],`${year}-06-30`)
 entry(8,'Syntetisk momsavräkning · neutraliserat momssaldo',[['2611',60000],['2641',-35000],['1930',-25000]],`${year}-07-01`)
 if(scene==='no-review'){
  for(let i=lines.length-1;i>=0;i--)if([6,7].includes(lines[i].verNr!))lines.splice(i,1)
  for(const l of lines.filter(l=>l.verNr===8)){if(l.account==='2641')l.credit=22500;if(l.account==='1930')l.credit=37500}
 }
 const sales=lines.filter(l=>l.account==='3010')
 sales[0].decision={row:'R1',basis:'taxable'};sales[0].vatRate=25
 if(scene==='warnings'||scene==='import'){
  entry(9,'Syntetisk intäkt med osäker NE-koppling',[['3900',-2000],['1930',2000]])
  entry(10,'Syntetisk kostnad utan säker NE-ruta',[['7970',1000],['1930',-1000]])
  entry(11,'Syntetisk representation · fördelning behöver granskas',[['6070',500],['1930',-500]])
  entry(12,'Syntetisk uttryckligen ej avdragsgill kostnad',[['6992',500],['1930',-500]])
  entry(13,'Syntetisk resultatöverföring',[['8999',140000],['2019',-140000]])
 }
 if(scene==='trace')entry(0,'Syntetisk ingående balans från föregående år',[['1930',10000],['2010',-10000]],`${year-1}-12-31`)
 if(scene==='bank')entry(14,'Syntetiskt eget uttag · negativ bank behöver granskas',[['2013',110000],['1930',-110000]])
 if(scene==='unresolved'){delete sales[0].decision;sales[0].vatRate=0}
 if(scene==='personnel')entry(15,'Syntetiskt importerat personalrelaterat konto · utanför stöd',[['7699',1000],['1930',-1000]])
 const annual:Record<string,number>={},cumulative:Record<string,number>={}
 for(const l of lines){cumulative[l.account]=(cumulative[l.account]??0)+l.debit-l.credit;if(l.date.startsWith(String(year)))annual[l.account]=(annual[l.account]??0)+l.debit-l.credit}
 const salesState={available:true,r2Reallocation:0,unresolvedCount:scene==='unresolved'?1:0,unresolvedAmount:scene==='unresolved'?240000:0,reviewRequired:scene==='unresolved'}
 const report=calculateNeReport({annualBalances:annual,balanceSheetBalances:cumulative,cumulativeBalances:cumulative,neSalesClassification:salesState},true)
 const data=buildNeReview(report,sales)
 return {report,data,lines}
}
export function sceneFromOwner(owner:string){return owner.split(':')[1]||'open'}
export async function getNeReviewData(owner:string,year:number){
 if(['review-error','loading','missing'].includes(sceneFromOwner(owner)))throw Error('Syntetiskt läsfel: underlaget kunde inte läsas fullständigt. Inget fullständighetsbesked ges.')
 return fixture(sceneFromOwner(owner),year).data
}
export async function getNeReviewEntries(owner:string,year:number,account:string,period:'annual'|'cumulative',balance:number){
 if(sceneFromOwner(owner)==='entry-error')throw Error('Syntetiskt journalfel: kontots verifikationer kunde inte hämtas. Inget gammalt underlag visas.')
 const rows=fixture(sceneFromOwner(owner),year).lines.filter(l=>l.account===account&&(period==='cumulative'||l.date.startsWith(String(year))))
 if(rows.reduce((n,l)=>n+l.debit-l.credit,0)!==balance)throw Error('Syntetiska journalrader och visat saldo stämmer inte överens.')
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||(b.verNr??0)-(a.verNr??0))
}
