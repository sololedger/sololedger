import { verifiedProfileRpc } from './profileWriteGuard'

export type PlannedVatPeriod = { start: string; end: string; type: 'month' | 'quarter' | 'year' }
export type VatPeriodCreationPlan = {
  version: 1
  owner: string
  year: number
  today: string
  state: 'complete' | 'missing' | 'blocked' | 'not_applicable'
  message: string
  expected: PlannedVatPeriod[]
  missing: PlannedVatPeriod[]
  basis: string
}

// Fail closed on an unavailable/older server. Never fall back to legacy generation.
function parsePlan(value: unknown, year: number, owner: string): VatPeriodCreationPlan {
  const p = value as VatPeriodCreationPlan | null
  const validPeriod = (v: PlannedVatPeriod) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.end) && v.start <= v.end && ['month', 'quarter', 'year'].includes(v.type)
  if (!p || p.version !== 1 || p.year !== year || p.owner !== owner ||
    !['complete', 'missing', 'blocked', 'not_applicable'].includes(p.state) ||
    !/^[a-f0-9]{32}$/.test(p.basis) || typeof p.message !== 'string' ||
    !Array.isArray(p.expected) || !p.expected.every(validPeriod) ||
    !Array.isArray(p.missing) || !p.missing.every(validPeriod) ||
    (p.state === 'complete' && (p.missing.length > 0 || p.expected.length === 0)) ||
    (p.state === 'missing' && p.missing.length === 0)) {
    throw new Error('Periodbehovet kunde inte verifieras. Läs in statusen igen; inga perioder har skapats.')
  }
  return p
}

export async function getVatPeriodCreationPlan(year: number): Promise<VatPeriodCreationPlan> {
  const client = await verifiedProfileRpc()
  const { data, error } = await client.rpc('get_vat_period_creation_plan', { p_year: year })
  if (error) throw new Error('Kunde inte kontrollera momsperioderna. Försök igen.')
  return parsePlan(data, year, client.userId!)
}

export async function createMissingVatPeriods(plan: VatPeriodCreationPlan): Promise<number> {
  const client = await verifiedProfileRpc()
  if (plan.owner !== client.userId || plan.state !== 'missing') {
    throw new Error('Inloggningen eller förhandsgranskningen har ändrats. Granska på nytt.')
  }
  const { data, error } = await client.rpc('create_missing_vat_periods', {
    p_year: plan.year, p_expected_basis: plan.basis,
  })
  if (error) {
    if (error.code === '40001' || error.code === '23514') throw new Error(error.message)
    throw new Error('Skapandet kunde inte bekräftas. Läs in aktuell periodstatus innan du försöker igen.')
  }
  if (data?.success !== true || !Number.isInteger(data.created_count) || data.created_count < 1 || data.year !== plan.year) {
    throw new Error('Svaret kunde inte verifieras. Läs in periodstatus innan du försöker igen.')
  }
  return data.created_count
}
