import {
  VAT_SETTLEMENT_IDEMPOTENCY_STORAGE_KEY,
  canStartVatSettlementSubmit,
  clearSettlementIdempotency,
  clearSettlementIdempotencyStorage,
  deriveVatSettlementReadModel,
  fromSettlementOre,
  isVatSettlementSubmitContextCurrent,
  payableOrRefundHeading,
  parseSettlementAmountOre,
  prepareSettlementIdempotencyKey,
  readSettlementIdempotencyFromStorage,
  settlementActionLabel,
  settlementAmountLabel,
  settlementEventText,
  settlementQuestion,
  settlementStateText,
  toSettlementOre,
  validateVatSettlementInput,
  writeSettlementIdempotencyToStorage,
  type TaxAccountEventLike,
  type VatSettlementIdempotencyState,
  type VatSettlementStorageLike,
} from '../src/lib/vatSettlementUi.ts'
import type { VatLifecyclePeriodLike } from '../src/lib/vatLifecycleUi.ts'
import {
  RECORD_VAT_SETTLEMENT_RPC_NAME,
  TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_EVENT_SELECT_COLUMNS,
  TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN,
  buildRecordVatSettlementRpcArgs,
} from '../src/lib/vatSettlementRpc.ts'
import {
  VatSettlementSubmissionError,
  classifyVatSettlementRpcError,
  vatSettlementSubmissionFailureKind,
} from '../src/lib/vatSettlementErrors.ts'
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
    status: 'declared',
    closing_amount: 4000,
    declared_at: '2026-04-12T10:00:00Z',
    skv_submitted_on: '2026-04-12',
    ...overrides,
  }
}

function event(
  amount: number,
  overrides: Partial<TaxAccountEventLike> = {}
): TaxAccountEventLike {
  return {
    id: `event-${amount}`,
    vat_period_id: 'period-1',
    event_kind: 'vat_debit',
    event_date: '2026-09-28',
    amount,
    created_at: '2026-09-28T10:00:00Z',
    ...overrides,
  }
}

function memoryStorage(): VatSettlementStorageLike {
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

const payableUnsettled = deriveVatSettlementReadModel(period(), [])
assert(payableUnsettled.actionable, 'Declared SoloLedger non-zero payable is actionable')
assertEqual(payableUnsettled.direction, 'payable', 'Positive closing amount is payable')
assertEqual(payableUnsettled.totalAmount, 4000, 'Payable total is abs closing amount')
assertEqual(payableUnsettled.registeredAmount, 0, 'Unsettled registered amount is zero')
assertEqual(payableUnsettled.remainingAmount, 4000, 'Unsettled remaining amount is total')
assertEqual(payableUnsettled.state, 'unsettled', 'No events means unsettled')

const payablePartial = deriveVatSettlementReadModel(period(), [event(2500)])
assertEqual(payablePartial.registeredAmount, 2500, 'Partial registered amount is summed')
assertEqual(payablePartial.remainingAmount, 1500, 'Partial remaining amount is derived')
assertEqual(payablePartial.state, 'partially_settled', 'Partial amount gives partial state')

const payableFull = deriveVatSettlementReadModel(period(), [event(2500), event(1500)])
assertEqual(payableFull.remainingAmount, 0, 'Full settlement has no remaining amount')
assertEqual(payableFull.state, 'fully_settled', 'Full amount gives full state')

const decimalFull = deriveVatSettlementReadModel(
  period({ closing_amount: 0.3 }),
  [event(0.1), event(0.2)]
)
assertEqual(decimalFull.registeredAmount, 0.3, '0.10 + 0.20 is exact in displayed SEK')
assertEqual(decimalFull.remainingAmount, 0, '0.10 + 0.20 leaves no floating remainder')
assertEqual(decimalFull.state, 'fully_settled', '0.10 + 0.20 fully settles 0.30')

const oneOreBoundary = deriveVatSettlementReadModel(
  period({ closing_amount: 0.03 }),
  [event(0.01)]
)
assertEqual(oneOreBoundary.registeredAmount, 0.01, 'One-öre event is retained exactly')
assertEqual(oneOreBoundary.remainingAmount, 0.02, 'One-öre remaining boundary is exact')

assertEqual(toSettlementOre(0.1), 10, 'Number 0.10 normalizes to ten öre')
assertEqual(toSettlementOre('4000,25'), 400025, 'Comma amount normalizes to öre')
assertEqual(fromSettlementOre(400025), 4000.25, 'Öre converts back to SEK for display')

const refundPartial = deriveVatSettlementReadModel(
  period({ closing_amount: -1500 }),
  [event(500, { event_kind: 'vat_credit' })]
)
assert(refundPartial.actionable, 'Declared SoloLedger non-zero refund is actionable')
assertEqual(refundPartial.direction, 'refund', 'Negative closing amount is refund')
assertEqual(refundPartial.totalAmount, 1500, 'Refund total is abs closing amount')
assertEqual(refundPartial.remainingAmount, 1000, 'Refund remaining amount is derived')

assert(
  !deriveVatSettlementReadModel(period({ status: 'open' }), []).actionable,
  'Open periods are not actionable'
)
assert(
  !deriveVatSettlementReadModel(period({ status: 'closed' }), []).actionable,
  'Closed periods are not actionable'
)
assert(
  !deriveVatSettlementReadModel(period({ source: 'imported_history' }), []).actionable,
  'Imported history is not actionable'
)
assert(
  !deriveVatSettlementReadModel(period({ closing_amount: 0 }), []).actionable,
  'Zero closing amount is not actionable'
)
assert(
  deriveVatSettlementReadModel(period({ skv_submitted_on: null }), [])
    .legacyMissingDeclarationDate,
  'Legacy declared period with NULL submitted date remains visible/actionable'
)

assertEqual(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '1500,25',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).amount,
  1500.25,
  'Swedish decimal amount is parsed'
)
assertEqual(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '4000',
    todayIso: '2026-09-30',
    remainingAmount: 4000,
  }).amount,
  4000,
  'Whole SEK amount is parsed'
)
assertEqual(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '4000.00',
    todayIso: '2026-09-30',
    remainingAmount: 4000,
  }).amount,
  4000,
  'Dot decimal amount is parsed'
)
assertEqual(parseSettlementAmountOre('0,01'), 1, 'One öre input parses exactly')
assert(
  !validateVatSettlementInput({
    eventDate: '2026-10-01',
    amountText: '100',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Future event date is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '0',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Zero amount is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '-10',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Negative amount is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '10.123',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'More than two decimals is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '2000,01',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Amount over remaining is rejected'
)
assert(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '0,02',
    todayIso: '2026-09-30',
    remainingAmount: 0.02,
  }).ok,
  'Exact one-öre boundary amount is accepted'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '0,03',
    todayIso: '2026-09-30',
    remainingAmount: 0.02,
  }).ok,
  'One öre over remaining is rejected'
)

assertEqual(payableOrRefundHeading('payable'), 'Moms att betala', 'Payable heading')
assertEqual(payableOrRefundHeading('refund'), 'Moms att få tillbaka', 'Refund heading')
assert(
  settlementQuestion('payable').includes('dragit momsen'),
  'Payable question uses plain tax-account wording'
)
assert(
  settlementQuestion('refund').includes('krediterat momsen'),
  'Refund question uses credited wording'
)
assertEqual(settlementAmountLabel('payable'), 'Belopp som dragits', 'Payable amount label')
assertEqual(settlementAmountLabel('refund'), 'Belopp som krediterats', 'Refund amount label')
assertEqual(settlementActionLabel('payable'), 'Registrera dragning', 'Payable action label')
assertEqual(settlementActionLabel('refund'), 'Registrera kreditering', 'Refund action label')
assertEqual(settlementEventText('vat_debit'), 'Skatteverket drog moms', 'Debit event history text')
assertEqual(settlementEventText('vat_credit'), 'Skatteverket krediterade moms', 'Credit event history text')
assertEqual(settlementStateText('unsettled'), 'Inget registrerat på skattekontot än', 'Unsettled text')
assertEqual(settlementStateText('partially_settled'), 'Delvis avräknad', 'Partial text')
assertEqual(settlementStateText('fully_settled'), 'Helt avräknad', 'Full text')

const primaryCopy = [
  payableOrRefundHeading('payable'),
  payableOrRefundHeading('refund'),
  settlementQuestion('payable'),
  settlementQuestion('refund'),
  settlementAmountLabel('payable'),
  settlementAmountLabel('refund'),
  settlementActionLabel('payable'),
  settlementActionLabel('refund'),
  settlementEventText('vat_debit'),
  settlementEventText('vat_credit'),
  settlementStateText('unsettled'),
  settlementStateText('partially_settled'),
  settlementStateText('fully_settled'),
].join(' ')

for (const forbidden of ['2012', '2650', 'vat_settlement', 'tax_account_events', 'event_kind']) {
  assert(
    !primaryCopy.includes(forbidden),
    `Primary settlement copy does not expose ${forbidden}`
  )
}

let state: VatSettlementIdempotencyState = clearSettlementIdempotency()
const intent = {
  periodId: 'period-1',
  eventDate: '2026-09-28',
  amount: 4000,
}
let prepared = prepareSettlementIdempotencyKey(state, intent, nextUuid)
state = prepared.state
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000001', 'First intent gets one UUID')

prepared = prepareSettlementIdempotencyKey(state, intent, nextUuid)
state = prepared.state
assertEqual(
  prepared.key,
  '00000000-0000-4000-8000-000000000001',
  'Same unchanged intent reuses UUID after indeterminate failure'
)

prepared = prepareSettlementIdempotencyKey(
  state,
  { ...intent, eventDate: '2026-09-29' },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000002', 'Edited date gets new UUID')

prepared = prepareSettlementIdempotencyKey(
  prepared.state,
  { ...intent, eventDate: '2026-09-29', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000003', 'Edited amount gets new UUID')

prepared = prepareSettlementIdempotencyKey(
  prepared.state,
  { ...intent, periodId: 'period-2', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000004', 'Period change gets new UUID')

state = clearSettlementIdempotency()
prepared = prepareSettlementIdempotencyKey(state, intent, nextUuid)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000005', 'Success/reset makes next intent new')

const storage = memoryStorage()
writeSettlementIdempotencyToStorage(storage, prepared.state)
assert(storage.getItem(VAT_SETTLEMENT_IDEMPOTENCY_STORAGE_KEY), 'Prepared settlement key is persisted for reload retry')
const restored = readSettlementIdempotencyFromStorage(storage)
assertEqual(restored.key, prepared.key, 'Stored settlement idempotency key is restored')
assertEqual(restored.intent?.amount, intent.amount, 'Stored settlement intent is restored')
clearSettlementIdempotencyStorage(storage)
assertEqual(
  readSettlementIdempotencyFromStorage(storage).key,
  null,
  'Settlement idempotency storage clears after success or authoritative rejection'
)
storage.setItem(VAT_SETTLEMENT_IDEMPOTENCY_STORAGE_KEY, '{"key":1,"intent":{}}')
assertEqual(
  readSettlementIdempotencyFromStorage(storage).key,
  null,
  'Malformed settlement idempotency storage fails safely'
)

assert(
  canStartVatSettlementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitSettlement: true,
    amount: 4000,
    inFlight: false,
  }),
  'Ready settlement submit is allowed'
)
assert(
  !canStartVatSettlementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitSettlement: true,
    amount: 4000,
    inFlight: true,
  }),
  'In-flight duplicate settlement submit is blocked'
)

assertEqual(
  classifyVatSettlementRpcError({ code: 'P0001', message: 'server rejected' }),
  'authoritative_rejection',
  'Structured PostgREST errors are authoritative rejections'
)
assertEqual(
  classifyVatSettlementRpcError(new TypeError('fetch failed')),
  'indeterminate',
  'Transport errors are indeterminate'
)
assertEqual(
  classifyVatSettlementRpcError({ message: 'shape without code' }),
  'indeterminate',
  'Unknown error shape defaults to indeterminate'
)
assertEqual(
  vatSettlementSubmissionFailureKind(
    new VatSettlementSubmissionError('authoritative_rejection')
  ),
  'authoritative_rejection',
  'Authoritative rejection is not treated as indeterminate'
)
assertEqual(
  vatSettlementSubmissionFailureKind(new Error('plain failure')),
  'indeterminate',
  'Unknown thrown errors are indeterminate'
)

assert(
  isVatSettlementSubmitContextCurrent(
    { periodId: 'q1', contextKey: '2026|profile|q1' },
    { periodId: 'q1', contextKey: '2026|profile|q1' }
  ),
  'Matching submit context may update the selected period UI'
)
assert(
  !isVatSettlementSubmitContextCurrent(
    { periodId: 'q2', contextKey: '2026|profile|q2' },
    { periodId: 'q1', contextKey: '2026|profile|q1' }
  ),
  'Stale old-period success cannot update the newly selected period UI'
)

assertEqual(
  RECORD_VAT_SETTLEMENT_RPC_NAME,
  'record_vat_settlement_atomic',
  'Service uses the exact settlement RPC name'
)

const rpcArgs = buildRecordVatSettlementRpcArgs({
  periodId: '11111111-1111-4111-8111-111111111111',
  eventDate: '2026-09-28',
  amount: 4000,
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
})

assertEqual(
  rpcArgs.p_vat_period_id,
  '11111111-1111-4111-8111-111111111111',
  'Settlement RPC args include period id'
)
assertEqual(rpcArgs.p_event_date, '2026-09-28', 'Settlement RPC args include event date')
assertEqual(rpcArgs.p_amount, 4000, 'Settlement RPC args include amount')
assertEqual(
  rpcArgs.p_idempotency_key,
  '22222222-2222-4222-8222-222222222222',
  'Settlement RPC args include idempotency key'
)

const vatSettlementPolicy = getTransactionSourceUiPolicy({ source: 'vat_settlement' })
assertEqual(vatSettlementPolicy.label, 'Momsavräkning', 'vat_settlement display label')
assert(vatSettlementPolicy.systemManaged, 'vat_settlement is system-managed')
assert(
  isTransactionSystemManagedInUi({ source: 'vat_settlement' }),
  'vat_settlement helper marks the row system-managed'
)
assert(
  !shouldOfferGenericTransactionEdit({ source: 'vat_settlement' }),
  'vat_settlement does not offer generic edit'
)
assert(
  !shouldOfferGenericTransactionCorrection({ source: 'vat_settlement' }),
  'vat_settlement does not offer generic correction'
)
assertEqual(
  transactionSourceUiLabel({ source: 'vat_settlement' }),
  'Momsavräkning',
  'vat_settlement label is centralized'
)

assert(
  !TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('idempotency_key'),
  'Settlement event UI read does not expose idempotency keys'
)
assert(
  !TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('user_id'),
  'Settlement event UI read does not expose user_id'
)
assert(
  TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('vat_period_id') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('transaction_id') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('event_kind') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('event_date') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('amount') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('created_at'),
  'Settlement event UI read selects the required history/model columns'
)
assertEqual(
  TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN,
  'user_id',
  'Settlement event service scopes reads by authenticated user'
)
assertEqual(
  TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN,
  'vat_period_id',
  'Settlement event service scopes reads by selected period'
)

console.log('VAT settlement UI/service tests passed.')

