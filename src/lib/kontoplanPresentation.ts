import { getBookingCategory, type AccountGroup } from './accountingKnowledge.ts'

export interface KontoplanItem {
  id: string
  name: string
  debit_account: string
  credit_account: string
  default_vat_rate: number
  comment: string
  hidden_from_new_booking?: boolean
}
export type KontoplanVisibility = 'all' | 'visible' | 'hidden'
const labels: Record<AccountGroup, string> = {
  income: 'Försäljning', purchases: 'Inköp', premises: 'Lokaler',
  equipment: 'Utrustning', travel: 'Resor', marketing: 'Marknadsföring',
  administration: 'Administration', education: 'Utbildning', owner: 'Egna insättningar och uttag',
  assets: 'Tillgångar', vat: 'Moms', periodization: 'Periodisering', system: 'Systemkategorier',
}
export function filterKontoplan<T extends KontoplanItem>(rows: readonly T[], search: string, visibility: KontoplanVisibility): T[] {
  const query = search.trim().toLocaleLowerCase('sv-SE')
  return rows.filter(row => {
    if (visibility === 'visible' && row.hidden_from_new_booking !== false) return false
    if (visibility === 'hidden' && row.hidden_from_new_booking !== true) return false
    return !query || [row.name, row.debit_account, row.credit_account, row.comment]
      .some(value => String(value ?? '').toLocaleLowerCase('sv-SE').includes(query))
  })
}
export function groupKontoplan<T extends KontoplanItem>(rows: readonly T[]): { label: string; rows: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const category = getBookingCategory(row.id)
    const preset = category?.legacyPreset
    // An ID alone is insufficient: modified and unknown categories remain neutral.
    const matches = preset && row.debit_account === preset.debitAccount &&
      row.credit_account === preset.creditAccount && Number(row.default_vat_rate) === preset.defaultVatRate
    const label = matches && category ? labels[category.group] : 'Övriga kategorier'
    const members = groups.get(label) ?? []
    members.push(row)
    groups.set(label, members)
  }
  return [...groups].sort(([a], [b]) => a === 'Övriga kategorier' ? 1 : b === 'Övriga kategorier' ? -1 : a.localeCompare(b, 'sv-SE'))
    .map(([label, members]) => ({ label, rows: [...members].sort((a, b) => a.name.localeCompare(b.name, 'sv-SE')) }))
}

/** Informational match only; never used to accept/reject a category or hide presets. */
export function findKontoplanAccountMatches<T extends KontoplanItem>(rows: readonly T[], debitAccount: string, creditAccount: string, selectedId: string): T[] {
  return rows.filter(row => row.id !== selectedId && row.debit_account === debitAccount && row.credit_account === creditAccount)
}
