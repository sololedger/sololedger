import { supabase } from './supabaseClient'
import { calculateBusinessResult } from './resultEngine'
import type { PaymentAccountRole } from './paymentAccountRoles'
import type { VatTreatment } from './vatDomain'
import type { VatV2BusinessFacts } from './vatBusinessFacts'
import { buildVatAuditSnapshot } from './vatAuditSnapshot'
import { buildVatJournalPlan } from './vatJournalPlan'
import { buildDeclareVatPeriodRpcArgs } from './vatDeclarationRpc'
import {
  RECORD_VAT_SETTLEMENT_RPC_NAME,
  TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_EVENT_SELECT_COLUMNS,
  TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN,
  buildRecordVatSettlementRpcArgs,
} from './vatSettlementRpc'
import { createVatSettlementSubmissionError } from './vatSettlementErrors'
import { createVatV2RuntimeBookingSubmissionError } from './vatRuntimeBooking'
import {
  RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
  TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS,
  TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN,
  buildRecordTaxAccountMovementRpcArgs,
} from './taxAccountMovementRpc'
import { createTaxAccountMovementSubmissionError } from './taxAccountMovementErrors'
import {
  isInputVatAccount,
  isLegacyReverseChargeVatIndicator,
  isLegacyVatInferenceTransaction,
  isOutputVatAccount,
  isSettlementAccount,
  legacyVatRateForAccount,
} from './legacyVatInference.ts'
import {
  fetchAllRows,
  fetchAllRowsByChunks,
  type FetchAllRangeQuery,
} from './supabaseFetchAll'
import { calculateNeBalanceRows } from './neBalance'

// Hjälpfunktion för att hämta användarens ID på ett 100% skottsäkert och server-verifierat sätt
// Exporterad så sieImport.ts kan återanvända den istället för att duplicera logiken.
export async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Ingen giltig eller inloggad användare hittades.")
  return user.id
}

interface BookTransactionInput {
  date: string
  description: string
  amount: number
  type: string
  vat_rate?: number | null
  file_url?: string | null
}

interface AccountBalanceRpcRow {
  account_number: string
  balance: number | string | null
}

type AccountingSupabaseFilterQuery<T> = FetchAllRangeQuery<T> & {
  eq(column: string, value: unknown): AccountingSupabaseFilterQuery<T>
  gte(column: string, value: string): AccountingSupabaseFilterQuery<T>
  lte(column: string, value: string): AccountingSupabaseFilterQuery<T>
  like(column: string, value: string): AccountingSupabaseFilterQuery<T>
  in(column: string, values: string[]): AccountingSupabaseFilterQuery<T>
}

type AccountingSupabaseQuery = {
  select(
    columns: string,
    options?: { count?: 'exact' }
  ): AccountingSupabaseFilterQuery<unknown>
}

type AccountingSupabaseClient = {
  from(table: string): AccountingSupabaseQuery
}

interface MomsBreakdownPeriodVatRow {
  account_number: string
  transaction_id: string
}

interface MomsBreakdownJournalRow {
  account_number: string
  debit: number | string | null
  credit: number | string | null
  transaction_id: string
  date: string
}

interface MomsBreakdownTransactionRow {
  id: string
  source: string | null
  import_batch_id: string | null
}

interface MomsBreakdownImportBatchRow {
  id: string
  status: string | null
}

function normalizeAccountBalanceRows(
  rows: AccountBalanceRpcRow[] | null | undefined,
  options: { balanceSheetOnly?: boolean } = {}
) {
  const balances: Record<string, number> = {}

  for (const row of rows ?? []) {
    const acc = row.account_number.toString()

    if (
      options.balanceSheetOnly === true &&
      !acc.startsWith('1') &&
      !acc.startsWith('2')
    ) {
      continue
    }

    balances[acc] = Number(row.balance ?? 0)
  }

  return balances
}

export async function bookTransaction(tx: BookTransactionInput) {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  // Hela den vanliga bokningen sker nu atomärt i databasen:
  // transaction + ver_nr + journal_entries skapas i samma PostgreSQL-transaktion.
  // Om något steg misslyckas rullas allt tillbaka.
  const payload = {
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    vat_rate: tx.vat_rate ?? 0,
    file_url: tx.file_url ?? null,
  }

  const { data, error } = await supabase.rpc('book_transaction_atomic', {
    p_payload: payload,
  })

  if (error) {
    throw new Error('Bokföringen misslyckades och rullades tillbaka: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Bokföringen misslyckades av okänd anledning.')
  }

  return {
    success: true,
    transactionId: data.transaction_id as string,
    verNr: Number(data.ver_nr),
  }
}

export interface BookVatV2EuServiceReverseChargeInput {
  date: string
  description: string
  treatment: VatTreatment
  businessFacts: VatV2BusinessFacts
  paymentAccountNumber: string
  paymentRole: PaymentAccountRole
  idempotencyKey: string
  fileUrl?: string | null
}

export interface BookVatV2EuServiceReverseChargeResult {
  success: true
  idempotentReplay: boolean
  transactionId: string
  verNr: number
  vatAuditSnapshotId: string
}

export type CustomerInvoiceVatTreatment = 'taxable' | 'exempt' | 'unknown'

export interface CreateCustomerInvoiceInput {
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  serviceDate: string
  dueDate: string
  grossAmount: number
  vatTreatment: CustomerInvoiceVatTreatment
  vatRate?: number | null
  attachmentUrl?: string | null
}

export interface UpdateCustomerInvoiceInput extends CreateCustomerInvoiceInput {
  invoiceId: string
}

export interface CustomerInvoiceRpcResult {
  success: true
  idempotentReplay?: boolean
  invoiceId: string
  bookingId?: string
  transactionId?: string
  verNr?: number
  bookingKind?: string
  paymentStatus?: string
}

export type CustomerInvoicePaymentStatus = 'unpaid' | 'paid' | 'cancelled'
export type CustomerInvoiceBookingKind =
  | 'payment_same_year'
  | 'year_end_receivable'
  | 'receivable_settlement'
  | 'payment_same_year_reversal'
  | 'receivable_settlement_reversal'
  | 'historical_payment_same_year'

export interface CustomerInvoiceBooking {
  id: string
  invoiceId: string
  transactionId: string
  bookingKind: CustomerInvoiceBookingKind
  bookingDate: string
  fiscalYear: number
  grossAmount: number
  netAmount: number
  vatAmount: number
  reversesBookingId: string | null
}

export interface CustomerInvoice {
  id: string
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  serviceDate: string
  dueDate: string
  grossAmount: number
  netAmount: number | null
  vatAmount: number | null
  vatRate: number | null
  vatTreatment: CustomerInvoiceVatTreatment
  paymentStatus: CustomerInvoicePaymentStatus
  paidAt: string | null
  attachmentUrl: string | null
  bookings: CustomerInvoiceBooking[]
}

type CustomerInvoiceRpcResponse = {
  success?: unknown
  idempotent_replay?: unknown
  invoice_id?: unknown
  booking_id?: unknown
  transaction_id?: unknown
  ver_nr?: unknown
  booking_kind?: unknown
  payment_status?: unknown
}

type CustomerInvoiceRow = {
  id: string
  invoice_number: string
  customer_name: string
  invoice_date: string
  service_date: string
  due_date: string
  gross_amount: number | string
  net_amount: number | string | null
  vat_amount: number | string | null
  vat_rate: number | string | null
  vat_treatment: CustomerInvoiceVatTreatment
  payment_status: CustomerInvoicePaymentStatus
  paid_at: string | null
  attachment_url: string | null
}

type CustomerInvoiceBookingRow = {
  id: string
  invoice_id: string
  transaction_id: string
  booking_kind: CustomerInvoiceBookingKind
  booking_date: string
  fiscal_year: number | string
  gross_amount: number | string
  net_amount: number | string
  vat_amount: number | string
  reverses_booking_id: string | null
}

function mapCustomerInvoiceRpcResult(data: CustomerInvoiceRpcResponse | null): CustomerInvoiceRpcResult {
  if (!data?.success) {
    throw new Error('Kundfakturaåtgärden misslyckades av okänd anledning.')
  }

  return {
    success: true,
    idempotentReplay: data.idempotent_replay === true,
    invoiceId: String(data.invoice_id),
    bookingId: data.booking_id == null ? undefined : String(data.booking_id),
    transactionId: data.transaction_id == null ? undefined : String(data.transaction_id),
    verNr: data.ver_nr == null ? undefined : Number(data.ver_nr),
    bookingKind: data.booking_kind == null ? undefined : String(data.booking_kind),
    paymentStatus: data.payment_status == null ? undefined : String(data.payment_status),
  }
}

function mapCustomerInvoiceBooking(row: CustomerInvoiceBookingRow): CustomerInvoiceBooking {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    transactionId: row.transaction_id,
    bookingKind: row.booking_kind,
    bookingDate: row.booking_date,
    fiscalYear: Number(row.fiscal_year),
    grossAmount: Number(row.gross_amount),
    netAmount: Number(row.net_amount),
    vatAmount: Number(row.vat_amount),
    reversesBookingId: row.reverses_booking_id,
  }
}

function mapCustomerInvoice(
  row: CustomerInvoiceRow,
  bookingsByInvoiceId: Map<string, CustomerInvoiceBooking[]>
): CustomerInvoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    invoiceDate: row.invoice_date,
    serviceDate: row.service_date,
    dueDate: row.due_date,
    grossAmount: Number(row.gross_amount),
    netAmount: row.net_amount == null ? null : Number(row.net_amount),
    vatAmount: row.vat_amount == null ? null : Number(row.vat_amount),
    vatRate: row.vat_rate == null ? null : Number(row.vat_rate),
    vatTreatment: row.vat_treatment,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    attachmentUrl: row.attachment_url,
    bookings: bookingsByInvoiceId.get(row.id) ?? [],
  }
}

export async function createCustomerInvoice(
  input: CreateCustomerInvoiceInput
): Promise<CustomerInvoiceRpcResult> {
  await getUserId()

  const { data, error } = await supabase.rpc('create_customer_invoice_atomic', {
    p_payload: {
      invoice_number: input.invoiceNumber,
      customer_name: input.customerName,
      customer_country: 'SE',
      currency: 'SEK',
      invoice_date: input.invoiceDate,
      service_date: input.serviceDate,
      due_date: input.dueDate,
      gross_amount: input.grossAmount,
      vat_treatment: input.vatTreatment,
      vat_rate: input.vatRate ?? null,
      attachment_url: input.attachmentUrl ?? null,
    },
  })

  if (error) {
    throw new Error('Kundfakturan kunde inte registreras: ' + error.message)
  }

  return mapCustomerInvoiceRpcResult(data)
}

export async function updateCustomerInvoiceUnbooked(
  input: UpdateCustomerInvoiceInput
): Promise<CustomerInvoiceRpcResult> {
  await getUserId()

  const { data, error } = await supabase.rpc('update_customer_invoice_unbooked_atomic', {
    p_invoice_id: input.invoiceId,
    p_payload: {
      invoice_number: input.invoiceNumber,
      customer_name: input.customerName,
      customer_country: 'SE',
      currency: 'SEK',
      invoice_date: input.invoiceDate,
      service_date: input.serviceDate,
      due_date: input.dueDate,
      gross_amount: input.grossAmount,
      vat_treatment: input.vatTreatment,
      vat_rate: input.vatRate ?? null,
      attachment_url: input.attachmentUrl ?? null,
    },
  })

  if (error) {
    throw new Error('Kundfakturan kunde inte uppdateras: ' + error.message)
  }

  return mapCustomerInvoiceRpcResult(data)
}

export async function getCustomerInvoices(throughYear: number): Promise<CustomerInvoice[]> {
  const userId = await getUserId()
  const throughDate = `${throughYear}-12-31`

  const { data, error } = await supabase
    .from('customer_invoices')
    .select('id, invoice_number, customer_name, invoice_date, service_date, due_date, gross_amount, net_amount, vat_amount, vat_rate, vat_treatment, payment_status, paid_at, attachment_url')
    .eq('user_id', userId)
    .lte('invoice_date', throughDate)
    .order('invoice_date', { ascending: false })
    .order('invoice_number', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error('Kunde inte hämta kundfakturor: ' + error.message)
  }

  const invoiceRows = (data ?? []) as CustomerInvoiceRow[]
  const invoiceIds = invoiceRows.map(row => row.id)
  const bookingsByInvoiceId = new Map<string, CustomerInvoiceBooking[]>()

  if (invoiceIds.length > 0) {
    const { data: bookingData, error: bookingError } = await supabase
      .from('customer_invoice_bookings')
      .select('id, invoice_id, transaction_id, booking_kind, booking_date, fiscal_year, gross_amount, net_amount, vat_amount, reverses_booking_id')
      .eq('user_id', userId)
      .in('invoice_id', invoiceIds)
      .order('booking_date', { ascending: true })

    if (bookingError) {
      throw new Error('Kunde inte hämta kundfakturornas bokningar: ' + bookingError.message)
    }

    for (const row of (bookingData ?? []) as CustomerInvoiceBookingRow[]) {
      const booking = mapCustomerInvoiceBooking(row)
      const existing = bookingsByInvoiceId.get(booking.invoiceId) ?? []
      existing.push(booking)
      bookingsByInvoiceId.set(booking.invoiceId, existing)
    }
  }

  return invoiceRows.map(row => mapCustomerInvoice(row, bookingsByInvoiceId))
}

export async function undoCustomerInvoicePayment(
  invoiceId: string,
  idempotencyKey: string
): Promise<CustomerInvoiceRpcResult> {
  await getUserId()

  const { data, error } = await supabase.rpc(
    'undo_customer_invoice_payment_atomic',
    {
      p_invoice_id: invoiceId,
      p_idempotency_key: idempotencyKey,
    }
  )

  if (error) {
    throw new Error('Kundfakturans betalning kunde inte ångras: ' + error.message)
  }

  return mapCustomerInvoiceRpcResult(data)
}

export async function recordCustomerInvoicePayment(
  invoiceId: string,
  paymentDate: string,
  idempotencyKey: string
): Promise<CustomerInvoiceRpcResult> {
  await getUserId()

  const { data, error } = await supabase.rpc(
    'record_customer_invoice_payment_atomic',
    {
      p_invoice_id: invoiceId,
      p_payment_date: paymentDate,
      p_idempotency_key: idempotencyKey,
    }
  )

  if (error) {
    throw new Error('Kundfakturans betalning kunde inte bokföras: ' + error.message)
  }

  return mapCustomerInvoiceRpcResult(data)
}

export async function bookCustomerInvoiceYearEndReceivable(
  invoiceId: string,
  fiscalYear: number,
  idempotencyKey: string
): Promise<CustomerInvoiceRpcResult> {
  await getUserId()

  const { data, error } = await supabase.rpc(
    'book_customer_invoice_year_end_receivable_atomic',
    {
      p_invoice_id: invoiceId,
      p_fiscal_year: fiscalYear,
      p_idempotency_key: idempotencyKey,
    }
  )

  if (error) {
    throw new Error('Kundfordran kunde inte bokföras vid årsskifte: ' + error.message)
  }

  return mapCustomerInvoiceRpcResult(data)
}

export async function settleCustomerInvoiceReceivable(
  invoiceId: string,
  paymentDate: string,
  idempotencyKey: string
): Promise<CustomerInvoiceRpcResult> {
  await getUserId()

  const { data, error } = await supabase.rpc(
    'settle_customer_invoice_receivable_atomic',
    {
      p_invoice_id: invoiceId,
      p_payment_date: paymentDate,
      p_idempotency_key: idempotencyKey,
    }
  )

  if (error) {
    throw new Error('Kundfordran kunde inte regleras: ' + error.message)
  }

  return mapCustomerInvoiceRpcResult(data)
}

export async function bookVatV2EuServiceReverseChargeTransaction(
  input: BookVatV2EuServiceReverseChargeInput
): Promise<BookVatV2EuServiceReverseChargeResult> {
  await getUserId()

  const journalPlanResult = buildVatJournalPlan({
    treatment: input.treatment,
    paymentAccountNumber: input.paymentAccountNumber,
  })

  if (journalPlanResult.status !== 'ready') {
    throw createVatV2RuntimeBookingSubmissionError({
      code: 'VAT_V2_RUNTIME_BOOKING_INVALID_JOURNAL_PLAN',
      message:
        'Utlandsinköpet stoppades före bokföring: ' +
        journalPlanResult.validation.errors.map(error => error.message).join(' '),
    })
  }

  const auditSnapshotResult = buildVatAuditSnapshot({
    treatment: input.treatment,
    journalPlan: journalPlanResult.plan,
    businessFacts: input.businessFacts,
  })

  if (auditSnapshotResult.status !== 'ready') {
    throw createVatV2RuntimeBookingSubmissionError({
      code: 'VAT_V2_RUNTIME_BOOKING_INVALID_AUDIT_SNAPSHOT',
      message:
        'VAT V2-audit snapshot kunde inte skapas: ' +
        auditSnapshotResult.validation.errors.map(error => error.message).join(' '),
    })
  }

  const payload = {
    date: input.date,
    description: input.description,
    treatment_code: input.treatment.code,
    calculation_rate: input.treatment.calculationRate,
    deduction_entitlement: input.treatment.deductibleInputVat.entitlement,
    taxable_base: input.treatment.taxableBase,
    output_vat_amount: input.treatment.outputVat.amount,
    deductible_input_vat_amount: input.treatment.deductibleInputVat.amount,
    acquisition_base_field: input.treatment.acquisitionBaseField ?? null,
    output_vat_report_field: input.treatment.outputVat.reportField,
    deductible_input_vat_report_field:
      input.treatment.deductibleInputVat.reportField,
    payment_account_role: input.paymentRole,
    rule_version: input.treatment.ruleVersion,
    facts_version: input.treatment.evidence.factsVersion,
    business_facts: input.businessFacts,
    idempotency_key: input.idempotencyKey,
    file_url: input.fileUrl ?? null,
  }

  let response: Awaited<ReturnType<typeof supabase.rpc>>
  try {
    response = await supabase.rpc(
      'book_vat_v2_eu_service_reverse_charge_atomic',
      { p_payload: payload }
    )
  } catch (error) {
    throw createVatV2RuntimeBookingSubmissionError(error)
  }

  const { data, error } = response

  if (error) {
    throw createVatV2RuntimeBookingSubmissionError(error)
  }

  if (!data?.success) {
    throw createVatV2RuntimeBookingSubmissionError({
      code: 'VAT_V2_RUNTIME_BOOKING_UNSUCCESSFUL_RESPONSE',
      message: 'The VAT V2 runtime booking RPC returned an unsuccessful response.',
    })
  }

  return {
    success: true,
    idempotentReplay: Boolean(data.idempotent_replay),
    transactionId: data.transaction_id as string,
    verNr: Number(data.ver_nr),
    vatAuditSnapshotId: data.vat_audit_snapshot_id as string,
  }
}

// BACKEND-SKYDD FÖR REDIGERING:
// All validering och själva UPDATE sker i databasen via en atomisk, server-side RPC.
// Klienten får därför inte själv avgöra ägarskap, låsta år eller vilka fält som får ändras.
interface TransactionUpdatePayload {
  date?: string
  description?: string
  amount?: number
  type?: string
  vat_rate?: number
  file_url?: string | null
}

export async function updateTransaction(
  txId: string,
  updates: TransactionUpdatePayload
) {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  const { data, error } = await supabase.rpc('update_transaction_safe', {
    p_tx_id: txId,
    p_updates: updates ?? {},
  })

  if (error) {
    throw new Error('Kunde inte uppdatera transaktionen: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Kunde inte uppdatera transaktionen av okänd anledning.')
  }
}

export async function getAccountBalances(year: number) {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const { data, error } = await supabase.rpc('get_period_account_balances', {
    p_start_date: startDate,
    p_end_date: endDate,
  })

  if (error) throw error

  return normalizeAccountBalanceRows(data as AccountBalanceRpcRow[] | null)
}

/**
 * Kumulativ balans för balanskonton (1xxx-2xxx), från bokföringens start
 * till och med 31 december angivet år - till skillnad från
 * getAccountBalances() som bara summerar det angivna kalenderårets egna
 * rörelser.
 *
 * Själva summeringen sker server-side via read-only RPC så klienten inte
 * behöver ladda alla journalrader när datamängden växer.
 */
export async function getBalanceSheetBalances(year: number) {
  const endDate = `${year}-12-31`

  const { data, error } = await supabase.rpc('get_cumulative_account_balances', {
    p_through_date: endDate,
  })

  if (error) throw error

  return normalizeAccountBalanceRows(data as AccountBalanceRpcRow[] | null, {
    balanceSheetOnly: true,
  })
}

export type VatPeriodType = 'month' | 'quarter' | 'year'
export type VatPeriodStatus = 'open' | 'closed' | 'declared'
export type VatPeriodSource = 'sololedger' | 'imported_history'

export interface VatPeriod {
  id: string
  period_start: string
  period_end: string
  period_type: VatPeriodType
  status: VatPeriodStatus
  source: VatPeriodSource
  closing_amount: number | null
  closing_transaction_id: string | null
  declared_at: string | null
  skv_submitted_on: string | null
}

export interface EnsureVatPeriodsResult {
  success: boolean
  created_count: number
  existing_count: number
  period_type: VatPeriodType
  management_from: string
  through_date: string
}

export interface CloseVatPeriodResult {
  success: boolean
  already_closed: boolean
  vat_period_id: string
  status: VatPeriodStatus
  closing_amount: number | null
  closing_transaction_id: string | null
  transaction_created?: boolean
  ver_nr?: number
}

export interface DeclareVatPeriodResult {
  success: boolean
  already_declared: boolean
  vat_period_id: string
  status: 'declared'
  source: 'sololedger'
  declared_at: string
  skv_submitted_on: string | null
  closing_amount: number | null
  closing_transaction_id: string | null
  updated_at: string
}

export type TaxAccountEventKind = 'vat_debit' | 'vat_credit'

export interface TaxAccountEvent {
  id: string
  vat_period_id: string
  transaction_id: string
  event_kind: TaxAccountEventKind
  event_date: string
  amount: number
  created_at: string
}

export interface RecordVatSettlementResult {
  success: boolean
  idempotent_replay: boolean
  event_id: string
  transaction_id: string
  ver_nr: number | null
  event_kind: TaxAccountEventKind
  event_date: string
  amount: number
  cumulative_settled: number
  remaining_amount: number
  settlement_state: 'unsettled' | 'partially_settled' | 'fully_settled'
}

export type TaxAccountMovementKind =
  | 'business_to_tax_account'
  | 'owner_private_to_tax_account'
  | 'tax_account_to_business'
  | 'tax_account_to_owner_private'

export interface TaxAccountMovement {
  id: string
  vat_period_id: string | null
  transaction_id: string
  movement_kind: TaxAccountMovementKind
  movement_date: string
  amount: number
  payment_account_role: string | null
  counter_account_number: string
  created_at: string
}

export interface RecordTaxAccountMovementResult {
  success: boolean
  idempotent_replay: boolean
  movement_id: string
  transaction_id: string
  ver_nr: number | null
  vat_period_id: string | null
  movement_kind: TaxAccountMovementKind
  movement_date: string
  amount: number
  payment_account_role: string | null
  counter_account_number: string
  cumulative_movement: number | null
  remaining_amount: number | null
  movement_state: 'unmoved' | 'partially_moved' | 'fully_moved' | null
}

type VatPeriodRow = Omit<VatPeriod, 'closing_amount'> & {
  closing_amount: number | string | null
}

type TaxAccountEventRow = Omit<TaxAccountEvent, 'amount'> & {
  amount: number | string
}

type TaxAccountMovementRow = Omit<TaxAccountMovement, 'amount'> & {
  amount: number | string
}

function normalizeVatPeriod(row: VatPeriodRow): VatPeriod {
  return {
    ...row,
    closing_amount: row.closing_amount == null ? null : Number(row.closing_amount),
  }
}

function normalizeTaxAccountEvent(row: TaxAccountEventRow): TaxAccountEvent {
  return {
    ...row,
    amount: Number(row.amount),
  }
}

function normalizeTaxAccountMovement(row: TaxAccountMovementRow): TaxAccountMovement {
  return {
    ...row,
    amount: Number(row.amount),
  }
}

export async function ensureVatPeriods(throughDate: string): Promise<EnsureVatPeriodsResult> {
  await getUserId()

  const { data, error } = await supabase.rpc('ensure_vat_periods', {
    p_through_date: throughDate,
  })

  if (error) {
    throw new Error('Kunde inte säkerställa momsperioder: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Kunde inte säkerställa momsperioder av okänd anledning.')
  }

  return {
    success: Boolean(data.success),
    created_count: Number(data.created_count ?? 0),
    existing_count: Number(data.existing_count ?? 0),
    period_type: data.period_type as VatPeriodType,
    management_from: data.management_from as string,
    through_date: data.through_date as string,
  }
}

export async function getVatPeriods(startDate: string, endDate: string): Promise<VatPeriod[]> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('vat_periods')
    .select('id, period_start, period_end, period_type, status, source, closing_amount, closing_transaction_id, declared_at, skv_submitted_on')
    .eq('user_id', userId)
    .lte('period_start', endDate)
    .gte('period_end', startDate)
    .order('period_start', { ascending: false })

  if (error) {
    throw new Error('Kunde inte hämta momsperioder: ' + error.message)
  }

  return ((data || []) as VatPeriodRow[]).map(normalizeVatPeriod)
}

export async function getTaxAccountEventsForPeriod(
  periodId: string
): Promise<TaxAccountEvent[]> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('tax_account_events')
    .select(TAX_ACCOUNT_EVENT_SELECT_COLUMNS)
    .eq(TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN, userId)
    .eq(TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN, periodId)
    .order('event_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error('Kunde inte hämta avräkningar från skattekontot: ' + error.message)
  }

  return ((data || []) as TaxAccountEventRow[]).map(normalizeTaxAccountEvent)
}

export async function getTaxAccountMovementsForPeriod(
  periodId: string
): Promise<TaxAccountMovement[]> {
  const userId = await getUserId()

  const { data, error } = await supabase
    .from('tax_account_movements')
    .select(TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS)
    .eq(TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN, userId)
    .eq(TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN, periodId)
    .order('movement_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error('Kunde inte hämta överföringar till eller från skattekontot: ' + error.message)
  }

  return ((data || []) as TaxAccountMovementRow[]).map(normalizeTaxAccountMovement)
}

export async function closeVatPeriod(periodId: string): Promise<CloseVatPeriodResult> {
  await getUserId()

  const { data, error } = await supabase.rpc('close_vat_period_atomic', {
    p_vat_period_id: periodId,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.success) {
    throw new Error('Momsperioden kunde inte stängas av okänd anledning.')
  }

  return {
    success: Boolean(data.success),
    already_closed: Boolean(data.already_closed),
    vat_period_id: data.vat_period_id as string,
    status: data.status as VatPeriodStatus,
    closing_amount: data.closing_amount == null ? null : Number(data.closing_amount),
    closing_transaction_id: data.closing_transaction_id ?? null,
    transaction_created: data.transaction_created == null ? undefined : Boolean(data.transaction_created),
    ver_nr: data.ver_nr == null ? undefined : Number(data.ver_nr),
  }
}

export async function declareVatPeriod(
  periodId: string,
  skvSubmittedOn: string
): Promise<DeclareVatPeriodResult> {
  await getUserId()

  const { data, error } = await supabase.rpc(
    'declare_vat_period_atomic',
    buildDeclareVatPeriodRpcArgs(periodId, skvSubmittedOn)
  )

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.success) {
    throw new Error('Momsperioden kunde inte markeras som deklarerad av okänd anledning.')
  }

  return {
    success: Boolean(data.success),
    already_declared: Boolean(data.already_declared),
    vat_period_id: data.vat_period_id as string,
    status: data.status as 'declared',
    source: data.source as 'sololedger',
    declared_at: data.declared_at as string,
    skv_submitted_on: data.skv_submitted_on ?? null,
    closing_amount: data.closing_amount == null ? null : Number(data.closing_amount),
    closing_transaction_id: data.closing_transaction_id ?? null,
    updated_at: data.updated_at as string,
  }
}

export async function recordVatSettlement(
  periodId: string,
  eventDate: string,
  amount: number,
  idempotencyKey: string
): Promise<RecordVatSettlementResult> {
  await getUserId()

  let response: Awaited<ReturnType<typeof supabase.rpc>>
  try {
    response = await supabase.rpc(
      RECORD_VAT_SETTLEMENT_RPC_NAME,
      buildRecordVatSettlementRpcArgs({
        periodId,
        eventDate,
        amount,
        idempotencyKey,
      })
    )
  } catch (error) {
    throw createVatSettlementSubmissionError(error)
  }

  const { data, error } = response

  if (error) {
    throw createVatSettlementSubmissionError(error)
  }

  if (!data?.success) {
    throw createVatSettlementSubmissionError({
      code: 'VAT_SETTLEMENT_UNSUCCESSFUL_RESPONSE',
      message: 'The VAT settlement RPC returned an unsuccessful response.',
    })
  }

  return {
    success: Boolean(data.success),
    idempotent_replay: Boolean(data.idempotent_replay),
    event_id: data.event_id as string,
    transaction_id: data.transaction_id as string,
    ver_nr: data.ver_nr == null ? null : Number(data.ver_nr),
    event_kind: data.event_kind as TaxAccountEventKind,
    event_date: data.event_date as string,
    amount: Number(data.amount),
    cumulative_settled: Number(data.cumulative_settled),
    remaining_amount: Number(data.remaining_amount),
    settlement_state: data.settlement_state as RecordVatSettlementResult['settlement_state'],
  }
}

export async function recordTaxAccountMovement(
  movementKind: TaxAccountMovementKind,
  movementDate: string,
  amount: number,
  vatPeriodId: string | null,
  idempotencyKey: string
): Promise<RecordTaxAccountMovementResult> {
  await getUserId()

  let response: Awaited<ReturnType<typeof supabase.rpc>>
  try {
    response = await supabase.rpc(
      RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
      buildRecordTaxAccountMovementRpcArgs({
        movementKind,
        movementDate,
        amount,
        vatPeriodId,
        idempotencyKey,
      })
    )
  } catch (error) {
    throw createTaxAccountMovementSubmissionError(error)
  }

  const { data, error } = response

  if (error) {
    throw createTaxAccountMovementSubmissionError(error)
  }

  if (!data?.success) {
    throw createTaxAccountMovementSubmissionError({
      code: 'TAX_ACCOUNT_MOVEMENT_UNSUCCESSFUL_RESPONSE',
      message: 'The tax-account movement RPC returned an unsuccessful response.',
    })
  }

  return {
    success: Boolean(data.success),
    idempotent_replay: Boolean(data.idempotent_replay),
    movement_id: data.movement_id as string,
    transaction_id: data.transaction_id as string,
    ver_nr: data.ver_nr == null ? null : Number(data.ver_nr),
    vat_period_id: data.vat_period_id ?? null,
    movement_kind: data.movement_kind as TaxAccountMovementKind,
    movement_date: data.movement_date as string,
    amount: Number(data.amount),
    payment_account_role: data.payment_account_role ?? null,
    counter_account_number: data.counter_account_number as string,
    cumulative_movement:
      data.cumulative_movement == null ? null : Number(data.cumulative_movement),
    remaining_amount:
      data.remaining_amount == null ? null : Number(data.remaining_amount),
    movement_state: data.movement_state as RecordTaxAccountMovementResult['movement_state'],
  }
}

/**
 * Beräknar utgående/ingående moms och netto för en period ("Alternativ E", låst arkitekturbeslut).
 *
 * Summerar rörelser på momskonton (261x/262x/263x utgående, 264x ingående) inom
 * [startDate, endDate], men EXKLUDERAR alla momskontorader vars verifikation även
 * innehåller en rad på ett avräkningskonto (265x, t.ex. 2650). En sådan verifikation
 * är en intern momsombokning (flyttar ackumulerad moms till avräkningskontot),
 * inte en ny affärshändelse - och ska därför inte räknas som periodens moms.
 *
 * Detta ersätter den tidigare modellen som bara summerade 2611/2641 rakt av,
 * vilken visade 0 kr för importerad SIE-data eftersom källbokföringen gör
 * periodiska momsombokningar som nollar ut exakt de kontona inom samma period.
 *
 * Konton utanför 26xx (t.ex. betalningar mot 1930 vid en skattedeklaration)
 * påverkar aldrig resultatet - de saknar momskontorader att exkludera eller
 * räkna med i första läget.
 *
 * Legacy/V1-sammanställning som används av Dashboard/useAccountingData.
 * Momsrapportens SKV-fält går via vatReportService.ts så att native VAT V2
 * läses från auktoritativa audit snapshots istället för BAS-inferens.
 */
export interface MomsBreakdown {
  utgaendeMoms: number
  ingaendeMoms: number
  momsNetto: number
  manualReviewRequired?: boolean
  manualReviewMessage?: string | null

  // För momsrapport/SKV 4700. Optional för bakåtkompatibilitet med befintliga
  // initialvärden i Dashboard/useAccountingData tills UI-steget är uppdaterat.
  utgaendeMoms25?: number
  utgaendeMoms12?: number
  utgaendeMoms6?: number
  momspliktigForsaljning25?: number
  momspliktigForsaljning12?: number
  momspliktigForsaljning6?: number
  momspliktigForsaljning?: number
}

export async function getMomsBreakdown(startDate: string, endDate: string): Promise<MomsBreakdown> {
  const userId = await getUserId()
  const db = supabase as unknown as AccountingSupabaseClient
  const manualReviewMessage =
    'Momsöversikten kräver manuell kontroll eftersom perioden innehåller äldre/manuella/SIE-rader med omvänd momsindikator utan kontrollerbar deklarationsruta.'

  // STEG 1: hitta de verifikationer som faktiskt har en momsrad (261x–264x)
  // vars EGET raddatum ligger i vald period.
  //
  // Viktigt: vi använder inte detta begränsade resultat för att avgöra om
  // verifikationen är en intern momsombokning. En SIE-verifikation kan ha olika
  // datum på sina #TRANS-rader och 265x-raden kan därför ligga precis utanför
  // perioden. Det var den tidigare periodgränsbuggen.
  const period26Rows = await fetchAllRows<MomsBreakdownPeriodVatRow>({
    context: 'dashboard VAT candidate journal rows',
    createQuery: () => db
      .from('journal_entries')
      .select('account_number, transaction_id', { count: 'exact' })
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .like('account_number', '26%') as AccountingSupabaseFilterQuery<
        MomsBreakdownPeriodVatRow
      >,
  })

  const candidateTransactionIds = Array.from(new Set(
    period26Rows
      .filter(r => isOutputVatAccount(r.account_number) || isInputVatAccount(r.account_number))
      .map(r => r.transaction_id)
  ))

  if (candidateTransactionIds.length === 0) {
    return {
      utgaendeMoms: 0,
      ingaendeMoms: 0,
      momsNetto: 0,
      manualReviewRequired: false,
      manualReviewMessage: null,
      utgaendeMoms25: 0,
      utgaendeMoms12: 0,
      utgaendeMoms6: 0,
      momspliktigForsaljning25: 0,
      momspliktigForsaljning12: 0,
      momspliktigForsaljning6: 0,
      momspliktigForsaljning: 0,
    }
  }

  // STEG 2: hämta SAMTLIGA 26xx-rader för kandidatverifikationerna, oavsett
  // raddatum. Dessa fullständiga verifikationer används bara för att upptäcka
  // om en 265x-rad finns någonstans i samma verifikation.
  //
  // Själva momsbeloppen summeras fortfarande ENDAST från rader vars datum
  // ligger inom [startDate, endDate].
  const [all26Rows, candidateTransactions] = await Promise.all([
    fetchAllRowsByChunks<MomsBreakdownJournalRow, string>({
      context: 'dashboard VAT complete journal rows',
      values: candidateTransactionIds,
      createQuery: ids => db
        .from('journal_entries')
        .select('account_number, debit, credit, transaction_id, date', { count: 'exact' })
        .eq('user_id', userId)
        .in('transaction_id', ids)
        .like('account_number', '26%') as AccountingSupabaseFilterQuery<
          MomsBreakdownJournalRow
        >,
    }),
    fetchAllRowsByChunks<MomsBreakdownTransactionRow, string>({
      context: 'dashboard VAT transactions',
      values: candidateTransactionIds,
      createQuery: ids => db
        .from('transactions')
        .select('id, source, import_batch_id', { count: 'exact' })
        .eq('user_id', userId)
        .in('id', ids) as AccountingSupabaseFilterQuery<
          MomsBreakdownTransactionRow
        >,
    }),
  ])

  const importBatchIds = Array.from(new Set(
    candidateTransactions
      .map(tx => tx.import_batch_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  ))
  const importBatches =
    importBatchIds.length === 0
      ? [] as MomsBreakdownImportBatchRow[]
      : await fetchAllRowsByChunks<MomsBreakdownImportBatchRow, string>({
        context: 'dashboard VAT import batches',
        values: importBatchIds,
        createQuery: ids => db
          .from('import_batches')
          .select('id, status', { count: 'exact' })
          .eq('user_id', userId)
          .in('id', ids) as AccountingSupabaseFilterQuery<
            MomsBreakdownImportBatchRow
          >,
      })

  const importBatchStatusById = new Map(
    importBatches.map(batch => [batch.id, batch.status as string | null])
  )
  const transactionById = new Map(
    candidateTransactions.map(tx => [
      tx.id,
      {
        source: tx.source as string | null,
        importBatchStatus: tx.import_batch_id
          ? importBatchStatusById.get(tx.import_batch_id) ?? null
          : null,
      },
    ])
  )

  const byTransaction: Record<
    string,
    { account_number: string; debit: number; credit: number; date: string }[]
  > = {}

  all26Rows.forEach(e => {
    if (!isLegacyVatInferenceTransaction(transactionById.get(e.transaction_id) ?? {
      source: undefined,
      importBatchStatus: null,
    })) return

    const key = e.transaction_id
    if (!byTransaction[key]) byTransaction[key] = []
    byTransaction[key].push({
      account_number: e.account_number,
      debit: Number(e.debit),
      credit: Number(e.credit),
      date: e.date,
    })
  })

  let utgaendeMoms25 = 0
  let utgaendeMoms12 = 0
  let utgaendeMoms6 = 0
  let ingaendeMoms = 0
  let manualReviewRequired = false

  Object.values(byTransaction).forEach(rows => {
    // Om SAMMA verifikation innehåller 265x är det en intern momsombokning.
    // Detta kontrolleras nu över hela verifikationen, även om 265x-raden ligger
    // utanför rapportperioden.
    const ärOmföring = rows.some(r => isSettlementAccount(r.account_number))
    if (ärOmföring) return

    const harTvetydigOmvändMoms = rows.some(r => (
      r.date >= startDate &&
      r.date <= endDate &&
      isLegacyReverseChargeVatIndicator(r.account_number)
    ))

    if (harTvetydigOmvändMoms) {
      manualReviewRequired = true
      return
    }

    rows.forEach(r => {
      // Bara momsradens eget datum avgör om beloppet hör till vald period.
      if (r.date < startDate || r.date > endDate) return

      const netCredit = r.credit - r.debit

      if (isOutputVatAccount(r.account_number)) {
        const rate = legacyVatRateForAccount(r.account_number)
        if (rate === 25) utgaendeMoms25 += netCredit
        if (rate === 12) utgaendeMoms12 += netCredit
        if (rate === 6) utgaendeMoms6 += netCredit
      } else if (isInputVatAccount(r.account_number)) {
        // Avdragsperspektiv: debetöverskott på 264x = positiv ingående moms.
        ingaendeMoms += -netCredit
      }
    })
  })

  const round2 = (n: number) => Math.round(n * 100) / 100

  utgaendeMoms25 = round2(utgaendeMoms25)
  utgaendeMoms12 = round2(utgaendeMoms12)
  utgaendeMoms6 = round2(utgaendeMoms6)
  ingaendeMoms = round2(ingaendeMoms)

  const utgaendeMoms = round2(utgaendeMoms25 + utgaendeMoms12 + utgaendeMoms6)
  const momsNetto = round2(utgaendeMoms - ingaendeMoms)

  // Försäljningsunderlaget kan härledas direkt från utgående moms när kontot
  // anger skattesatsen (261x=25 %, 262x=12 %, 263x=6 %). Det gör att även
  // importerad SIE-data utan transactions.vat_rate kan presenteras korrekt.
  const momspliktigForsaljning25 = round2(utgaendeMoms25 / 0.25)
  const momspliktigForsaljning12 = round2(utgaendeMoms12 / 0.12)
  const momspliktigForsaljning6 = round2(utgaendeMoms6 / 0.06)
  const momspliktigForsaljning = round2(
    momspliktigForsaljning25 + momspliktigForsaljning12 + momspliktigForsaljning6
  )

  return {
    utgaendeMoms,
    ingaendeMoms,
    momsNetto,
    manualReviewRequired,
    manualReviewMessage: manualReviewRequired ? manualReviewMessage : null,
    utgaendeMoms25,
    utgaendeMoms12,
    utgaendeMoms6,
    momspliktigForsaljning25,
    momspliktigForsaljning12,
    momspliktigForsaljning6,
    momspliktigForsaljning,
  }
}

export async function createCorrectionTransaction(originalTxId: string): Promise<number> {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  // Hela korrigeringsflödet sker nu atomärt i databasen:
  // korrigeringstransaktion + ver_nr + spegelvända journalrader och,
  // vid periodisering, även korrigering av vändningsverifikationen.
  // Om något steg misslyckas rullas ALLT tillbaka.
  const { data, error } = await supabase.rpc('create_correction_transaction_atomic', {
    p_original_tx_id: originalTxId,
  })

  if (error) {
    throw new Error('Korrigeringen misslyckades och rullades tillbaka: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Korrigeringen misslyckades av okänd anledning.')
  }

  return Number(data.ver_nr)
}

/**
 * Periodisering: Bokför en utgift som sträcker sig över ett nyårsskifte.
 */
interface BookPeriodizedTransactionInput extends BookTransactionInput {
  future_date: string
}

export async function bookPeriodizedTransaction(
  tx: BookPeriodizedTransactionInput
) {
  await getUserId() // säkerställer giltig inloggning innan RPC-anropet

  // Hela periodiseringen sker nu atomärt i databasen:
  // båda transactions, båda verifikationsnumren och samtliga journalrader
  // skapas i samma PostgreSQL-transaktion. Om något steg misslyckas
  // rullas HELA periodiseringen tillbaka.
  const payload = {
    date: tx.date,
    future_date: tx.future_date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    vat_rate: tx.vat_rate ?? 0,
    file_url: tx.file_url ?? null,
  }

  const { data, error } = await supabase.rpc('book_periodized_transaction_atomic', {
    p_payload: payload,
  })

  if (error) {
    throw new Error('Periodiseringen misslyckades och rullades tillbaka: ' + error.message)
  }

  if (!data?.success) {
    throw new Error('Periodiseringen misslyckades av okänd anledning.')
  }

  return {
    success: true,
    ver_nr: Number(data.ver_nr),
    reversal_ver_nr: Number(data.reversal_ver_nr),
    transaction_id: data.transaction_id as string,
    reversal_transaction_id: data.reversal_transaction_id as string,
    periodization_group_id: data.periodization_group_id as string,
  }
}

// ── RÄKENSKAPSÅRSLÅSNING ───────────────────────────────────────────────────
export async function isYearClosed(year: number): Promise<boolean> {
  const userId = await getUserId()
  const { data, error } = await supabase
    .from('closed_years')
    .select('id')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle()
  if (error) throw new Error('Kunde inte kontrollera låsstatus: ' + error.message)
  return data !== null
}

export async function closeYear(year: number): Promise<void> {
  const { error } = await supabase.rpc('close_year_atomic', {
    p_year: year,
  })

  if (error) {
    throw new Error(error.message || 'Kunde inte låsa räkenskapsåret.')
  }
}

/**
 * Steg 1 av B10-arbetet: ren, fristående resultatformel - extraherad ur
 * getNEData() utan någon beteendeförändring. Tar emot VILKET balansobjekt
 * som helst (idag: årsvist balances från getAccountBalances; i ett senare
 * steg: ett kumulativt balansobjekt) och returnerar samma R1-R10/R11-R17
 * som tidigare låg inline. Ingen kumulativ logik här - bara en flytt.
 */
/**
 * Gemensam resultatmotor för SoloLedger.
 *
 * Själva klassificeringen av resultatkonton, teckenhanteringen och
 * NE-raderna R1-R10 finns i resultEngine.ts.
 *
 * Den här adaptern behåller accountingService.ts befintliga returformat
 * så att getNEData(), getCumulativeResultat() och B10-logiken kan fortsätta
 * fungera utan andra ändringar i detta steg.
 */
function computeResultat(balances: Record<string, number>) {
  const result = calculateBusinessResult(balances)

  const {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
    R7,
    R8,
    R9,
    R10,
  } = result.neRows

  const bokfRes = result.bokfortResultat
  const ejAvdr = result.ejAvdragsgillt

  // NE sida 2 – skattemässiga justeringar:
  // R12 = bokfört resultat från R11
  // R13 = bokförda kostnader som inte ska dras av
  // R14 = bokförda intäkter som inte ska tas upp
  // R15 = intäkter som inte bokförts men ska tas upp
  // R16 = kostnader som inte bokförts men ska dras av
  //
  // SoloLedger har i nuläget automatisk mappning för R13 via konto 6992.
  // R14–R16 är fortsatt 0 tills särskilt stöd finns.
  const R11 = bokfRes
  const R12 = R11
  const R13 = ejAvdr
  const R14 = 0
  const R15 = 0
  const R16 = 0
  const R17 = result.skattemassigtResultat

  return {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
    R7,
    R8,
    R9,
    R10,
    ejAvdr,
    bokfRes,
    R11,
    R12,
    R13,
    R14,
    R15,
    R16,
    R17,

    // Behålls internt för kommande varnings-/avstämningssteg.
    warnings: result.warnings,
    unresolvedResultEffect: result.unresolvedResultEffect,
    reconciliationDifference: result.reconciliationDifference,
  }
}

/**
 * Steg 2 av B10-arbetet: kumulativt bokfört resultat (R1-R10/R11-R17) för
 * ALLA resultatkonton (3xxx-8xxx), från bokföringens start t.o.m. 31
 * december angivet år - till skillnad från getAccountBalances(year) som
 * bara summerar det angivna kalenderåret.
 *
 * Bygger INGEN egen R1-R8-logik. Bygger bara ett kumulativt balansobjekt,
 * exakt samma mönster som getBalanceSheetBalances() (ingen nedre
 * datumgräns och samma debit-credit-konvention), men utan kontoprefix-filter.
 * computeResultat() läser ändå bara de resultatkonton (3xxx-8xxx) den bryr
 * sig om, så en äkta öppningsbalans (som bara innehåller balanskonton, t.ex.
 * 1930/2010) påverkar aldrig detta resultat, oavsett dess source/type.
 *
 * Returnerar HELA computeResultat()-resultatet (inte bara bokfRes), så att
 * R1-R8-nedbrytningen också går att inspektera isolerat vid verifiering -
 * kostar inget extra eftersom computeResultat() redan räknar ut alla
 * fälten tillsammans.
 *
 * Själva summeringen sker server-side via read-only RPC så klienten inte
 * behöver ladda alla journalrader när datamängden växer.
 */
export async function getCumulativeResultat(year: number) {
  const endDate = `${year}-12-31`

  const { data, error } = await supabase.rpc('get_cumulative_account_balances', {
    p_through_date: endDate,
  })

  if (error) throw error

  return computeResultat(
    normalizeAccountBalanceRows(data as AccountBalanceRpcRow[] | null)
  )
}

export async function getNEData(year: number) {
  const balances = await getAccountBalances(year)
  // Steg 3: hämtas ENDAST för att ge B13_forutbetalda (konto 1790) ett
  // kumulativt saldo istället för årets egna rörelse. Används inte för
  // något annat fält i denna funktion i detta steg.
  const balanceSheetBalances = await getBalanceSheetBalances(year)

  const { R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, ejAvdr, bokfRes, R11, R12, R13, R14, R15, R16, R17 } = computeResultat(balances)

  // B10 är kumulativt och ska följa K1:s eget-kapital-konton för
  // enskild näringsverksamhet. BAS K1 placerar 2010, 2011, 2012, 2013,
  // 2014, 2017 och 2019 i B10. SoloLedger använder dessutom 2018
  // ("Övriga egna insättningar"), som i nuvarande BAS också tillhör
  // eget-kapitalgruppen.
  //
  // Vi behåller den redan verifierade carry-forward-modellen:
  //   kapital/start + kumulativt bokfört resultat + insättningar - uttag.
  // Skillnaden här är att alla relevanta K1-konton nu fångas upp.
  //
  // Viktigt: vi klipper inte längre uttag/insättningar till >= 0. En kredit
  // på ett uttagskonto eller en debet på ett insättningskonto kan vara en
  // legitim rättning/återföring och ska då påverka B10 åt motsatt håll.
  // Det bevarar även balansidentiteten.
  const kumulativtEgetKapitalStart =
    -(balanceSheetBalances['2010'] || 0) -
    (balanceSheetBalances['2019'] || 0)

  // Uttagskonton i K1:
  // 2011 Egna varuuttag
  // 2012 Avräkning för skatter och avgifter
  // 2013 Övriga egna uttag
  // 2014 Uttag förmåner
  const kumulativaUttag =
    (balanceSheetBalances['2011'] || 0) +
    (balanceSheetBalances['2012'] || 0) +
    (balanceSheetBalances['2013'] || 0) +
    (balanceSheetBalances['2014'] || 0)

  // Insättningskonton:
  // 2017 Egna insättningar / Årets kapitaltillskott (K1/BAS)
  // 2018 Övriga egna insättningar (SoloLedgers standard och nuvarande BAS)
  // Båda är kreditnormala i vår debet-minus-kredit-konvention och vänds därför.
  const kumulativaInsattningar =
    -(
      (balanceSheetBalances['2017'] || 0) +
      (balanceSheetBalances['2018'] || 0)
    )

  const cumulativeResult = await getCumulativeResultat(year)

  const IB_kapital = Math.round(kumulativtEgetKapitalStart * 100) / 100
  const uttag = Math.round(kumulativaUttag * 100) / 100
  const insattningar = Math.round(kumulativaInsattningar * 100) / 100
  const B10_total = Math.round(
    (IB_kapital + cumulativeResult.bokfRes + insattningar - uttag) * 100
  ) / 100

  const neBalanceRows = calculateNeBalanceRows(balanceSheetBalances, B10_total)

  // Behåll dessa alias under övergången så att annan befintlig UI-kod inte
  // behöver gå sönder medan NE-vyn flyttas till korrekta B-rutor.
  const bank = neBalanceRows.B9
  const B13_forutbetalda = Math.round(Math.max(0, balanceSheetBalances['1790'] || 0) * 100) / 100

  return {
    R1, R2, R3, R4, R5, R6, R7, R8, R9, R10,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11, R12, R13, R14, R15, R16, R17,
    IB_kapital, insattningar, uttag,
    bank,
    ...neBalanceRows,
    B13_forutbetalda,
  }
}
