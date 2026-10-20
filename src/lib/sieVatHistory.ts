import type { LoadedVatReportRows } from './vatReportService.ts'

export const HISTORICAL_SIE_VAT_REVIEW_MESSAGE =
  'En tidigare återställning eller rättelse har osäker momshistorik. Beloppen visar aktuell journalavstämning. Historiska momsperioder och eventuella deklarationer kräver separat hantering; momsavslut och uttagsutrymme kan inte beräknas automatiskt.'

// The loader supplies the entire affected batch, including rows outside the
// report/year. A full-year net of zero must not conceal a cross-period undo.
export function historicalSieUndoNeedsReview(rows: LoadedVatReportRows) {
  const batches = new Set(rows.transactions
    .filter(tx => tx.import_batch_id &&
      (tx.import_batch_status === 'undone' || tx.source === 'sie_import_undo'))
    .map(tx => tx.import_batch_id as string))
  for (const batchId of batches) {
    const transactions = rows.transactions.filter(tx => tx.import_batch_id === batchId)
    const ids = new Set(transactions.map(tx => tx.id))
    const vatRows = rows.journalRows.filter(row => ids.has(row.transaction_id) &&
      row.account_number.startsWith('26'))
    if (vatRows.length === 0) continue
    if (!transactions.some(tx => tx.source === 'sie_import_undo')) return true
    const periodIds = new Set<string>()
    for (const row of vatRows) {
      const periods = (rows.vatPeriods ?? []).filter(period => row.date &&
        row.date >= period.period_start && row.date <= period.period_end)
      if (periods.length !== 1 || periods[0].source !== 'sololedger') return true
      periodIds.add(periods[0].id)
    }
    if (periodIds.size !== 1) return true
  }
  return false
}
