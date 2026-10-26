import type { VatPeriodCreationPlan } from '../../src/lib/vatPeriodCreation'

type Mode = 'complete' | 'missing' | 'blocked' | 'cross_year_blocked' | 'not_applicable' | 'read_error' | 'malformed'
let mode: Mode = 'complete'
let owner = 'synthetic-A'
let basis = 'a'.repeat(32)
let annualStart = '06-02'
let writeMode = 'success'
let pending: (() => void) | null = null
const calls: { name: string; args: Record<string, unknown> }[] = []

function plan(year: number): VatPeriodCreationPlan {
  const period = { start: `${year}-${annualStart}`, end: `${year}-12-31`, type: 'year' as const }
  return { version: 1, owner, year, today: '2026-10-26', state: mode === 'cross_year_blocked' ? 'blocked' : mode === 'read_error' || mode === 'malformed' ? 'missing' : mode,
    message: mode === 'cross_year_blocked' ? 'Momsprofilen motsäger en redan fastställd första delperiod, även om den ligger i ett annat år. Kontrollera Profil och registreringsunderlaget; inga perioder skapas.' : mode === 'blocked' ? 'Första delperioden behöver styrkas mot registreringsunderlaget. Kontrollera Profil.' : 'Företaget är inte momsregistrerat. Inga nya momsperioder skapas.',
    expected: mode === 'cross_year_blocked' ? [] : [period], missing: mode === 'complete' || mode === 'not_applicable' || mode === 'cross_year_blocked' ? [] : [period], basis }
}

export const transport = {
  calls,
  setup(next: Mode, user = 'synthetic-A') { mode = next; owner = user; annualStart = next === 'complete' ? '06-02' : '01-01'; basis = 'a'.repeat(32); writeMode = 'success'; calls.splice(0) },
  changeRemotely() { basis = 'b'.repeat(32) },
  writeMode(value: string) { writeMode = value },
  finish() { pending?.(); pending = null },
}

export async function verifiedProfileRpc() {
  const userId = owner
  return { userId, rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args })
    if (name === 'get_vat_period_creation_plan') {
      if (mode === 'read_error') return { data: null, error: { message: 'Synthetic transport unavailable' } }
      return { data: mode === 'malformed' ? {} : plan(args.p_year as number), error: null }
    }
    if (writeMode === 'pending') await new Promise<void>(resolve => { pending = resolve })
    if (args.p_expected_basis !== basis) return { data: null, error: { code: '40001', message: 'Uppgifterna har ändrats. Granska momsperioderna på nytt.' } }
    mode = 'complete'
    basis = 'c'.repeat(32)
    if (writeMode === 'uncertain') return { data: null, error: { code: 'network', message: 'Unknown result' } }
    return { data: { success: true, created_count: 1, year: args.p_year }, error: null }
  } }
}
