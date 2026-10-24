'use client'
import { useEffect, useRef, useState } from 'react'
import DeclarationArchiveEditor from './DeclarationArchiveEditor'
import DeclarationVersionView from './DeclarationVersionView'
import { declarationChangeLabels, emptyDeclarationCommand, type DeclarationCommand, type DeclarationSourceView, type DeclarationSummary, type DeclarationVersion } from '@/lib/declarationArchiveView'

// Opening the ordinary NE page must not initialize another client or read path.
const transport=()=>import('@/lib/declarationArchiveClient')
const button='min-h-11 rounded-lg border border-gray-400 px-3 py-2 font-semibold disabled:opacity-50'
type Review={command: DeclarationCommand; version: DeclarationVersion}
const message=(error: unknown)=>error instanceof Error?error.message:'Historiken kunde inte läsas.'
async function latestVersion(owner: string,year: number,versions: DeclarationSummary[]) {
  const latest=versions.find(v=>v.income_year===year)
  return latest?(await transport()).loadDeclarationVersion(owner,latest.id):null
}
function documentCommand(year: number,latest: DeclarationVersion | null) {
  const command=emptyDeclarationCommand(year)
  if(latest) Object.assign(command,{expected_previous_id:latest.id,change_kind:'documentation_correction',
    source:{mode:latest.source_snapshot_id?'reuse':'none',snapshot_id:latest.source_snapshot_id,expected_fingerprint:null},
    manual:structuredClone(latest.manual),submission:structuredClone(latest.submission)})
  return command
}
function reviewVersion(command: DeclarationCommand,source: DeclarationSourceView | null,latest: DeclarationVersion | null,submitted: DeclarationSourceView | null): DeclarationVersion {
  return {id:'',income_year:command.income_year,revision_no:(latest?.revision_no??0)+1,previous_revision_id:command.expected_previous_id,
    source_snapshot_id:source?.id??null,submission_source_snapshot_id:command.submission.source_snapshot_id==='current'?source?.id??null:command.submission.source_snapshot_id,
    recorded_at:'',change_kind:command.change_kind,reason:command.reason,submission_status:command.submission.status,
    manual:command.manual,submission:command.submission,source,submitted_source:submitted}
}
async function capture(owner: string,year: number,versions: DeclarationSummary[]): Promise<Review> {
  const api=await transport(),[source,latest]=await Promise.all([api.loadDeclarationPreview(owner,year),latestVersion(owner,year,versions)])
  if(!source.locked) throw new Error('Året måste vara låst innan ett bokföringsunderlag sparas. Låsning görs separat i Årsavslut. Du kan ändå dokumentera egna och faktiskt deklarerade uppgifter här.')
  const command=documentCommand(year,latest)
  command.change_kind=latest?'new_calculation':'initial'
  command.source={mode:'capture',snapshot_id:null,expected_fingerprint:source.source_fingerprint}
  return {command,version:reviewVersion(command,source,latest,latest?.submitted_source??null)}
}
function ArchiveContent({owner,year,start,onClose}: {owner: string; year: number; start: 'history'|'capture'; onClose: ()=>void}) {
  const [versions,setVersions]=useState<DeclarationSummary[]|null>(null),[selectedYear,setYear]=useState(year)
  const [version,setVersion]=useState<DeclarationVersion|null>(null),[draft,setDraft]=useState<DeclarationCommand|null>(null)
  const [review,setReview]=useState<Review|null>(null),[pending,setPending]=useState<{id: string; command: DeclarationCommand}|null>(null)
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const alive=useRef(true),sequence=useRef(0)
  const printFrames=useRef(new Set<HTMLIFrameElement>())
  useEffect(()=>{
    let active=true;alive.current=true
    ;(async()=>{
      const data=await (await transport()).loadDeclarationIndex(owner)
      const initial=start==='capture'?await capture(owner,year,data):null
      const selected=initial?null:await latestVersion(owner,year,data)
      if(active){setVersions(data);setReview(initial);setVersion(selected)}
    })().catch(e=>{if(active)setError(message(e))}).finally(()=>{if(active)setBusy(false)})
    const frames=printFrames.current
    return()=>{active=false;alive.current=false;for(const frame of frames)frame.remove();frames.clear()}
  },[owner,year,start])
  const valid=(n: number)=>alive.current&&n===sequence.current
  async function run(action: (current: ()=>boolean)=>Promise<void>) {
    const n=++sequence.current;setBusy(true);setError('')
    try{await action(()=>valid(n))}catch(e){if(valid(n))setError(message(e))}finally{if(valid(n))setBusy(false)}
  }
  async function reload(preferred?: string) {
    const data=await (await transport()).loadDeclarationIndex(owner)
    const selected=preferred?await (await transport()).loadDeclarationVersion(owner,preferred):await latestVersion(owner,selectedYear,data)
    return {data,selected}
  }
  function refresh() {void run(async current=>{const next=await reload();if(current()){setVersions(next.data);setVersion(next.selected)}})}
  function selectYear(nextYear: number) {
    setYear(nextYear);setVersion(null);setDraft(null);setReview(null);setNotice('')
    void run(async current=>{const selected=await latestVersion(owner,nextYear,versions??[]);if(current())setVersion(selected)})
  }
  function beginCapture() {void run(async current=>{const next=await capture(owner,selectedYear,versions??[]);if(current()){setDraft(null);setReview(next);setNotice('')}})}
  function beginEdit() {void run(async current=>{
    const latest=await latestVersion(owner,selectedYear,versions??[])
    if(current()){setDraft(documentCommand(selectedYear,latest));setReview(null);setNotice('')}
  })}
  function previewEdit(command: DeclarationCommand) {
    setDraft(command)
    void run(async current=>{
      const latest=await latestVersion(owner,selectedYear,versions??[])
      let submitted=latest?.submitted_source??null
      if(command.submission.source_snapshot_id!==submitted?.id) {
        const ref=versions?.find(v=>v.source_snapshot_id===command.submission.source_snapshot_id)
        submitted=ref?(await (await transport()).loadDeclarationVersion(owner,ref.id)).source:null
      }
      if(current())setReview({command,version:reviewVersion(command,latest?.source??null,latest,submitted)})
    })
  }
  function save() {
    if(!review) return
    const unresolvedEarlierAttempt=pending!==null
    const attempt=pending??{id:crypto.randomUUID(),command:structuredClone(review.command)}
    setPending(attempt)
    void run(async current=>{
      try {
        const receipt=await (await transport()).submitDeclarationVersion(owner,attempt.id,attempt.command)
        if(!current())return
        setPending(null);setReview(null);setDraft(null);setVersion(null)
        setNotice(`Version ${receipt.revision_no} är sparad. Inget har skickats till Skatteverket.`)
        // A read failure after confirmation must never turn a saved result into
        // an apparent failed save or offer a new request ID for the same attempt.
        try{const next=await reload(receipt.id);if(current()){setVersions(next.data);setVersion(next.selected)}}
        catch{if(current())setError('Versionen är sparad, men historiken kunde inte läsas igen. Använd Läs historiken igen.')}
      } catch(e) {
        if(current()) {
          // A rejected retry (for example an expired login) cannot settle the
          // unknown result of an earlier request. Keep its original key/data.
          if(!unresolvedEarlierAttempt && !(e && typeof e==='object' && 'uncertain' in e && e.uncertain)) setPending(null)
          setError(message(e))
        }
      }
    })
  }
  function exportVersion(print: boolean) {
    if(!version)return
    const selected=version
    void run(async current=>{
      const html=await (await transport()).loadDeclarationExport(owner,selected.id)
      if(!current())return
      if(print) {
        const frame=document.createElement('iframe');frame.title='Utskrift av vald deklarationsversion'
        frame.style.position='fixed';frame.style.width='1px';frame.style.height='1px';frame.style.border='0'
        frame.setAttribute('sandbox','allow-same-origin allow-modals')
        const remove=()=>{frame.remove();printFrames.current.delete(frame)}
        frame.onload=()=>{if(!current()){remove();return}frame.contentWindow?.addEventListener('afterprint',remove,{once:true});frame.contentWindow?.focus();frame.contentWindow?.print()}
        printFrames.current.add(frame);setTimeout(remove,60000)
        frame.srcdoc=html;document.body.appendChild(frame)
      } else {
        const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),link=document.createElement('a')
        link.href=url;link.download=`Deklarationshistorik-${selected.income_year}-v${selected.revision_no}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      }
    })
  }
  const yearOptions=[...new Set([year,...(versions??[]).map(v=>v.income_year)])].sort((a,b)=>b-a)
  return <section aria-label="Deklarationshistorik" className="mt-4 space-y-5 rounded-xl border border-emerald-200 p-3 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Deklarationshistorik</h3><button type="button" className={button} onClick={onClose} disabled={!!pending}>Stäng historiken</button></div>
    {notice&&<p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">{notice}</p>}
    {error&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">{error}</p>}
    {busy&&<p role="status">{pending?'Sparar samma begäran…':'Läser deklarationshistorik…'}</p>}
    {pending&&!busy&&<p className="font-semibold">Sparbegäran bevaras medan utfallet är okänt. Försök igen nedan; uppgifterna kan inte ändras under omförsöket.</p>}
    {!review&&!draft&&<button className={button} type="button" disabled={busy||!!pending} onClick={refresh}>Läs historiken igen</button>}
    {versions!==null&&!review&&!draft&&<>
      <label className="block font-semibold">Inkomstår<select aria-label="Inkomstår" className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2 text-base" value={selectedYear} disabled={busy||!!pending} onChange={e=>selectYear(Number(e.target.value))}>{yearOptions.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      {versions.some(v=>v.income_year===selectedYear)?<label className="block font-semibold">Sparad version<select aria-label="Sparad version" className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2 text-base" value={version?.id??''} disabled={busy||!!pending} onChange={e=>{const id=e.currentTarget.value;setVersion(null);void run(async current=>{const loaded=await (await transport()).loadDeclarationVersion(owner,id);if(current())setVersion(loaded)})}}><option value="" disabled>Välj version</option>{versions.filter(v=>v.income_year===selectedYear).map(v=><option key={v.id} value={v.id}>Version {v.revision_no} · {declarationChangeLabels[v.change_kind]??v.change_kind} · {v.submission_status==='submitted_by_user'?'Inlämnad enligt egen uppgift':'Ingen inlämning dokumenterad'}</option>)}</select></label>:<p>Inga sparade versioner för {selectedYear}.</p>}
      <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={beginCapture}>Spara {versions.some(v=>v.income_year===selectedYear)?'nytt ':''}deklarationsunderlag för {selectedYear}</button><button type="button" className={button} disabled={busy} onClick={beginEdit}>{versions.some(v=>v.income_year===selectedYear)?'Uppdatera egna uppgifter / rätta senaste versionen':'Dokumentera egna och deklarerade uppgifter'}</button></div>
      <p className="text-sm">Sparande och årslåsning är separata handlingar. Egna uppgifter kan dokumenteras även utan låst år eller ett säkert NE-underlag. Rättelser utgår alltid från senaste versionen.</p>
      {version&&<><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={()=>exportVersion(true)}>Skriv ut / spara PDF</button><button type="button" className={button} disabled={busy} onClick={()=>exportVersion(false)}>Ladda ner vald version (HTML)</button></div><DeclarationVersionView version={version}/></>}
    </>}
    {draft&&!review&&<fieldset disabled={busy}><DeclarationArchiveEditor initial={draft} versions={versions??[]} onReview={previewEdit} onCancel={()=>setDraft(null)}/></fieldset>}
    {review&&<div className="space-y-4"><DeclarationVersionView version={{...review.version,reason:review.command.reason}} preview/>
      {review.command.expected_previous_id&&review.command.source.mode==='capture'&&<label className="block">Varför sparar du ett nytt underlag?<textarea className="mt-1 w-full rounded-lg border p-2" maxLength={4000} disabled={busy||!!pending} value={review.command.reason} onChange={e=>setReview(old=>old?{...old,command:{...old.command,reason:e.target.value}}:old)}/></label>}
      <p className="font-semibold">Den här versionen bevaras. Senare ändringar skapar en ny version.</p>
      <div className="flex flex-wrap gap-3"><button className={button+' bg-emerald-700 text-white'} type="button" disabled={busy || (!!review.command.expected_previous_id&&!review.command.reason.trim())} onClick={save}>{pending?'Försök spara samma begäran igen':'Spara denna version'}</button>
        <button className={button} type="button" disabled={busy||!!pending} onClick={()=>{setReview(null);setError('')}}>{draft?'Tillbaka till egna uppgifter':'Avbryt förhandsgranskning'}</button></div>
    </div>}
  </section>
}
export default function NEDeclarationArchive({owner,year,locked}: {owner: string; year: number; locked: boolean}) {
  const [start,setStart]=useState<'history'|'capture'|null>(null)
  return <div className="my-5 rounded-xl border border-emerald-200 bg-white p-3 sm:p-4">
    {!start?<><div className="flex flex-wrap gap-3"><button type="button" className={button+' bg-emerald-700 text-white'} disabled={!locked} onClick={()=>setStart('capture')}>Spara deklarationsunderlag</button><button type="button" className={button} onClick={()=>setStart('history')}>Deklarationshistorik</button></div><p className="mt-2 text-sm text-gray-600">{locked?'Året är låst. Sparandet bevarar en separat version.':'Lås året i Årsavslut för att spara bokföringsunderlaget.'} Egna och faktiskt deklarerade uppgifter kan dokumenteras i historiken.</p></>
      :<ArchiveContent key={`${owner}:${year}:${start}`} owner={owner} year={year} start={start} onClose={()=>setStart(null)}/>}
  </div>
}
