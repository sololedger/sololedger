/** KAN-88: NE-only allocation. Never change journal balances or the shared result engine. */
export interface NeSalesClassificationSummary {
  available: boolean
  r2Reallocation: number
  unresolvedCount: number
  unresolvedAmount: number
  reviewRequired: boolean
}
export const unavailableNeSalesClassification: NeSalesClassificationSummary = {
  available: false, r2Reallocation: 0, unresolvedCount: 0, unresolvedAmount: 0, reviewRequired: true,
}
export function parseNeSalesSummary(value: unknown): NeSalesClassificationSummary {
  if (!value || typeof value !== 'object') throw new Error('NE-klassificeringsunderlag saknas.')
  const row = value as Record<string, unknown>
  const amount = Number(row.r2_reallocation)
  const count = Number(row.unresolved_count)
  const unresolved = Number(row.unresolved_amount)
  if (row.version !== 1 || row.r2_reallocation == null || row.unresolved_count == null || row.unresolved_amount == null ||
      !Number.isFinite(amount) || !Number.isSafeInteger(count) || count < 0 || !Number.isFinite(unresolved) || unresolved < 0) {
    throw new Error('NE-klassificeringsunderlaget är ofullständigt eller ogiltigt.')
  }
  return { available: true, r2Reallocation: amount, unresolvedCount: count, unresolvedAmount: unresolved, reviewRequired: count > 0 }
}
export function allocateNeSales<T extends { R1: number; R2: number }>(rows: T, summary: NeSalesClassificationSummary): T {
  const amount = summary.r2Reallocation
  if (!Number.isFinite(amount)) throw new Error('Ogiltig NE-omfördelning.')
  return { ...rows, R1: Math.round((rows.R1 - amount) * 100) / 100, R2: Math.round((rows.R2 + amount) * 100) / 100 }
}
