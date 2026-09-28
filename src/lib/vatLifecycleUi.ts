export type VatLifecycleStatus = 'open' | 'closed' | 'declared'
export type VatLifecycleSource = 'sololedger' | 'imported_history'

export interface VatLifecyclePeriodLike {
  id: string
  period_end: string
  status: VatLifecycleStatus
  source: VatLifecycleSource
  closing_amount: number | null
  declared_at: string | null
  skv_submitted_on?: string | null
}

export interface VatReportSelectionContext {
  periodId: string
  contextKey: string | null
}

export const CONFIRM_DECLARATION_BUTTON_LABEL =
  'Bekräfta inlämnad momsdeklaration'

export const DECLARATION_SUBMITTED_ON_LABEL =
  'Datum då momsdeklarationen lämnades till Skatteverket'

export const DECLARATION_DOES_NOT_SUBMIT_COPY =
  'SoloLedger skickar inte in momsdeklarationen till Skatteverket.'

export const DECLARATION_ALREADY_SUBMITTED_COPY =
  'Bekräfta bara när du redan har lämnat momsdeklarationen hos Skatteverket.'

export const VAT_RECLASSIFIED_NOT_SETTLED_COPY =
  'Momsen är omförd till redovisningskontot för moms. Den är inte betald eller avräknad än.'

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

export function formatLocalDateOnly(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function isValidDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return (
    Number.isInteger(year) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}

export function isClosedOrDeclaredSoloLedgerPeriod(
  period: VatLifecyclePeriodLike | null
) {
  return (
    period?.source === 'sololedger' &&
    (period.status === 'closed' || period.status === 'declared')
  )
}

export function shouldAutoLoadVatReport(input: {
  selectedPeriod: VatLifecyclePeriodLike | null
  hasCurrentReport: boolean
  hasCurrentReportError: boolean
  loading: boolean
  periodsLoading: boolean
}) {
  return (
    isClosedOrDeclaredSoloLedgerPeriod(input.selectedPeriod) &&
    !input.hasCurrentReport &&
    !input.hasCurrentReportError &&
    !input.loading &&
    !input.periodsLoading
  )
}

export function isVatReportRequestCurrent(
  current: VatReportSelectionContext,
  expected: VatReportSelectionContext
) {
  return (
    current.periodId === expected.periodId &&
    current.contextKey === expected.contextKey
  )
}

export function isValidSkvSubmittedOnDate(input: {
  submittedOn: string
  periodEnd: string
  todayIso: string
}) {
  return (
    isValidDateOnly(input.submittedOn) &&
    isValidDateOnly(input.periodEnd) &&
    isValidDateOnly(input.todayIso) &&
    input.submittedOn >= input.periodEnd &&
    input.submittedOn <= input.todayIso
  )
}

export function skvSubmittedOnValidationMessage(input: {
  submittedOn: string
  periodEnd: string
  todayIso: string
}) {
  if (!isValidDateOnly(input.submittedOn)) {
    return 'Välj datumet då momsdeklarationen lämnades till Skatteverket.'
  }

  if (input.submittedOn < input.periodEnd) {
    return 'Datumet kan inte vara före momsperiodens slut.'
  }

  if (input.submittedOn > input.todayIso) {
    return 'Datumet kan inte vara i framtiden.'
  }

  return null
}

export function vatDeclarationStatusText(
  period: VatLifecyclePeriodLike,
  formatDate: (date: string) => string
) {
  if (period.status !== 'declared') return null

  if (period.skv_submitted_on) {
    return `Momsdeklaration inlämnad till Skatteverket: ${formatDate(period.skv_submitted_on)}`
  }

  return 'Deklarerad i SoloLedger. Datum för inlämning till Skatteverket saknas för den här äldre perioden.'
}

export function vatClosingObligationText(
  period: VatLifecyclePeriodLike,
  formatAmount: (amount: number) => string
) {
  if (period.closing_amount == null || period.status === 'open') return null

  const amount = Math.abs(period.closing_amount)
  if (period.closing_amount > 0) return `Moms att betala: ${formatAmount(amount)} kr`
  if (period.closing_amount < 0) return `Moms att få tillbaka: ${formatAmount(amount)} kr`
  return 'Moms att betala/få tillbaka: 0,00 kr'
}
