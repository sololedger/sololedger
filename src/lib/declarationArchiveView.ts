import type { parseDeclarationCommand } from './declarationArchive'

export type DeclarationCommand = ReturnType<typeof parseDeclarationCommand>
export type DeclarationManual = DeclarationCommand['manual']
export type DeclarationSubmission = DeclarationCommand['submission']
export interface DeclarationSummary {
  id: string; income_year: number; revision_no: number; previous_revision_id: string | null;
  source_snapshot_id: string | null; submission_source_snapshot_id: string | null;
  recorded_at: string; change_kind: string; reason: string; submission_status: string;
}
export interface DeclarationSourceView {
  id: string | null; income_year: number; captured_at: string; calculation_version: string;
  app_revision: string; source_fingerprint: string; locked: boolean;
  company: { name: string | null; org_nr: string | null };
  report: Record<string, unknown>; risk: { assessment: string; reasons: string[]; verification: string };
}
export interface DeclarationVersion extends DeclarationSummary {
  manual: DeclarationManual; submission: DeclarationSubmission;
  source: DeclarationSourceView | null; submitted_source: DeclarationSourceView | null;
}
export const declarationChangeLabels: Record<string, string> = {
  initial: 'Första version', documentation_correction: 'Uppdaterad dokumentation',
  new_calculation: 'Nytt NE-underlag', declaration_amendment: 'Dokumenterad ändringsinlämning',
}
export const declarationStateLabels: Record<string, string> = {
  not_assessed: 'Inte bedömt', not_applicable: 'Inte aktuellt', entered: 'Eget belopp',
}
export const declarationFieldLabels: Record<string, string> = {
  R1:'Försäljning med moms', R2:'Momsfria intäkter', R3:'Bil- och bostadsförmån', R4:'Ränteintäkter',
  R5:'Varor, material och tjänster', R6:'Övriga externa kostnader', R7:'Anställd personal',
  R8:'Räntekostnader m.m.', R9:'Avskrivningar byggnader/mark', R10:'Avskrivningar inventarier m.m.', R11:'Bokfört resultat',
  R12:'Bokfört resultat före justeringar', R13:'Kostnader som inte ska dras av',
  R14:'Intäkter som inte ska tas upp', R15:'Intäkter utanför bokföringen', R16:'Kostnader utanför bokföringen',
  R17:'Resultat efter bokföringsanknutna justeringar',
  B1:'Immateriella anläggningstillgångar', B2:'Byggnader och markanläggningar', B3:'Mark',
  B4:'Maskiner och inventarier', B5:'Övriga anläggningstillgångar', B6:'Varulager', B7:'Kundfordringar',
  B8:'Övriga fordringar', B9:'Kassa och bank', B10:'Eget kapital', B13:'Låneskulder',
  B14:'Skatteskulder', B15:'Leverantörsskulder', B16:'Övriga skulder',
}
export function declarationAmount(value: unknown) {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return 'Saknas'
  const amount=Number(value)
  return (amount===0?0:amount).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
}
export function declarationTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(value))
}
export function declarationReportRows(report: Record<string, unknown>) {
  return Object.entries(declarationFieldLabels).filter(([key]) => Object.hasOwn(report, key === 'B10' ? 'B10_total' : key))
    .map(([field,label]) => {
      const value=report[field === 'B10' ? 'B10_total' : field]
      // Same cost presentation as existing NEBilaga; frozen values are untouched.
      return {field,label,amount:/^R([5-9]|10)$/.test(field) && typeof value==='number' ? -value : value}
    })
}
export function declarationWarnings(report: Record<string, unknown>): string[] {
  const messages: string[]=[]
  for (const key of ['warnings','taxReviews']) if (Array.isArray(report[key])) for (const row of report[key]) {
    if (row && typeof row==='object') {
      const entry=row as Record<string,unknown>
      for(const property of ['message','reason','nextStep']) if(typeof entry[property]==='string' && !messages.includes(entry[property])) messages.push(entry[property])
    }
  }
  if(report.equityReviewRequired) messages.push('Eget kapital behöver granskas. Importerade bokslutsverifikationer kan påverka NE-underlaget.')
  const classification=report.neSalesClassification as Record<string,unknown> | undefined
  if(classification?.reviewRequired) messages.push('Fördelningen mellan R1 och R2 behöver granskas.')
  if(Array.isArray(report.accountCoverage)) for(const row of report.accountCoverage) {
    if(row && typeof row==='object' && row.status==='review') messages.push(`Konto ${String(row.accountNumber)}: ${String(row.reason || 'Behöver granskas')}`)
  }
  return messages
}
export function declarationRiskText(source: DeclarationSourceView) {
  if (source.risk.assessment === 'limited') return 'Underlaget har importspår eller andra osäkerheter. SIE-import kan ge missvisande NE-belopp även utan andra varningar. Jämför med externa resultat- och balansrapporter samt bokslutsverifikationer. Sparandet bekräftar inte att beloppen är korrekta.'
  return 'Beloppen är beräknade från bokföringen. Skatteuppgifter och deklarationen är inte verifierade av SoloLedger eller Skatteverket.'
}
export function normalizeDeclarationAmount(input: string) {
  const value=input.trim().replace(/ /g,'').replace(',','.')
  if (!/^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) throw new Error('Ange ett belopp med högst två decimaler.')
  const [whole,fraction='']=value.split('.'), normalized=whole+'.'+fraction.padEnd(2,'0')
  return normalized==='-0.00'?'0.00':normalized
}
export function emptyDeclarationCommand(year: number): DeclarationCommand {
  return {schema_version:1,income_year:year,expected_previous_id:null,change_kind:'initial',reason:'',
    source:{mode:'none',snapshot_id:null,expected_fingerprint:null},manual:{fields:[],note:''},
    submission:{status:'not_recorded',date:null,kind:null,coverage:'partial',fields:[],note:'',receipt_reference:'',source_snapshot_id:null}}
}
export class DeclarationArchiveError extends Error {
  constructor(message: string, public status = 503, public code = 'unavailable', public uncertain = false) { super(message) }
}
