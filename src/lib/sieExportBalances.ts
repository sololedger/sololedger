type JournalRow = {
  transaction_id: string
  account_number: string
  debit: number | string | null
  credit: number | string | null
}

const message = 'SIE-exporten stoppades eftersom balansunderlaget inte går att stämma av. Ladda om och försök igen. Om felet kvarstår behöver bokföringsunderlaget granskas.'
const fail = (): never => { throw new Error(message) }
const add = (a: number, b: number) => {
  const result = a + b
  if (!Number.isSafeInteger(result)) fail()
  return result
}

function cents(value: number | string | null): number {
  const amount = Number(value)
  const rounded = Math.round(amount * 100)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(rounded) || Math.abs(amount * 100 - rounded) > 0.00001) fail()
  return rounded
}

function sumRows(rows: readonly JournalRow[]) {
  const accounts: Record<string, number> = {}
  const transactions: Record<string, number> = {}
  for (const row of rows) {
    const account = row.account_number
    if (!/^[1-8]\d{3}$/.test(account) || !row.transaction_id) fail()
    const debit = cents(row.debit), credit = cents(row.credit)
    if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) fail()
    const amount = debit - credit
    accounts[account] = add(accounts[account] ?? 0, amount)
    transactions[row.transaction_id] = add(transactions[row.transaction_id] ?? 0, amount)
  }
  if (Object.values(transactions).some(value => value !== 0)) fail()
  return accounts
}

function rawBalances(values: Record<string, number>) {
  const result: Record<string, number> = {}
  for (const [account, value] of Object.entries(values)) {
    if (!/^[12]\d{3}$/.test(account)) fail()
    result[account] = cents(value)
  }
  return result
}

const balanceOnly = (values: Record<string, number>) => Object.fromEntries(
  Object.entries(values).filter(([account]) => /^[12]/.test(account)),
)
const total = (values: Record<string, number>) => Object.values(values).reduce(add, 0)
const money = (values: Record<string, number>) => Object.fromEntries(
  Object.entries(values).map(([account, value]) => [account, value / 100]),
)

/** Export representation only: never creates or changes a journal entry.
 * Carry = signed cumulative 3000–8999 balance before the export year, INCLUDING
 * 899x. A posted debit on 8999 / credit on 2019 reduces carry exactly once.
 * Retain all real capital accounts; add only the untransferred prior result to
 * 2010 in BOTH IB and UB. Current-year result and all #TRANS stay unchanged.
 */
export function reconcileSieExportBalances(
  historicalRows: readonly JournalRow[],
  currentRows: readonly JournalRow[],
  openingTransactionIds: ReadonlySet<string>,
  previousBalances: Record<string, number>,
  currentBalances: Record<string, number>,
) {
  const historical = sumRows(historicalRows)
  const current = sumRows(currentRows)
  const previous = rawBalances(previousBalances)
  const closing = rawBalances(currentBalances)
  const historicalBalance = balanceOnly(historical)
  const currentBalance = balanceOnly(current)
  // Independent balance reads must match the actual rows. A discrepancy must
  // never become an inferred equity adjustment (including concurrent writes).
  for (const account of new Set([...Object.keys(previous), ...Object.keys(closing), ...Object.keys(historicalBalance), ...Object.keys(currentBalance)])) {
    if ((previous[account] ?? 0) !== (historicalBalance[account] ?? 0)) fail()
    if ((closing[account] ?? 0) !== add(historicalBalance[account] ?? 0, currentBalance[account] ?? 0)) fail()
  }
  const openingRows = currentRows.filter(row => openingTransactionIds.has(row.transaction_id))
  if (openingRows.some(row => !/^[12]/.test(row.account_number))) fail()
  const opening = sumRows(openingRows)
  const carry = total(Object.fromEntries(Object.entries(historical).filter(([account]) => /^[3-8]/.test(account))))
  const ib = { ...previous }
  for (const [account, value] of Object.entries(opening)) ib[account] = add(ib[account] ?? 0, value)
  if (carry !== 0) {
    ib['2010'] = add(ib['2010'] ?? 0, carry)
    closing['2010'] = add(closing['2010'] ?? 0, carry)
  }
  const result = Object.fromEntries(Object.entries(current).filter(([account]) => /^[3-8]/.test(account)))
  if (total(ib) !== 0 || add(total(closing), total(result)) !== 0) fail()
  const regular = balanceOnly(sumRows(currentRows.filter(row => !openingTransactionIds.has(row.transaction_id))))
  for (const account of new Set([...Object.keys(ib), ...Object.keys(closing), ...Object.keys(regular)])) {
    if ((closing[account] ?? 0) !== add(ib[account] ?? 0, regular[account] ?? 0)) fail()
  }
  return { opening: money(ib), closing: money(closing) }
}
