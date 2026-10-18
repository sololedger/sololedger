import { calculateNeBalanceRows, type BalanceMap } from './neBalance'
import { calculateBusinessResult, classifyResultAccount } from './resultEngine'
import { getNeTaxReviewReason } from './neTaxAdjustments'
import type { NeSalesClassificationSummary } from './neSalesClassification'

export interface NeAccountCoverage {
  accountNumber: string
  balance: number
  period: 'annual' | 'cumulative'
  status: 'mapped' | 'excluded' | 'review'
  handling: string
  reason: string
}

/** Audit of the existing calculation, not a new BAS/SRU mapping or tax rule.
 * Probe the actual balance calculator rather than maintaining another range table.
 * Opposite-sign balances are reviewed individually before any clipping/netting.
 */
export function collectNeAccountCoverage(
  annual: BalanceMap,
  cumulative: BalanceMap,
  sales: NeSalesClassificationSummary,
): NeAccountCoverage[] {
  const rows: NeAccountCoverage[] = []
  const resultWarnings = calculateBusinessResult(annual).warnings
  for (const [accountNumber, balance] of Object.entries(annual)) {
    if (!/^[3-8]\d{3}$/.test(accountNumber) || balance === 0) continue
    const row: NeAccountCoverage = {
      accountNumber, balance, period: 'annual', status: 'review',
      handling: 'Ingen säker NE-ruta', reason: '',
    }
    if (/^899\d$/.test(accountNumber)) {
      row.status = 'excluded'
      row.handling = 'Tekniskt resultatkonto'
      row.reason = 'Undantas från R-raderna enligt befintlig resultatregel för att inte räkna resultatet en gång till.'
    } else {
      const classification = classifyResultAccount(accountNumber)
      const warning = resultWarnings.find(item => item.accountNumber === accountNumber)
      if (classification?.status === 'fixed' && classification.neRow) {
        row.status = 'mapped'
        row.handling = accountNumber === '3010' ? 'R1/R2 enligt sparat underlag' : classification.neRow
        row.reason = 'Ingår enligt befintlig kontokoppling. Kontrollen verifierar inte skattejusteringar eller kontots användning.'
      } else {
        row.reason = warning?.message ?? 'Kontot saknar säker NE-hantering.'
      }
      if (accountNumber === '3010' && sales.reviewRequired) {
        row.status = 'review'
        row.reason = 'R1/R2-underlaget behöver granskas. Dagens momsprofil ersätter inte sparade historiska beslut.'
      }
      const taxReason = getNeTaxReviewReason(accountNumber)
      if (taxReason) {
        row.status = 'review'
        row.reason = taxReason
      } else if (['6072', '6982', '6992', '8314'].includes(accountNumber)) {
        row.handling += accountNumber === '8314' ? ' och avdrag i R14' : ' och återläggning i R13'
        row.reason = 'Skattejusteras enligt BAS-kontots uttryckliga innebörd. Kontrollera att endast den ej avdragsgilla kostnaden respektive skattefria intäkten har bokförts på kontot.'
      }
    }
    rows.push(row)
  }

  for (const [accountNumber, balance] of Object.entries(cumulative)) {
    if (!/^[12]\d{3}$/.test(accountNumber) || balance === 0) continue
    const row: NeAccountCoverage = {
      accountNumber, balance, period: 'cumulative', status: 'review',
      handling: 'Ingen säker NE-ruta', reason: 'SoloLedger kan ännu inte placera kontots saldo i en NE-ruta. Kontrollera vad bokningarna gäller och ta hjälp med rätt ruta före deklaration.',
    }
    if (['2010', '2011', '2012', '2013', '2014', '2017', '2018', '2019'].includes(accountNumber)) {
      row.status = 'mapped'
      row.handling = 'B10'
      row.reason = 'Ingår i befintlig beräkning av eget kapital med bibehållet tecken.'
    } else {
      // Positive asset / negative liability probe identifies the implemented route,
      // including the deliberate tax netting between B8 and B14.
      const probe = calculateNeBalanceRows({ [accountNumber]: accountNumber.startsWith('1') ? 1 : -1 }, 0)
      const target = (['B1','B2','B3','B4','B5','B6','B7','B8','B9','B13','B14','B15','B16'] as const)
        .find(key => probe[key] !== 0)
      if (target) {
        row.status = 'mapped'
        row.handling = target
        row.reason = 'Ingår enligt befintlig kontokoppling.'
        if (target === 'B14') {
          row.handling = 'B8/B14'
          row.reason = 'Ingår i befintlig nettning av moms och skatt: fordran i B8 eller skuld i B14.'
        } else if ((accountNumber.startsWith('1') && balance < 0) || (accountNumber.startsWith('2') && balance > 0)) {
          row.status = 'review'
          row.reason = 'Saldot går åt motsatt håll mot den här tillgångs- eller skuldgruppen. Det kan vara korrekt, till exempel vid en bokförd värdeminskning, men beloppet kan döljas när konton räknas ihop. Kontrollera bokningarna för kontot före deklaration.'
        }
      }
    }
    const scopeReason = getNeTaxReviewReason(accountNumber)
    if (scopeReason) {
      row.status = 'review'
      row.reason = scopeReason
    }
    if (!Number.isFinite(balance)) {
      row.status = 'review'
      row.reason = 'Kontosaldot är ogiltigt och kan inte verifieras.'
    }
    rows.push(row)
  }
  return rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
}
