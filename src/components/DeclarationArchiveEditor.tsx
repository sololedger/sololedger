'use client'
import { useState } from 'react'
import { parseDeclarationCommand } from '@/lib/declarationArchive'
import { declarationFieldLabels, normalizeDeclarationAmount, type DeclarationCommand, type DeclarationSummary } from '@/lib/declarationArchiveView'

const input='mt-1 w-full min-w-0 rounded-lg border border-gray-400 bg-white p-2 text-base text-gray-900'
const button='min-h-11 rounded-lg border border-gray-400 px-3 py-2 font-semibold disabled:opacity-50'
function FieldSelect({value,onChange,label}: {value: string; onChange: (value: string)=>void; label: string}) {
  return <label className="block">{label}<select aria-label={label} className={input} value={value} onChange={e=>onChange(e.target.value)} required><option value="">Välj NE-ruta</option>
    {[...Array.from({length:48},(_,i)=>'R'+(i+1)),...Array.from({length:16},(_,i)=>'B'+(i+1))].map(field=><option key={field} value={field}>{field}{declarationFieldLabels[field]?' · '+declarationFieldLabels[field]:''}</option>)}
  </select></label>
}
export default function DeclarationArchiveEditor({initial,versions,onReview,onCancel}: {initial: DeclarationCommand; versions: DeclarationSummary[]; onReview: (command: DeclarationCommand)=>void; onCancel: ()=>void}) {
  const [command,setCommand]=useState(()=>structuredClone(initial)),[error,setError]=useState('')
  const setManual=(patch: Partial<DeclarationCommand['manual']>)=>setCommand(old=>({...old,manual:{...old.manual,...patch}}))
  const setSubmission=(patch: Partial<DeclarationCommand['submission']>)=>setCommand(old=>({...old,submission:{...old.submission,...patch}}))
  const sourceOptions=[...new Map(versions.filter(v=>v.income_year===command.income_year && v.source_snapshot_id).slice().reverse().map(v=>[v.source_snapshot_id,{id:v.source_snapshot_id!,version:v.revision_no}])).values()]
  function review(e: React.FormEvent) {
    e.preventDefault();setError('')
    try {
      const next=structuredClone(command)
      next.manual.fields=next.manual.fields.map(f=>({...f,amount:f.state==='entered'?normalizeDeclarationAmount(f.amount??''):null}))
      if(next.submission.status==='not_recorded') next.submission={...next.submission,date:null,kind:null,fields:[],receipt_reference:'',source_snapshot_id:null}
      else next.submission.fields=next.submission.fields.map(f=>({...f,amount:normalizeDeclarationAmount(f.amount)}))
      onReview(parseDeclarationCommand(next))
    } catch {setError('Kontrollera NE-rutor, belopp, inlämningsdatum och ändringsorsak. Samma NE-ruta får bara förekomma en gång i varje avsnitt.')}
  }
  return <form onSubmit={review} aria-label="Egna deklarationsuppgifter" className="space-y-5 rounded-xl border bg-gray-50 p-3 sm:p-5">
    <h3 className="text-lg font-bold">Dokumentera egna uppgifter · {command.income_year}</h3>
    <p>Egna uppgifter ändrar inte bokföringen eller SoloLedgers NE-beräkning. Tidigare versioner finns kvar. Inget skickas till Skatteverket.</p>
    {command.expected_previous_id&&<label className="block">Vad dokumenterar du?<select className={input} value={command.change_kind} onChange={e=>setCommand(old=>({...old,change_kind:e.target.value as DeclarationCommand['change_kind'],submission:e.target.value==='declaration_amendment'?{...old.submission,status:'submitted_by_user',kind:'amendment'}:old.submission}))}>
      <option value="documentation_correction">Uppdatering eller rättelse av dokumentation</option><option value="declaration_amendment">Jag har lämnat in en ny ändringsdeklaration</option></select></label>}
    <fieldset className="space-y-4"><legend className="font-bold">Egna skattemässiga bedömningar</legend><p className="text-sm">Välj själv relevanta NE-rutor, till exempel underskott eller egenavgiftsavstämning. SoloLedger beräknar inte dessa uppgifter åt dig.</p>
      {command.manual.fields.map((field,index)=><div key={index} className="space-y-3 rounded-lg border bg-white p-3">
        <FieldSelect label={`NE-ruta för egen uppgift ${index+1}`} value={field.field} onChange={value=>setManual({fields:command.manual.fields.map((f,i)=>i===index?{...f,field:value}:f)})}/>
        <label className="block">Bedömning<select aria-label="Bedömning" className={input} value={field.state} onChange={e=>setManual({fields:command.manual.fields.map((f,i)=>i===index?{...f,state:e.target.value as typeof f.state,amount:e.target.value==='entered'?(f.amount??''):null}:f)})}><option value="not_assessed">Inte bedömt</option><option value="not_applicable">Inte aktuellt</option><option value="entered">Eget belopp</option></select></label>
        {field.state==='entered'&&<label className="block">Eget belopp för {field.field || 'vald ruta'}<input className={input} inputMode="decimal" value={field.amount??''} onChange={e=>setManual({fields:command.manual.fields.map((f,i)=>i===index?{...f,amount:e.target.value}:f)})} required/></label>}
        <label className="block">Anteckning till uppgiften<textarea className={input} maxLength={4000} value={field.note} onChange={e=>setManual({fields:command.manual.fields.map((f,i)=>i===index?{...f,note:e.target.value}:f)})}/></label>
        <label className="block">Dokumentreferens, om du har en<input className={input} maxLength={1000} value={field.document_reference} onChange={e=>setManual({fields:command.manual.fields.map((f,i)=>i===index?{...f,document_reference:e.target.value}:f)})}/></label>
        <button className={button} type="button" onClick={()=>setManual({fields:command.manual.fields.filter((_,i)=>i!==index)})}>Ta bort egen uppgift {index+1}</button>
      </div>)}
      <button type="button" className={button} onClick={()=>setManual({fields:[...command.manual.fields,{field:'',state:'not_assessed',amount:null,note:'',document_reference:''}]})} disabled={command.manual.fields.length>=64}>Lägg till egen uppgift</button>
      <label className="block">Övriga egna bedömningar<textarea className={input} maxLength={4000} value={command.manual.note} onChange={e=>setManual({note:e.target.value})}/></label>
    </fieldset>
    <fieldset className="space-y-4"><legend className="font-bold">Faktiskt deklarerade uppgifter</legend>
      <label className="flex items-start gap-3 py-2"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={command.submission.status==='submitted_by_user'} onChange={e=>setSubmission({status:e.target.checked?'submitted_by_user':'not_recorded',kind:command.change_kind==='declaration_amendment'?'amendment':(command.submission.kind??'original')})}/>Jag har lämnat in deklarationen (enligt egen uppgift)</label>
      {command.submission.status==='submitted_by_user'&&<>
        <label className="block">Inlämningsdatum<input className={input} type="date" value={command.submission.date??''} onChange={e=>setSubmission({date:e.target.value})} required/></label>
        <label className="block">Typ av inlämning<select className={input} value={command.submission.kind??'original'} onChange={e=>setSubmission({kind:e.target.value as 'original'|'amendment'})} disabled={command.change_kind==='declaration_amendment'}><option value="original">Ursprunglig inlämning</option><option value="amendment">Ändringsinlämning</option></select></label>
        <label className="block">Vilket sparat underlag använde du?<select className={input} value={command.submission.source_snapshot_id??''} onChange={e=>setSubmission({source_snapshot_id:e.target.value||null})}><option value="">Ej angivet / externt underlag</option>{sourceOptions.map(source=><option key={source.id} value={source.id}>NE-underlag från version {source.version}</option>)}</select></label>
        <p className="text-sm">Ange de belopp du faktiskt förde över. De kopieras inte från SoloLedgers beräkning.</p>
        {command.submission.fields.map((field,index)=><div key={index} className="space-y-3 rounded-lg border bg-white p-3">
          <FieldSelect label={`NE-ruta för deklarerat belopp ${index+1}`} value={field.field} onChange={value=>setSubmission({fields:command.submission.fields.map((f,i)=>i===index?{...f,field:value}:f)})}/>
          <label className="block">Deklarerat belopp för {field.field || 'vald ruta'}<input className={input} inputMode="decimal" value={field.amount} onChange={e=>setSubmission({fields:command.submission.fields.map((f,i)=>i===index?{...f,amount:e.target.value}:f)})} required/></label>
          <button type="button" className={button} onClick={()=>setSubmission({fields:command.submission.fields.filter((_,i)=>i!==index)})}>Ta bort deklarerat belopp {index+1}</button>
        </div>)}
        <button type="button" className={button} onClick={()=>setSubmission({fields:[...command.submission.fields,{field:'',amount:''}]})} disabled={command.submission.fields.length>=64}>Lägg till deklarerat belopp</button>
        <label className="block">Dokumentationens omfattning<select className={input} value={command.submission.coverage} onChange={e=>setSubmission({coverage:e.target.value as typeof command.submission.coverage})}><option value="partial">Vissa belopp är dokumenterade</option><option value="complete_as_documented">Alla belopp jag vill bevara är dokumenterade</option></select></label>
        <label className="block">Kvittensreferens, om du har en<input className={input} maxLength={1000} value={command.submission.receipt_reference} onChange={e=>setSubmission({receipt_reference:e.target.value})}/></label>
      </>}
      <label className="block">Anteckning om inlämningen<textarea className={input} maxLength={4000} value={command.submission.note} onChange={e=>setSubmission({note:e.target.value})}/></label>
      <p className="text-sm">SoloLedger har inte verifierat inlämningen hos Skatteverket.</p>
    </fieldset>
    {command.expected_previous_id&&<label className="block">Ändringsorsak<textarea className={input} value={command.reason} onChange={e=>setCommand(old=>({...old,reason:e.target.value}))} maxLength={4000} required placeholder="Beskriv vad du uppdaterar och varför"/></label>}
    {error&&<p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className={button+' bg-emerald-700 text-white'} type="submit">Granska nya versionen</button><button className={button} type="button" onClick={onCancel}>Avbryt</button></div>
  </form>
}
