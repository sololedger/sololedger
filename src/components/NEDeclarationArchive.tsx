'use client'
import { useEffect, useRef, useState } from 'react'
import DeclarationArchiveEditor from './DeclarationArchiveEditor'
import DeclarationVersionView from './DeclarationVersionView'
import { declarationChangeLabels, emptyDeclarationCommand, type DeclarationCommand, type DeclarationSourceView, type DeclarationSummary, type DeclarationVersion } from '@/lib/declarationArchiveView'

// Opening the ordinary NE page must not initialize another client or read path.
const transport=()=>import('@/lib/declarationArchiveClient')
const button='ne-secondary'
type Activity={pending:boolean;blocked:boolean}
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
  if(!source.locked) throw new Error('Året måste vara låst innan ett bokföringsunderlag sparas. Låsknappen finns under resultat- och balansrutorna i NE-bilagan. Du kan ändå dokumentera egna och faktiskt deklarerade uppgifter här.')
  const command=documentCommand(year,latest)
  command.change_kind=latest?'new_calculation':'initial'
  command.source={mode:'capture',snapshot_id:null,expected_fingerprint:source.source_fingerprint}
  return {command,version:reviewVersion(command,source,latest,latest?.submitted_source??null)}
}
function ArchiveContent({owner,year,start,onClose,onActivityChange}: {owner: string; year: number; start: 'history'|'capture'|'document'; onClose: ()=>void;onActivityChange:(activity:Activity)=>void}) {
  const [versions,setVersions]=useState<DeclarationSummary[]|null>(null),[selectedYear,setYear]=useState(year)
  const [version,setVersion]=useState<DeclarationVersion|null>(null),[draft,setDraft]=useState<DeclarationCommand|null>(null)
  const [review,setReview]=useState<Review|null>(null),[pending,setPending]=useState<{id: string; command: DeclarationCommand}|null>(null)
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const alive=useRef(true),sequence=useRef(0)
  const printFrames=useRef(new Set<HTMLIFrameElement>())
  const heading=useRef<HTMLHeadingElement>(null),hasDraft=!!draft,hasReview=!!review
  useEffect(()=>{onActivityChange({pending:!!pending,blocked:busy||!!pending||hasDraft||hasReview})},[busy,pending,hasDraft,hasReview,onActivityChange])
  useEffect(()=>{if(!busy)heading.current?.focus({preventScroll:true})},[busy,hasDraft,hasReview])
  useEffect(()=>{
    let active=true;alive.current=true
    ;(async()=>{
      const data=await (await transport()).loadDeclarationIndex(owner)
      const initial=start==='capture'?await capture(owner,year,data):null
      const selected=initial?null:await latestVersion(owner,year,data)
      if(active){setVersions(data);setReview(initial);setVersion(selected);if(start==='document')setDraft(documentCommand(year,selected))}
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
        catch{if(current())setError('Versionen är sparad, men historiken kunde inte läsas igen. Använd Uppdatera historiken.')}
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
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 ref={heading} tabIndex={-1} className="text-lg font-bold">{review?'Granska nya versionen':draft?'Dokumentera egna uppgifter':'Sparade versioner'} · {selectedYear}</h3><button type="button" className={button} onClick={onClose} disabled={!!pending}>Stäng</button></div>
    {notice&&<p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">{notice}</p>}
    {error&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">{error}</p>}
    {busy&&<p role="status">{pending?'Sparar samma begäran…':'Läser deklarationshistorik…'}</p>}
    {pending&&!busy&&<p className="font-semibold">Sparbegäran bevaras medan utfallet är okänt. Försök igen nedan; uppgifterna kan inte ändras under omförsöket.</p>}
    {!review&&!draft&&<button className={button} type="button" disabled={busy||!!pending} onClick={refresh}>Uppdatera historiken</button>}
    {versions!==null&&!review&&!draft&&<>
      <label className="block font-semibold">Inkomstår<select aria-label="Inkomstår" className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2 text-base" value={selectedYear} disabled={busy||!!pending} onChange={e=>selectYear(Number(e.target.value))}>{yearOptions.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      {versions.some(v=>v.income_year===selectedYear)?<label className="block font-semibold">Sparad version<select aria-label="Sparad version" className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2 text-base" value={version?.id??''} disabled={busy||!!pending} onChange={e=>{const id=e.currentTarget.value;setVersion(null);void run(async current=>{const loaded=await (await transport()).loadDeclarationVersion(owner,id);if(current())setVersion(loaded)})}}><option value="" disabled>Välj version</option>{versions.filter(v=>v.income_year===selectedYear).map(v=><option key={v.id} value={v.id}>Version {v.revision_no} · {declarationChangeLabels[v.change_kind]??v.change_kind} · {v.submission_status==='submitted_by_user'?'Inlämnad enligt egen uppgift':'Ingen inlämning dokumenterad'}</option>)}</select></label>:<p>Inga sparade versioner för {selectedYear}.</p>}

      <p className="text-sm">Här läser du sparad dokumentation. Den räknas inte om när dagens bokföring ändras. Nya egna uppgifter utgår alltid från senaste versionen för sidans år.</p>
      {version&&<p className="text-sm">{version.submission_status==='submitted_by_user'?'Inlämning dokumenterad av dig · '+version.submission.date:'Ingen inlämning dokumenterad'} · Inte verifierat hos Skatteverket.</p>}
      {version&&versions.find(v=>v.income_year===selectedYear)?.id!==version.id&&<p className="ne-notice">Du läser en äldre version. Nya uppgifter utgår alltid från den senaste versionen.</p>}
      {version&&<><p className="text-sm">Exporten gäller version {version.revision_no} för {selectedYear}. PDF väljs i webbläsarens utskriftsruta. Detta är inte ett inlämningskvitto.</p><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={()=>exportVersion(true)}>Skriv ut / spara som PDF</button><button type="button" className={button} disabled={busy} onClick={()=>exportVersion(false)}>Ladda ner som HTML</button></div><DeclarationVersionView version={version}/></>}
    </>}
    {draft&&!review&&<fieldset disabled={busy}><DeclarationArchiveEditor initial={draft} versions={versions??[]} onReview={previewEdit} onCancel={()=>setDraft(null)}/></fieldset>}
    {review&&<div className="space-y-4"><DeclarationVersionView version={{...review.version,reason:review.command.reason}} preview/>
      {review.command.expected_previous_id&&review.command.source.mode==='capture'&&<label className="block">Varför sparar du ett nytt underlag?<textarea className="mt-1 w-full rounded-lg border p-2" maxLength={4000} disabled={busy||!!pending} value={review.command.reason} onChange={e=>setReview(old=>old?{...old,command:{...old.command,reason:e.target.value}}:old)}/></label>}
      <p className="font-semibold">Den här versionen bevaras. Senare ändringar skapar en ny version.</p>
      <div className="flex flex-wrap gap-3"><button className="ne-primary" type="button" disabled={busy || (!!review.command.expected_previous_id&&!review.command.reason.trim())} onClick={save}>{pending?'Försök spara samma uppgifter igen':'Spara version'}</button>
        <button className={button} type="button" disabled={busy||!!pending} onClick={()=>{setReview(null);setError('')}}>{draft?'Tillbaka till egna uppgifter':'Avbryt förhandsgranskning'}</button></div>
    </div>}
  </section>
}
export default function NEDeclarationArchive({owner,year,locked,ready=true,error,onOpenYearEnd}: {owner:string;year:number;locked:boolean;ready?:boolean;error?:string|null;onOpenYearEnd?:()=>void}){
 const [start,setStart]=useState<'history'|'capture'|'document'|null>(null),[open,setOpen]=useState(false),[visit,setVisit]=useState(0)
 const [activity,setActivity]=useState<Activity>({pending:false,blocked:false})
 const container=useRef<HTMLDetailsElement>(null),lastAction=useRef<HTMLButtonElement|null>(null)
 useEffect(()=>{if(activity.pending&&container.current)container.current.open=true},[activity.pending])
 const state=error?'Årsstatus kunde inte hämtas':!ready?'Årsstatus läses…':locked?'Bokföringsåret är låst':'Bokföringsåret är öppet'
 function begin(next:'history'|'capture'|'document',button:HTMLButtonElement){lastAction.current=button;setVisit(value=>value+1);setStart(next)}
 function close(){setStart(null);setActivity({pending:false,blocked:false});requestAnimationFrame(()=>lastAction.current?.focus())}
 return <details ref={container} id="ne-documentation" className="sl-ne ne-disclosure my-4" onToggle={e=>{if(activity.pending&&!e.currentTarget.open){e.currentTarget.open=true;return}setOpen(e.currentTarget.open)}}>
 <summary className="ne-disclosure-summary" aria-expanded={open} aria-controls="ne-documentation-body" aria-disabled={activity.pending} onClick={e=>{if(activity.pending)e.preventDefault()}}><span><strong>Spara och dokumentera</strong><span className="ne-summary-meta">{activity.pending?'Sparutfallet hanteras – samma sparbegäran bevaras':year+' · '+state}</span></span><span className="ne-disclosure-action" aria-hidden="true">{open?'Stäng −':'Öppna +'}</span></summary>
 <div id="ne-documentation-body" className="ne-disclosure-body"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Spara och dokumentera · {year}</h3><details><summary className="ne-link">Så fungerar det</summary><div className="space-y-3 py-3"><p>NE-underlag bevarar en kopia av SoloLedgers beräknade bokföringsvärden. Du granskar före sparandet. Ett låst år krävs.</p><p>Egna anteckningar, belopp och uppgifter om inlämning kan dokumenteras även utan låst år eller sparat NE-underlag. De ändrar inte bokföringen eller NE-beräkningen.</p><p>Tidigare versioner bevaras. Nya egna uppgifter utgår alltid från senaste versionen för sidans år. Historikens årsval ändrar bara vad du läser.</p><p>Förbered i Årsavslut. Låsknappen finns under resultat- och balansrutorna. Sparat underlag, årslås och inlämning är olika saker.</p><a className="ne-link" href="?help=deklarationshistorik" target="_blank" rel="noopener noreferrer">Läs mer i Hjälp &amp; FAQ (ny flik)</a></div></details></div>
 <p className="my-4 text-sm text-slate-600">Spara underlag här. Du lämnar och skriver under deklarationen hos Skatteverket.</p>
 <div className="grid gap-5 md:grid-cols-2"><div><button type="button" className="ne-primary" disabled={!ready||!locked||activity.blocked} aria-describedby="ne-capture-reason" onClick={e=>begin('capture',e.currentTarget)}>Spara NE-underlag</button><p id="ne-capture-reason" className="mt-2 text-sm">{error?'Sparande är inte tillgängligt eftersom årets underlag inte kunde läsas.':!ready?'Invänta läsningen av årsstatus.':locked?'Du granskar en kopia innan du sparar. Sparandet kontrolleras på nytt.':'Inte tillgängligt: bokföringsåret är öppet. Förbered årsavslutet och lås året först.'}</p>{ready&&!locked&&<div className="mt-2 flex flex-wrap gap-3">{onOpenYearEnd&&<button className="ne-link" type="button" disabled={activity.blocked} onClick={onOpenYearEnd}>Förbered i Årsavslut</button>}<button className="ne-link" type="button" disabled={activity.blocked} onClick={()=>{const lock=document.getElementById('ne-year-lock');lock?.focus({preventScroll:true});lock?.scrollIntoView({block:'start'})}}>Till årslåset i NE-bilagan</button></div>}</div>
 <div><button type="button" className="ne-secondary" disabled={activity.blocked} onClick={e=>begin('document',e.currentTarget)}>Dokumentera egna uppgifter</button><p className="mt-2 text-sm">Skriv egna anteckningar och belopp, eller dokumentera det du har lämnat in. Fungerar även utan låst år och utan sparat NE-underlag.</p></div></div>
 <div className="my-5 border-t border-slate-200 pt-5"><button type="button" className="ne-secondary" disabled={activity.blocked} onClick={e=>begin('history',e.currentTarget)}>Visa sparade versioner</button><p className="mt-2 text-sm">Läs tidigare underlag och egna uppgifter eller skriv ut en vald version som PDF. Historiken läses separat från dagens rapport.</p></div>
 {activity.blocked&&!activity.pending&&start&&<p className="text-sm">Avsluta eller avbryt den pågående granskningen innan du väljer en annan åtgärd. Hopfällning sparar inget.</p>}
 {start&&<ArchiveContent key={owner+':'+year+':'+start+':'+visit} owner={owner} year={year} start={start} onClose={close} onActivityChange={setActivity}/>}</div></details>
}
