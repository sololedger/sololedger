// Synthetic contract fixture. No real user, batch, document or invoice IDs.
import type { PresentationTransaction, PresentationJournal } from '../../src/lib/transactionHistoryPresentation.ts'

export function kan84Fixture() {
  const owner = 'fixture-owner'
  const prefix = 'KAN-84 11111111-1111-4111-8111-111111111111 '
  const packageFile = owner + '/synthetic-evidence.pdf'
  const creditGroup = ['TESTCREDIT01', 'TESTCREDIT02', 'TESTCREDIT03', 'TESTCREDIT04', 'TESTCREDIT05'].join(',')
  const transactions: PresentationTransaction[] = []
  const journalMap: Record<string, Array<PresentationJournal & { id: string }>> = {}
  function add(ver: number, date: string, description: string, amount: number, type: string | null,
    rows: Array<[string, number, number]>, source = 'manual', file = packageFile) {
    const id = 'synthetic-tx-' + ver
    transactions.push({ id, user_id: owner, date, description, amount, type, source, file_url: file,
      booked: true, vat_rate: source === 'vat_v2' ? 25 : 0, is_correction: false, corrects_ver_nr: null,
      is_periodized: false, is_periodized_reversal: false, periodization_group_id: null, import_batch_id: null })
    journalMap[id] = rows.map(([account_number, debit, credit], index) => ({ id: id + '-row-' + index,
      transaction_id: id, user_id: owner, date, ver_nr: ver, account_number, debit, credit }))
  }
  for (const [i, ver] of [10, 12, 13, 15].entries()) {
    add(ver, `2026-0${i + 6}-02`, `Adobe original ${i + 6}/2026`, 285, 'prenumerationer',
      [['5420', 285, 0], ['1930', 0, 285]], 'manual', owner + '/original-' + ver + '.pdf')
    add(18 + i, '2026-10-16', prefix + `reclass-${i + 1} rättar kostnad i VER-${ver}; bankbetalning bevarad`,
      285, 'kan84_adobe_reclass', [['1680', 285, 0], ['5420', 0, 285]])
  }
  add(22, '2026-10-03', prefix + 'october-payment; originalfaktura saknas', 285,
    'kan84_adobe_payment', [['1680', 285, 0], ['1930', 0, 285]])
  for (let month = 6; month <= 10; month++) {
    add(23 + month - 6, '2026-10-16', prefix + `eu-${month} faktura TESTINVOICE${month} slutligt EU-köp; tjänsteperiod ${String(month).padStart(2, '0')}/2026; gemensam kreditgrupp`,
      228, null, [['4535', 228, 0], ['4535', 57, 0], ['2614', 0, 57], ['1680', 0, 228]], 'vat_v2')
  }
  for (let i = 0; i < 5; i++) {
    add(28 + i, i === 4 ? '2026-10-13' : '2026-10-12', prefix + `refund-${i + 1} bankhändelse; kreditgrupp ${creditGroup}; individuell fakturakoppling ej styrkt`,
      57, 'kan84_adobe_refund', [['1930', 57, 0], ['1680', 0, 57]])
  }
  return { transactions, journalMap }
}
