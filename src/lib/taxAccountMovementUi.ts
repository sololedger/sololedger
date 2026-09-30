import type { VatLifecyclePeriodLike } from './vatLifecycleUi'

export type TaxAccountMovementDirection = 'payable' | 'refund'
export type TaxAccountMovementState = 'unmoved' | 'partially_moved' | 'fully_moved'

export type TaxAccountMovementKind =
  | 'business_to_tax_account'
  | 'owner_private_to_tax_account'
  | 'tax_account_to_business'
  | 'tax_account_to_owner_private'

export type TaxAccountMovementChoice =
  | 'business_account'
  | 'owner_private'
  | 'tax_account_only'
  | 'not_yet'
  | 'unsure'

export interface TaxAccountMovementLike {
  id: string
  vat_period_id: string | null
  movement_kind: TaxAccountMovementKind
  movement_date: string
  amount: number
  payment_account_role: string | null
  counter_account_number: string
  created_at: string
}

export interface TaxAccountMovementReadModel {
  actionable: boolean
  direction: TaxAccountMovementDirection | null
  totalAmount: number
  registeredAmount: number
  remainingAmount: number
  state: TaxAccountMovementState
  movements: TaxAccountMovementLike[]
}

export interface TaxAccountMovementIntent {
  periodId: string | null
  movementKind: TaxAccountMovementKind
  movementDate: string
  amount: number
}

export interface TaxAccountMovementIdempotencyState {
  intent: TaxAccountMovementIntent | null
  key: string | null
}

export interface TaxAccountMovementValidationInput {
  movementDate: string
  amountText: string
  todayIso: string
  remainingAmount: number
}

export interface TaxAccountMovementValidationResult {
  ok: boolean
  amount: number | null
  message: string | null
}

export interface TaxAccountMovementSelectionContext {
  periodId: string | null
  contextKey: string | null
}

export interface TaxAccountMovementSubmitGateInput {
  hasSelectedPeriod: boolean
  hasSelectedContext: boolean
  canSubmitMovement: boolean
  amount: number | null
  movementKind: TaxAccountMovementKind | null
  inFlight: boolean
}

export interface TaxAccountMovementChoiceTransitionInput {
  currentChoice: TaxAccountMovementChoice
  previousContextKey: string | null
  nextContextKey: string | null
  previousDirection: TaxAccountMovementDirection | null
  nextDirection: TaxAccountMovementDirection | null
}

export interface TaxAccountMovementStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const EMPTY_TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STATE:
  TaxAccountMovementIdempotencyState = {
    intent: null,
    key: null,
  }

export const TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY =
  'sololedger.taxAccountMovement.idempotency.v1'

export function fromTaxAccountMovementOre(ore: number) {
  return ore / 100
}

export function toTaxAccountMovementOre(value: number | string | null | undefined) {
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

export function parseTaxAccountMovementAmountOre(value: string) {
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

function isValidMovementDateOnly(value: string) {
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
  left: TaxAccountMovementIntent | null,
  right: TaxAccountMovementIntent
) {
  return (
    left?.periodId === right.periodId &&
    left.movementKind === right.movementKind &&
    left.movementDate === right.movementDate &&
    left.amount === right.amount
  )
}

function isTaxAccountMovementKind(value: unknown): value is TaxAccountMovementKind {
  return (
    value === 'business_to_tax_account' ||
    value === 'owner_private_to_tax_account' ||
    value === 'tax_account_to_business' ||
    value === 'tax_account_to_owner_private'
  )
}

function isStoredState(value: unknown): value is TaxAccountMovementIdempotencyState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as TaxAccountMovementIdempotencyState
  const intent = candidate.intent
  return (
    typeof candidate.key === 'string' &&
    intent !== null &&
    typeof intent === 'object' &&
    (typeof intent.periodId === 'string' || intent.periodId === null) &&
    isTaxAccountMovementKind(intent.movementKind) &&
    typeof intent.movementDate === 'string' &&
    typeof intent.amount === 'number'
  )
}

export function deriveTaxAccountMovementReadModel(
  period: VatLifecyclePeriodLike | null,
  movements: TaxAccountMovementLike[]
): TaxAccountMovementReadModel {
  const closingOre = toTaxAccountMovementOre(period?.closing_amount ?? 0)
  const direction: TaxAccountMovementDirection | null =
    closingOre > 0 ? 'payable' : closingOre < 0 ? 'refund' : null
  const totalOre = Math.abs(closingOre)
  const registeredOre = movements.reduce(
    (sum, movement) => sum + toTaxAccountMovementOre(movement.amount),
    0
  )
  const remainingOre = Math.max(totalOre - registeredOre, 0)
  const totalAmount = fromTaxAccountMovementOre(totalOre)
  const registeredAmount = fromTaxAccountMovementOre(registeredOre)
  const remainingAmount = fromTaxAccountMovementOre(remainingOre)
  const state: TaxAccountMovementState =
    registeredOre <= 0
      ? 'unmoved'
      : remainingOre <= 0
      ? 'fully_moved'
      : 'partially_moved'

  return {
    actionable: Boolean(
      period?.source === 'sololedger' &&
        (period.status === 'closed' || period.status === 'declared') &&
        totalAmount > 0
    ),
    direction,
    totalAmount,
    registeredAmount,
    remainingAmount,
    state,
    movements,
  }
}

export function taxAccountMovementKindForChoice(
  direction: TaxAccountMovementDirection | null,
  choice: TaxAccountMovementChoice
): TaxAccountMovementKind | null {
  if (direction === 'payable') {
    if (choice === 'business_account') return 'business_to_tax_account'
    if (choice === 'owner_private') return 'owner_private_to_tax_account'
  }

  if (direction === 'refund') {
    if (choice === 'business_account') return 'tax_account_to_business'
    if (choice === 'owner_private') return 'tax_account_to_owner_private'
  }

  return null
}

export function defaultTaxAccountMovementChoice(
  direction: TaxAccountMovementDirection | null
): TaxAccountMovementChoice {
  return direction === 'refund' ? 'tax_account_only' : 'not_yet'
}

export function isTaxAccountMovementChoiceValidForDirection(
  direction: TaxAccountMovementDirection | null,
  choice: TaxAccountMovementChoice
) {
  if (choice === 'unsure') return true
  if (direction === 'payable') {
    return (
      choice === 'business_account' ||
      choice === 'owner_private' ||
      choice === 'not_yet'
    )
  }

  if (direction === 'refund') {
    return (
      choice === 'business_account' ||
      choice === 'owner_private' ||
      choice === 'tax_account_only'
    )
  }

  return choice === defaultTaxAccountMovementChoice(direction)
}

export function nextTaxAccountMovementChoiceForContext(
  input: TaxAccountMovementChoiceTransitionInput
): TaxAccountMovementChoice {
  const safeDefault = defaultTaxAccountMovementChoice(input.nextDirection)

  if (
    input.previousContextKey !== input.nextContextKey ||
    input.previousDirection !== input.nextDirection
  ) {
    return safeDefault
  }

  if (
    !isTaxAccountMovementChoiceValidForDirection(
      input.nextDirection,
      input.currentChoice
    )
  ) {
    return safeDefault
  }

  return input.currentChoice
}

export function taxAccountMovementQuestion(direction: TaxAccountMovementDirection) {
  return direction === 'payable'
    ? 'Hur flyttades pengarna till skattekontot?'
    : 'Vad hände med pengarna på skattekontot?'
}

export function taxAccountMovementActionLabel(kind: TaxAccountMovementKind) {
  switch (kind) {
    case 'business_to_tax_account':
      return 'Registrera överföring från företaget'
    case 'owner_private_to_tax_account':
      return 'Registrera privat betalning'
    case 'tax_account_to_business':
      return 'Registrera överföring till företaget'
    case 'tax_account_to_owner_private':
      return 'Registrera privat uttag'
  }
}

export function taxAccountMovementHistoryText(kind: TaxAccountMovementKind) {
  switch (kind) {
    case 'business_to_tax_account':
      return 'Från företagets konto till skattekontot'
    case 'owner_private_to_tax_account':
      return 'Privata pengar till skattekontot'
    case 'tax_account_to_business':
      return 'Från skattekontot till företagets konto'
    case 'tax_account_to_owner_private':
      return 'Privat uttag från skattekontot'
  }
}

export function taxAccountMovementStateText(state: TaxAccountMovementState) {
  if (state === 'fully_moved') return 'Hela beloppet hanterat'
  if (state === 'partially_moved') return 'Delvis hanterat'
  return 'Ingen pengaflytt registrerad än'
}

export function taxAccountMovementAmountLabel(direction: TaxAccountMovementDirection) {
  return direction === 'payable' ? 'Belopp som flyttades in' : 'Belopp som flyttades ut'
}

export function parseTaxAccountMovementAmountText(value: string) {
  const ore = parseTaxAccountMovementAmountOre(value)
  return ore == null ? null : fromTaxAccountMovementOre(ore)
}

export function validateTaxAccountMovementInput(
  input: TaxAccountMovementValidationInput
): TaxAccountMovementValidationResult {
  if (!isValidMovementDateOnly(input.movementDate)) {
    return {
      ok: false,
      amount: null,
      message: 'Välj datumet för överföringen.',
    }
  }

  if (input.movementDate > input.todayIso) {
    return {
      ok: false,
      amount: null,
      message: 'Datumet för överföringen kan inte vara i framtiden.',
    }
  }

  const amountOre = parseTaxAccountMovementAmountOre(input.amountText)
  if (amountOre == null) {
    return {
      ok: false,
      amount: null,
      message: 'Ange ett belopp med högst två decimaler.',
    }
  }

  const amount = fromTaxAccountMovementOre(amountOre)
  if (amountOre <= 0) {
    return {
      ok: false,
      amount: null,
      message: 'Beloppet måste vara större än 0 kr.',
    }
  }

  if (amountOre > toTaxAccountMovementOre(input.remainingAmount)) {
    return {
      ok: false,
      amount,
      message: 'Beloppet kan inte vara större än det som är kvar att koppla till momsen.',
    }
  }

  return { ok: true, amount, message: null }
}

export function canStartTaxAccountMovementSubmit(
  input: TaxAccountMovementSubmitGateInput
) {
  return Boolean(
    input.hasSelectedPeriod &&
      input.hasSelectedContext &&
      input.canSubmitMovement &&
      input.amount &&
      input.movementKind &&
      !input.inFlight
  )
}

export function prepareTaxAccountMovementIdempotencyKey(
  state: TaxAccountMovementIdempotencyState,
  intent: TaxAccountMovementIntent,
  generateKey: () => string
): { state: TaxAccountMovementIdempotencyState; key: string } {
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

export function clearTaxAccountMovementIdempotency(): TaxAccountMovementIdempotencyState {
  return { ...EMPTY_TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STATE }
}

export function readTaxAccountMovementIdempotencyFromStorage(
  storage: TaxAccountMovementStorageLike | null | undefined
): TaxAccountMovementIdempotencyState {
  if (!storage) return clearTaxAccountMovementIdempotency()

  try {
    const stored = storage.getItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY)
    if (!stored) return clearTaxAccountMovementIdempotency()
    const parsed = JSON.parse(stored) as unknown
    return isStoredState(parsed) ? parsed : clearTaxAccountMovementIdempotency()
  } catch {
    return clearTaxAccountMovementIdempotency()
  }
}

export function writeTaxAccountMovementIdempotencyToStorage(
  storage: TaxAccountMovementStorageLike | null | undefined,
  state: TaxAccountMovementIdempotencyState
) {
  if (!storage || !state.key || !state.intent) return

  storage.setItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY, JSON.stringify(state))
}

export function clearTaxAccountMovementIdempotencyStorage(
  storage: TaxAccountMovementStorageLike | null | undefined
) {
  storage?.removeItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY)
}

export function isTaxAccountMovementSubmitContextCurrent(
  current: TaxAccountMovementSelectionContext,
  expected: TaxAccountMovementSelectionContext
) {
  return (
    current.periodId === expected.periodId &&
    current.contextKey === expected.contextKey
  )
}

export const TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY =
  'Den här överföringen kan gälla flera skatter. SoloLedger kan inte koppla hela beloppet till momsen utan tydligt underlag.'

export const TAX_ACCOUNT_MOVEMENT_UNSURE_COPY =
  'Osäker -> SoloLedger gissar inte.'
