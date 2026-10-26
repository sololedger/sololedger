'use client'
import {useEffect,useState,useSyncExternalStore} from 'react'
import {ChecklistStore,needsReview,type CheckKey} from '@/lib/yearEndChecklist'
import {checklistPort} from '@/lib/yearEndChecklistClient'

const button='min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2'
export function useYearEndChecklist(owner:string,year:number){
 const [store]=useState(()=>new ChecklistStore(checklistPort(owner,year)))
 const state=useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot)
 useEffect(()=>{
  // StrictMode can mount this effect twice. Generation invalidates the first load.
  void store.start()
  const focus=()=>{if(!store.state.busy&&!store.state.pending)void store.load()}
  window.addEventListener('focus',focus)
  const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('sololedger-year-end')
  if(channel)channel.onmessage=focus
  const unsubscribe=store.subscribe(()=>{if(store.state.notice==='Sparat')channel?.postMessage('changed')})
  return()=>{unsubscribe();channel?.close();window.removeEventListener('focus',focus);store.dispose()}
 },[store])
 return {store,state}
}
export function ChecklistNotice({checklist}:{checklist:ReturnType<typeof useYearEndChecklist>}){
 const {store,state}=checklist
 return <div className="space-y-2" aria-live="polite" aria-atomic="true">
  {state.busy&&<p>{state.notice||'Läser dina sparade avstämningar…'}</p>}
  {state.notice&&!state.busy&&<p>{state.notice}</p>}
  {state.error&&<p role="alert" className="text-red-800">{state.error} {state.pending&&<button type="button" className={button} disabled={state.busy} onClick={()=>void store.retry()}>Försök spara igen</button>}</p>}
  <button type="button" className={button} disabled={state.busy} onClick={()=>void store.load()}>Läs om checklistan</button>
 </div>
}
export function ChecklistConfirmation({checklist,checkKey,label}:{checklist:ReturnType<typeof useYearEndChecklist>;checkKey:CheckKey;label:string}){
 const {state,store}=checklist, data=state.data, row=data?.checks.find(r=>r.check_key===checkKey)
 const review=data&&needsReview(data,checkKey)
 if(!data)return <p className="rounded-lg bg-gray-50 p-3 text-sm">Din sparade markering kan inte visas förrän checklistan har lästs.</p>
 return <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
  <p className="font-semibold">Din avstämning</p>
  <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={row?.confirmed??false} disabled={!data||state.busy||!!state.pending} onChange={e=>void store.set(checkKey,e.currentTarget.checked)}/><span>{label}</span></label>
  {row?.confirmed&&<p>Bekräftat av dig {new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeZone:'Europe/Stockholm'}).format(new Date(row.confirmed_at!))}.</p>}
  {data.basis===null&&<p>Ändringskontrollen är inte tillgänglig för detta underlag. Dina bekräftelser sparas ändå, men du behöver själv kontrollera om underlaget ändrats.</p>}
  {review&&<><p className="font-semibold">Kontrollera igen</p><p>Registrerat underlag har ändrats sedan din bekräftelse. Din markering finns kvar. Kontrollera om ändringen påverkar avstämningen.</p><button type="button" className={button} disabled={state.busy||!!state.pending} onClick={()=>void store.set(checkKey,true)}>Jag har kontrollerat igen</button></>}
  {state.pending?.key===checkKey&&<p>Ändringen är inte bekräftad som sparad.</p>}
 </div>
}
