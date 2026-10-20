// Advisory liquidity only. No accounting writes and no personal tax engine.
export type WithdrawalQuality = 'checked' | 'estimated'
export interface WithdrawalPart {
  key: string
  kind: 'vat' | 'preliminary' | 'final' | 'estimate' | 'other'
  ore: number
  quality: WithdrawalQuality
}
export interface WithdrawalInput {
  asOf: string
  bankOre: number
  bankQuality: WithdrawalQuality
  taxAccountOre: number | null
  taxQuality?: WithdrawalQuality
  parts: WithdrawalPart[]
  bufferOre: number
  issues: string[]
}
export interface WithdrawalResult {
  estimationNotes: string[]
  status: 'calculated' | 'estimated' | 'incomplete'
  asOf: string
  bankOre: number
  vatOre: number
  incomeTaxOre: number
  otherOre: number
  taxAccountOre: number | null
  bufferOre: number
  reserveOre: number | null
  rawOre: number | null
  recommendedOre: number | null
  issues: string[]
}
export function assertOre(value: unknown, signed = false): asserts value is number {
  if (!Number.isSafeInteger(value) || Math.abs(value as number) > 9_000_000_000_000 || (!signed && (value as number) < 0)) {
    throw new Error('Ett belopp saknar giltigt underlag.')
  }
}
export function toOre(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') throw new Error('Belopp saknas.')
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n * 100 - Math.round(n * 100)) > 0.0001) throw new Error('Ogiltigt belopp.')
  const ore = Math.round(n * 100)
  assertOre(ore, true)
  return ore
}
export function validWithdrawalDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
}
export function calculateWithdrawal(input: WithdrawalInput): WithdrawalResult {
  if (!validWithdrawalDate(input.asOf)) throw new Error('Ogiltigt beräkningsdatum.')
  assertOre(input.bankOre, true)
  assertOre(input.bufferOre)
  if (input.taxAccountOre !== null) assertOre(input.taxAccountOre, true)
  const keys = new Set<string>()
  const totals = { vat: 0, preliminary: 0, final: 0, estimate: 0, other: 0 }
  for (const part of input.parts) {
    if (!part.key || keys.has(part.key) || !(part.kind in totals) || !['checked', 'estimated'].includes(part.quality)) throw new Error('Motstridiga eller dubbla reserveringar.')
    keys.add(part.key)
    assertOre(part.ore)
    totals[part.kind] += part.ore
    assertOre(totals[part.kind])
  }
  const incomeTaxOre = totals.preliminary + totals.final + totals.estimate
  const issues = [...new Set(input.issues)]
  if (input.taxAccountOre === null) issues.push('Skattekontots påverkan behöver kontrolleras.')
  const reserveOre = input.taxAccountOre === null ? null : Math.max(0, totals.vat + incomeTaxOre - input.taxAccountOre)
  if (reserveOre !== null) assertOre(reserveOre)
  const rawOre = reserveOre === null ? null : input.bankOre - reserveOre - totals.other - input.bufferOre
  if (rawOre !== null) assertOre(rawOre, true)
  const incomplete = issues.length > 0
  const estimationNotes: string[] = []
  if (input.bankQuality === 'estimated') estimationNotes.push('Bankbeloppet bygger på bokföringen utan en matchande kontroll av dagens bankbehållning.')
  if (input.taxQuality === 'estimated') estimationNotes.push('Skattekontot är framskrivet eller ingen skattekontokredit tillgodoräknas.')
  if (input.parts.some(p => p.kind === 'estimate' && p.quality === 'estimated')) estimationNotes.push('Årsvis skatt och egenavgifter är uppskattade.')
  return {
    estimationNotes,
    status: incomplete ? 'incomplete' : input.bankQuality === 'estimated' || input.taxQuality === 'estimated' || input.parts.some(p => p.quality === 'estimated') ? 'estimated' : 'calculated',
    asOf: input.asOf, bankOre: input.bankOre, vatOre: totals.vat, incomeTaxOre,
    otherOre: totals.other, taxAccountOre: input.taxAccountOre, bufferOre: input.bufferOre,
    reserveOre, rawOre, recommendedOre: incomplete || rawOre === null ? null : Math.max(0, rawOre), issues,
  }
}
