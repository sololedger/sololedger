/** Versioned user documentation. No tax rules or automatic field transfers. */
export type ArchiveObject = Record<string, unknown>
const fail = (): never => { throw new Error('Ogiltiga arkivuppgifter.') }
const object = (x: unknown): ArchiveObject => x && typeof x === 'object' && !Array.isArray(x) ? x as ArchiveObject : fail()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const archiveUuid = (x: unknown): string => typeof x === 'string' && uuidPattern.test(x) ? x.toLowerCase() : fail()
const nullableUuid = (x: unknown) => x === null ? null : archiveUuid(x)
const text = (x: unknown, max = 4000): string => typeof x === 'string' && x.length <= max ? x : fail()
const keys = (x: ArchiveObject, names: string[]) => { if (Object.keys(x).some(k => !names.includes(k)) || names.some(k => !Object.hasOwn(x, k))) fail() }
const choice = <T extends string>(x: unknown, values: readonly T[]): T => values.includes(x as T) ? x as T : fail()
function amount(x: unknown) {
  // Exact decimal units; no float parsing or automatic rounding of user data.
  if (typeof x !== 'string' || !/^-?(0|[1-9]\d{0,11})\.\d{2}$/.test(x) || x === '-0.00') return fail()
  return x
}
export interface DeclarationManualField { field: string; state: 'not_assessed' | 'not_applicable' | 'entered'; amount: string | null; note: string; document_reference: string }
export interface DeclarationSubmittedField { field: string; amount: string }
function fields(x: unknown, manual: true): DeclarationManualField[]
function fields(x: unknown, manual: false): DeclarationSubmittedField[]
function fields(x: unknown, manual: boolean) {
  if (!Array.isArray(x) || x.length > 100) return fail()
  const seen = new Set<string>()
  return x.map(value => {
    const row = object(value)
    keys(row, manual ? ['field','state','amount','note','document_reference'] : ['field','amount'])
    const field = text(row.field, 8)
    if (!/^(R([1-9]|[1-3]\d|4[0-8])|B([1-9]|1[0-6]))$/.test(field) || seen.has(field)) return fail()
    seen.add(field)
    if (!manual) return { field, amount: amount(row.amount) }
    const state = choice(row.state, ['not_assessed','not_applicable','entered'] as const)
    if (state !== 'entered' && row.amount !== null) return fail()
    return { field, state, amount: state === 'entered' ? amount(row.amount) : null,
      note: text(row.note), document_reference: text(row.document_reference, 1000) }
  }).sort((a, b) => a.field.localeCompare(b.field))
}
export function parseDeclarationCommand(value: unknown) {
  const c = object(value)
  keys(c, ['schema_version','income_year','expected_previous_id','change_kind','reason','source','manual','submission'])
  if (c.schema_version !== 1 || !Number.isInteger(c.income_year) || Number(c.income_year) < 1900 || Number(c.income_year) > 9998) return fail()
  const source = object(c.source)
  keys(source, ['mode','snapshot_id','expected_fingerprint'])
  const mode = choice(source.mode, ['capture','reuse','none'] as const)
  const snapshotId = nullableUuid(source.snapshot_id)
  if ((mode === 'reuse') !== (snapshotId !== null)) return fail()
  const fingerprint = source.expected_fingerprint
  if (mode === 'capture' ? typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) : fingerprint !== null) return fail()
  const manual = object(c.manual); keys(manual, ['fields','note'])
  const submission = object(c.submission)
  keys(submission, ['status','date','kind','coverage','fields','note','receipt_reference','source_snapshot_id'])
  const status = choice(submission.status, ['not_recorded','submitted_by_user'] as const)
  const date = submission.date
  if (status === 'submitted_by_user') {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return fail()
  } else if (date !== null) return fail()
  const submittedFields = fields(submission.fields, false)
  const kind = submission.kind === null ? null : choice(submission.kind, ['original','amendment'] as const)
  const coverage = choice(submission.coverage, ['partial','complete_as_documented'] as const)
  const submittedSource = submission.source_snapshot_id === 'current' ? 'current' : nullableUuid(submission.source_snapshot_id)
  if (submittedSource === 'current' && mode === 'none') return fail()
  if (status === 'not_recorded' && (submittedFields.length || kind !== null || submittedSource !== null || submission.receipt_reference !== '')) return fail()
  if (status === 'submitted_by_user' && kind === null) return fail()
  const previous = nullableUuid(c.expected_previous_id)
  const changeKind = choice(c.change_kind, ['initial','documentation_correction','new_calculation','declaration_amendment'] as const)
  const reason = text(c.reason)
  if ((previous === null) !== (changeKind === 'initial') || (previous !== null && !reason.trim())) return fail()
  if (changeKind === 'declaration_amendment' && (status !== 'submitted_by_user' || kind !== 'amendment')) return fail()
  return { schema_version: 1, income_year: Number(c.income_year), expected_previous_id: previous,
    change_kind: changeKind, reason, source: { mode, snapshot_id: snapshotId, expected_fingerprint: fingerprint },
    manual: { fields: fields(manual.fields, true), note: text(manual.note) },
    submission: { status, date, kind, coverage, fields: submittedFields, note: text(submission.note),
      receipt_reference: text(submission.receipt_reference, 1000), source_snapshot_id: submittedSource } }
}

export function declarationRisk(source: { provenance: { reasons: string[] } }) {
  const reasons = [...source.provenance.reasons].sort()
  return { version: 1, assessment: reasons.length ? 'limited' : 'not_assessed', verification: 'not_verified',
    reasons, affected_sections: reasons.length ? ['NE','result','balance'] : [],
    policy: 'kan100-v1-conservative-import' }
}
