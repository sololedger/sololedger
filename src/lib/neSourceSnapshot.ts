/** KAN-100: validate a complete v1 read result before using the pure NE engine.
 * This is not archive storage or a claim of tax/import reliability.
 */
import { calculateNeReport } from './neCalculation'
import type { NeSalesClassificationSummary } from './neSalesClassification'

type Row = Record<string, unknown>
const fail = (): never => { throw new Error('NE-källunderlaget är ofullständigt eller kan inte verifieras.') }
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  return value as Row
}
function list(value: unknown): Row[] {
  if (!Array.isArray(value)) return fail()
  return value.map(object)
}
function text(value: unknown): string {
  if (typeof value !== 'string') return fail()
  return value
}
function uuid(value: unknown): string {
  const id = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return fail()
  return id
}
function date(value: unknown): string {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) return fail()
  return result
}
function cents(value: unknown, nullable = false): bigint {
  if (nullable && value === null) return BigInt(0)
  if (typeof value !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(value)) return fail()
  const [whole, fraction = ''] = value.replace('-', '').split('.')
  const result = (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))) * (value.startsWith('-') ? BigInt(-1) : BigInt(1))
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) return fail()
  return result
}
function number(value: bigint): number { const n = Number(value); if (!Number.isSafeInteger(n)) return fail(); return n / 100 }
function unique(rows: Row[], key: string, owner: string): Map<string, Row> {
  const result = new Map<string, Row>()
  for (const row of rows) {
    const id = uuid(row[key])
    if (row.user_id !== owner || result.has(id)) return fail()
    result.set(id, row)
  }
  return result
}
function sameMap(actual: Map<string, bigint>, encoded: unknown): Record<string, number> {
  const expected = new Map<string, bigint>()
  for (const row of list(encoded)) {
    const account = text(row.account)
    if (!/^\d{4}$/.test(account) || expected.has(account)) return fail()
    expected.set(account, cents(row.balance))
  }
  if (actual.size !== expected.size) return fail()
  for (const [key, amount] of actual) if (expected.get(key) !== amount) return fail()
  return Object.fromEntries([...actual].map(([key, value]) => [key, number(value)]))
}
const knownSources = new Set(['manual','sie_import','sie_opening_balance','sie_import_undo','vat_closing','vat_v2','vat_settlement','tax_account_movement','customer_invoice','supplier_invoice','fixed_asset','fixed_asset_depreciation','fixed_asset_reclassification'])

export function validateNeSourceSnapshot(value: unknown, owner: string, year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) return fail()
  uuid(owner)
  // Own the returned tree: later changes to transport objects cannot alter the source.
  const raw = object(JSON.parse(JSON.stringify(value)))
  if (raw.version !== 1 || raw.owner !== owner || raw.income_year !== year || raw.period_start !== `${year}-01-01` || raw.period_end !== `${year}-12-31`) return fail()
  if (!Number.isFinite(Date.parse(text(raw.captured_at)))) return fail()
  const company = object(raw.company)
  for (const field of ['name', 'org_nr']) if (company[field] !== null && typeof company[field] !== 'string') return fail()
  if (raw.year_lock !== null) {
    const lock = object(raw.year_lock); uuid(lock.id)
    if (!Number.isFinite(Date.parse(text(lock.closed_at)))) return fail()
  }
  const transactions = list(raw.transactions), journal = list(raw.journal), decisions = list(raw.decisions), imports = list(raw.imports)
  const tx = unique(transactions, 'id', owner), entries = unique(journal, 'id', owner), classified = unique(decisions, 'journal_entry_id', owner)
  const batches = unique(imports, 'id', owner)
  const counts = object(raw.counts)
  if (counts.transactions !== tx.size || counts.journal !== entries.size || counts.decisions !== classified.size || counts.imports !== batches.size || object(raw.integrity).mislinked_decisions !== 0 || tx.size > 50000 || entries.size > 50000) return fail()
  const annual = new Map<string, bigint>(), opening = new Map<string, bigint>(), closing = new Map<string, bigint>()
  const byNumber = new Map<number, Set<string>>()
  const reasons = new Set<string>()
  const add = (map: Map<string, bigint>, key: string, amount: bigint) => map.set(key, (map.get(key) ?? BigInt(0)) + amount)
  const end = `${year}-12-31`, start = `${year}-01-01`
  for (const t of transactions) {
    for (const key of ['source','import_batch_id','source_ver_series','source_ver_number','is_correction','corrects_ver_nr','booked']) if (!Object.hasOwn(t, key)) return fail()
    date(t.date)
    if (!knownSources.has(String(t.source))) reasons.add('unknown_source')
    if (['sie_import','sie_opening_balance','sie_import_undo'].includes(String(t.source)) || t.source_ver_series != null || t.source_ver_number != null) reasons.add('import_marker')
    if (t.import_batch_id != null) {
      uuid(t.import_batch_id); reasons.add('import_batch')
      if (!batches.has(String(t.import_batch_id))) reasons.add('missing_import_batch')
    }
    if (t.vat_rate !== null && (typeof t.vat_rate !== 'string' || !Number.isFinite(Number(t.vat_rate)))) return fail()
    if (t.is_correction !== null && typeof t.is_correction !== 'boolean') return fail()
    if (t.booked !== null && typeof t.booked !== 'boolean') return fail()
    if (t.corrects_ver_nr !== null && !Number.isSafeInteger(t.corrects_ver_nr)) return fail()
  }
  const hasJournal = new Set<string>()
  let r2 = BigInt(0), unresolved = 0, unresolvedAmount = BigInt(0)
  for (const j of journal) {
    const parent = tx.get(uuid(j.transaction_id)); if (!parent) return fail()
    hasJournal.add(String(parent.id))
    const account = text(j.account_number); if (!/^\d{4}$/.test(account)) return fail()
    date(j.date)
    if (!Number.isSafeInteger(j.ver_nr)) return fail()
    const ids = byNumber.get(Number(j.ver_nr)) ?? new Set<string>(); ids.add(String(parent.id)); byNumber.set(Number(j.ver_nr), ids)
    const debit = cents(j.debit, true), credit = cents(j.credit, true), delta = debit - credit
    if (String(parent.date) <= end) {
      add(closing, account, delta)
      add(String(parent.date) < start ? opening : annual, account, delta)
    }
    const decision = classified.get(String(j.id))
    if (decision && (account !== '3010' || decision.transaction_id !== parent.id || !['R1','R2'].includes(String(decision.ne_row)) || !['small_business_exempt','taxable','reviewed_legacy','inherited_correction'].includes(String(decision.basis)))) return fail()
    if (account === '3010' && String(parent.date) >= start && String(parent.date) <= end && (debit !== BigInt(0) || credit !== BigInt(0))) {
      if (decision?.ne_row === 'R2') r2 += credit - debit
      if (!decision && Number(parent.vat_rate ?? 0) === 0) { unresolved++; unresolvedAmount += delta < BigInt(0) ? -delta : delta }
    }
  }
  for (const t of transactions) if (t.booked === true && !hasJournal.has(String(t.id))) return fail()
  for (const d of decisions) { if (!entries.has(String(d.journal_entry_id))) return fail(); object(d.evidence); uuid(d.decided_by); if (!Number.isFinite(Date.parse(text(d.decided_at)))) return fail() }
  // Every ancestor is included in SQL scope, even if its date is after cutoff.
  // Iterative traversal terminates both cycles and very long historical chains.
  const resolved = new Set<string>()
  for (const t of transactions) {
    const seen = new Set<string>(); let current: Row | undefined = t
    while (current?.is_correction === true && !resolved.has(String(current.id))) {
      if (seen.has(String(current.id))) { reasons.add('cyclic_correction'); break }
      seen.add(String(current.id))
      const parents = byNumber.get(Number(current.corrects_ver_nr))
      if (current.corrects_ver_nr == null || !parents?.size) { reasons.add('broken_correction'); break }
      if (parents.size !== 1) { reasons.add('ambiguous_correction'); break }
      current = tx.get([...parents][0])
    }
    for (const id of seen) resolved.add(id)
  }
  if (imports.length) reasons.add('import_batch')
  const balances = object(raw.balances)
  const annualBalances = sameMap(annual, balances.annual), cumulativeBalances = sameMap(closing, balances.closing)
  const openingBalances = sameMap(opening, balances.opening)
  const balanceSheetBalances = Object.fromEntries(Object.entries(cumulativeBalances).filter(([account]) => /^[12]/.test(account)))
  const neSalesClassification: NeSalesClassificationSummary = { available: true, r2Reallocation: number(r2), unresolvedCount: unresolved, unresolvedAmount: number(unresolvedAmount), reviewRequired: unresolved > 0 }
  const calculationSources = { annualBalances, cumulativeBalances, balanceSheetBalances, neSalesClassification }
  return { raw, calculationSources, openingBalances,
    report: calculateNeReport(calculationSources, true),
    provenance: { version: 1 as const, assessment: 'not_assessed' as const, reasons: [...reasons].sort() } }
}
