import type { SieParseResult } from './sieParser'

// Shared pure mapping. Keep the historical canonical hash byte-compatible.
export async function buildSieImportPayload(parseResult: SieParseResult, filename: string) {
  const fileHash = await computeCanonicalHash(parseResult)
  const payload = {
    filename,
    file_hash: fileHash,
    company_name: parseResult.companyName,
    org_nr: parseResult.orgNr,
    fiscal_year: parseResult.year,
    closing_balances: parseResult.closingBalances,
    opening_balances: parseResult.openingBalances.map((ob) => ({
      account_number: ob.accountNumber,
      amount: ob.amount,
    })),
    previous_year_result_balances: parseResult.previousYearResultBalances.map((res) => ({
      account_number: res.accountNumber,
      amount: res.amount,
    })),
    verifications: parseResult.verifications.map((v) => ({
      series: v.series,
      ver_number: v.verNumber,
      date: v.date,
      description: v.description,
      rows: v.transactions.map((t) => ({
        account_number: t.accountNumber,
        amount: t.amount,
        date: t.transDate ?? v.date,
        description: t.description ?? null,
      })),
    })),
  }


  return payload
}

export async function computeCanonicalHash(parseResult: SieParseResult): Promise<string> {
  const openingBalanceLines = parseResult.openingBalances
    .map((ob) => `${ob.accountNumber}:${ob.amount.toFixed(2)}`)
    .sort()

  const verificationLines = parseResult.verifications
    .map((v) => {
      const rows = v.transactions
        .map((t) => `${t.accountNumber}:${t.amount.toFixed(2)}`)
        .sort()
        .join(',')
      return `${v.series}${v.verNumber}|${v.date}|${v.description}|${rows}`
    })
    .sort()

  const canonical = [
    parseResult.companyName ?? '',
    parseResult.orgNr ?? '',
    String(parseResult.year ?? ''),
    ...openingBalanceLines,
    ...verificationLines,
  ].join('\n')

  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}