/** Narrow BAS-based income-tax adjustments. No VAT deduction inference or I/O.
 * Sources and limits: docs/reviews/KAN-91-ne-tax-adjustments.md.
 * Explicit subaccounts describe amounts already separated in the journal;
 * group accounts must never imply that every expense is non-deductible.
 */
export interface NeTaxReview {
  accountNumber: string
  balance: number
  reason: string
}

export function getNeTaxReviewReason(accountNumber: string): string | null {
  if (/^(7[0-6]\d{2}|27\d{2}|282\d|29[1-5]\d|161\d|1382)$/.test(accountNumber)) {
    return 'Personalrelaterat konto: SoloLedger är byggt för enskild firma utan anställda. Bokförda belopp bevaras, men NE-behandlingen behöver granskas. Ingen skattejustering gissas. Granska underlaget med en redovisningskunnig före deklaration.'
  }
  if (/^607\d$/.test(accountNumber) && !['6071', '6072'].includes(accountNumber)) {
    return 'Representation kan innehålla både avdragsgilla och ej avdragsgilla delar. Kontosaldot räcker inte för att bestämma R13. Granska fördelningen före deklaration; momsavdrag bedöms separat.'
  }
  if (/^698\d$/.test(accountNumber) && !['6981', '6982'].includes(accountNumber)) {
    return 'Föreningsavgifter kan innehålla medlemsavgift utan avdragsrätt och serviceavgift med avdragsrätt. Kontosaldot räcker inte för att bestämma R13. Granska fördelningen före deklaration.'
  }
  return null
}

export function calculateNeTaxAdjustments(balances: Record<string, number>) {
  let R13 = 0
  let R14 = 0
  const reviews: NeTaxReview[] = []
  for (const [rawAccount, rawBalance] of Object.entries(balances)) {
    const account = rawAccount.trim()
    const balance = Number(rawBalance)
    if (!Number.isFinite(balance) || balance === 0) continue
    // Preserve signs: credit reversals reduce R13; debit reversals reduce R14.
    if (['6072', '6982', '6992'].includes(account)) R13 += balance
    if (account === '8314') R14 -= balance
    const reason = getNeTaxReviewReason(account)
    if (reason) reviews.push({ accountNumber: account, balance, reason })
  }
  return {
    R13: Math.round(R13 * 100) / 100,
    R14: Math.round(R14 * 100) / 100,
    reviews,
  }
}
