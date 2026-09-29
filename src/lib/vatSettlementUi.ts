import type { VatLifecyclePeriodLike } from './vatLifecycleUi'

export type VatSettlementDirection = 'payable' | 'refund'
export type VatSettlementState =
  | 'unsettled'
  | 'partially_settled'
  | 'fully_settled'

export type TaxAccountEventKind = 'vat_debit' | 'vat_credit'

export interface TaxAccountEventLike {
  id: string
  vat_period_id: string
  event_kind: TaxAccountEventKind
  event_date: string
  amount: number
  created_at: string
}

export interface VatSettlementReadModel {
  actionable: boolean
  direction: VatSettlementDirection | null
  totalAmount: number
  registeredAmount: number
  remainingAmount: number
  state: VatSettlementState
  events: TaxAccountEventLike[]
  legacyMissingDeclarationDate: boolean
}

export interface VatSettlementIntent {
  periodId: string
  eventDate: string
  amount: number
}

export interface VatSettlementIdempotencyState {
  intent: VatSettlementIntent | null
  key: string | null
}

export interface VatSettlementValidationInput {
  eventDate: string
  amountText: string
  todayIso: string
  remainingAmount: number
}

export interface VatSettlementValidationResult {
  ok: boolean
  amount: number | null
  message: string | null
}

export interface VatSettlementSubmitGateInput {
  hasSelectedPeriod: boolean
  hasSelectedContext: boolean
  canSubmitSettlement: boolean
  amount: number | null
  inFlight: boolean
}

export const EMPTY_SETTLEMENT_IDEMPOTENCY_STATE: VatSettlementIdempotencyState = {
  intent: null,
  key: null,
}

export interface VatSettlementSelectionContext {
  periodId: string | null
  contextKey: string | null
}

export function fromSettlementOre(ore: number) {
  return ore / 100
}

export function toSettlementOre(value: number | string | null | undefined) {
  if (value == null) return 0

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
    if (!match) {
      const numeric = Number(normalized)
      return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
    }
    const sign = match[1] === '-' ? -1 : 1
    const whole = Number(match[2])
    const cents = Number((match[3] ?? '').padEnd(2, '0'))
    return sign * (whole * 100 + cents)
  }

  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100)
}

export function parseSettlementAmountOre(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return null

  const whole = Number(match[1])
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  const ore = whole * 100 + cents
  return Number.isSafeInteger(ore) ? ore : null
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

function isValidSettlementDateOnly(value: string) {
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

function sameIntent(
  left: VatSettlementIntent | null,
  right: VatSettlementIntent
) {
  return (
    left?.periodId === right.periodId &&
    left.eventDate === right.eventDate &&
    left.amount === right.amount
  )
}

export function canStartVatSettlementSubmit(input: VatSettlementSubmitGateInput) {
  return Boolean(
    input.hasSelectedPeriod &&
      input.hasSelectedContext &&
      input.canSubmitSettlement &&
      input.amount &&
      !input.inFlight
  )
}

export function deriveVatSettlementReadModel(
  period: VatLifecyclePeriodLike | null,
  events: TaxAccountEventLike[]
): VatSettlementReadModel {
  const closingOre = toSettlementOre(period?.closing_amount ?? 0)
  const direction: VatSettlementDirection | null =
    closingOre > 0 ? 'payable' : closingOre < 0 ? 'refund' : null
  const totalOre = Math.abs(closingOre)
  const registeredOre = events.reduce(
    (sum, event) => sum + toSettlementOre(event.amount),
    0
  )
  const remainingOre = Math.max(totalOre - registeredOre, 0)
  const totalAmount = fromSettlementOre(totalOre)
  const registeredAmount = fromSettlementOre(registeredOre)
  const remainingAmount = fromSettlementOre(remainingOre)
  const state: VatSettlementState =
    registeredOre <= 0
      ? 'unsettled'
      : remainingOre <= 0
      ? 'fully_settled'
      : 'partially_settled'

  return {
    actionable: Boolean(
      period?.source === 'sololedger' &&
        period.status === 'declared' &&
        totalAmount > 0
    ),
    direction,
    totalAmount,
    registeredAmount,
    remainingAmount,
    state,
    events,
    legacyMissingDeclarationDate: Boolean(
      period?.source === 'sololedger' &&
        period.status === 'declared' &&
        !period.skv_submitted_on
    ),
  }
}

export function payableOrRefundHeading(direction: VatSettlementDirection) {
  return direction === 'payable' ? 'Moms att betala' : 'Moms att få tillbaka'
}

export function settlementQuestion(direction: VatSettlementDirection) {
  return direction === 'payable'
    ? 'Har Skatteverket dragit momsen från ditt skattekonto?'
    : 'Har Skatteverket krediterat momsen på ditt skattekonto?'
}

export function settlementAmountLabel(direction: VatSettlementDirection) {
  return direction === 'payable'
    ? 'Belopp som dragits'
    : 'Belopp som krediterats'
}

export function settlementActionLabel(direction: VatSettlementDirection) {
  return direction === 'payable'
    ? 'Registrera dragning'
    : 'Registrera kreditering'
}

export function settlementEventText(kind: TaxAccountEventKind) {
  return kind === 'vat_debit'
    ? 'Skatteverket drog moms'
    : 'Skatteverket krediterade moms'
}

export function settlementStateText(state: VatSettlementState) {
  if (state === 'fully_settled') return 'Helt avräknad'
  if (state === 'partially_settled') return 'Delvis avräknad'
  return 'Inget registrerat på skattekontot än'
}

export function parseSettlementAmountText(value: string) {
  const ore = parseSettlementAmountOre(value)
  return ore == null ? null : fromSettlementOre(ore)
}

export function validateVatSettlementInput(
  input: VatSettlementValidationInput
): VatSettlementValidationResult {
  if (!isValidSettlementDateOnly(input.eventDate)) {
    return {
      ok: false,
      amount: null,
      message: 'Välj datumet som visas på skattekontot hos Skatteverket.',
    }
  }

  if (input.eventDate > input.todayIso) {
    return {
      ok: false,
      amount: null,
      message: 'Datumet på skattekontot kan inte vara i framtiden.',
    }
  }

  const amountOre = parseSettlementAmountOre(input.amountText)
  if (amountOre == null) {
    return {
      ok: false,
      amount: null,
      message: 'Ange ett belopp med högst två decimaler.',
    }
  }

  const amount = fromSettlementOre(amountOre)
  if (amountOre <= 0) {
    return {
      ok: false,
      amount: null,
      message: 'Beloppet måste vara större än 0 kr.',
    }
  }

  if (amountOre > toSettlementOre(input.remainingAmount)) {
    return {
      ok: false,
      amount,
      message: 'Beloppet kan inte vara större än det som är kvar att registrera.',
    }
  }

  return { ok: true, amount, message: null }
}

export function prepareSettlementIdempotencyKey(
  state: VatSettlementIdempotencyState,
  intent: VatSettlementIntent,
  generateKey: () => string
): { state: VatSettlementIdempotencyState; key: string } {
  if (state.key && sameIntent(state.intent, intent)) {
    return { state, key: state.key }
  }

  const key = generateKey()
  return {
    key,
    state: {
      intent,
      key,
    },
  }
}

export function clearSettlementIdempotency(): VatSettlementIdempotencyState {
  return { ...EMPTY_SETTLEMENT_IDEMPOTENCY_STATE }
}

export function isVatSettlementSubmitContextCurrent(
  current: VatSettlementSelectionContext,
  expected: VatSettlementSelectionContext
) {
  return (
    current.periodId === expected.periodId &&
    current.contextKey === expected.contextKey
  )
}

