// Explanation of the existing NE output. No independent account-to-NE rules or I/O.
import { collectNeAccountCoverage, type NeAccountCoverage } from './neAccountCoverage'
import { calculateBusinessResult, type ResultWarning } from './resultEngine'
import { calculateNeTaxAdjustments, type NeTaxReview } from './neTaxAdjustments'
import { allocateNeSales, type NeSalesClassificationSummary } from './neSalesClassification'
import { getBasAccountHelp } from './accountingKnowledge'
import { calculateNeBalanceDiff } from './neBalance'

export type NeReviewPeriod = 'annual' | 'cumulative'
export interface NeReviewEntry {
  id: string; transactionId: string; date: string; journalDate: string; description: string; rowDescription?: string | null; verNr: number | null
  debit: number; credit: number; vatRate: number | null; decision?: { row: 'R1' | 'R2'; basis: string }
}
interface ReviewReport {
  reviewSources?: { annual: Record<string, number>; cumulative: Record<string, number> }
  neSalesClassification: NeSalesClassificationSummary
  warnings: ResultWarning[]; taxReviews: NeTaxReview[]; equityReviewRequired?: boolean
  R1: number; R2: number; R3: number; R4: number; R5: number; R6: number; R7: number; R8: number; R9: number; R10: number
  R11: number; R12: number; R13: number; R14: number; R15: number; R16: number; R17: number
  B1: number; B2: number; B3: number; B4: number; B5: number; B6: number; B7: number; B8: number; B9: number; B10_total: number; B13: number; B14: number; B15: number; B16: number
  IB_kapital: number; insattningar: number; uttag: number; unclassifiedNegativeBankBalance: number
  negativeBankBalances: { accountNumber: string; balance: number; amount: number }[]
}
export interface NeReviewAccount extends NeAccountCoverage { name: string; nameSource: string; contribution?: number }
export interface NeReviewGroup { id: string; title: string; amount: number | null; explanation: string; accounts: NeReviewAccount[] }
export interface NeReviewData { groups: NeReviewGroup[]; reviews: { account: string; reason: string; next: string }[]; sales: NeReviewEntry[] }
const round = (v: number) => Math.round(v * 100) / 100
const taxProbe = (account: string) => calculateNeTaxAdjustments({ [account]: 1 }) // Identify existing rule, never a posted/displayed amount.
function named(row: NeAccountCoverage): NeReviewAccount {
  const name = getBasAccountHelp(row.accountNumber)
  return { ...row, name: name ?? 'Kontonamn saknas', nameSource: name ? 'SoloLedgers kuraterade BAS-hjälp; inte verifierat importnamn' : 'Inget verifierat namn tillgängligt' }
}

export function buildNeReview(report: ReviewReport, sales: NeReviewEntry[]): NeReviewData {
  if (!report.reviewSources || !report.neSalesClassification.available) throw new Error('Fullständigt NE-underlag saknas.')
  const { annual, cumulative } = report.reviewSources
  for (const balances of [annual, cumulative]) for (const [account, balance] of Object.entries(balances)) {
    if (!/^[1-8]\d{3}$/.test(account) || !Number.isFinite(balance)) throw new Error('Ett använt konto eller belopp kan inte verifieras. Ingen fullständighetsbedömning kan visas.')
  }
  // Reconcile per-row historical decisions with the authoritative summary, even at net zero.
  const salesBalance = round(sales.reduce((n, row) => n + row.debit - row.credit, 0))
  const r2 = round(sales.filter(row => row.decision?.row === 'R2').reduce((n, row) => n + row.credit - row.debit, 0))
  const unresolved = sales.filter(row => !row.decision && Number(row.vatRate ?? 0) === 0 && (row.debit !== 0 || row.credit !== 0))
  if (salesBalance !== (annual['3010'] ?? 0) || r2 !== report.neSalesClassification.r2Reallocation || unresolved.length !== report.neSalesClassification.unresolvedCount || round(unresolved.reduce((n, row) => n + Math.abs(row.credit - row.debit), 0)) !== report.neSalesClassification.unresolvedAmount) throw new Error('NE-beslut och rapportunderlag stämmer inte överens. Öppna kontrollen igen.')
  const coverage = collectNeAccountCoverage(annual, cumulative, report.neSalesClassification, { includeZeroBalances: true }).map(named)
  const groups: NeReviewGroup[] = []
  const add = (id: string, title: string, amount: number | null, explanation: string, accounts: NeReviewAccount[]) => groups.push({ id, title, amount, explanation, accounts })
  for (let i = 1; i <= 10; i++) {
    const id = `R${i}` as keyof ReturnType<typeof calculateBusinessResult>['neRows']
    const accounts = coverage.filter(row => row.period === 'annual' && row.status !== 'excluded').flatMap(row => {
      const result = calculateBusinessResult({ [row.accountNumber]: row.balance })
      const probe = calculateBusinessResult({ [row.accountNumber]: 1 })
      if (row.accountNumber === '3010') {
        if (!['R1', 'R2'].includes(id)) return []
        const allocated = allocateNeSales(result.neRows, report.neSalesClassification)
        return [{ ...row, contribution: allocated[id] }]
      }
      if (!probe.neRows[id]) return []
      return [{ ...row, contribution: result.neRows[id] }]
    })
    add(id, 'Direkt resultatkoppling', report[id], 'Årets rörelser. Bidraget följer befintlig resultatmotor. Preliminära kopplingar och granskningsbehov gäller fortfarande.', accounts)
  }
  const annualResults = coverage.filter(row => row.period === 'annual' && row.status !== 'excluded')
  add('R11', 'Bokfört resultat', report.R11, 'Beräknat verksamhetsresultat enligt befintlig motor, även resultatkonton som ännu saknar säker R-ruta. 899x undantas. Kontosaldona nedan är inte positiva belopp att summera direkt.', annualResults)
  add('R12', 'Överfört bokfört resultat', report.R12, 'Samma beräknade belopp som R11.', [])
  for (const id of ['R13', 'R14'] as const) add(id, 'Skattejustering', report[id], 'Justering utöver bokfört resultat. Samma konto kan också ingå i en vanlig R-ruta; detta är inte en extra bokföringspost.', annualResults.filter(row => taxProbe(row.accountNumber)[id] !== 0).map(row => ({ ...row, contribution: calculateNeTaxAdjustments({ [row.accountNumber]: row.balance })[id] })))
  for (const id of ['R15', 'R16'] as const) add(id, 'Uppgifter utanför bokföringen', report[id], 'Befintlig beräkning sätter denna ruta till 0. Vyn har inga uppgifter om eventuella obokförda skattejusteringar; 0 betyder inte att behovet är kontrollerat.', [])
  add('R17', 'Sammanlagt resultat', report.R17, 'Befintlig beräkning: R12 + R13 − R14 + R15 − R16. Se underlagen för respektive ruta.', [])
  for (const id of ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B13','B14','B15','B16'] as const) {
    add(id, 'Utgående balans', report[id], ['B8','B14'].includes(id)
      ? 'Saldo till årets slut. Moms/skatt nettas gemensamt mellan B8 och B14. Enskilda kontosaldon är förklarande underlag och summerar inte direkt till rutans belopp.'
      : 'Saldo till årets slut, inklusive tidigare år och importerad IB. Befintlig nettning, teckenhantering och nollbegränsning gäller; enskilda kontosaldon är förklarande underlag.', coverage.filter(row => row.period === 'cumulative' && (row.handling === id || (row.handling === 'B8/B14' && ['B8','B14'].includes(id)))))
  }
  const equity = coverage.filter(row => row.period === 'cumulative' && row.handling === 'B10')
  const cumulativeResults = collectNeAccountCoverage(cumulative, {}, report.neSalesClassification, { includeZeroBalances: true }).filter(row => row.period === 'annual').map(row => named({ ...row, period: 'cumulative', handling: 'Resultatdelen i B10', reason: /^899\d$/.test(row.accountNumber) ? 'Tekniskt resultatkonto nettas teckenriktigt i B10; undantas från R-raderna.' : 'Kumulativ resultatdel till årets slut. Årets R-rader räknas separat.' }))
  add('B10', 'Beräknat eget kapital', report.B10_total, 'Kapital på 2010/2019 + kumulativt resultat efter bokförda 899x-överföringar + egna insättningar − uttag/skatteavräkning. Ingen extra IB- eller resultatöverföring skapas. Underlaget summerar inte direkt som positiva kontobelopp.', [...equity, ...cumulativeResults])
  add('Övrigt', 'Undantag eller ingen säker ruta', null, 'Använda konton visas även med nettosaldo 0. Ett uttryckligt undantag är inte ett beslut om att bokföringen är korrekt.', coverage.filter(row => row.status === 'excluded' || row.handling === 'Ingen säker NE-ruta'))
  for (const group of groups) {
    if (group.amount != null && !Number.isFinite(group.amount)) throw new Error('NE-beloppet kunde inte verifieras.')
    if (/^R([1-9]|10|13|14)$/.test(group.id) && round(group.accounts.reduce((sum, row) => sum + (row.contribution ?? 0), 0)) !== group.amount) throw new Error('Kontounderlag och NE-ruta stämmer inte överens. Öppna kontrollen igen.')
  }
  const reviews = coverage.filter(row => row.status === 'review').map(row => ({ account: row.accountNumber, reason: row.reason, next: 'Öppna bokföringsposterna och jämför med underlaget. Ta hjälp av en redovisningskunnig om bedömningen är osäker.' }))
  for (const warning of report.warnings) if (!reviews.some(r => r.account === warning.accountNumber && r.reason === warning.message)) reviews.push({ account: warning.accountNumber, reason: warning.message, next: 'Granska underlaget före deklaration; ingen NE-ruta gissas.' })
  for (const review of report.taxReviews) if (!reviews.some(r => r.account === review.accountNumber && r.reason === review.reason)) reviews.push({ account: review.accountNumber, reason: review.reason, next: 'Granska skattebehandlingen före deklaration. Ändra inte bokföringen enbart för att släcka varningen.' })
  if (report.equityReviewRequired) reviews.push({ account: 'B10', reason: 'Kontrollera bokslutsverifikationerna. Resultatöverföringar nettas i B10; helt nollade externa resultatkonton återskapas inte till R11/R17.', next: 'Stäm av mot det externa bokslutet före deklaration.' })
  if (report.neSalesClassification.reviewRequired) reviews.push({ account: '3010', reason: `${report.neSalesClassification.unresolvedCount} intäktsrader saknar sparat R1/R2-underlag. Fördelningen är preliminär.`, next: 'Jämför de enskilda journalraderna med försäljningsunderlaget. Dagens momsprofil avgör inte historiken.' })
  if (report.unclassifiedNegativeBankBalance > 0) reviews.push({ account: 'Kassa/bank', reason: 'Negativt banksaldo saknar säker skuldklassificering.', next: 'Stäm av bankkontot och eventuell kredit. Vyn bokför eller klassificerar inget.' })
  if (Math.abs(calculateNeBalanceDiff(report)) > 1) reviews.push({ account: 'Balansräkningen', reason: 'Tillgångar matchar inte eget kapital och skulder enligt befintlig balanskontroll.', next: 'Stäm av underlaget före deklaration. En differens ska inte döljas genom omklassificering i granskningsvyn.' })
  const titles: Record<string, string> = { R1: 'Momspliktiga intäkter', R2: 'Momsfria intäkter', R3: 'Bil- och bostadsförmån m.m.', R4: 'Ränteintäkter m.m.', R5: 'Varor, material och tjänster', R6: 'Övriga externa kostnader', R7: 'Anställd personal', R8: 'Räntekostnader m.m.', R9: 'Avskrivningar byggnader/mark', R10: 'Avskrivningar inventarier m.m.', R13: 'Ej avdragsgilla kostnader', R14: 'Bokförda intäkter som inte ska tas upp', B1: 'Immateriella anläggningstillgångar', B2: 'Byggnader och markanläggningar', B3: 'Mark och andra tillgångar', B4: 'Maskiner och inventarier', B5: 'Övriga anläggningstillgångar', B6: 'Varulager', B7: 'Kundfordringar', B8: 'Övriga fordringar', B9: 'Kassa och bank', B13: 'Låneskulder', B14: 'Skatteskulder', B15: 'Leverantörsskulder', B16: 'Övriga skulder' }
  for (const group of groups) group.title = titles[group.id] ?? group.title
  return { groups, reviews, sales }
}
