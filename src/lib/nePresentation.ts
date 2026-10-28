import { calculateNeBalanceDiff } from './neBalance'

/** Presentation of warnings already returned by the report. Never a clearance,
 * replacement for buildNeReview, or a reason to allow/deny an accounting write. */
export interface NeSummarySource {
  accountCoverage?: { accountNumber: string; status: string }[]
  warnings?: { accountNumber: string }[]
  taxReviews?: { accountNumber: string }[]
  equityReviewRequired?: boolean
  resultClosingReview?: { blocked: boolean }
  neSalesClassification?: { available: boolean; reviewRequired: boolean }
  unclassifiedNegativeBankBalance?: number
  B1?: number; B2?: number; B3?: number; B4?: number; B5?: number; B6?: number
  B7?: number; B8?: number; B9?: number; B10_total?: number
  B13?: number; B14?: number; B15?: number; B16?: number
}
export function neReviewSummary(source: NeSummarySource | null | undefined, ready = true) {
  if (!ready || !source) return { known: false, areas: [] as string[], text: 'Granskningsstatus är inte tillgänglig' }
  const areas = new Set<string>()
  if (source.resultClosingReview?.blocked) areas.add('Bokslutsposter och resultat')
  for (const row of source.accountCoverage ?? []) if (row.status === 'review') areas.add(row.accountNumber)
  for (const row of [...source.warnings ?? [], ...source.taxReviews ?? []]) areas.add(row.accountNumber)
  if (source.equityReviewRequired) areas.add('B10')
  if (!source.neSalesClassification?.available || source.neSalesClassification.reviewRequired) areas.add('3010')
  if ((source.unclassifiedNegativeBankBalance ?? 0) > 0) areas.add('Kassa/bank')
  const balanceKnown = ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10_total','B13','B14','B15','B16'].every(key => Number.isFinite(source[key as keyof NeSummarySource]))
  if (balanceKnown && Math.abs(calculateNeBalanceDiff(source as Parameters<typeof calculateNeBalanceDiff>[0])) > 1) areas.add('Balansräkningen')
  const known = balanceKnown && !!source.accountCoverage && !!source.warnings && !!source.taxReviews && !!source.neSalesClassification?.available
  return { known, areas: [...areas], text: areas.size ? `${areas.size} ${areas.size === 1 ? 'granskningsbehov' : 'konton/rutor att granska'}` : 'Öppna för hela granskningen' }
}
