/** Presentation guard for the existing calendar-year model. The RPC is authoritative. */
export function yearCloseDateBlockReason(year: number, now = new Date()): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) return 'Ogiltigt räkenskapsår.'
  const stockholmYear = Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Stockholm', year: 'numeric',
  }).format(now))
  return year >= stockholmYear
    ? `År ${year} är inte avslutat. Du kan låsa året tidigast den 1 januari ${year + 1} (svensk tid).`
    : null
}
