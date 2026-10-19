// Synthetic browser-only dependencies. No Supabase client or credentials are bundled.
export const pending: { id: number; group: number; owner: string; year: number; kind: string; resolve: (data: unknown) => void; reject: (error: Error) => void }[] = []
let id = 0
let bootstrapError = false
export function setBootstrapError(value: boolean) { bootstrapError = value }
export let owner: string | null = 'company-a'
export function setOwner(value: string | null) { owner = value }
function request(kind: string, year: number) {
  return new Promise<unknown>((resolve, reject) => pending.push({ group: Math.floor(id / 6) + 1, id: ++id, owner: owner!, year, kind, resolve, reject }))
}
export function getUserId() { return Promise.resolve(owner) }
export function getAccountBalances(year: number) { return request('balances', year) }
export function getBalanceSheetBalances(year: number) { return request('cumulative', year) }
export function getNEData(year: number) { return request('ne', year) }
export function isYearClosed(year: number) { return request('lock', year) }
export function getDashboardVatBreakdown(start: string) { return request('vat', Number(start.slice(0, 4))) }
export function loadCompleteTransactionHistory({ startDate }: { startDate: string }) {
  return request('history', Number(startDate.slice(0, 4)))
}
export const supabase = {
  from: () => ({ select: () => ({ eq: () => ({
    limit: async () => ({ data: [{ id: 'synthetic' }], error: bootstrapError ? new Error('Injected bootstrap failure') : null }),
    order: async () => ({ data: [{ id: 'synthetic', name: 'Test' }], error: null }),
  }) }) }),
}
export async function setupDefaultAccounts() { throw new Error('Tests must never write accounts') }
export function finish(groupId: number, value: number, failKind?: string) {
  for (const item of pending.filter(item => item.group === groupId)) {
    pending.splice(pending.indexOf(item), 1)
    if (item.kind === failKind) { item.reject(new Error('Injected read failure')); continue }
    const values: Record<string, unknown> = {
      balances: { '3010': -value }, cumulative: { '1930': value },
      ne: { R1: value, R11: value, R17: value, bank: value, B9: value, B10_total: value },
      vat: { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 }, lock: false,
      history: { transactions: value ? [{ id: 'synthetic', date: '2026-01-01', description: 'Syntetiskt' }] : [], journalMap: {} },
    }
    item.resolve(failKind === 'missing-ne' && item.kind === 'ne' ? null : values[item.kind])
  }
}

export function transactionHistoryErrorMessage() { return "Syntetiskt läsfel" }
