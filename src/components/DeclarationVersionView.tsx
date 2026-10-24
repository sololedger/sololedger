'use client'
import { useState } from 'react'
import { declarationAmount, declarationChangeLabels, declarationReportRows, declarationRiskText, declarationStateLabels, declarationTime, declarationWarnings,
  type DeclarationSourceView, type DeclarationVersion } from '@/lib/declarationArchiveView'

export function DeclarationSourceContent({source}: {source: DeclarationSourceView | null}) {
  const [showAll,setShowAll]=useState(false)
  if(!source) return <p>Inget fryst SoloLedger-underlag är kopplat. Egna uppgifter kan ändå dokumenteras, till exempel från ett externt underlag.</p>
  const warnings=declarationWarnings(source.report)
  const allRows=declarationReportRows(source.report)
  const rows=showAll?allRows:allRows.filter(row=>['R11','R15','R16','R17','B10'].includes(row.field) || row.amount!==0)
  return <div className="space-y-3">
    <p>{source.company.name}{source.company.org_nr ? ` · ${source.company.org_nr}`:''}</p>
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-3">{declarationRiskText(source)}</p>
    <table className="block w-full text-left text-sm sm:table"><caption className="sr-only">Sparade bokföringsvärden för inkomstår {source.income_year}</caption>
      <thead className="sr-only sm:not-sr-only sm:table-header-group"><tr><th className="w-12 py-2">Ruta</th><th className="py-2">Bokföringsunderlag</th><th className="w-32 py-2 text-right">Belopp</th></tr></thead>
      <tbody className="block sm:table-row-group">{rows.map(row=><tr key={row.field} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-t py-2 sm:table-row sm:py-0"><td className="align-top sm:py-2">{row.field}</td><td className="min-w-0 align-top break-words sm:py-2 sm:pr-2">{row.label}{['R15','R16'].includes(row.field)&&<span className="block text-amber-900">Inte bedömt</span>}</td><td className="col-start-2 align-top break-words font-medium sm:py-2 sm:text-right sm:font-normal">{declarationAmount(row.amount)}</td></tr>)}</tbody>
    </table>
    <button type="button" className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold" onClick={()=>setShowAll(old=>!old)}>{showAll?'Dölj nollrutor':'Visa alla sparade NE-rutor'}</button>
    <p className="text-sm">R15 och R16 är inte personliga skattebedömningar. Egna uppgifter nedan hålls separata och räknas inte automatiskt in i bokföringsvärdena.</p>
    {warnings.length>0&&<div className="rounded-lg border border-amber-300 p-3"><h5 className="font-semibold">Sparade granskningsbehov</h5><ul className="list-disc space-y-2 pl-5">{warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></div>}
    <details className="text-sm"><summary className="cursor-pointer py-2">Underlagsreferens och beräkningsversion</summary><p className="break-all">{source.id || 'Förhandsgranskning'} · {source.calculation_version} · {source.app_revision || 'Programrevision registreras vid sparandet'}</p></details>
  </div>
}
export default function DeclarationVersionView({version,preview=false}: {version: DeclarationVersion; preview?: boolean}) {
  const own=version.manual,submission=version.submission
  return <article aria-label={preview?'Förhandsgranskad deklarationsversion':`Sparad deklarationsversion ${version.revision_no}`} className="space-y-5 break-words">
    <div><h3 className="text-lg font-bold">{preview?'Förhandsgranskning':`Version ${version.revision_no}`} · Inkomstår {version.income_year}</h3>
      <p>{declarationChangeLabels[version.change_kind] || version.change_kind}{!preview&&` · ${declarationTime(version.recorded_at)} (svensk tid)`}</p>
      {version.reason&&<p className="whitespace-pre-wrap">Ändringsorsak: {version.reason}</p>}
      <p className="mt-2 text-sm">Inget skickas till Skatteverket. Inlämningsstatus är din egen uppgift och har inte verifierats av Skatteverket.</p></div>
    <section aria-label="SoloLedgers sparade NE-underlag" className="rounded-xl border p-3 sm:p-4"><h4 className="mb-3 font-bold">1. SoloLedgers NE-underlag</h4><DeclarationSourceContent key={version.source?.id??'preview'} source={version.source}/></section>
    <section aria-label="Egna sparade bedömningar" className="rounded-xl border p-3 sm:p-4"><h4 className="mb-3 font-bold">2. Egna bedömningar</h4>
      {!own.fields.length&&<p>Inga egna fält dokumenterade.</p>}
      {own.fields.map(field=><div key={field.field} className="border-t py-3"><p><strong>{field.field}</strong> · {declarationStateLabels[field.state]}{field.amount!==null&&` · ${declarationAmount(field.amount)}`}</p><p className="whitespace-pre-wrap">{field.note}</p>{field.document_reference&&<p>Dokumentreferens: {field.document_reference}</p>}</div>)}
      <p className="whitespace-pre-wrap">{own.note}</p></section>
    <section aria-label="Faktiskt deklarerade uppgifter" className="rounded-xl border p-3 sm:p-4"><h4 className="mb-3 font-bold">3. Faktiskt deklarerade uppgifter</h4>
      <p className="font-semibold">{submission.status==='submitted_by_user'?`Inlämnad enligt egen uppgift den ${submission.date}`:'Ingen inlämning dokumenterad'}</p>
      {submission.status==='submitted_by_user'&&<><p>{submission.kind==='amendment'?'Ändringsinlämning':'Ursprunglig inlämning'} · {submission.coverage==='partial'?'Vissa belopp dokumenterade':'Alla belopp du valt att dokumentera'}</p>
        {submission.fields.map(field=><p key={field.field} className="border-t py-2"><strong>{field.field}</strong> · {declarationAmount(field.amount)} enligt egen uppgift</p>)}
        {!submission.fields.length&&<p>Inga deklarerade belopp dokumenterade.</p>}
        <p>Kvittensreferens: {submission.receipt_reference || 'Ej angiven'}</p>
        <p className="text-sm break-all">Använt SoloLedger-underlag: {version.submission_source_snapshot_id || 'Ej angivet; kan vara externt underlag'}</p></>}
      <p className="whitespace-pre-wrap">{submission.note}</p></section>
    {version.submitted_source&&version.submitted_source.id!==version.source?.id&&<section className="rounded-xl border p-3 sm:p-4"><h4 className="mb-3 font-bold">Underlaget du angav för inlämningen</h4><p className="mb-3">Inlämningen är kopplad till ett annat, tidigare sparat underlag.</p><DeclarationSourceContent source={version.submitted_source}/></section>}
    {!preview&&<p className="text-xs text-gray-600 break-all">Versionsreferens: {version.id} · Tidigare versioner bevaras.</p>}
  </article>
}
