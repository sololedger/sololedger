import type { SieParseResult } from './sieParser'

/** KAN-92: verified number/meaning collisions, not a chart detector or NE mapper.
 * BAS K1 2018: 3100 = exempt income, 3200 = benefits.
 * BAS 2026: 31xx = foreign goods sales, 32xx = VMB/reverse-charge sales.
 * Exact published accounts only; do not infer the meaning of custom subaccounts.
 * Sources and separate assessment cases: docs/reviews/KAN-92-bas-chart-review.md.
 */
const CONFLICTS: Readonly<Record<string, { normalMeaning: string; currentRow: 'R2' | 'R3' }>> = {
  '3100': { normalMeaning: 'försäljning av varor utanför Sverige', currentRow: 'R2' },
  '3105': { normalMeaning: 'försäljning av varor till land utanför EU', currentRow: 'R2' },
  '3106': { normalMeaning: 'momspliktig försäljning av varor till annat EU-land', currentRow: 'R2' },
  '3108': { normalMeaning: 'momsfri försäljning av varor till annat EU-land', currentRow: 'R2' },
  '3200': { normalMeaning: 'försäljning med vinstmarginalbeskattning eller omvänd moms', currentRow: 'R3' },
  '3211': { normalMeaning: 'försäljning med positiv vinstmarginalbeskattning, 25 %', currentRow: 'R3' },
  '3212': { normalMeaning: 'försäljning med negativ vinstmarginalbeskattning, 25 %', currentRow: 'R3' },
  '3231': { normalMeaning: 'försäljning inom byggsektorn med omvänd betalningsskyldighet för moms', currentRow: 'R3' },
}

export function getNeChartReviewReason(accountNumber: string): string | null {
  if (!Object.hasOwn(CONFLICTS, accountNumber)) return null
  const { normalMeaning, currentRow } = CONFLICTS[accountNumber]
  const k1Meaning = currentRow === 'R2' ? 'momsfria intäkter' : 'bil- och bostadsförmån m.m.'
  return `I vanlig BAS kan kontot avse ${normalMeaning}, medan SoloLedgers befintliga K1-koppling till ${currentRow} avser ${k1Meaning}. ` +
    'SoloLedger kan inte säkert avgöra kontots betydelse. Fördelningen mellan NE-rutorna är preliminär och behöver granskas mot bokföringsunderlaget före deklaration. Ingen automatisk omklassificering har gjorts.'
}

/** Preview actual movements, not unused #KONTO declarations or prior-year #RES.
 * Even offsetting original/correction rows deserve advance notice; the NE check
 * separately uses the selected year's remaining balance, like KAN-90.
 * Names, #KPTYP, VAT rate and current profile never suppress this review.
 */
export function collectSieNeChartReviews(parsed: Pick<SieParseResult, 'verifications'>): { accountNumber: string; reason: string }[] {
  const used = new Set<string>()
  for (const verification of parsed.verifications) {
    for (const row of verification.transactions) {
      if (Number.isFinite(row.amount) && row.amount !== 0) used.add(row.accountNumber)
    }
  }
  return [...used].sort().flatMap(accountNumber => {
    const reason = getNeChartReviewReason(accountNumber)
    return reason ? [{ accountNumber, reason }] : []
  })
}
