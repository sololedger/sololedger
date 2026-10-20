import { calculateBusinessResult } from './resultEngine.ts'
import { calculateVatReportFromLoadedRows, type LoadedVatReportRows } from './vatReportService.ts'
import { assertOre, calculateWithdrawal, toOre, validWithdrawalDate, type WithdrawalPart } from './withdrawalModel.ts'

export interface WithdrawalTransaction { id: string; user_id: string; date: string; source: string | null; booked: boolean }
export interface WithdrawalJournal { id: string; user_id: string; transaction_id: string; date: string; account_number: string; debit: number | string; credit: number | string }
export interface WithdrawalEvent { id: string; user_id: string; transaction_id: string; vat_period_id: string; event_date: string; event_kind: 'vat_debit' | 'vat_credit'; amount: number | string }
export interface WithdrawalMovement { id: string; user_id: string; transaction_id: string; vat_period_id: string | null; movement_date: string; movement_kind: string; amount: number | string }
export interface WithdrawalFact { key: string; value: Record<string, unknown>; source?: string; observed_on?: string }
export interface WithdrawalRevision { id: string; user_id: string; as_of_date: string; recorded_at: string; facts: WithdrawalFact[] }
export interface WithdrawalSnapshot {
  protocol: 1; user_id: string; as_of: string; signature: string
  transactions: WithdrawalTransaction[]; journal: WithdrawalJournal[]
  periods: NonNullable<LoadedVatReportRows['vatPeriods']>
  snapshots: LoadedVatReportRows['vatV2Snapshots']
  events: WithdrawalEvent[]; movements: WithdrawalMovement[]
  roles: { user_id: string; role: string; account_number: string }[]
  revision: WithdrawalRevision | null
  financial_signature: string
  anchor_financial_signature: string | null
}
export function stableWithdrawalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableWithdrawalValue).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableWithdrawalValue(v)}`).join(',')}}`
  return JSON.stringify(value)
}
// One active model rate per year. Explicit rate facts replace the legacy rate
// embedded in income facts; final decisions are evaluated separately below.
export function withdrawalAnnualRate(facts: WithdrawalFact[], year: number): number {
  const rate = facts.find(f => f.key === `rate:${year}`)?.value.rate
    ?? facts.find(f => f.key === `income:${year}`)?.value.rate ?? 45
  if (typeof rate !== 'number' || !Number.isInteger(rate) || rate < 25 || rate > 55) throw new Error('Ogiltig årsprocent.')
  return rate
}
export function withdrawalFinancialBasis(s: WithdrawalSnapshot, date: string): string {
  if (date === s.as_of) return s.financial_signature
  const anchor = s.revision?.facts.find(f => f.key === 'tax_account')?.value.date
  if (date === anchor && s.anchor_financial_signature) return s.anchor_financial_signature
  throw new Error('Det saknas en sammanhängande skatteavstämning för datumet.')
}
// Used in synthetic fixtures to build fingerprints with the same dependency
// scope as the server. Runtime signatures are always server-generated.
export function withdrawalFinancialRows(s: WithdrawalSnapshot, date: string): string {
  const financialIds = new Set(s.journal.filter(j => j.account_number === '2012' && j.date <= date).map(j => j.transaction_id))
  return stableWithdrawalValue({
    events: s.events.filter(e => e.event_date <= date).sort((a, b) => a.id.localeCompare(b.id)),
    movements: s.movements.filter(e => e.movement_date <= date).sort((a, b) => a.id.localeCompare(b.id)),
    journal: s.journal.filter(j => financialIds.has(j.transaction_id)).sort((a, b) => a.id.localeCompare(b.id)),
  })
}
export function validateWithdrawalSnapshot(s: WithdrawalSnapshot, owner: string, asOf: string) {
  if (s.protocol !== 1 || s.user_id !== owner || s.as_of !== asOf || !s.signature || !s.financial_signature || !validWithdrawalDate(asOf)) throw new Error('Uttagsunderlaget tillhör fel sammanhang.')
  for (const rows of [s.transactions, s.journal, s.periods, s.snapshots, s.events, s.movements, s.roles]) {
    if (!Array.isArray(rows) || rows.some(r => r.user_id !== owner)) throw new Error('Uttagsunderlaget är ofullständigt eller tillhör en annan användare.')
  }
  if (s.revision && s.revision.user_id !== owner) throw new Error('Avstämningen tillhör en annan användare.')
  for (const rows of [s.periods, s.events, s.movements]) {
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Dubblerade skattehändelser eller perioder.')
  }
  const ids = new Set(s.transactions.map(t => t.id))
  if (ids.size !== s.transactions.length || new Set(s.journal.map(j => j.id)).size !== s.journal.length) throw new Error('Dubblerat uttagsunderlag.')
  if (s.journal.some(j => !ids.has(j.transaction_id) || !validWithdrawalDate(j.date) || j.date > asOf)) throw new Error('Journalunderlaget är ofullständigt.')
  if (s.events.some(e => !ids.has(e.transaction_id) || !s.periods.some(p => p.id === e.vat_period_id)) || s.movements.some(m => !ids.has(m.transaction_id))) throw new Error('Skattehändelsernas underlag är ofullständigt.')
  for (const j of s.journal) { toOre(j.debit); toOre(j.credit) }
}
export function buildWithdrawalAssessment(s: WithdrawalSnapshot) {
  validateWithdrawalSnapshot(s, s.user_id, s.as_of)
  const facts = new Map<string, Record<string, unknown>>()
  for (const f of s.revision?.facts ?? []) {
    if (!/^(coverage|tax_account|bank|other|buffer|(income|rate):\d{4})$/.test(f.key) || !f.value || typeof f.value !== 'object') throw new Error('Okänd avstämningsuppgift.')
    if (facts.has(f.key)) throw new Error('Dubbla avstämningsuppgifter.')
    facts.set(f.key, f.value)
  }
  const issues: string[] = []
  const parts: WithdrawalPart[] = []
  const allBalances: Record<string, number> = {}
  const transactionTotals = new Map<string, number>()
  const transactionRows = new Map<string, WithdrawalJournal[]>()
  const years = new Map<number, Record<string, number>>()
  const txById = new Map(s.transactions.map(t => [t.id, t]))
  const supported = new Set(['manual', 'vat_v2', 'vat_closing', 'vat_settlement', 'tax_account_movement'])
  if (s.transactions.some(t => t.source !== null && !supported.has(t.source))) issues.push('Underlaget innehåller bokföring utanför den verifierade manuella uttagsberäkningen. Kontrollera historiken.')
  for (const j of s.journal) {
    const rows = transactionRows.get(j.transaction_id) ?? []
    rows.push(j)
    transactionRows.set(j.transaction_id, rows)
    const t = txById.get(j.transaction_id)!
    if (t.date !== j.date || !t.booked) issues.push('Journalens datum eller bokningsstatus behöver kontrolleras.')
    const movement = (toOre(j.debit) - toOre(j.credit)) / 100
    transactionTotals.set(j.transaction_id, (transactionTotals.get(j.transaction_id) ?? 0) + toOre(j.debit) - toOre(j.credit))
    allBalances[j.account_number] = (allBalances[j.account_number] ?? 0) + movement
    const year = Number(j.date.slice(0, 4))
    const b = years.get(year) ?? {}
    b[j.account_number] = (b[j.account_number] ?? 0) + movement
    years.set(year, b)
  }
  if ([...transactionTotals.values()].some(total => total !== 0)) issues.push('Journalunderlaget är ofullständigt eller balanserar inte.')
  if (s.transactions.some(t => t.booked && !transactionTotals.has(t.id))) issues.push('En bokförd verifikation saknar journalunderlag.')
  for (const key of facts.keys()) {
    if (key.startsWith('income:')) {
      const year = Number(key.slice(7))
      if (!Number.isInteger(year) || year < 1900 || year > Number(s.as_of.slice(0, 4))) throw new Error('Ogiltigt inkomstår.')
      if (!years.has(year)) years.set(year, {})
    }
  }
  const coverage = facts.get('coverage')
  const firstDate = [...s.journal.map(j => j.date), s.as_of].sort()[0]
  if (!coverage || coverage.noEarlierObligations !== true || typeof coverage.from !== 'string' || !validWithdrawalDate(coverage.from) || coverage.from > firstDate) {
    issues.push('Kontrollera om äldre åtaganden saknas innan den registrerade bokföringen börjar.')
  }
  const privateAccount = s.roles.find(r => r.role === 'owner_private_payment')?.account_number
  const businessAccount = s.roles.find(r => r.role === 'business_payment_account')?.account_number ?? '1930'
  if (businessAccount !== '1930' || Object.entries(allBalances).some(([a, n]) => a.startsWith('19') && a !== '1930' && a !== privateAccount && Math.abs(n) >= 0.005)) issues.push('Flera eller andra betalningskonton behöver avstämmas. Denna version använder företagskonto 1930.')
  if (privateAccount === '1930') issues.push('1930 är registrerat som privat konto och kan inte användas som företagsbank.')

  // Disjoint intervals: persisted boundaries are evidence for those periods
  // only. No profile period configuration is included in protocol 1. An
  // uncovered VAT fragment must therefore block, never assume annual netting.
  // Never annual-report VAT + 2650, and never net a refund across separate periods.
  const periods = [...s.periods].filter(p => p.period_start <= s.as_of).sort((a, b) => a.period_start.localeCompare(b.period_start))
  const intervals: { key: string; from: string; through: string }[] = []
  let cursor = [firstDate.slice(0, 4) + '-01-01', ...periods.map(p => p.period_start)].sort()[0]
  const previousDay = (d: string) => new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10)
  const nextDay = (d: string) => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)
  function addGap(end: string) {
    while (cursor <= end) {
      const through = [end, cursor.slice(0, 4) + '-12-31'].sort()[0]
      intervals.push({ key: `gap:${cursor}:${through}`, from: cursor, through })
      cursor = nextDay(through)
    }
  }
  for (const p of periods) {
    if (!validWithdrawalDate(p.period_start) || !validWithdrawalDate(p.period_end) || p.period_end < p.period_start) throw new Error('Ogiltig momsperiod.')
    if (p.period_start < cursor) { issues.push('Momsperioderna överlappar eller ligger före den täckta historiken.'); continue }
    addGap(previousDay(p.period_start))
    const through = p.period_end < s.as_of ? p.period_end : s.as_of
    intervals.push({ key: p.id, from: p.period_start, through })
    cursor = nextDay(through)
  }
  addGap(s.as_of)
  if (intervals.some(i => i.key.startsWith('gap:') && s.journal.some(j =>
    j.date >= i.from && j.date <= i.through && /^26[1-4]/.test(j.account_number) &&
    (toOre(j.debit) !== 0 || toOre(j.credit) !== 0)))) {
    issues.push('Momsunderlaget saknar styrkta periodgränser. Kontrollera företagets momsperioder i momsrapporten.')
  }
  // Reconcile 265x by controlled source and period/event, not by a global
  // amount match. Unexplained residuals block; a matched closing is already
  // represented by V, and a matched settlement is represented by V/S.
  const matchedClosings = new Set<string>()
  for (const t of s.transactions) {
    const rows = transactionRows.get(t.id) ?? []
    const vatDebt = rows.filter(j => /^265/.test(j.account_number))
    if (!vatDebt.some(j => toOre(j.debit) !== toOre(j.credit))) continue
    let matched = vatDebt.every(j => j.account_number === '2650')
    const debtNet = vatDebt.reduce((sum, j) => sum + toOre(j.credit) - toOre(j.debit), 0)
    if (t.source === 'vat_closing') {
      const candidates = periods.filter(p => p.period_end === t.date && p.source === 'sololedger' &&
        ['closed', 'declared'].includes(p.status ?? '') && p.closing_amount != null)
      const p = candidates.length === 1 ? candidates[0] : null
      const clearing = rows.filter(j => /^26[1-4]/.test(j.account_number)).reduce((sum, j) => sum + toOre(j.debit) - toOre(j.credit), 0)
      matched = matched && !!p && !matchedClosings.has(p.id) && debtNet === toOre(p.closing_amount) && clearing === debtNet && rows.every(j => /^26[1-5]/.test(j.account_number))
      if (p) matchedClosings.add(p.id)
    } else if (t.source === 'vat_settlement') {
      const events = s.events.filter(e => e.transaction_id === t.id && e.event_date === t.date)
      const settled = events.reduce((sum, e) => sum + (e.event_kind === 'vat_debit' ? 1 : -1) * toOre(e.amount), 0)
      matched = matched && events.length === 1 && debtNet === -settled && rows.every(j => ['2650', '2012'].includes(j.account_number))
    } else matched = false
    if (!matched) issues.push('Momsunderlaget har en oförklarad bokförd förändring på 265x. Stäm av momsskulden mot momsperioder och skattekonto.')
  }
  const tax = facts.get('tax_account')
  const hasFinancialActivity = s.events.some(e => e.event_kind === 'vat_credit') || s.movements.length > 0 || s.journal.some(j => j.account_number === '2012' && txById.get(j.transaction_id)?.source !== 'vat_settlement')
  let taxAccountOre: number | null = hasFinancialActivity ? null : 0
  let checkedAt: string | null = null
  if (tax) {
    if (typeof tax.date !== 'string' || !validWithdrawalDate(tax.date) || tax.date > s.as_of) throw new Error('Ogiltigt skattekontodatum.')
    assertOre(tax.saldoOre, true)
    checkedAt = tax.date
    if (tax.basis !== withdrawalFinancialBasis(s, tax.date)) issues.push('Skattehändelser i den tidigare avstämningen har ändrats. Kontrollera skattekontot igen.')
    else {
      taxAccountOre = tax.saldoOre
      // A VAT debit is pure reclassification. A later movement's inclusion in
      // the actual balance cannot be inferred from its bank booking date.
      if (s.movements.some(m => m.movement_date > (tax.date as string)) || s.journal.some(j => j.date > (tax.date as string) && j.account_number === '2012' && !['vat_settlement'].includes(txById.get(j.transaction_id)?.source ?? 'manual'))) {
        taxAccountOre = null
        issues.push('En senare skattebetalning behöver matchas mot skattekontot. Uppdatera saldot när betalningen syns.')
      } else for (const e of s.events.filter(e => e.event_date > (tax.date as string))) taxAccountOre += (e.event_kind === 'vat_debit' ? -1 : 1) * toOre(e.amount)
    }
  }
  for (const interval of intervals) {
    const report = calculateVatReportFromLoadedRows({ userId: s.user_id, startDate: interval.from, endDate: interval.through,
      rows: { transactions: s.transactions, journalRows: s.journal, vatV2Snapshots: s.snapshots, vatPeriods: s.periods } })
    if (report.status !== 'ready' || report.report.historicalReviewRequired || report.report.closingReconciliationRequired) { issues.push('Momsunderlaget behöver granskas i momsrapporten.'); continue }
    const gross = Math.max(0, toOre(report.report.fields['49']))
    const debits = tax ? s.events.filter(e => e.vat_period_id === interval.key && e.event_kind === 'vat_debit').reduce((sum, e) => sum + toOre(e.amount), 0) : 0
    if (debits > gross) issues.push('Momsavräkningen överstiger periodens beräknade moms.')
    parts.push({ key: `vat:${interval.key}`, kind: 'vat', ore: Math.max(0, gross - debits), quality: 'checked' })
  }
  const taxYears: number[] = []
  const taxRates: string[] = []
  const manualTaxPayment = s.journal.some(j => j.account_number === '2012' && !['vat_settlement', 'tax_account_movement'].includes(txById.get(j.transaction_id)?.source ?? 'manual'))
  for (const [year, balances] of [...years].sort(([a], [b]) => a - b)) {
    const business = calculateBusinessResult(balances)
    if (business.taxReviews.length) issues.push(`Skatteunderlaget för ${year} behöver granskas i NE-underlaget.`)
    const income = facts.get(`income:${year}`)
    const profit = Math.max(0, toOre(business.skattemassigtResultat))
    if (profit === 0 && !income) continue
    taxYears.push(year)
    if (manualTaxPayment && !income) issues.push(`Kontrollera debiterad skatt för ${year}; en registrerad skattebetalning kan avse ett annat år.`)
    // A model default is stable across the calendar boundary; never reuse the
    // dashboard's browser-global slider as historical tax evidence.
    const rate = withdrawalAnnualRate(s.revision?.facts ?? [], year)
    if (income?.finalOre === null || income?.finalOre === undefined) taxRates.push(`${year}: ${rate} %`)
    const debited = income?.debitedOre ?? 0
    const pending = income?.pendingOre ?? 0
    assertOre(debited); assertOre(pending)
    if (income && !tax) issues.push('Skattebeslutet behöver en avstämning mot skattekontot.')
    if (income && (manualTaxPayment || debited > 0 || pending > 0 || Number(income.finalOre ?? 0) > 0) && income.taxBasis !== stableWithdrawalValue(tax)) {
      issues.push(`Kontrollera vilka skattebelopp för ${year} som ingår i den nya skattekontoavstämningen.`)
    }
    if (income?.finalOre !== null && income?.finalOre !== undefined) {
      assertOre(income.finalOre)
      if (year >= Number(s.as_of.slice(0, 4))) throw new Error('Slutskattebeskedet måste avse ett avslutat inkomstår.')
      if (income.basis !== stableWithdrawalValue(Object.fromEntries(Object.entries(balances).filter(([a]) => /^[3-8]/.test(a))))) issues.push(`Resultatunderlaget för den fasta skatteuppgiften ${year} har ändrats.`)
      parts.push({ key: `income:${year}:final`, kind: 'final', ore: income.finalOre, quality: 'checked' })
    } else {
      const total = Math.round(profit * rate / 100)
      parts.push({ key: `income:${year}:preliminary`, kind: 'preliminary', ore: pending, quality: 'checked' })
      parts.push({ key: `income:${year}:estimate`, kind: 'estimate', ore: Math.max(0, total - debited - pending), quality: 'estimated' })
    }
  }
  const other = facts.get('other')
  const knownOther = Object.entries(allBalances).filter(([a]) => /^2/.test(a) && !/^(20|26)/.test(a)).reduce((sum, [, balance]) => sum + Math.max(0, -toOre(balance)), 0)
  const otherBasis = stableWithdrawalValue(Object.fromEntries(Object.entries(allBalances).filter(([a]) => /^2/.test(a) && !/^(20|26)/.test(a))))
  let otherOre = knownOther
  if (other) {
    assertOre(other.amountOre)
    otherOre = other.amountOre
    if (other.basis !== otherBasis || otherOre < knownOther) issues.push('Andra betalningar behöver kontrolleras mot det ändrade skuldunderlaget.')
  } else if (knownOther > 0) issues.push('Kontrollera andra återstående betalningar. Bokförda skulder visas som underlag, inte en extra reserv ovanpå samma betalning.')
  if (Object.keys(allBalances).some(a => /^(25|27|266)/.test(a) && Math.abs(allBalances[a]) > 0.005)) issues.push('Skatte- eller personalkonton utanför den stödda beräkningen kräver separat kontroll.')
  if (Object.keys(allBalances).some(a => /^23/.test(a) && Math.abs(allBalances[a]) > 0.005)) issues.push('Långfristiga lån behöver en verifierad betalningsplan. Denna version kan inte avgöra kommande amorteringar från lånesaldot.')
  parts.push({ key: 'other', kind: 'other', ore: otherOre, quality: 'checked' })
  const bufferOre = facts.get('buffer')?.amountOre ?? 0
  assertOre(bufferOre)
  const bankOre = toOre(allBalances['1930'] ?? 0)
  const bank = facts.get('bank')
  if (bank && bank.amountOre !== bank.bookOre) issues.push('Bankens kontrollerade saldo avviker från bokföringen. Stäm av banken igen.')
  const result = calculateWithdrawal({ asOf: s.as_of, bankOre, bankQuality: bank && bank.signature === s.signature && bank.date === s.as_of ? 'checked' : 'estimated', taxQuality: checkedAt === s.as_of ? 'checked' : 'estimated', taxAccountOre, parts, bufferOre, issues })
  return { result, taxYears, taxRates, facts: [...facts].map(([key, value]) => ({ ...s.revision?.facts.find(f => f.key === key), key, value })), checkedAt,
    otherBasis, incomeBases: Object.fromEntries([...years].map(([year, b]) => [year, stableWithdrawalValue(Object.fromEntries(Object.entries(b).filter(([a]) => /^[3-8]/.test(a))))])),
    firstDate, financialBasis: withdrawalFinancialBasis(s, s.as_of) }
}
