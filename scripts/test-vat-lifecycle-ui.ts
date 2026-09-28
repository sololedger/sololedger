import {
  CONFIRM_DECLARATION_BUTTON_LABEL,
  DECLARATION_ALREADY_SUBMITTED_COPY,
  DECLARATION_DOES_NOT_SUBMIT_COPY,
  DECLARATION_SUBMITTED_ON_LABEL,
  formatLocalDateOnly,
  isValidDateOnly,
  isValidSkvSubmittedOnDate,
  isVatReportRequestCurrent,
  skvSubmittedOnValidationMessage,
  shouldAutoLoadVatReport,
  vatClosingObligationText,
  vatDeclarationStatusText,
  type VatLifecyclePeriodLike,
} from '../src/lib/vatLifecycleUi.ts'
import { buildDeclareVatPeriodRpcArgs } from '../src/lib/vatDeclarationRpc.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function period(
  overrides: Partial<VatLifecyclePeriodLike> = {}
): VatLifecyclePeriodLike {
  return {
    id: 'period-1',
    period_end: '2026-03-31',
    status: 'closed',
    source: 'sololedger',
    closing_amount: 4000,
    declared_at: null,
    skv_submitted_on: null,
    ...overrides,
  }
}

const formatDate = (value: string) => value
const formatAmount = (value: number) =>
  value.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
const normalizeSpace = (value: string | null | undefined) =>
  value?.replace(/\u00a0/g, ' ') ?? value

assert(
  CONFIRM_DECLARATION_BUTTON_LABEL === 'Bekräfta inlämnad momsdeklaration',
  'Declaration button uses the approved wording'
)

assert(
  DECLARATION_DOES_NOT_SUBMIT_COPY.includes('skickar inte in'),
  'Declaration copy says SoloLedger does not submit to Skatteverket'
)

assert(
  DECLARATION_ALREADY_SUBMITTED_COPY.includes('redan har lämnat'),
  'Declaration copy says the user must already have submitted externally'
)

assert(
  DECLARATION_SUBMITTED_ON_LABEL ===
    'Datum då momsdeklarationen lämnades till Skatteverket',
  'Submission-date label is the approved Swedish copy'
)

const rpcArgs = buildDeclareVatPeriodRpcArgs(
  '11111111-1111-1111-1111-111111111111',
  '2026-04-12'
)

assert(
  rpcArgs.p_vat_period_id === '11111111-1111-1111-1111-111111111111',
  'Declaration service payload includes period id'
)

assert(
  rpcArgs.p_skv_submitted_on === '2026-04-12',
  'Declaration service payload includes Skatteverket submission date'
)

assert(
  formatLocalDateOnly(new Date(2026, 3, 12)) === '2026-04-12',
  'Local date-only formatting does not depend on UTC timestamp conversion'
)

assert(
  isValidDateOnly('2026-02-28') &&
    isValidDateOnly('2028-02-29') &&
    !isValidDateOnly('2026-02-29') &&
    !isValidDateOnly('2026-02-31') &&
    !isValidDateOnly('2026-04') &&
    !isValidDateOnly(''),
  'Date-only validation rejects incomplete and impossible calendar dates'
)

assert(
  isValidSkvSubmittedOnDate({
    submittedOn: '2026-04-12',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Valid submitted date at or after period end is accepted'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '2026-03-30',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Submitted date before period end is rejected'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '2026-09-29',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Future submitted date is rejected'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Incomplete submitted date is invalid'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '2026-02-31',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Impossible submitted date is invalid'
)

assert(
  skvSubmittedOnValidationMessage({
    submittedOn: '',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }) === 'Välj datumet då momsdeklarationen lämnades till Skatteverket.',
  'Incomplete submitted date gets a Swedish validation message'
)

assert(
  skvSubmittedOnValidationMessage({
    submittedOn: '2026-03-30',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }) === 'Datumet kan inte vara före momsperiodens slut.',
  'Before-period-end submitted date gets a Swedish validation message'
)

assert(
  skvSubmittedOnValidationMessage({
    submittedOn: '2026-09-29',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }) === 'Datumet kan inte vara i framtiden.',
  'Future submitted date gets a Swedish validation message'
)

assert(
  shouldAutoLoadVatReport({
    selectedPeriod: period(),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Closed SoloLedger period auto-loads when no current report exists'
)

assert(
  shouldAutoLoadVatReport({
    selectedPeriod: period({
      status: 'declared',
      declared_at: '2026-04-12T10:00:00Z',
      skv_submitted_on: '2026-04-12',
    }),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Declared SoloLedger period auto-loads when no current report exists'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period({ status: 'open', closing_amount: null }),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Open periods retain explicit calculate behavior'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period(),
    hasCurrentReport: true,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Current successful report prevents duplicate auto-load'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period(),
    hasCurrentReport: false,
    hasCurrentReportError: true,
    loading: false,
    periodsLoading: false,
  }),
  'Blocked report does not loop and declaration remains fail-closed'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period({ source: 'imported_history' }),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Imported-history periods do not auto-load as SoloLedger declarations'
)

assert(
  isVatReportRequestCurrent(
    { periodId: 'period-1', contextKey: 'ctx-1' },
    { periodId: 'period-1', contextKey: 'ctx-1' }
  ),
  'Matching report request context is accepted'
)

assert(
  !isVatReportRequestCurrent(
    { periodId: 'period-2', contextKey: 'ctx-2' },
    { periodId: 'period-1', contextKey: 'ctx-1' }
  ),
  'Stale report request cannot replace newer selected period'
)

assert(
  normalizeSpace(vatClosingObligationText(period(), formatAmount)) ===
    'Moms att betala: 4 000,00 kr',
  'Closed payable period presents VAT payable plainly'
)

assert(
  normalizeSpace(vatClosingObligationText(
    period({ closing_amount: -1500 }),
    formatAmount
  )) === 'Moms att få tillbaka: 1 500,00 kr',
  'Closed refund period presents VAT refund plainly'
)

assert(
  vatDeclarationStatusText(
    period({
      status: 'declared',
      declared_at: '2026-04-12T10:00:00Z',
      skv_submitted_on: '2026-04-12',
    }),
    formatDate
  ) === 'Momsdeklaration inlämnad till Skatteverket: 2026-04-12',
  'Declared period displays external submission date when available'
)

assert(
  vatDeclarationStatusText(
    period({
      status: 'declared',
      declared_at: '2026-04-12T10:00:00Z',
      skv_submitted_on: null,
    }),
    formatDate
  )?.includes('saknas för den här äldre perioden'),
  'Legacy declared period with NULL submission date does not invent a date'
)

const declarationReady =
  true &&
  isValidSkvSubmittedOnDate({
    submittedOn: '2026-04-12',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  })

assert(
  declarationReady,
  'Declaration button readiness requires a current successful report and valid submitted date'
)

const declarationBlockedByReportFailure =
  false &&
  isValidSkvSubmittedOnDate({
    submittedOn: '2026-04-12',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  })

assert(
  !declarationBlockedByReportFailure,
  'Report failure keeps declaration disabled'
)

const declarationBlockedByInvalidDate =
  true &&
  isValidSkvSubmittedOnDate({
    submittedOn: '',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  })

assert(
  !declarationBlockedByInvalidDate,
  'Declaration stays disabled for invalid or incomplete submitted date'
)

console.log('VAT lifecycle UI/service tests passed.')
