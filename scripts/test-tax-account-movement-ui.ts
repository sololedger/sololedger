import {
  TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY,
  TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY,
  TAX_ACCOUNT_MOVEMENT_UNSURE_COPY,
  canStartTaxAccountMovementSubmit,
  clearTaxAccountMovementIdempotency,
  clearTaxAccountMovementIdempotencyStorage,
  defaultTaxAccountMovementChoice,
  deriveTaxAccountMovementReadModel,
  readTaxAccountMovementIdempotencyFromStorage,
  taxAccountMovementActionLabel,
  taxAccountMovementAmountLabel,
  taxAccountMovementHistoryText,
  taxAccountMovementKindForChoice,
  taxAccountMovementQuestion,
  taxAccountMovementStateText,
  validateTaxAccountMovementInput,
  writeTaxAccountMovementIdempotencyToStorage,
  nextTaxAccountMovementChoiceForContext,
  prepareTaxAccountMovementIdempotencyKey,
  paymentRoleRequiredForTaxAccountMovement,
  type TaxAccountMovementIdempotencyState,
  type TaxAccountMovementLike,
  type TaxAccountMovementStorageLike,
} from '../src/lib/taxAccountMovementUi.ts'
import type { VatLifecyclePeriodLike } from '../src/lib/vatLifecycleUi.ts'
import {
  RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
  TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS,
  TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN,
  buildRecordTaxAccountMovementRpcArgs,
} from '../src/lib/taxAccountMovementRpc.ts'
import {
  TaxAccountMovementSubmissionError,
  classifyTaxAccountMovementRpcError,
  taxAccountMovementSubmissionErrorMessage,
  taxAccountMovementSubmissionFailureKind,
} from '../src/lib/taxAccountMovementErrors.ts'
import {
  getTransactionSourceUiPolicy,
  isTransactionSystemManagedInUi,
  shouldOfferGenericTransactionCorrection,
  shouldOfferGenericTransactionEdit,
  transactionSourceUiLabel,
} from '../src/lib/transactionSourceUi.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

function period(
  overrides: Partial<VatLifecyclePeriodLike> = {}
): VatLifecyclePeriodLike {
  return {
    id: 'period-1',
    period_end: '2026-03-31',
    source: 'sololedger',
    status: 'closed',
    closing_amount: 4000,
    declared_at: null,
    skv_submitted_on: null,
    ...overrides,
  }
}

function movement(
  amount: number,
  overrides: Partial<TaxAccountMovementLike> = {}
): TaxAccountMovementLike {
  return {
    id: `movement-${amount}`,
    vat_period_id: 'period-1',
    movement_kind: 'business_to_tax_account',
    movement_date: '2026-09-28',
    amount,
    payment_account_role: 'business_payment_account',
    counter_account_number: '1930',
    created_at: '2026-09-28T10:00:00Z',
    ...overrides,
  }
}

function memoryStorage(): TaxAccountMovementStorageLike {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: key => {
      values.delete(key)
    },
  }
}

let uuidCounter = 0
function nextUuid() {
  uuidCounter += 1
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
}

const payableUnmoved = deriveTaxAccountMovementReadModel(period(), [])
assert(payableUnmoved.actionable, 'Closed SoloLedger payable period is actionable')
assertEqual(payableUnmoved.direction, 'payable', 'Positive closing amount is payable')
assertEqual(payableUnmoved.totalAmount, 4000, 'Payable total is abs closing amount')
assertEqual(payableUnmoved.registeredAmount, 0, 'Unmoved registered amount is zero')
assertEqual(payableUnmoved.remainingAmount, 4000, 'Unmoved remaining amount is total')
assertEqual(payableUnmoved.state, 'unmoved', 'No movements means unmoved')

const declaredPayable = deriveTaxAccountMovementReadModel(
  period({ status: 'declared', declared_at: '2026-04-12T10:00:00Z' }),
  []
)
assert(declaredPayable.actionable, 'Declared SoloLedger payable period is actionable')

const payablePartial = deriveTaxAccountMovementReadModel(period(), [movement(1500)])
assertEqual(payablePartial.registeredAmount, 1500, 'Partial movement amount is summed')
assertEqual(payablePartial.remainingAmount, 2500, 'Partial movement remaining is derived')
assertEqual(payablePartial.state, 'partially_moved', 'Partial amount gives partial state')

const payableFull = deriveTaxAccountMovementReadModel(period(), [
  movement(1500),
  movement(2500),
])
assertEqual(payableFull.remainingAmount, 0, 'Full movement has no remaining amount')
assertEqual(payableFull.state, 'fully_moved', 'Full amount gives full state')

const refundPartial = deriveTaxAccountMovementReadModel(
  period({ closing_amount: -1500 }),
  [movement(500, { movement_kind: 'tax_account_to_business' })]
)
assert(refundPartial.actionable, 'Closed SoloLedger refund period is actionable')
assertEqual(refundPartial.direction, 'refund', 'Negative closing amount is refund')
assertEqual(refundPartial.remainingAmount, 1000, 'Refund remaining amount is derived')

assert(
  !deriveTaxAccountMovementReadModel(period({ status: 'open' }), []).actionable,
  'Open periods are not actionable'
)
assert(
  !deriveTaxAccountMovementReadModel(period({ source: 'imported_history' }), []).actionable,
  'Imported history is not actionable'
)
assert(
  !deriveTaxAccountMovementReadModel(period({ closing_amount: 0 }), []).actionable,
  'Zero closing amount is not actionable'
)

assertEqual(
  taxAccountMovementKindForChoice('payable', 'business_account'),
  'business_to_tax_account',
  'Payable business choice maps to business-to-tax-account movement'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'owner_private'),
  'owner_private_to_tax_account',
  'Payable private choice maps to private-to-tax-account movement'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'business_account'),
  'tax_account_to_business',
  'Refund business choice maps to tax-account-to-business movement'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'owner_private'),
  'tax_account_to_owner_private',
  'Refund private choice maps to tax-account-to-private movement'
)
assertEqual(
  paymentRoleRequiredForTaxAccountMovement('business_to_tax_account'),
  'business_payment_account',
  'Business-to-tax-account movement requires the business payment role'
)
assertEqual(
  paymentRoleRequiredForTaxAccountMovement('tax_account_to_business'),
  'business_payment_account',
  'Tax-account-to-business movement requires the business payment role'
)
assertEqual(
  paymentRoleRequiredForTaxAccountMovement('owner_private_to_tax_account'),
  'owner_private_payment',
  'Private payment into the tax account requires the owner-private payment role'
)
assertEqual(
  paymentRoleRequiredForTaxAccountMovement('tax_account_to_owner_private'),
  null,
  'Private withdrawal from the tax account keeps the 2013 semantics and requires no owner-private payment role'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'not_yet'),
  null,
  'Payable not-yet choice creates no movement kind'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'tax_account_only'),
  null,
  'Refund tax-account-only choice creates no movement kind'
)
assertEqual(defaultTaxAccountMovementChoice('payable'), 'not_yet', 'Payable default does not book')
assertEqual(defaultTaxAccountMovementChoice('refund'), 'tax_account_only', 'Refund default does not book')
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'business_account',
    previousContextKey: '2026|profile|payable-period',
    nextContextKey: '2026|profile|refund-period',
    previousDirection: 'payable',
    nextDirection: 'refund',
  }),
  'tax_account_only',
  'Payable bookable choice does not carry into a refund period'
)
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'owner_private',
    previousContextKey: '2026|profile|refund-period',
    nextContextKey: '2026|profile|payable-period',
    previousDirection: 'refund',
    nextDirection: 'payable',
  }),
  'not_yet',
  'Refund bookable choice does not carry into a payable period'
)
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'unsure',
    previousContextKey: '2026|profile|payable-period',
    nextContextKey: '2026|profile|payable-period',
    previousDirection: 'payable',
    nextDirection: 'payable',
  }),
  'unsure',
  'Unsure remains selected within the same period context'
)
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'business_account',
    previousContextKey: '2026|profile|same-period',
    nextContextKey: '2026|profile|same-period',
    previousDirection: 'payable',
    nextDirection: 'refund',
  }),
  'tax_account_only',
  'Same-period direction change resets stale payable choice to refund default'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'unsure'),
  null,
  'Unsure cannot produce a payable movement RPC intent'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'unsure'),
  null,
  'Unsure cannot produce a refund movement RPC intent'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'not_yet'),
  null,
  'Not-yet cannot produce a movement RPC intent'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'tax_account_only'),
  null,
  'Refund remaining on tax account cannot produce a movement RPC intent'
)

assertEqual(
  validateTaxAccountMovementInput({
    movementDate: '2026-09-30',
    amountText: '1500,25',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).amount,
  1500.25,
  'Swedish decimal amount is parsed'
)
assert(
  !validateTaxAccountMovementInput({
    movementDate: '2026-10-01',
    amountText: '100',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Future movement date is rejected'
)
assert(
  !validateTaxAccountMovementInput({
    movementDate: '2026-09-30',
    amountText: '2000,01',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Amount over remaining VAT allocation is rejected'
)

const primaryCopy = [
  taxAccountMovementQuestion('payable'),
  taxAccountMovementQuestion('refund'),
  taxAccountMovementActionLabel('business_to_tax_account'),
  taxAccountMovementActionLabel('owner_private_to_tax_account'),
  taxAccountMovementActionLabel('tax_account_to_business'),
  taxAccountMovementActionLabel('tax_account_to_owner_private'),
  taxAccountMovementAmountLabel('payable'),
  taxAccountMovementAmountLabel('refund'),
  taxAccountMovementHistoryText('business_to_tax_account'),
  taxAccountMovementHistoryText('owner_private_to_tax_account'),
  taxAccountMovementHistoryText('tax_account_to_business'),
  taxAccountMovementHistoryText('tax_account_to_owner_private'),
  taxAccountMovementStateText('unmoved'),
  taxAccountMovementStateText('partially_moved'),
  taxAccountMovementStateText('fully_moved'),
  TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY,
  TAX_ACCOUNT_MOVEMENT_UNSURE_COPY,
].join(' ')

for (const forbidden of ['2012', '2650', 'debit', 'credit', 'tax_account_movements']) {
  assert(
    !primaryCopy.includes(forbidden),
    `Primary movement copy does not expose ${forbidden}`
  )
}

let state: TaxAccountMovementIdempotencyState = clearTaxAccountMovementIdempotency()
const intent = {
  periodId: 'period-1',
  movementKind: 'business_to_tax_account' as const,
  movementDate: '2026-09-28',
  amount: 4000,
}
let prepared = prepareTaxAccountMovementIdempotencyKey(state, intent, nextUuid)
state = prepared.state
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000001', 'First intent gets one UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(state, intent, nextUuid)
assertEqual(
  prepared.key,
  '00000000-0000-4000-8000-000000000001',
  'Same unchanged movement intent reuses UUID after indeterminate failure'
)

prepared = prepareTaxAccountMovementIdempotencyKey(
  state,
  { ...intent, amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000002', 'Edited movement amount gets new UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(
  prepared.state,
  { ...intent, periodId: 'period-2', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000003', 'Period switch gets new movement UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(
  prepared.state,
  { ...intent, movementDate: '2026-09-29', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000004', 'Edited movement date gets new UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(
  prepared.state,
  { ...intent, movementKind: 'owner_private_to_tax_account', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000005', 'Edited movement kind gets new UUID')

const storage = memoryStorage()
writeTaxAccountMovementIdempotencyToStorage(storage, prepared.state)
assert(storage.getItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY), 'Prepared key is persisted for reload retry')
const restored = readTaxAccountMovementIdempotencyFromStorage(storage)
assertEqual(restored.key, prepared.key, 'Stored movement idempotency key is restored')
assertEqual(restored.intent?.amount, 3999, 'Stored movement intent is restored')
clearTaxAccountMovementIdempotencyStorage(storage)
assertEqual(
  readTaxAccountMovementIdempotencyFromStorage(storage).key,
  null,
  'Movement idempotency storage clears after success or authoritative rejection'
)
storage.setItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY, '{"key":1,"intent":{}}')
assertEqual(
  readTaxAccountMovementIdempotencyFromStorage(storage).key,
  null,
  'Malformed movement idempotency storage fails safely'
)

assert(
  canStartTaxAccountMovementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitMovement: true,
    amount: 4000,
    movementKind: 'business_to_tax_account',
    inFlight: false,
  }),
  'Ready movement submit is allowed'
)
assert(
  !canStartTaxAccountMovementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitMovement: true,
    amount: 4000,
    movementKind: 'business_to_tax_account',
    inFlight: true,
  }),
  'In-flight duplicate movement submit is blocked'
)

assertEqual(
  classifyTaxAccountMovementRpcError({ code: 'P0001', message: 'server rejected' }),
  'authoritative_rejection',
  'Structured PostgREST movement errors are authoritative rejections'
)
assertEqual(
  classifyTaxAccountMovementRpcError(new TypeError('fetch failed')),
  'indeterminate',
  'Transport movement errors are indeterminate'
)
assertEqual(
  taxAccountMovementSubmissionFailureKind(
    new TaxAccountMovementSubmissionError('authoritative_rejection')
  ),
  'authoritative_rejection',
  'Movement authoritative rejection is not treated as indeterminate'
)
assert(
  taxAccountMovementSubmissionErrorMessage(
    new TaxAccountMovementSubmissionError(
      'authoritative_rejection',
      'Det konfigurerade betalningskontot är inte giltigt för skattekontorörelsen: 2018.'
    )
  ).includes('Betalningskontot'),
  'Invalid stored payment-role configuration gets actionable movement error copy'
)

assertEqual(
  RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
  'record_tax_account_movement_atomic',
  'Service uses the exact tax-account movement RPC name'
)

const rpcArgs = buildRecordTaxAccountMovementRpcArgs({
  movementKind: 'business_to_tax_account',
  movementDate: '2026-09-28',
  amount: 4000,
  vatPeriodId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
})

assertEqual(rpcArgs.p_movement_kind, 'business_to_tax_account', 'Movement RPC args include kind')
assertEqual(rpcArgs.p_movement_date, '2026-09-28', 'Movement RPC args include date')
assertEqual(rpcArgs.p_amount, 4000, 'Movement RPC args include amount')
assertEqual(
  rpcArgs.p_vat_period_id,
  '11111111-1111-4111-8111-111111111111',
  'Movement RPC args include nullable VAT period id when linked'
)
assertEqual(
  rpcArgs.p_idempotency_key,
  '22222222-2222-4222-8222-222222222222',
  'Movement RPC args include idempotency key'
)

const sourcePolicy = getTransactionSourceUiPolicy({ source: 'tax_account_movement' })
assertEqual(sourcePolicy.label, 'Skattekontorörelse', 'tax_account_movement display label')
assert(sourcePolicy.systemManaged, 'tax_account_movement is system-managed')
assert(
  isTransactionSystemManagedInUi({ source: 'tax_account_movement' }),
  'tax_account_movement helper marks the row system-managed'
)
assert(
  !shouldOfferGenericTransactionEdit({ source: 'tax_account_movement' }),
  'tax_account_movement does not offer generic edit'
)
assert(
  !shouldOfferGenericTransactionCorrection({ source: 'tax_account_movement' }),
  'tax_account_movement does not offer generic correction'
)
assertEqual(
  transactionSourceUiLabel({ source: 'tax_account_movement' }),
  'Skattekontorörelse',
  'tax_account_movement label is centralized'
)

assert(
  !TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('idempotency_key'),
  'Movement UI read does not expose idempotency keys'
)
assert(
  !TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('user_id'),
  'Movement UI read does not expose user_id'
)
assert(
  TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('vat_period_id') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('transaction_id') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('movement_kind') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('movement_date') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('amount') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('created_at'),
  'Movement UI read selects the required history/model columns'
)
assertEqual(
  TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN,
  'user_id',
  'Movement service scopes reads by authenticated user'
)
assertEqual(
  TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN,
  'vat_period_id',
  'Movement service scopes reads by selected period'
)

console.log('Tax-account movement UI/service tests passed.')
