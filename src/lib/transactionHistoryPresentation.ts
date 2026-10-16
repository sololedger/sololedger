// KAN-87: display-only metadata. Never feed this into booking, reports or actions.
export interface HistoryPresentation {
  title: string
  searchTerms: string[]
  kind: 'reclassification' | 'payment' | 'eu_service' | 'refund'
  explanation?: string
  badge?: string
  amountLabel?: string
  amountClass?: string
}

export interface PresentationTransaction {
  id: string
  user_id?: string | null
  date?: string | null
  description?: string | null
  source?: string | null
  type?: string | null
  amount?: number | string | null
  vat_rate?: number | string | null
  booked?: boolean
  file_url?: string | null
  is_correction?: boolean | null
  corrects_ver_nr?: number | null
  is_periodized?: boolean | null
  is_periodized_reversal?: boolean | null
  periodization_group_id?: string | null
  import_batch_id?: string | null
}

export interface PresentationJournal {
  transaction_id?: string
  user_id?: string | null
  date?: string | null
  ver_nr?: number | null
  account_number: string | number
  debit?: number | string | null
  credit?: number | string | null
}

const header = /^KAN-84 ([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}) (.+)$/
const months = ['juni', 'juli', 'augusti', 'september', 'oktober']
const originalVers = [10, 12, 13, 15]
type Row = [string, number, number]
const cents = (value: unknown) => {
  if (value == null || value === '') return NaN
  const number = Number(value)
  return Number.isFinite(number) && Math.abs(number * 100 - Math.round(number * 100)) < 0.000001
    ? Math.round(number * 100) : NaN
}
const money = (amount: number) => amount.toLocaleString('sv-SE') + ' kr'

/**
 * Narrow legacy adapter for the inspected KAN-84 generator contract (2026).
 * Provenance is corroborated by all 15 batch members, owner/private reference,
 * technical category/source, complete journals and all four untouched originals.
 * Neither shared evidence, amounts nor description grammar alone is sufficient.
 * No real owner/transaction/batch/document identifiers are embedded in the app.
 */
export function buildHistoryPresentations(
  transactions: PresentationTransaction[],
  journalMap: Record<string, PresentationJournal[] | undefined>,
): Map<string, HistoryPresentation> {
  const result = new Map<string, HistoryPresentation>()
  const owners = new Set(transactions.map(tx => tx.user_id))
  // The year loader promises one owner. Mixed/missing ownership fails closed.
  if (owners.size !== 1 || !transactions[0]?.user_id) return result
  const owner = transactions[0].user_id
  if (new Set(transactions.map(tx => tx.id)).size !== transactions.length) return result
  if (transactions.some(tx => tx.is_correction && tx.corrects_ver_nr != null &&
    [...originalVers, ...Array.from({ length: 15 }, (_, i) => i + 18)].includes(tx.corrects_ver_nr))) return result
  const groups = new Map<string, PresentationTransaction[]>()
  for (const tx of transactions) {
    const match = tx.description?.match(header)
    if (!match) continue
    const batch = groups.get(match[1]) ?? []
    batch.push(tx)
    groups.set(match[1], batch)
  }

  function base(tx: PresentationTransaction, date: string, amount: number, source: string, type: string | null) {
    return tx.user_id === owner && tx.booked === true && tx.date === date && cents(tx.amount) === amount * 100 &&
      tx.source === source && (tx.type ?? null) === type && cents(tx.vat_rate) === (source === 'vat_v2' ? 2500 : 0) &&
      tx.is_correction === false && tx.corrects_ver_nr == null && !tx.is_periodized &&
      !tx.is_periodized_reversal && tx.periodization_group_id == null && tx.import_batch_id == null
  }
  function journal(tx: PresentationTransaction, ver: number, expected: Row[]) {
    const rows = journalMap[tx.id]
    if (!rows || rows.length !== expected.length || rows.some(row =>
      row.user_id !== owner || row.transaction_id !== tx.id || row.date !== tx.date || row.ver_nr !== ver)) return false
    const key = (account: string, debit: number, credit: number) => JSON.stringify([account, debit, credit])
    const actual = rows.map(row => key(String(row.account_number), cents(row.debit), cents(row.credit))).sort()
    return JSON.stringify(actual) === JSON.stringify(expected.map(([account, debit, credit]) => key(account, debit * 100, credit * 100)).sort())
  }

  for (const members of groups.values()) {
    if (members.length !== 15) continue
    const path = members[0].file_url
    if (!path?.startsWith(owner + '/') || !path.endsWith('.pdf') || path.trim() !== path ||
      members.some(tx => tx.file_url !== path)) continue
    const pending = new Map<string, HistoryPresentation>()
    let valid = true
    const used = new Set<string>()
    const creditGroups = new Set<string>()
    const invoices = new Set<string>()
    for (const tx of members) {
      const tail = tx.description!.match(header)![2]
      let match: RegExpMatchArray | null
      let tag = ''
      let presentation: HistoryPresentation | undefined
      if ((match = tail.match(/^reclass-([1-4]) rättar kostnad i VER-(\d+); bankbetalning bevarad$/))) {
        const index = Number(match[1]) - 1
        const originalVer = originalVers[index]
        const originals = transactions.filter(candidate => journalMap[candidate.id]?.some(row => row.ver_nr === originalVer))
        const original = originals[0]
        tag = 'reclass-' + match[1]
        if (Number(match[2]) !== originalVer || originals.length !== 1 || !original ||
          !base(original, `2026-0${index + 6}-02`, 285, 'manual', 'prenumerationer') ||
          !original.file_url?.startsWith(owner + '/') ||
          !journal(original, originalVer, [['5420', 285, 0], ['1930', 0, 285]]) ||
          !base(tx, '2026-10-16', 285, 'manual', 'kan84_adobe_reclass') ||
          !journal(tx, 18 + index, [['1680', 285, 0], ['5420', 0, 285]])) { valid = false; break }
        presentation = { kind: 'reclassification', title: 'Adobe – omklassificering av tidigare kostnad',
          badge: 'Bokföringsrättelse', explanation: `Ingen ny bankbetalning. Avser tidigare kostnad i VER-${originalVer}.`,
          amountLabel: 'Omfört ' + money(285), amountClass: 'text-gray-700', searchTerms: ['Adobe', 'Bokföringsrättelse', `VER-${originalVer}`] }
      } else if (tail === 'october-payment; originalfaktura saknas') {
        tag = 'october-payment'
        if (!base(tx, '2026-10-03', 285, 'manual', 'kan84_adobe_payment') ||
          !journal(tx, 22, [['1680', 285, 0], ['1930', 0, 285]])) { valid = false; break }
        presentation = { kind: 'payment', title: 'Adobe – bankbetalning oktober 2026', searchTerms: ['Adobe'] }
      } else if ((match = tail.match(/^eu-(6|7|8|9|10) faktura ([A-Z0-9-]{4,50}) slutligt EU-köp; tjänsteperiod (06|07|08|09|10)\/2026; gemensam kreditgrupp$/))) {
        const month = Number(match[1])
        tag = 'eu-' + month
        if (month !== Number(match[3]) || invoices.has(match[2]) ||
          !base(tx, '2026-10-16', 228, 'vat_v2', null) ||
          !journal(tx, 23 + month - 6, [['4535', 228, 0], ['4535', 57, 0], ['2614', 0, 57], ['1680', 0, 228]])) { valid = false; break }
        invoices.add(match[2])
        presentation = { kind: 'eu_service', title: `Adobe – EU-tjänst ${months[month - 6]} 2026`, searchTerms: ['Adobe', months[month - 6], '2026'] }
      } else if ((match = tail.match(/^refund-([1-5]) bankhändelse; kreditgrupp ([A-Z0-9-]{4,50}(?:,[A-Z0-9-]{4,50}){4}); individuell fakturakoppling ej styrkt$/))) {
        const index = Number(match[1]) - 1
        tag = 'refund-' + match[1]
        const credits = match[2].split(',')
        if (new Set(credits).size !== 5 || !base(tx, index === 4 ? '2026-10-13' : '2026-10-12', 57, 'manual', 'kan84_adobe_refund') ||
          !journal(tx, 28 + index, [['1930', 57, 0], ['1680', 0, 57]])) { valid = false; break }
        creditGroups.add(match[2])
        presentation = { kind: 'refund', title: 'Adobe – återbetalning', explanation: 'Inbetalning till bank',
          amountLabel: '+' + money(57), amountClass: 'text-emerald-600', searchTerms: ['Adobe', 'återbetalning'] }
      }
      if (!presentation || used.has(tag)) { valid = false; break }
      used.add(tag)
      pending.set(tx.id, presentation)
    }
    if (valid && used.size === 15 && creditGroups.size === 1 && invoices.size === 5) {
      for (const [id, presentation] of pending) result.set(id, presentation)
    }
  }
  return result
}
