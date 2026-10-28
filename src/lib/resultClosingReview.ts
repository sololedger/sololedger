/** KAN-96 transport/presentation only. The journal rule lives in PostgreSQL. */
export interface ResultClosingEntry {
  transaction_id: string
  date: string
  ver_nr: number
  journal_dates: string[]
  accounts: string[]
}
export interface ResultClosingReview {
  version: 1
  year: number
  through_date: string
  blocked: boolean
  entries: ResultClosingEntry[]
}
export const resultClosingMessage = 'Bokslutsposter kan ha nollställt resultatkontona. Resultat och skattebelopp är osäkra och året kan inte låsas.'
export const resultClosingNextStep = 'Jämför de berörda verifikationerna med bokföringsunderlaget och eventuellt externt bokslut. Ta hjälp av en redovisningskunnig. SoloLedger har ännu inget självserviceflöde för att godkänna detta underlag. Skapa inte en extra bokslutsbokning för att komma förbi spärren.'

export function parseResultClosingReview(value: unknown, year?: number): ResultClosingReview {
  if (!value || typeof value !== 'object') throw new Error('Kontrollen av bokslutsposter saknas. Resultatunderlaget kan inte verifieras.')
  const r = value as ResultClosingReview
  if (r.version !== 1 || !Number.isInteger(r.year) || r.year < 1900 || r.year > 9998 ||
    (year !== undefined && r.year !== year) || !/^\d{4}-\d{2}-\d{2}$/.test(r.through_date) ||
    Number(r.through_date.slice(0, 4)) !== r.year || typeof r.blocked !== 'boolean' || !Array.isArray(r.entries) ||
    r.blocked !== (r.entries.length > 0) || r.entries.some(e => !e || typeof e.transaction_id !== 'string' ||
      !e.transaction_id || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isInteger(e.ver_nr) ||
      !Array.isArray(e.journal_dates) || !e.journal_dates.length || e.journal_dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)) ||
      !Array.isArray(e.accounts) || !e.accounts.length || e.accounts.some(a => typeof a !== 'string' || !a))) {
    throw new Error('Kontrollen av bokslutsposter är ofullständig. Resultatunderlaget kan inte verifieras.')
  }
  return r
}
