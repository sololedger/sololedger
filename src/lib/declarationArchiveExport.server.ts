import 'server-only'
import type { DeclarationSourceView, DeclarationVersion } from './declarationArchiveView'
import { declarationAmount, declarationChangeLabels, declarationReportRows, declarationRiskText, declarationStateLabels, declarationTime, declarationWarnings } from './declarationArchiveView'

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!))
function table(headers: string[], rows: unknown[][]) {
  return '<table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escape(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'
}
function sourceHtml(source: DeclarationSourceView | null) {
  if (!source) return '<p>Inget fryst SoloLedger-underlag är kopplat till denna version.</p>'
  return `<p>${escape(source.company.name)} ${escape(source.company.org_nr)}</p><p>Sparat ${escape(declarationTime(source.captured_at))} (svensk tid).</p><p class="notice">${escape(declarationRiskText(source))}</p>`
    +table(['NE-ruta','Bokföringsunderlag','Belopp'],declarationReportRows(source.report).map(r=>[r.field,r.label,declarationAmount(r.amount)]))
    +'<p>R15 och R16 är inte personliga skattebedömningar. Egna uppgifter nedan är separata och räknas inte automatiskt in här.</p>'
    +'<ul>'+declarationWarnings(source.report).map(w=>'<li>'+escape(w)+'</li>').join('')+'</ul>'
    +`<p>Underlagsreferens: ${escape(source.id)} · Beräkning ${escape(source.calculation_version)} · Programrevision ${escape(source.app_revision)}</p>`
}
export function exportDeclarationHtml(version: DeclarationVersion) {
  const own=version.manual, submitted=version.submission
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Deklarationshistorik ${version.income_year} – version ${version.revision_no}</title><style>
body{font:15px/1.5 system-ui,sans-serif;color:#172b25;max-width:900px;margin:32px auto;padding:0 20px;overflow-wrap:anywhere}h1{font-size:25px}h2{font-size:20px;margin-top:30px}table{border-collapse:collapse;width:100%;margin:15px 0}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccc;padding:7px}th{background:#edf6f0}.notice{border:1px solid #bba565;padding:12px;background:#fff9e8}p{white-space:pre-wrap}tr{break-inside:avoid}@media print{body{margin:0;max-width:none}details{display:none}thead{display:table-header-group}h2{break-after:avoid}}@page{margin:16mm}
</style></head><body><h1>Deklarationshistorik ${version.income_year} – version ${version.revision_no}</h1>
<p>${escape(declarationChangeLabels[version.change_kind] ?? version.change_kind)} · Registrerad ${escape(declarationTime(version.recorded_at))} (svensk tid).</p><p>Ändringsorsak: ${escape(version.reason || 'Första versionen')}</p><p class="notice">Detta är sparad dokumentation. Inget skickas till Skatteverket. Inlämningsstatus är användarens egen uppgift och har inte verifierats av Skatteverket.</p>
<h2>1. SoloLedgers NE-underlag</h2>${sourceHtml(version.source)}
<h2>2. Egna bedömningar</h2>${own.fields.length?table(['NE-ruta','Bedömning','Eget belopp','Anteckning','Dokumentreferens'],own.fields.map(f=>[f.field,declarationStateLabels[f.state]??f.state,f.amount===null?'Ej angivet':declarationAmount(f.amount),f.note,f.document_reference])):'<p>Inga egna fält dokumenterade.</p>'}<p>${escape(own.note)}</p>
<h2>3. Faktiskt deklarerade uppgifter</h2><p>${submitted.status==='submitted_by_user'?'Inlämnad enligt egen uppgift den '+escape(submitted.date):'Ingen inlämning dokumenterad.'}</p>
${submitted.status==='submitted_by_user'?`<p>${submitted.kind==='amendment'?'Ändringsinlämning':'Ursprunglig inlämning'}. ${submitted.coverage==='partial'?'Vissa belopp dokumenterade.':'Alla belopp som användaren valt att dokumentera.'}</p>`:''}
${submitted.fields.length?table(['NE-ruta','Deklarerat belopp enligt egen uppgift'],submitted.fields.map(f=>[f.field,declarationAmount(f.amount)])):''}<p>${escape(submitted.note)}</p><p>Kvittensreferens: ${escape(submitted.receipt_reference || 'Ej angiven')}</p><p>Använt SoloLedger-underlag: ${escape(version.submission_source_snapshot_id || 'Ej angivet; kan vara externt underlag')}</p>
${version.submitted_source && version.submitted_source.id!==version.source?.id?'<h2>Underlaget som angavs för inlämningen</h2>'+sourceHtml(version.submitted_source):''}
<p>Versionsreferens: ${escape(version.id)}. Föregående version: ${escape(version.previous_revision_id || 'Ingen')}.</p></body></html>`
}
