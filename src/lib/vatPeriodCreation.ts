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
  profile_revision: string
  pending?: boolean
  resolution?: string
}

type PendingCreation = Pick<VatPeriodCreationPlan, 'owner' | 'year' | 'basis' | 'profile_revision' | 'missing'>
const pendingKey = (owner: string) => `sololedger:vat-period-confirmation:${owner}`
const validPeriod = (v: PlannedVatPeriod) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.start) &&
  /^\d{4}-\d{2}-\d{2}$/.test(v.end) && v.start <= v.end && ['month', 'quarter', 'year'].includes(v.type)
function readPending(owner: string): PendingCreation | null {
  try {
    const value = localStorage.getItem(pendingKey(owner))
    if (!value) return null
    const p = JSON.parse(value) as PendingCreation
    if (!p || p.owner !== owner || !Number.isInteger(p.year) || p.year < 1900 || p.year > 9998 ||
      !Array.isArray(p.missing) || p.missing.length === 0 || !p.missing.every(validPeriod) ||
      !/^[a-f0-9]{32}$/.test(p.basis) || !/^\d+$/.test(p.profile_revision)) throw new Error('Invalid local confirmation')
    return p
  } catch {
    throw new Error('Ett tidigare skapande behöver kontrolleras. Kontakta support; inga nya perioder skapas.')
  }
}
function clearPending(p: PendingCreation) {
  // A late response must never clear a newer confirmation's marker.
  if (readPending(p.owner)?.basis === p.basis) localStorage.removeItem(pendingKey(p.owner))
}

// Fail closed on an unavailable/older server. Never fall back to legacy generation.
function parsePlan(value: unknown, year: number, owner: string): VatPeriodCreationPlan {
  const p = value as VatPeriodCreationPlan | null
  if (!p || p.version !== 1 || p.year !== year || p.owner !== owner ||
    !['complete', 'missing', 'blocked', 'not_applicable'].includes(p.state) ||
    !/^[a-f0-9]{32}$/.test(p.basis) || !/^\d+$/.test(p.profile_revision) || typeof p.message !== 'string' ||
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
  const read = async (y: number) => {
    const { data, error } = await client.rpc('get_vat_period_creation_plan', { p_year: y })
    if (error) throw new Error('Kunde inte kontrollera momsperioderna. Försök igen.')
    return parsePlan(data, y, client.userId!)
  }
  const current = await read(year)
  const pending = readPending(client.userId!)
  if (!pending) return current
  const actual = pending.year === year ? current : await read(pending.year)
  const covered = actual.state === 'complete' && pending.missing.every(p =>
    actual.expected.some(e => e.start === p.start && e.end === p.end && e.type === p.type))
  if (covered || actual.profile_revision !== pending.profile_revision) {
    clearPending(pending)
    return { ...current, resolution: covered
      ? `Perioderna från din tidigare bekräftelse för ${pending.year} finns nu. Ingen ny bekräftelse behövs.`
      : 'Momsprofilen har ändrats. Den tidigare planen är ogiltig; granska aktuella datum på nytt.' }
  }
  // A read showing missing rows cannot prove a queued or accepted request was cancelled.
  // Retain the marker across year changes, remounts, reloads and browser close. No timed expiry.
  return { ...current, state: 'blocked', pending: true,
    message: `Ett bekräftat skapande för ${pending.year} pågår eller har okänt resultat. Stängning av vyn avbryter inte serveranropet. Kontrollera periodstatus innan du försöker igen. Om statusen inte kan fastställas, kontakta support.` }
}

export async function createMissingVatPeriods(plan: VatPeriodCreationPlan): Promise<number> {
  const client = await verifiedProfileRpc()
  if (plan.owner !== client.userId || plan.state !== 'missing') {
    throw new Error('Inloggningen eller förhandsgranskningen har ändrats. Granska på nytt.')
  }
  if (readPending(plan.owner)) throw new Error('Ett tidigare skapande måste kontrolleras innan du kan bekräfta igen.')
  const pending: PendingCreation = { owner: plan.owner, year: plan.year, basis: plan.basis,
    profile_revision: plan.profile_revision, missing: plan.missing }
  // Persist BEFORE dispatch; if browser storage is unavailable, fail closed without an RPC.
  try { localStorage.setItem(pendingKey(plan.owner), JSON.stringify(pending)) }
  catch { throw new Error('Webbläsaren kunde inte bevara bekräftelsens status. Inget anrop skickades. Kontrollera webbläsarens lagring innan nytt försök.') }
  const { data, error } = await client.rpc('create_missing_vat_periods', {
    p_year: plan.year, p_expected_basis: plan.basis,
  })
  if (error) {
    if (error.code === '23514') { clearPending(pending); throw new Error(error.message) }
    throw new Error('Skapandet kunde inte bekräftas. Anropet kan fortsätta på servern. Kontrollera periodstatus; skicka ingen ny bekräftelse ännu.')
  }
  if (data?.success !== true || !Number.isInteger(data.created_count) || data.created_count < 1 || data.year !== plan.year) {
    throw new Error('Svaret kunde inte verifieras. Läs in periodstatus innan du försöker igen.')
  }
  clearPending(pending)
  return data.created_count
}
