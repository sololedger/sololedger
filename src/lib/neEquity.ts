/** B10 only. Balances use debit minus credit, cumulatively through year end.
 * The business result intentionally excludes 899x. Equity must include their
 * signed net movement: a debit transfer to 2019 has already increased capital.
 * Do not remove 2019/2010: they can contain genuine imported opening capital.
 * This is a report calculation, never a new year-end/opening journal.
 */
export function calculateNeEquityResult(
  balances: Record<string, number>,
  businessResult: number,
) {
  const technicalResultBalance = Math.round(Object.entries(balances)
    .filter(([account]) => /^899\d$/.test(account.trim()))
    .reduce((sum, [, balance]) => sum + balance, 0) * 100) / 100

  return {
    technicalResultBalance,
    resultAfterTransfers: Math.round((businessResult - technicalResultBalance) * 100) / 100,
  }
}
