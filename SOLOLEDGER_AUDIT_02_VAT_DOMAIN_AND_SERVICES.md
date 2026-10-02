# SoloLedger External Audit #1 - VAT Domain And Services

VAT V2 domain logic, report services, lifecycle helpers, payment-account roles, source policies, Supabase client boundary, and SIE import/parser services.

This file is part of SoloLedger External Audit #1. It contains verbatim source from the approved repository snapshot.

==================================================
FILE: src/lib/accountingService.ts
==================================================

````typescript
import { supabase } from './supabaseClient'
import { calculateBusinessResult } from './resultEngine'
import type { VatTreatment } from './vatDomain'
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
import {
  RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
  TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS,
  TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN,
  buildRecordTaxAccountMovementRpcArgs,
} from './taxAccountMovementRpc'
import { createTaxAccountMovementSubmissionError } from './taxAccountMovementErrors'

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
  paymentAccountNumber: string
  fileUrl?: string | null
}

export interface BookVatV2EuServiceReverseChargeResult {
  success: true
  transactionId: string
  verNr: number
  vatAuditSnapshotId: string
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
    throw new Error(
      'VAT V2-bokningen stoppades före persistens: ' +
      journalPlanResult.validation.errors.map(error => error.message).join(' ')
    )
  }

  const auditSnapshotResult = buildVatAuditSnapshot({
    treatment: input.treatment,
    journalPlan: journalPlanResult.plan,
  })

  if (auditSnapshotResult.status !== 'ready') {
    throw new Error(
      'VAT V2-audit snapshot kunde inte skapas: ' +
      auditSnapshotResult.validation.errors.map(error => error.message).join(' ')
    )
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
    payment_account_number: input.paymentAccountNumber,
    rule_version: input.treatment.ruleVersion,
    facts_version: input.treatment.evidence.factsVersion,
    file_url: input.fileUrl ?? null,
  }

  const { data, error } = await supabase.rpc(
    'book_vat_v2_eu_service_reverse_charge_atomic',
    { p_payload: payload }
  )

  if (error) {
    throw new Error(
      'VAT V2-bokningen misslyckades och rullades tillbaka: ' +
      error.message
    )
  }

  if (!data?.success) {
    throw new Error('VAT V2-bokningen misslyckades av okänd anledning.')
  }

  return {
    success: true,
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
  const userId = await getUserId()

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('user_id', userId)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return {}

  // SÄKERHETSBÄLTE: Filtrera även journalrader på user_id för att undvika data-läckage
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
    .eq('user_id', userId)
  if (entryError) throw entryError

  const balances: Record<string, number> = {}
  entries?.forEach(e => {
    const acc = e.account_number.toString()
    balances[acc] = Math.round(
      ((balances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })
  return balances
}

/**
 * Kumulativ balans för balanskonton (1xxx-2xxx), från bokföringens start
 * till och med 31 december angivet år - till skillnad från
 * getAccountBalances() som bara summerar det angivna kalenderårets egna
 * rörelser.
 *
 * Steg 1 av carry-forward-arbetet: helt fristående funktion. Används INTE
 * av någon befintlig konsument ännu - getAccountBalances() och alla dess
 * nuvarande anropare (Dashboard, NE-bilagan, SIE-export m.fl.) är oförändrade.
 *
 * Samma saldokonvention (debit - credit per konto) och samma dubbla
 * user_id-filtrering (transactions + journal_entries) som
 * getAccountBalances() - se den funktionen för bakgrund.
 */
export async function getBalanceSheetBalances(year: number) {
  const endDate = `${year}-12-31`
  const userId = await getUserId()

  // Ingen nedre datumgräns - det är hela poängen: alla transaktioner
  // sedan bokföringens start, inte bara det valda kalenderåret.
  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .lte('date', endDate)
    .eq('user_id', userId)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return {}

  // SÄKERHETSBÄLTE: samma dubbla user_id-filtrering som getAccountBalances()
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
    .eq('user_id', userId)
  if (entryError) throw entryError

  const balances: Record<string, number> = {}
  entries?.forEach(e => {
    const acc = e.account_number.toString()

    // Endast balanskonton (1xxx-2xxx). Resultatkonton (3xxx-8xxx) hanteras
    // fortsatt uteslutande av getAccountBalances() och ska inte vara
    // kumulativa.
    if (!acc.startsWith('1') && !acc.startsWith('2')) return

    balances[acc] = Math.round(
      ((balances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })
  return balances
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

  const isUtgåendeMomskonto = (acc: string) =>
    acc.startsWith('261') || acc.startsWith('262') || acc.startsWith('263')
  const isIngåendeMomskonto = (acc: string) => acc.startsWith('264')
  const isAvräkningskonto = (acc: string) => acc.startsWith('265')

  const vatRateForAccount = (acc: string): 25 | 12 | 6 | null => {
    if (acc.startsWith('261')) return 25
    if (acc.startsWith('262')) return 12
    if (acc.startsWith('263')) return 6
    return null
  }

  // STEG 1: hitta de verifikationer som faktiskt har en momsrad (261x–264x)
  // vars EGET raddatum ligger i vald period.
  //
  // Viktigt: vi använder inte detta begränsade resultat för att avgöra om
  // verifikationen är en intern momsombokning. En SIE-verifikation kan ha olika
  // datum på sina #TRANS-rader och 265x-raden kan därför ligga precis utanför
  // perioden. Det var den tidigare periodgränsbuggen.
  const { data: period26Rows, error: periodError } = await supabase
    .from('journal_entries')
    .select('account_number, transaction_id')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .like('account_number', '26%')
  if (periodError) throw periodError

  const candidateTransactionIds = Array.from(new Set(
    (period26Rows || [])
      .filter(r => isUtgåendeMomskonto(r.account_number) || isIngåendeMomskonto(r.account_number))
      .map(r => r.transaction_id)
  ))

  if (candidateTransactionIds.length === 0) {
    return {
      utgaendeMoms: 0,
      ingaendeMoms: 0,
      momsNetto: 0,
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
  const { data: all26Rows, error: allRowsError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit, transaction_id, date')
    .eq('user_id', userId)
    .in('transaction_id', candidateTransactionIds)
    .like('account_number', '26%')
  if (allRowsError) throw allRowsError

  const byTransaction: Record<
    string,
    { account_number: string; debit: number; credit: number; date: string }[]
  > = {}

  all26Rows?.forEach(e => {
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

  Object.values(byTransaction).forEach(rows => {
    // Om SAMMA verifikation innehåller 265x är det en intern momsombokning.
    // Detta kontrolleras nu över hela verifikationen, även om 265x-raden ligger
    // utanför rapportperioden.
    const ärOmföring = rows.some(r => isAvräkningskonto(r.account_number))
    if (ärOmföring) return

    rows.forEach(r => {
      // Bara momsradens eget datum avgör om beloppet hör till vald period.
      if (r.date < startDate || r.date > endDate) return

      const netCredit = r.credit - r.debit

      if (isUtgåendeMomskonto(r.account_number)) {
        const rate = vatRateForAccount(r.account_number)
        if (rate === 25) utgaendeMoms25 += netCredit
        if (rate === 12) utgaendeMoms12 += netCredit
        if (rate === 6) utgaendeMoms6 += netCredit
      } else if (isIngåendeMomskonto(r.account_number)) {
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
 * datumgräns, samma dubbla user_id-filtrering, samma debit-credit-
 * konvention), men utan kontoprefix-filter - computeResultat() läser
 * ändå bara de resultatkonton (3xxx-8xxx) den bryr sig om, så en äkta
 * öppningsbalans (som bara innehåller balanskonton, t.ex. 1930/2010)
 * påverkar aldrig detta resultat, oavsett dess source/type.
 *
 * Returnerar HELA computeResultat()-resultatet (inte bara bokfRes), så att
 * R1-R8-nedbrytningen också går att inspektera isolerat vid verifiering -
 * kostar inget extra eftersom computeResultat() redan räknar ut alla
 * fälten tillsammans.
 *
 * Ännu inte kopplad till getNEData/B10 eller någon UI - helt fristående
 * i detta steg.
 */
export async function getCumulativeResultat(year: number) {
  const endDate = `${year}-12-31`
  const userId = await getUserId()

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .lte('date', endDate)
    .eq('user_id', userId)
  if (txError) throw txError

  const ids = txs?.map(t => t.id) || []
  if (ids.length === 0) return computeResultat({})

  // SÄKERHETSBÄLTE: samma dubbla user_id-filtrering som getBalanceSheetBalances()
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit')
    .in('transaction_id', ids)
    .eq('user_id', userId)
  if (entryError) throw entryError

  const cumulativeBalances: Record<string, number> = {}
  entries?.forEach(e => {
    const acc = e.account_number.toString()
    cumulativeBalances[acc] = Math.round(
      ((cumulativeBalances[acc] || 0) + (Number(e.debit) - Number(e.credit))) * 100
    ) / 100
  })

  return computeResultat(cumulativeBalances)
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

  // --- BALANSRÄKNING / NE B1-B16 (förenklat årsbokslut, K1) ---
  //
  // getBalanceSheetBalances() använder debet-minus-kredit:
  //   tillgångar -> normalt positiva
  //   skulder/eget kapital -> normalt negativa
  //
  // För förenklat årsbokslut fylls B1-B10 och B13-B16 i.
  // B11 och B12 används inte i den förenklade NE-balansen.

  const sumBalanceRange = (start: number, end: number) =>
    Object.entries(balanceSheetBalances)
      .filter(([acc]) => {
        const n = parseInt(acc)
        return Number.isInteger(n) && n >= start && n <= end
      })
      .reduce((sum, [, value]) => sum + (value as number), 0)

  const sumBalanceAccounts = (prefixes: string[]) =>
    Object.entries(balanceSheetBalances)
      .filter(([acc]) => prefixes.some(prefix => acc.startsWith(prefix)))
      .reduce((sum, [, value]) => sum + (value as number), 0)

  const round2 = (value: number) => Math.round(value * 100) / 100
  const assetValue = (value: number) => round2(Math.max(0, value))
  const liabilityValue = (value: number) => round2(Math.max(0, -value))

  // Tillgångar
  const B1 = assetValue(sumBalanceRange(1000, 1099)) // Immateriella anläggningstillgångar
  const B2 = assetValue(
    sumBalanceRange(1110, 1119) + sumBalanceRange(1150, 1159)
  ) // Byggnader och markanläggningar
  const B3 = assetValue(
    sumBalanceRange(1130, 1139) + sumBalanceRange(1180, 1189)
  ) // Mark och andra ej avskrivningsbara tillgångar
  const B4 = assetValue(sumBalanceRange(1220, 1249)) // Maskiner och inventarier
  const B5 = assetValue(sumBalanceRange(1300, 1399)) // Övriga anläggningstillgångar
  const B6 = assetValue(sumBalanceRange(1400, 1499)) // Varulager
  const B7 = assetValue(sumBalanceRange(1500, 1599)) // Kundfordringar

  // B8 omfattar övriga fordringar, inklusive periodiseringar som 1790.
  // Om moms-/skatteområdet netto har debetsaldo är det också en fordran.
  const taxRaw = sumBalanceAccounts(['261', '262', '263', '264', '265', '266', '271', '273'])
  const taxReceivable = Math.max(0, taxRaw)
  const B8 = assetValue(sumBalanceRange(1600, 1899) + taxReceivable)

  const B9 = assetValue(sumBalanceRange(1900, 1999)) // Kassa och bank

  // Skulder
  const B13 = liabilityValue(sumBalanceRange(2300, 2399)) // Låneskulder
  const B14 = liabilityValue(taxRaw) // Skatteskulder / nettomoms m.m.
  const B15 = liabilityValue(sumBalanceRange(2440, 2449)) // Leverantörsskulder
  const B16 = liabilityValue(sumBalanceRange(2900, 2999)) // Övriga skulder

  // Behåll dessa alias under övergången så att annan befintlig UI-kod inte
  // behöver gå sönder medan NE-vyn flyttas till korrekta B-rutor.
  const bank = B9
  const B13_forutbetalda = assetValue(balanceSheetBalances['1790'] || 0)

  return {
    R1, R2, R3, R4, R5, R6, R7, R8, R9, R10,
    bokfortResultat: bokfRes,
    ejAvdragsgillt: ejAvdr,
    R11, R12, R13, R14, R15, R16, R17,
    IB_kapital, insattningar, uttag,
    bank, B10_total,
    B1, B2, B3, B4, B5, B6, B7, B8, B9,
    B13, B14, B15, B16,
    B13_forutbetalda,
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatAuditSnapshot.ts
==================================================

````typescript
import type {
  AcquisitionBaseField,
  DeductibleInputVatReportField,
  DeductionEntitlement,
  OutputVatReportField,
  ValidationError,
  ValidationResult,
  VatCalculationRate,
  VatTreatment,
} from './vatDomain'
import type {
  VatJournalPlan,
  VatJournalPlanRow,
  VatJournalPlanRowRole,
} from './vatJournalPlan'

export const VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION = 'vat-audit-snapshot-v1'
export const VAT_AUDIT_JOURNAL_PLAN_VERSION = 'vat-journal-plan-v1'

export type VatAuditSnapshotBlockCode =
  | 'unsupported_vat_treatment'
  | 'unsupported_calculation_rate'
  | 'unsupported_deduction_entitlement'
  | 'unsupported_report_field'
  | 'invalid_treatment_amount'
  | 'invalid_journal_row'
  | 'inconsistent_evidence'
  | 'inconsistent_journal_plan'
  | 'unbalanced_journal_plan'

export type VatAuditSnapshotPath =
  | 'treatment.code'
  | 'treatment.ruleVersion'
  | 'treatment.factsVersion'
  | 'treatment.calculationRate'
  | 'treatment.taxableBase'
  | 'treatment.acquisitionBaseField'
  | 'treatment.outputVat.amount'
  | 'treatment.outputVat.reportField'
  | 'treatment.deductibleInputVat.amount'
  | 'treatment.deductibleInputVat.reportField'
  | 'treatment.deductibleInputVat.entitlement'
  | 'journalPlan.treatmentCode'
  | 'journalPlan.ruleVersion'
  | 'journalPlan.factsVersion'
  | 'journalPlan.journalRows'
  | 'journalPlan.reconciliation'

export type VatAuditSnapshotError = ValidationError<
  VatAuditSnapshotBlockCode,
  VatAuditSnapshotPath
>

export interface VatAuditSnapshotJournalRow {
  readonly role: VatJournalPlanRowRole
  readonly accountNumber: string
  readonly debit: number
  readonly credit: number
}

export interface VatAuditSnapshotVatSemantics {
  readonly taxableBase: number
  readonly calculationRate: VatCalculationRate
  readonly acquisitionBaseField: AcquisitionBaseField
  readonly outputVat: {
    readonly amount: number
    readonly reportField: OutputVatReportField
  }
  readonly deductibleInputVat: {
    readonly amount: number
    readonly reportField: DeductibleInputVatReportField
    readonly entitlement: DeductionEntitlement
  }
}

export interface VatAuditSnapshotReconciliation {
  readonly balanced: true
  readonly totalDebit: number
  readonly totalCredit: number
  readonly acquisitionBase: number
  readonly outputVat: number
  readonly deductibleInputVat: number
  readonly paymentPayable: number
  readonly acquisitionBaseField: AcquisitionBaseField
  readonly outputVatReportField: OutputVatReportField
  readonly deductibleInputVatReportField: DeductibleInputVatReportField
}

export interface VatAuditSnapshot {
  readonly schemaVersion: typeof VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION
  readonly journalPlanVersion: typeof VAT_AUDIT_JOURNAL_PLAN_VERSION
  readonly treatmentCode: VatTreatment['code']
  readonly ruleVersion: string
  readonly factsVersion: string
  readonly vat: VatAuditSnapshotVatSemantics
  readonly journal: {
    readonly rows: readonly VatAuditSnapshotJournalRow[]
  }
  readonly reconciliation: VatAuditSnapshotReconciliation
}

export interface BuildVatAuditSnapshotInput {
  readonly treatment: VatTreatment
  readonly journalPlan: VatJournalPlan
}

export type VatAuditSnapshotBuildResult =
  | {
      readonly status: 'ready'
      readonly snapshot: VatAuditSnapshot
      readonly validation: ValidationResult<VatAuditSnapshotError> & {
        readonly valid: true
        readonly errors: []
      }
    }
  | {
      readonly status: 'blocked'
      readonly snapshot: null
      readonly validation: ValidationResult<VatAuditSnapshotError> & {
        readonly valid: false
        readonly errors: VatAuditSnapshotError[]
      }
    }

const REQUIRED_ROLES: readonly VatJournalPlanRowRole[] = [
  'acquisition_base',
  'deductible_calculated_input_vat',
  'calculated_output_vat',
  'payment_payable',
]

const REQUIRED_ROLE_ACCOUNTS = {
  acquisition_base: '4535',
  deductible_calculated_input_vat: '2645',
  calculated_output_vat: '2614',
} as const

const ROLE_SET = new Set<string>(REQUIRED_ROLES)

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function isCurrencyAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    roundCurrency(value) === value
  )
}

function error(
  code: VatAuditSnapshotBlockCode,
  path: VatAuditSnapshotPath,
  message: string
): VatAuditSnapshotError {
  return { code, path, message }
}

function ready(snapshot: VatAuditSnapshot): VatAuditSnapshotBuildResult {
  return {
    status: 'ready',
    snapshot,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

function blocked(
  errors: VatAuditSnapshotError[]
): VatAuditSnapshotBuildResult {
  return {
    status: 'blocked',
    snapshot: null,
    validation: {
      valid: false,
      errors,
    },
  }
}

function validateSupportedTreatment(
  treatment: VatTreatment
): VatAuditSnapshotError[] {
  const errors: VatAuditSnapshotError[] = []

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(
      error(
        'unsupported_vat_treatment',
        'treatment.code',
        'This audit snapshot slice only supports EU service reverse charge.'
      )
    )
  }

  if (treatment.calculationRate !== 25) {
    errors.push(
      error(
        'unsupported_calculation_rate',
        'treatment.calculationRate',
        'This audit snapshot slice only supports 25 percent VAT.'
      )
    )
  }

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(
      error(
        'unsupported_deduction_entitlement',
        'treatment.deductibleInputVat.entitlement',
        'This audit snapshot slice only supports full deduction.'
      )
    )
  }

  if (treatment.acquisitionBaseField !== '21') {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.acquisitionBaseField',
        'EU service reverse charge must use acquisition base field 21.'
      )
    )
  }

  if (treatment.outputVat.reportField !== '30') {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.outputVat.reportField',
        '25 percent reverse-charge output VAT must use report field 30.'
      )
    )
  }

  if (treatment.deductibleInputVat.reportField !== '48') {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.deductibleInputVat.reportField',
        'Full deduction must use deductible input VAT report field 48.'
      )
    )
  }

  const amountChecks: Array<[
    number,
    VatAuditSnapshotPath,
    string,
  ]> = [
    [treatment.taxableBase, 'treatment.taxableBase', 'Taxable base'],
    [treatment.outputVat.amount, 'treatment.outputVat.amount', 'Output VAT'],
    [
      treatment.deductibleInputVat.amount,
      'treatment.deductibleInputVat.amount',
      'Deductible input VAT',
    ],
  ]

  for (const [value, path, label] of amountChecks) {
    if (!isCurrencyAmount(value)) {
      errors.push(
        error(
          'invalid_treatment_amount',
          path,
          `${label} must be a finite non-negative currency amount.`
        )
      )
    }
  }

  return errors
}

function sumRows(
  rows: readonly VatJournalPlanRow[],
  role: VatJournalPlanRowRole,
  side: 'debit' | 'credit'
) {
  return roundCurrency(
    rows
      .filter(row => row.role === role)
      .reduce((sum, row) => sum + row[side], 0)
  )
}

function validateJournalRows(
  journalRows: readonly VatJournalPlanRow[]
): VatAuditSnapshotError[] {
  const errors: VatAuditSnapshotError[] = []

  if (journalRows.length !== REQUIRED_ROLES.length) {
    errors.push(
      error(
        'invalid_journal_row',
        'journalPlan.journalRows',
        'Journal snapshot evidence must contain exactly one row per supported semantic role.'
      )
    )
  }

  for (const role of REQUIRED_ROLES) {
    const count = journalRows.filter(row => row.role === role).length
    if (count !== 1) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          `Journal snapshot evidence must contain exactly one ${role} row.`
        )
      )
    }
  }

  for (const row of journalRows) {
    if (!ROLE_SET.has(row.role)) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence contains an unsupported semantic role.'
        )
      )
    }

    if (!/^[1-9]\d{3}$/.test(row.accountNumber)) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence contains an invalid account number.'
        )
      )
    }

    if (
      row.role in REQUIRED_ROLE_ACCOUNTS &&
      row.accountNumber !== REQUIRED_ROLE_ACCOUNTS[
        row.role as keyof typeof REQUIRED_ROLE_ACCOUNTS
      ]
    ) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence uses an unsupported account for its semantic role.'
        )
      )
    }

    if (!isCurrencyAmount(row.debit) || !isCurrencyAmount(row.credit)) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence must use finite non-negative currency amounts.'
        )
      )
    }

    if (row.debit > 0 && row.credit > 0) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'A single journal snapshot row cannot carry both debit and credit.'
        )
      )
    }
  }

  return errors
}

function reconcileJournalPlan(
  journalPlan: VatJournalPlan
): VatAuditSnapshotReconciliation | VatAuditSnapshotError {
  const { journalRows, reconciliation } = journalPlan
  const totalDebit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.debit, 0)
  )
  const totalCredit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.credit, 0)
  )
  const acquisitionBase = sumRows(journalRows, 'acquisition_base', 'debit')
  const outputVat = sumRows(
    journalRows,
    'calculated_output_vat',
    'credit'
  )
  const deductibleInputVat = sumRows(
    journalRows,
    'deductible_calculated_input_vat',
    'debit'
  )
  const paymentPayable = sumRows(journalRows, 'payment_payable', 'credit')

  if (totalDebit !== totalCredit || reconciliation.balanced !== true) {
    return error(
      'unbalanced_journal_plan',
      'journalPlan.journalRows',
      'JournalPlan rows must balance independently before snapshot creation.'
    )
  }

  const amountChecks: Array<[
    number,
    number,
    string,
  ]> = [
    [totalDebit, reconciliation.totalDebit, 'total debit'],
    [totalCredit, reconciliation.totalCredit, 'total credit'],
    [acquisitionBase, reconciliation.acquisitionBase, 'acquisition base'],
    [outputVat, reconciliation.outputVat, 'output VAT'],
    [
      deductibleInputVat,
      reconciliation.deductibleInputVat,
      'deductible input VAT',
    ],
    [paymentPayable, reconciliation.paymentPayable, 'payment/payable amount'],
  ]

  for (const [actual, declared, label] of amountChecks) {
    if (actual !== declared) {
      return error(
        'inconsistent_journal_plan',
        'journalPlan.reconciliation',
        `JournalPlan declared ${label} does not match semantic rows.`
      )
    }
  }

  if (
    reconciliation.acquisitionBaseField !== '21' ||
    reconciliation.outputVatReportField !== '30' ||
    reconciliation.deductibleInputVatReportField !== '48'
  ) {
    return error(
      'unsupported_report_field',
      'journalPlan.reconciliation',
      'JournalPlan reconciliation uses unsupported VAT report fields.'
    )
  }

  return {
    balanced: true,
    totalDebit,
    totalCredit,
    acquisitionBase,
    outputVat,
    deductibleInputVat,
    paymentPayable,
    acquisitionBaseField: reconciliation.acquisitionBaseField,
    outputVatReportField: reconciliation.outputVatReportField,
    deductibleInputVatReportField:
      reconciliation.deductibleInputVatReportField,
  }
}

function validateTreatmentAndPlanMatch(
  treatment: VatTreatment,
  journalPlan: VatJournalPlan,
  reconciliation: VatAuditSnapshotReconciliation
): VatAuditSnapshotError[] {
  const errors: VatAuditSnapshotError[] = []

  if (journalPlan.treatmentCode !== treatment.code) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.treatmentCode',
        'JournalPlan treatment code must match the VatTreatment.'
      )
    )
  }

  if (journalPlan.ruleVersion !== treatment.ruleVersion) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.ruleVersion',
        'JournalPlan rule version must match the VatTreatment.'
      )
    )
  }

  if (journalPlan.factsVersion !== treatment.evidence.factsVersion) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.factsVersion',
        'JournalPlan facts version must match the VatTreatment evidence.'
      )
    )
  }

  if (reconciliation.acquisitionBase !== treatment.taxableBase) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan acquisition base must match the VatTreatment taxable base.'
      )
    )
  }

  if (reconciliation.outputVat !== treatment.outputVat.amount) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan output VAT must match the VatTreatment output VAT.'
      )
    )
  }

  if (
    reconciliation.deductibleInputVat !==
    treatment.deductibleInputVat.amount
  ) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan deductible input VAT must match the VatTreatment deductible input VAT.'
      )
    )
  }

  if (reconciliation.paymentPayable !== treatment.taxableBase) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'Payment/payable evidence must match the VatTreatment taxable base.'
      )
    )
  }

  if (reconciliation.acquisitionBaseField !== treatment.acquisitionBaseField) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan acquisition base field must match the VatTreatment.'
      )
    )
  }

  if (reconciliation.outputVatReportField !== treatment.outputVat.reportField) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan output VAT report field must match the VatTreatment.'
      )
    )
  }

  if (
    reconciliation.deductibleInputVatReportField !==
    treatment.deductibleInputVat.reportField
  ) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan deductible input VAT report field must match the VatTreatment.'
      )
    )
  }

  return errors
}

export function buildVatAuditSnapshot(
  input: BuildVatAuditSnapshotInput
): VatAuditSnapshotBuildResult {
  const treatmentErrors = validateSupportedTreatment(input.treatment)
  const journalRowErrors = validateJournalRows(input.journalPlan.journalRows)

  if (treatmentErrors.length > 0 || journalRowErrors.length > 0) {
    return blocked([...treatmentErrors, ...journalRowErrors])
  }

  const reconciliation = reconcileJournalPlan(input.journalPlan)
  if ('code' in reconciliation) {
    return blocked([reconciliation])
  }

  const evidenceErrors = validateTreatmentAndPlanMatch(
    input.treatment,
    input.journalPlan,
    reconciliation
  )

  if (evidenceErrors.length > 0) {
    return blocked(evidenceErrors)
  }

  return ready({
    schemaVersion: VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION,
    journalPlanVersion: VAT_AUDIT_JOURNAL_PLAN_VERSION,
    treatmentCode: input.treatment.code,
    ruleVersion: input.treatment.ruleVersion,
    factsVersion: input.treatment.evidence.factsVersion,
    vat: {
      taxableBase: input.treatment.taxableBase,
      calculationRate: input.treatment.calculationRate,
      acquisitionBaseField: '21',
      outputVat: {
        amount: input.treatment.outputVat.amount,
        reportField: '30',
      },
      deductibleInputVat: {
        amount: input.treatment.deductibleInputVat.amount,
        reportField: '48',
        entitlement: input.treatment.deductibleInputVat.entitlement,
      },
    },
    journal: {
      rows: input.journalPlan.journalRows.map(row => ({
        role: row.role,
        accountNumber: row.accountNumber,
        debit: row.debit,
        credit: row.credit,
      })),
    },
    reconciliation,
  })
}
````````

==================================================

==================================================
FILE: src/lib/vatDeclarationRpc.ts
==================================================

````typescript
export function buildDeclareVatPeriodRpcArgs(
  periodId: string,
  skvSubmittedOn: string
) {
  return {
    p_vat_period_id: periodId,
    p_skv_submitted_on: skvSubmittedOn,
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatDomain.ts
==================================================

````typescript
export type Unknownable<T extends string> = T | 'unknown'

export type VatPeriodType = 'month' | 'quarter' | 'year'

export type DomesticSalesVatTreatment = Unknownable<
  'taxable' | 'small_business_exempt' | 'mixed' | 'exempt_other'
>

export type VatRegistrationStatus = Unknownable<
  'registered' | 'not_registered'
>

export type ForeignPurchaseReporting = Unknownable<
  'required' | 'not_required'
>

export type DeductionEntitlement = Unknownable<
  'full' | 'none' | 'partial'
>

export interface CompanyVatProfile {
  /**
   * Domestic small-business exemption is separate from VAT registration.
   * A company can be exempt for domestic sales and still be registered for
   * reporting specific foreign purchases.
   */
  domesticSalesVatTreatment: DomesticSalesVatTreatment
  vatRegistrationStatus: VatRegistrationStatus
  foreignPurchaseReporting: ForeignPurchaseReporting
  vatPeriodType: VatPeriodType | null
  vatReportingFrom: string | null

  /**
   * Company-level deduction is context/default only. Final deduction belongs
   * to the transaction-level VatTreatment.
   */
  defaultDeductionEntitlement: DeductionEntitlement
  defaultDeductionPercent?: number
}

export type CompanyVatProfileValidationErrorCode =
  | 'registered_requires_vat_period_type'
  | 'registered_requires_vat_reporting_from'
  | 'vat_reporting_from_invalid_date'
  | 'foreign_purchase_reporting_requires_registration'
  | 'partial_deduction_requires_percent'
  | 'deduction_percent_requires_partial_entitlement'
  | 'deduction_percent_out_of_range'

export interface ValidationError<
  TCode extends string = string,
  TPath extends string = string,
> {
  code: TCode
  path: TPath
  message: string
}

export type CompanyVatProfileValidationError = ValidationError<
  CompanyVatProfileValidationErrorCode,
  keyof CompanyVatProfile & string
>

export interface ValidationResult<TError extends ValidationError = ValidationError> {
  valid: boolean
  errors: TError[]
}

function isValidIsoDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function validateCompanyVatProfile(
  profile: CompanyVatProfile
): ValidationResult<CompanyVatProfileValidationError> {
  const errors: CompanyVatProfileValidationError[] = []

  if (profile.vatRegistrationStatus === 'registered') {
    if (profile.vatPeriodType === null) {
      errors.push({
        code: 'registered_requires_vat_period_type',
        path: 'vatPeriodType',
        message: 'A VAT registered company must have a VAT period type.',
      })
    }

    if (profile.vatReportingFrom === null) {
      errors.push({
        code: 'registered_requires_vat_reporting_from',
        path: 'vatReportingFrom',
        message: 'A VAT registered company must have a VAT reporting start date.',
      })
    } else if (!isValidIsoDateOnly(profile.vatReportingFrom)) {
      errors.push({
        code: 'vat_reporting_from_invalid_date',
        path: 'vatReportingFrom',
        message: 'VAT reporting start must be an ISO date string: YYYY-MM-DD.',
      })
    }
  }

  if (
    profile.foreignPurchaseReporting === 'required' &&
    profile.vatRegistrationStatus !== 'registered'
  ) {
    errors.push({
      code: 'foreign_purchase_reporting_requires_registration',
      path: 'foreignPurchaseReporting',
      message:
        'Foreign purchase reporting requires VAT registration; unknown is not registered.',
    })
  }

  if (
    profile.defaultDeductionEntitlement === 'partial' &&
    profile.defaultDeductionPercent === undefined
  ) {
    errors.push({
      code: 'partial_deduction_requires_percent',
      path: 'defaultDeductionPercent',
      message: 'Partial default deduction requires an explicit percent.',
    })
  }

  if (
    profile.defaultDeductionPercent !== undefined &&
    profile.defaultDeductionEntitlement !== 'partial'
  ) {
    errors.push({
      code: 'deduction_percent_requires_partial_entitlement',
      path: 'defaultDeductionPercent',
      message:
        'Default deduction percent is only valid with partial default deduction.',
    })
  }

  if (
    profile.defaultDeductionPercent !== undefined &&
    (
      !Number.isFinite(profile.defaultDeductionPercent) ||
      profile.defaultDeductionPercent < 0 ||
      profile.defaultDeductionPercent > 100
    )
  ) {
    errors.push({
      code: 'deduction_percent_out_of_range',
      path: 'defaultDeductionPercent',
      message: 'Default deduction percent must be between 0 and 100.',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export type VatEventKind = 'sale' | 'purchase'
export type VatGoodsOrService = 'goods' | 'service' | 'unknown'
export type VatYesNoUnknown = 'yes' | 'no' | 'unknown'
export type VatBusinessUse = 'yes' | 'no' | 'mixed' | 'unknown'

export type IsoCountryCode = string

export type VatCalculationRate = 25 | 12 | 6 | 0
export type VatCalculationRateInput = VatCalculationRate | 'unknown'

export type VatCounterpartyCountry =
  | { kind: 'country'; code: IsoCountryCode }
  | { kind: 'unknown' }
  | { kind: 'not_applicable' }

export interface VatFactsInput {
  companyProfile: CompanyVatProfile
  eventKind: VatEventKind
  goodsOrService: VatGoodsOrService
  supplierCountry: VatCounterpartyCountry
  customerCountry: VatCounterpartyCountry
  supplierVatCharged: VatYesNoUnknown
  usedForBusiness: VatBusinessUse
  calculationRate: VatCalculationRateInput
  deductionEntitlement: DeductionEntitlement
  accountingCategoryId: string
  invoiceDate: string
  amount: number
  currency: string
}

export type VatReturnField =
  | '05'
  | '10'
  | '11'
  | '12'
  | '20'
  | '21'
  | '22'
  | '30'
  | '31'
  | '32'
  | '48'
  | '49'
  | '50'
  | '60'
  | '61'
  | '62'

export type OutputVatReportField =
  | '10'
  | '11'
  | '12'
  | '30'
  | '31'
  | '32'
  | '60'
  | '61'
  | '62'

export type AcquisitionBaseField = '20' | '21' | '22' | '50'
export type DomesticSalesBaseField = '05'
export type DeductibleInputVatReportField = '48'

export type VatTreatmentCode =
  | 'DOMESTIC_TAXABLE_SALE'
  | 'DOMESTIC_DEDUCTIBLE_PURCHASE'
  | 'DOMESTIC_EXEMPT_SALE'
  | 'EU_SERVICE_REVERSE_CHARGE'
  | 'EU_GOODS_ACQUISITION'
  | 'NON_EU_SERVICE_REVERSE_CHARGE'
  | 'IMPORT_GOODS'
  | 'NO_VAT_CONSEQUENCE'

export type VatTreatmentEvidenceSource =
  | 'user'
  | 'invoice'
  | 'profile'
  | 'rule'

export interface VatTreatment {
  /**
   * A VatTreatment is the VAT consequence snapshot. It is not a journal plan,
   * account mapping, RPC payload, or booking decision engine.
   */
  code: VatTreatmentCode
  ruleVersion: string
  taxableBase: number
  calculationRate: VatCalculationRate
  outputVat: {
    amount: number
    reportField: OutputVatReportField | null
  }
  deductibleInputVat: {
    amount: number
    reportField: DeductibleInputVatReportField | null
    entitlement: DeductionEntitlement
  }
  acquisitionBaseField?: AcquisitionBaseField
  domesticSalesBaseField?: DomesticSalesBaseField
  evidence: {
    source: VatTreatmentEvidenceSource
    factsVersion: string
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatJournalPlan.ts
==================================================

````typescript
import type {
  AcquisitionBaseField,
  DeductibleInputVatReportField,
  OutputVatReportField,
  ValidationError,
  ValidationResult,
  VatTreatment,
} from './vatDomain'

export type VatJournalPlanRowRole =
  | 'acquisition_base'
  | 'calculated_output_vat'
  | 'deductible_calculated_input_vat'
  | 'payment_payable'

export interface VatJournalPlanRow {
  accountNumber: string
  debit: number
  credit: number
  role: VatJournalPlanRowRole
}

export type VatJournalPlanBlockCode =
  | 'unsupported_vat_treatment'
  | 'unsupported_calculation_rate'
  | 'unsupported_deduction_entitlement'
  | 'invalid_payment_account'
  | 'invalid_treatment_amount'
  | 'inconsistent_treatment'
  | 'unbalanced_journal_plan'

export type VatJournalPlanPath =
  | 'treatment.code'
  | 'treatment.calculationRate'
  | 'treatment.taxableBase'
  | 'treatment.outputVat.amount'
  | 'treatment.outputVat.reportField'
  | 'treatment.deductibleInputVat.amount'
  | 'treatment.deductibleInputVat.reportField'
  | 'treatment.deductibleInputVat.entitlement'
  | 'treatment.acquisitionBaseField'
  | 'paymentAccountNumber'
  | 'journalRows'

export type VatJournalPlanError = ValidationError<
  VatJournalPlanBlockCode,
  VatJournalPlanPath
>

export interface VatJournalPlanReconciliation {
  balanced: true
  totalDebit: number
  totalCredit: number
  acquisitionBase: number
  outputVat: number
  deductibleInputVat: number
  paymentPayable: number
  acquisitionBaseField: AcquisitionBaseField
  outputVatReportField: OutputVatReportField
  deductibleInputVatReportField: DeductibleInputVatReportField
}

export interface VatJournalPlan {
  treatmentCode: VatTreatment['code']
  ruleVersion: string
  factsVersion: string
  journalRows: VatJournalPlanRow[]
  reconciliation: VatJournalPlanReconciliation
}

export type VatJournalPlanBuildResult =
  | {
      status: 'ready'
      plan: VatJournalPlan
      validation: ValidationResult<VatJournalPlanError> & {
        valid: true
        errors: []
      }
    }
  | {
      status: 'blocked'
      plan: null
      validation: ValidationResult<VatJournalPlanError> & {
        valid: false
        errors: VatJournalPlanError[]
      }
    }

export interface BuildVatJournalPlanInput {
  treatment: VatTreatment
  paymentAccountNumber: string
}

const EU_SERVICE_25_ACCOUNTS = {
  acquisitionBase: '4535',
  outputVat: '2614',
  deductibleInputVat: '2645',
} as const

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function sumRows(
  rows: VatJournalPlanRow[],
  role: VatJournalPlanRowRole,
  side: 'debit' | 'credit'
) {
  return roundCurrency(
    rows
      .filter(row => row.role === role)
      .reduce((sum, row) => sum + row[side], 0)
  )
}

function error(
  code: VatJournalPlanBlockCode,
  path: VatJournalPlanPath,
  message: string
): VatJournalPlanError {
  return { code, path, message }
}

function ready(plan: VatJournalPlan): VatJournalPlanBuildResult {
  return {
    status: 'ready',
    plan,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

function blocked(errors: VatJournalPlanError[]): VatJournalPlanBuildResult {
  return {
    status: 'blocked',
    plan: null,
    validation: {
      valid: false,
      errors,
    },
  }
}

function isCurrencyAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    roundCurrency(value) === value
  )
}

function validateCurrencyAmount(
  value: number,
  path: VatJournalPlanPath,
  label: string
) {
  return isCurrencyAmount(value)
    ? null
    : error(
        'invalid_treatment_amount',
        path,
        `${label} must be a finite non-negative currency amount rounded to two decimals.`
      )
}

function normalizePaymentAccount(
  accountNumber: string
): { accountNumber: string } | { error: VatJournalPlanError } {
  const normalized = accountNumber.trim()

  if (!/^[1-9]\d{3}$/.test(normalized)) {
    return {
      error: error(
        'invalid_payment_account',
        'paymentAccountNumber',
        'Payment/payable account must be a four-digit BAS account number.'
      ),
    }
  }

  return { accountNumber: normalized }
}

function validateSupportedTreatment(
  treatment: VatTreatment
): VatJournalPlanError[] {
  const errors: VatJournalPlanError[] = []

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(
      error(
        'unsupported_vat_treatment',
        'treatment.code',
        'This JournalPlan slice only supports EU service reverse charge.'
      )
    )
  }

  if (treatment.calculationRate !== 25) {
    errors.push(
      error(
        'unsupported_calculation_rate',
        'treatment.calculationRate',
        'This JournalPlan slice only supports 25 percent EU service reverse charge.'
      )
    )
  }

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(
      error(
        'unsupported_deduction_entitlement',
        'treatment.deductibleInputVat.entitlement',
        'This JournalPlan slice only supports full deduction.'
      )
    )
  }

  return errors
}

function validateEuService25FullDeduction(
  treatment: VatTreatment
): VatJournalPlanError[] {
  const errors: VatJournalPlanError[] = []

  const amountErrors = [
    validateCurrencyAmount(
      treatment.taxableBase,
      'treatment.taxableBase',
      'Acquisition base'
    ),
    validateCurrencyAmount(
      treatment.outputVat.amount,
      'treatment.outputVat.amount',
      'Output VAT'
    ),
    validateCurrencyAmount(
      treatment.deductibleInputVat.amount,
      'treatment.deductibleInputVat.amount',
      'Deductible input VAT'
    ),
  ].filter((amountError): amountError is VatJournalPlanError => (
    amountError !== null
  ))

  errors.push(...amountErrors)

  if (amountErrors.length > 0) {
    return errors
  }

  const expectedVat = roundCurrency(treatment.taxableBase * 0.25)

  if (treatment.outputVat.amount !== expectedVat) {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.outputVat.amount',
        'Output VAT must equal 25 percent of the acquisition base.'
      )
    )
  }

  if (treatment.deductibleInputVat.amount !== treatment.outputVat.amount) {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.deductibleInputVat.amount',
        'Full deduction requires deductible input VAT to equal calculated output VAT.'
      )
    )
  }

  if (treatment.acquisitionBaseField !== '21') {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.acquisitionBaseField',
        'EU service reverse charge must use acquisition base field 21 in this slice.'
      )
    )
  }

  if (treatment.outputVat.reportField !== '30') {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.outputVat.reportField',
        '25 percent reverse-charge output VAT must use report field 30.'
      )
    )
  }

  if (treatment.deductibleInputVat.reportField !== '48') {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.deductibleInputVat.reportField',
        'Full deduction must use deductible input VAT report field 48.'
      )
    )
  }

  return errors
}

function reconcilePlan(
  treatment: VatTreatment,
  journalRows: VatJournalPlanRow[]
): VatJournalPlanReconciliation | VatJournalPlanError {
  const totalDebit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.debit, 0)
  )
  const totalCredit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.credit, 0)
  )

  if (totalDebit !== totalCredit) {
    return error(
      'unbalanced_journal_plan',
      'journalRows',
      'JournalPlan rows must balance before booking.'
    )
  }

  const acquisitionBase = sumRows(journalRows, 'acquisition_base', 'debit')
  const outputVat = sumRows(journalRows, 'calculated_output_vat', 'credit')
  const deductibleInputVat = sumRows(
    journalRows,
    'deductible_calculated_input_vat',
    'debit'
  )
  const paymentPayable = sumRows(journalRows, 'payment_payable', 'credit')

  if (acquisitionBase !== treatment.taxableBase) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Journal acquisition base must equal treatment taxable base.'
    )
  }

  if (outputVat !== treatment.outputVat.amount) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Journal output VAT must equal treatment output VAT.'
    )
  }

  if (deductibleInputVat !== treatment.deductibleInputVat.amount) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Journal deductible input VAT must equal treatment deductible input VAT.'
    )
  }

  if (paymentPayable !== treatment.taxableBase) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Payment/payable leg must equal the acquisition base for this verified case.'
    )
  }

  return {
    balanced: true,
    totalDebit,
    totalCredit,
    acquisitionBase,
    outputVat,
    deductibleInputVat,
    paymentPayable,
    acquisitionBaseField: '21',
    outputVatReportField: '30',
    deductibleInputVatReportField: '48',
  }
}

export function buildVatJournalPlan(
  input: BuildVatJournalPlanInput
): VatJournalPlanBuildResult {
  const paymentAccountResult =
    normalizePaymentAccount(input.paymentAccountNumber)
  const supportErrors = validateSupportedTreatment(input.treatment)

  if ('error' in paymentAccountResult || supportErrors.length > 0) {
    return blocked([
      ...supportErrors,
      ...('error' in paymentAccountResult ? [paymentAccountResult.error] : []),
    ])
  }

  const treatmentErrors =
    validateEuService25FullDeduction(input.treatment)

  if (treatmentErrors.length > 0) {
    return blocked(treatmentErrors)
  }

  const acquisitionBase = input.treatment.taxableBase
  const outputVat = input.treatment.outputVat.amount
  const deductibleInputVat = input.treatment.deductibleInputVat.amount

  const journalRows: VatJournalPlanRow[] = [
    {
      accountNumber: EU_SERVICE_25_ACCOUNTS.acquisitionBase,
      debit: acquisitionBase,
      credit: 0,
      role: 'acquisition_base',
    },
    {
      accountNumber: EU_SERVICE_25_ACCOUNTS.deductibleInputVat,
      debit: deductibleInputVat,
      credit: 0,
      role: 'deductible_calculated_input_vat',
    },
    {
      accountNumber: EU_SERVICE_25_ACCOUNTS.outputVat,
      debit: 0,
      credit: outputVat,
      role: 'calculated_output_vat',
    },
    {
      accountNumber: paymentAccountResult.accountNumber,
      debit: 0,
      credit: acquisitionBase,
      role: 'payment_payable',
    },
  ]

  const reconciliation = reconcilePlan(input.treatment, journalRows)

  if ('code' in reconciliation) {
    return blocked([reconciliation])
  }

  return ready({
    treatmentCode: input.treatment.code,
    ruleVersion: input.treatment.ruleVersion,
    factsVersion: input.treatment.evidence.factsVersion,
    journalRows,
    reconciliation,
  })
}
````````

==================================================

==================================================
FILE: src/lib/vatLifecycleUi.ts
==================================================

````typescript
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
````````

==================================================

==================================================
FILE: src/lib/vatPaymentSource.ts
==================================================

````typescript
import {
  getPaymentAccountRoleRecommendation,
  isValidPaymentRoleAccountNumberForRole,
  type PaymentAccountRole,
  type PaymentAccountRoleRecommendation,
} from './accountingKnowledge.ts'
import type { ConfiguredPaymentAccountRole } from './paymentAccountRoles'

export const VAT_V2_PAYMENT_SOURCE_CHOICES = [
  'business_account',
  'owner_private',
] as const

export type VatV2PaymentSourceChoice =
  typeof VAT_V2_PAYMENT_SOURCE_CHOICES[number]

export interface VatV2PaymentSourceOption {
  choice: VatV2PaymentSourceChoice
  role: PaymentAccountRole
  label: string
  summary: string
}

export const VAT_V2_PAYMENT_SOURCE_OPTIONS:
  Record<VatV2PaymentSourceChoice, VatV2PaymentSourceOption> = {
    business_account: {
      choice: 'business_account',
      role: 'business_payment_account',
      label: 'Företagets konto',
      summary: 'Inköpet betalades från företagets betalningskonto.',
    },
    owner_private: {
      choice: 'owner_private',
      role: 'owner_private_payment',
      label: 'Privat betalning',
      summary: 'Ägaren betalade ett verksamhetsinköp med privata pengar.',
    },
  }

export type VatV2PaymentSourceConfiguration =
  | {
      status: 'configured'
      choice: VatV2PaymentSourceChoice
      role: PaymentAccountRole
      accountNumber: string
      recommendation: PaymentAccountRoleRecommendation
    }
  | {
      status: 'unconfigured'
      choice: VatV2PaymentSourceChoice
      role: PaymentAccountRole
      recommendation: PaymentAccountRoleRecommendation
    }
  | {
      status: 'invalid_configuration'
      choice: VatV2PaymentSourceChoice
      role: PaymentAccountRole
      accountNumber: string
      recommendation: PaymentAccountRoleRecommendation
    }

export type VatV2BookingReadiness =
  | {
      status: 'ready_to_book'
      paymentAccountNumber: string
      paymentRole: PaymentAccountRole
    }
  | {
      status: 'not_ready_to_book'
      blockers: VatV2BookingReadinessBlocker[]
    }

export type VatV2BookingReadinessBlocker =
  | 'vat_treatment_not_ready'
  | 'payment_source_inactive'
  | 'payment_roles_loading'
  | 'payment_roles_error'
  | 'payment_role_unconfigured'
  | 'payment_role_invalid_configuration'

export type VatV2PaymentRoleConfigurationState =
  | 'inactive'
  | 'loading'
  | 'error'
  | 'loaded'

export function getVatV2PaymentSourceOption(
  choice: VatV2PaymentSourceChoice
) {
  return VAT_V2_PAYMENT_SOURCE_OPTIONS[choice]
}

export function getVatV2PaymentSourceRole(
  choice: VatV2PaymentSourceChoice
) {
  return getVatV2PaymentSourceOption(choice).role
}

export function resolveVatV2PaymentSourceConfiguration(
  choice: VatV2PaymentSourceChoice,
  configuredRoles: readonly ConfiguredPaymentAccountRole[]
): VatV2PaymentSourceConfiguration {
  const role = getVatV2PaymentSourceRole(choice)
  const recommendation = getPaymentAccountRoleRecommendation(role)
  const configuredRole = configuredRoles.find(
    candidate => candidate.role === role
  )

  if (!configuredRole) {
    return {
      status: 'unconfigured',
      choice,
      role,
      recommendation,
    }
  }

  if (
    !isValidPaymentRoleAccountNumberForRole(
      role,
      configuredRole.accountNumber
    )
  ) {
    return {
      status: 'invalid_configuration',
      choice,
      role,
      accountNumber: configuredRole.accountNumber,
      recommendation,
    }
  }

  return {
    status: 'configured',
    choice,
    role,
    accountNumber: configuredRole.accountNumber.trim(),
    recommendation,
  }
}

export function buildVatV2BookingReadiness(input: {
  treatmentReady: boolean
  roleConfigurationState: VatV2PaymentRoleConfigurationState
  paymentSource: VatV2PaymentSourceConfiguration
}): VatV2BookingReadiness {
  const blockers: VatV2BookingReadinessBlocker[] = []

  if (!input.treatmentReady) {
    blockers.push('vat_treatment_not_ready')
  }

  if (input.roleConfigurationState === 'inactive') {
    blockers.push('payment_source_inactive')
  }

  if (input.roleConfigurationState === 'loading') {
    blockers.push('payment_roles_loading')
  }

  if (input.roleConfigurationState === 'error') {
    blockers.push('payment_roles_error')
  }

  if (input.paymentSource.status === 'unconfigured') {
    blockers.push('payment_role_unconfigured')
  }

  if (input.paymentSource.status === 'invalid_configuration') {
    blockers.push('payment_role_invalid_configuration')
  }

  if (
    blockers.length > 0 ||
    input.roleConfigurationState !== 'loaded' ||
    input.paymentSource.status !== 'configured'
  ) {
    return {
      status: 'not_ready_to_book',
      blockers,
    }
  }

  return {
    status: 'ready_to_book',
    paymentAccountNumber: input.paymentSource.accountNumber,
    paymentRole: input.paymentSource.role,
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatProfileAdapter.ts
==================================================

````typescript
import type {
  CompanyVatProfile,
  CompanyVatProfileValidationError,
  DeductionEntitlement,
  DomesticSalesVatTreatment,
  ForeignPurchaseReporting,
  ValidationResult,
  VatPeriodType,
  VatRegistrationStatus,
} from './vatDomain'
import { validateCompanyVatProfile } from './vatDomain.ts'

export type PersistedDefaultDeductionEntitlement = Exclude<
  DeductionEntitlement,
  'partial'
>

export interface PersistedVatProfile {
  domestic_sales_vat_treatment?: DomesticSalesVatTreatment | null
  vat_status?: VatRegistrationStatus | null
  foreign_purchase_reporting?: ForeignPurchaseReporting | null
  vat_period_type?: VatPeriodType | null
  vat_management_from?: string | null
  default_deduction_entitlement?: PersistedDefaultDeductionEntitlement | null
}

export interface CompanyVatProfileAdapterResult {
  profile: CompanyVatProfile
  validation: ValidationResult<CompanyVatProfileValidationError>
}

function knownOrUnknown<T extends string>(
  value: T | null | undefined,
  allowed: readonly T[]
): T | 'unknown' {
  if (value == null || value === '') return 'unknown'
  return allowed.includes(value) ? value : 'unknown'
}

function knownPeriodOrNull(
  value: VatPeriodType | null | undefined
): VatPeriodType | null {
  if (value === 'month' || value === 'quarter' || value === 'year') {
    return value
  }

  return null
}

export function profileToCompanyVatProfile(
  persisted: PersistedVatProfile | null | undefined
): CompanyVatProfileAdapterResult {
  const profile: CompanyVatProfile = {
    domesticSalesVatTreatment: knownOrUnknown(
      persisted?.domestic_sales_vat_treatment,
      ['taxable', 'small_business_exempt', 'mixed', 'exempt_other', 'unknown']
    ),
    vatRegistrationStatus: knownOrUnknown(
      persisted?.vat_status,
      ['registered', 'not_registered', 'unknown']
    ),
    foreignPurchaseReporting: knownOrUnknown(
      persisted?.foreign_purchase_reporting,
      ['required', 'not_required', 'unknown']
    ),
    vatPeriodType: knownPeriodOrNull(persisted?.vat_period_type),
    vatReportingFrom: persisted?.vat_management_from ?? null,
    defaultDeductionEntitlement: knownOrUnknown(
      persisted?.default_deduction_entitlement,
      ['full', 'none', 'unknown']
    ),
  }

  return {
    profile,
    validation: validateCompanyVatProfile(profile),
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatReportAggregation.ts
==================================================

````typescript
import type { VatReturnField } from './vatDomain'

export const VAT_REPORT_FIELDS = [
  '05',
  '10',
  '11',
  '12',
  '20',
  '21',
  '22',
  '30',
  '31',
  '32',
  '48',
  '49',
  '50',
  '60',
  '61',
  '62',
] as const satisfies readonly VatReturnField[]

export type VatReportFields = Record<VatReturnField, number>

export interface VatReportTransactionInput {
  id: string
  source?: string | null
  /**
   * Data loading scopes native VAT V2 report contribution by transaction.date.
   * A VAT V2 transaction outside the selected period may still be present to
   * prove its journal rows cannot fall back to legacy account inference.
   */
  inReportPeriod?: boolean
}

export interface VatReportJournalRowInput {
  transactionId: string
  accountNumber: string
  debit: number
  credit: number
  /**
   * Period and tenant scoping is owned by the data-loading layer. This flag
   * lets that layer pass all 26xx rows for candidate verifications while still
   * marking which row dates belong to the selected report period.
   */
  inReportPeriod: boolean
}

export interface VatReportSnapshotInput {
  transactionId: string
  snapshot: unknown
}

export type VatReportAggregationErrorCode =
  | 'vat_v2_snapshot_missing'
  | 'vat_v2_snapshot_duplicate'
  | 'vat_v2_snapshot_unexpected'
  | 'vat_v2_snapshot_malformed'
  | 'vat_v2_snapshot_unsupported'
  | 'vat_v2_snapshot_inconsistent'

export interface VatReportAggregationError {
  code: VatReportAggregationErrorCode
  transactionId: string
  message: string
  path?: string
}

export interface VatReportAggregation {
  fields: VatReportFields
  legacy: {
    outputVat25: number
    outputVat12: number
    outputVat6: number
    inputVat: number
    domesticSalesBase25: number
    domesticSalesBase12: number
    domesticSalesBase6: number
    domesticSalesBase: number
  }
  vatV2: {
    nativeTransactionIds: string[]
  }
}

export type VatReportAggregationResult =
  | {
      status: 'ready'
      report: VatReportAggregation
      errors: []
    }
  | {
      status: 'blocked'
      report: null
      errors: VatReportAggregationError[]
    }

type SnapshotObject = Record<string, unknown>

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function isCurrencyAmount(value: number) {
  return Number.isFinite(value) && roundCurrency(value) === value
}

function createEmptyFields(): VatReportFields {
  return VAT_REPORT_FIELDS.reduce((fields, field) => {
    fields[field] = 0
    return fields
  }, {} as VatReportFields)
}

function addField(fields: VatReportFields, field: VatReturnField, amount: number) {
  fields[field] = roundCurrency(fields[field] + amount)
}

function isObject(value: unknown): value is SnapshotObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function child(
  object: SnapshotObject,
  key: string
): SnapshotObject | null {
  const value = object[key]
  return isObject(value) ? value : null
}

function stringValue(object: SnapshotObject, key: string) {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

function booleanValue(object: SnapshotObject, key: string) {
  const value = object[key]
  return typeof value === 'boolean' ? value : null
}

function numberValue(object: SnapshotObject, key: string) {
  const value = object[key]
  return typeof value === 'number' && isCurrencyAmount(value) ? value : null
}

function error(
  code: VatReportAggregationErrorCode,
  transactionId: string,
  message: string,
  path?: string
): VatReportAggregationError {
  return { code, transactionId, message, path }
}

function isOutputVatAccount(accountNumber: string) {
  return (
    accountNumber.startsWith('261') ||
    accountNumber.startsWith('262') ||
    accountNumber.startsWith('263')
  )
}

function isInputVatAccount(accountNumber: string) {
  return accountNumber.startsWith('264')
}

function isSettlementAccount(accountNumber: string) {
  return accountNumber.startsWith('265')
}

function legacyVatRateForAccount(accountNumber: string): 25 | 12 | 6 | null {
  if (accountNumber.startsWith('261')) return 25
  if (accountNumber.startsWith('262')) return 12
  if (accountNumber.startsWith('263')) return 6
  return null
}

function validateSupportedVatV2Snapshot(
  transactionId: string,
  snapshot: unknown
):
  | {
      status: 'ready'
      contribution: {
        field21: number
        field30: number
        field48: number
      }
    }
  | {
      status: 'blocked'
      errors: VatReportAggregationError[]
    } {
  const errors: VatReportAggregationError[] = []

  if (!isObject(snapshot)) {
    return {
      status: 'blocked',
      errors: [
        error(
          'vat_v2_snapshot_malformed',
          transactionId,
          'VAT V2 audit snapshot must be an object.'
        ),
      ],
    }
  }

  const vat = child(snapshot, 'vat')
  const outputVat = vat ? child(vat, 'outputVat') : null
  const deductibleInputVat = vat ? child(vat, 'deductibleInputVat') : null
  const reconciliation = child(snapshot, 'reconciliation')

  if (stringValue(snapshot, 'schemaVersion') !== 'vat-audit-snapshot-v1') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Unsupported VAT audit snapshot schema version.',
      'schemaVersion'
    ))
  }

  if (stringValue(snapshot, 'journalPlanVersion') !== 'vat-journal-plan-v1') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Unsupported VAT audit snapshot journal-plan version.',
      'journalPlanVersion'
    ))
  }

  if (stringValue(snapshot, 'treatmentCode') !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Unsupported VAT V2 treatment for report aggregation.',
      'treatmentCode'
    ))
  }

  if (!vat || !outputVat || !deductibleInputVat || !reconciliation) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 audit snapshot is missing required VAT or reconciliation evidence.'
    ))
  }

  const taxableBase = vat ? numberValue(vat, 'taxableBase') : null
  const acquisitionBaseField = vat ? stringValue(vat, 'acquisitionBaseField') : null
  const outputVatAmount = outputVat ? numberValue(outputVat, 'amount') : null
  const outputVatReportField = outputVat ? stringValue(outputVat, 'reportField') : null
  const deductibleInputVatAmount = deductibleInputVat
    ? numberValue(deductibleInputVat, 'amount')
    : null
  const deductibleInputVatReportField = deductibleInputVat
    ? stringValue(deductibleInputVat, 'reportField')
    : null
  const deductionEntitlement = deductibleInputVat
    ? stringValue(deductibleInputVat, 'entitlement')
    : null

  if (taxableBase === null || taxableBase <= 0) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 taxable base must be a positive currency amount.',
      'vat.taxableBase'
    ))
  }

  if (acquisitionBaseField !== '21') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports acquisition field 21.',
      'vat.acquisitionBaseField'
    ))
  }

  if (outputVatAmount === null || outputVatAmount < 0) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 output VAT must be a currency amount.',
      'vat.outputVat.amount'
    ))
  }

  if (outputVatReportField !== '30') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports output VAT field 30.',
      'vat.outputVat.reportField'
    ))
  }

  if (deductibleInputVatAmount === null || deductibleInputVatAmount < 0) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 deductible input VAT must be a currency amount.',
      'vat.deductibleInputVat.amount'
    ))
  }

  if (deductibleInputVatReportField !== '48') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports deductible input VAT field 48.',
      'vat.deductibleInputVat.reportField'
    ))
  }

  if (deductionEntitlement !== 'full') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports full deduction.',
      'vat.deductibleInputVat.entitlement'
    ))
  }

  if (
    taxableBase !== null &&
    outputVatAmount !== null &&
    outputVatAmount !== roundCurrency(taxableBase * 0.25)
  ) {
    errors.push(error(
      'vat_v2_snapshot_inconsistent',
      transactionId,
      'VAT V2 output VAT does not reconcile to 25 percent of taxable base.',
      'vat.outputVat.amount'
    ))
  }

  if (
    outputVatAmount !== null &&
    deductibleInputVatAmount !== null &&
    deductibleInputVatAmount !== outputVatAmount
  ) {
    errors.push(error(
      'vat_v2_snapshot_inconsistent',
      transactionId,
      'Full deduction requires deductible input VAT to equal output VAT.',
      'vat.deductibleInputVat.amount'
    ))
  }

  if (reconciliation) {
    const balanced = booleanValue(reconciliation, 'balanced')
    const reconciledBase = numberValue(reconciliation, 'acquisitionBase')
    const reconciledOutput = numberValue(reconciliation, 'outputVat')
    const reconciledInput = numberValue(reconciliation, 'deductibleInputVat')
    const totalDebit = numberValue(reconciliation, 'totalDebit')
    const totalCredit = numberValue(reconciliation, 'totalCredit')

    if (balanced !== true) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation must be balanced.',
        'reconciliation.balanced'
      ))
    }

    if (reconciledBase !== taxableBase) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation base does not match VAT semantics.',
        'reconciliation.acquisitionBase'
      ))
    }

    if (reconciledOutput !== outputVatAmount) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation output VAT does not match VAT semantics.',
        'reconciliation.outputVat'
      ))
    }

    if (reconciledInput !== deductibleInputVatAmount) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation deductible input VAT does not match VAT semantics.',
        'reconciliation.deductibleInputVat'
      ))
    }

    if (
      stringValue(reconciliation, 'acquisitionBaseField') !== '21' ||
      stringValue(reconciliation, 'outputVatReportField') !== '30' ||
      stringValue(reconciliation, 'deductibleInputVatReportField') !== '48'
    ) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation report fields do not match supported report fields.',
        'reconciliation'
      ))
    }

    if (
      totalDebit === null ||
      totalCredit === null ||
      totalDebit !== totalCredit
    ) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation totals must balance.',
        'reconciliation.totalDebit'
      ))
    }
  }

  if (errors.length > 0) {
    return { status: 'blocked', errors }
  }

  return {
    status: 'ready',
    contribution: {
      field21: taxableBase as number,
      field30: outputVatAmount as number,
      field48: deductibleInputVatAmount as number,
    },
  }
}

function finalizeNetVat(fields: VatReportFields) {
  fields['49'] = roundCurrency(
    fields['10'] +
      fields['11'] +
      fields['12'] +
      fields['30'] +
      fields['31'] +
      fields['32'] +
      fields['60'] +
      fields['61'] +
      fields['62'] -
      fields['48']
  )
}

export function aggregateVatReport(input: {
  transactions: VatReportTransactionInput[]
  journalRows: VatReportJournalRowInput[]
  vatV2Snapshots: VatReportSnapshotInput[]
}): VatReportAggregationResult {
  const fields = createEmptyFields()
  const errors: VatReportAggregationError[] = []
  const transactionById = new Map(input.transactions.map(tx => [tx.id, tx]))
  const nativeVatV2TransactionIds = new Set(
    input.transactions
      .filter(tx => tx.source === 'vat_v2')
      .map(tx => tx.id)
  )
  const reportVatV2TransactionIds = new Set(
    input.transactions
      .filter(tx => tx.source === 'vat_v2' && tx.inReportPeriod !== false)
      .map(tx => tx.id)
  )
  const snapshotsByTransaction = new Map<string, VatReportSnapshotInput[]>()

  for (const snapshot of input.vatV2Snapshots) {
    const existing = snapshotsByTransaction.get(snapshot.transactionId) ?? []
    existing.push(snapshot)
    snapshotsByTransaction.set(snapshot.transactionId, existing)

    if (transactionById.get(snapshot.transactionId)?.source !== 'vat_v2') {
      errors.push(error(
        'vat_v2_snapshot_unexpected',
        snapshot.transactionId,
        'VAT V2 snapshot input must belong to a native VAT V2 transaction.'
      ))
    }
  }

  for (const transactionId of reportVatV2TransactionIds) {
    const snapshots = snapshotsByTransaction.get(transactionId) ?? []

    if (snapshots.length === 0) {
      errors.push(error(
        'vat_v2_snapshot_missing',
        transactionId,
        'Native VAT V2 transaction is missing an authoritative audit snapshot.'
      ))
      continue
    }

    if (snapshots.length > 1) {
      errors.push(error(
        'vat_v2_snapshot_duplicate',
        transactionId,
        'Native VAT V2 transaction has multiple audit snapshots.'
      ))
      continue
    }

    const validated = validateSupportedVatV2Snapshot(
      transactionId,
      snapshots[0].snapshot
    )

    if (validated.status === 'blocked') {
      errors.push(...validated.errors)
      continue
    }

    addField(fields, '21', validated.contribution.field21)
    addField(fields, '30', validated.contribution.field30)
    addField(fields, '48', validated.contribution.field48)
  }

  if (errors.length > 0) {
    return { status: 'blocked', report: null, errors }
  }

  const legacyRows = input.journalRows.filter(
    row => !nativeVatV2TransactionIds.has(row.transactionId)
  )
  const candidateTransactionIds = new Set(
    legacyRows
      .filter(row => (
        row.inReportPeriod &&
        (isOutputVatAccount(row.accountNumber) || isInputVatAccount(row.accountNumber))
      ))
      .map(row => row.transactionId)
  )
  const rowsByTransaction = new Map<string, VatReportJournalRowInput[]>()

  for (const row of legacyRows) {
    if (!candidateTransactionIds.has(row.transactionId)) continue

    const rows = rowsByTransaction.get(row.transactionId) ?? []
    rows.push(row)
    rowsByTransaction.set(row.transactionId, rows)
  }

  let outputVat25 = 0
  let outputVat12 = 0
  let outputVat6 = 0
  let inputVat = 0

  for (const rows of rowsByTransaction.values()) {
    if (rows.some(row => isSettlementAccount(row.accountNumber))) {
      continue
    }

    for (const row of rows) {
      if (!row.inReportPeriod) continue

      const netCredit = roundCurrency(row.credit - row.debit)

      if (isOutputVatAccount(row.accountNumber)) {
        const rate = legacyVatRateForAccount(row.accountNumber)
        if (rate === 25) outputVat25 = roundCurrency(outputVat25 + netCredit)
        if (rate === 12) outputVat12 = roundCurrency(outputVat12 + netCredit)
        if (rate === 6) outputVat6 = roundCurrency(outputVat6 + netCredit)
      } else if (isInputVatAccount(row.accountNumber)) {
        inputVat = roundCurrency(inputVat - netCredit)
      }
    }
  }

  const domesticSalesBase25 = roundCurrency(outputVat25 / 0.25)
  const domesticSalesBase12 = roundCurrency(outputVat12 / 0.12)
  const domesticSalesBase6 = roundCurrency(outputVat6 / 0.06)
  const domesticSalesBase = roundCurrency(
    domesticSalesBase25 + domesticSalesBase12 + domesticSalesBase6
  )

  addField(fields, '10', outputVat25)
  addField(fields, '11', outputVat12)
  addField(fields, '12', outputVat6)
  addField(fields, '48', inputVat)
  addField(fields, '05', domesticSalesBase)
  finalizeNetVat(fields)

  return {
    status: 'ready',
    report: {
      fields,
      legacy: {
        outputVat25,
        outputVat12,
        outputVat6,
        inputVat,
        domesticSalesBase25,
        domesticSalesBase12,
        domesticSalesBase6,
        domesticSalesBase,
      },
      vatV2: {
        nativeTransactionIds: Array.from(reportVatV2TransactionIds),
      },
    },
    errors: [],
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatReportPresentation.ts
==================================================

````typescript
import type { VatReportAggregation } from './vatReportAggregation'
import type { VatReturnField } from './vatDomain'
import type { VatReportServiceError } from './vatReportService'

export interface VatReportDisplayRow {
  field: VatReturnField
  label: string
  description?: string
  amount: number
}

export interface VatReportPresentation {
  fields: Record<VatReturnField, number>
  domesticSalesBase: number
  domesticSalesBase25: number
  domesticSalesBase12: number
  domesticSalesBase6: number
  ordinaryOutputVat25: number
  ordinaryOutputVat12: number
  ordinaryOutputVat6: number
  euServicePurchases: number
  euServiceOutputVat25: number
  deductibleInputVat: number
  netVat: number
  totalOutputVat: number
  domesticSalesRows: VatReportDisplayRow[]
  ordinaryOutputRows: VatReportDisplayRow[]
  euPurchaseRows: VatReportDisplayRow[]
  inputRows: VatReportDisplayRow[]
  netRows: VatReportDisplayRow[]
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function buildVatReportPresentation(
  report: VatReportAggregation
): VatReportPresentation {
  const fields = report.fields
  const totalOutputVat = roundCurrency(
    fields['10'] +
      fields['11'] +
      fields['12'] +
      fields['30'] +
      fields['31'] +
      fields['32'] +
      fields['60'] +
      fields['61'] +
      fields['62']
  )

  return {
    fields,
    domesticSalesBase: fields['05'],
    domesticSalesBase25: report.legacy.domesticSalesBase25,
    domesticSalesBase12: report.legacy.domesticSalesBase12,
    domesticSalesBase6: report.legacy.domesticSalesBase6,
    ordinaryOutputVat25: fields['10'],
    ordinaryOutputVat12: fields['11'],
    ordinaryOutputVat6: fields['12'],
    euServicePurchases: fields['21'],
    euServiceOutputVat25: fields['30'],
    deductibleInputVat: fields['48'],
    netVat: fields['49'],
    totalOutputVat,
    domesticSalesRows: [
      {
        field: '05',
        label: 'Momspliktig försäljning exkl. moms',
        description: 'Försäljningsunderlag för vanlig momspliktig försäljning i Sverige',
        amount: fields['05'],
      },
    ],
    ordinaryOutputRows: [
      { field: '10', label: 'Utgående moms 25 %', amount: fields['10'] },
      { field: '11', label: 'Utgående moms 12 %', amount: fields['11'] },
      { field: '12', label: 'Utgående moms 6 %', amount: fields['12'] },
    ],
    euPurchaseRows: [
      {
        field: '21',
        label: 'Inköp av tjänster från ett annat EU-land',
        amount: fields['21'],
      },
      {
        field: '30',
        label: 'Utgående moms 25 % på inköp i rutorna 20–24',
        amount: fields['30'],
      },
    ],
    inputRows: [
      { field: '48', label: 'Ingående moms att dra av', amount: fields['48'] },
    ],
    netRows: [
      {
        field: '49',
        label: 'Moms att betala eller få tillbaka',
        amount: fields['49'],
      },
    ],
  }
}

export function vatReportBlockedMessage(errors: VatReportServiceError[]) {
  if (errors.some(error => error.code === 'invalid_loaded_scope')) {
    return 'Momsrapporten kan inte beräknas säkert eftersom laddad data inte matchar inloggat konto.'
  }

  if (errors.some(error => error.code === 'query_failed')) {
    return 'Momsrapporten kunde inte hämtas just nu. Inga belopp visas förrän rapporten kan beräknas säkert.'
  }

  return 'Momsrapporten kan inte beräknas säkert eftersom ett inköp med omvänd moms saknar kontrollerbart underlag.'
}
````````

==================================================

==================================================
FILE: src/lib/vatReportService.ts
==================================================

````typescript
import {
  aggregateVatReport,
  type VatReportAggregation,
  type VatReportAggregationError,
  type VatReportJournalRowInput,
  type VatReportSnapshotInput,
  type VatReportTransactionInput,
} from './vatReportAggregation.ts'

export type VatReportServiceErrorCode =
  | 'query_failed'
  | 'invalid_loaded_scope'
  | 'aggregation_blocked'

export interface VatReportServiceError {
  code: VatReportServiceErrorCode
  message: string
  details?: string
  aggregationErrors?: VatReportAggregationError[]
}

export type VatReportServiceResult =
  | {
      status: 'ready'
      report: VatReportAggregation
      errors: []
    }
  | {
      status: 'blocked'
      report: null
      errors: VatReportServiceError[]
    }

export interface VatReportTransactionRow {
  id: string
  user_id: string
  date: string
  source: string | null
}

export interface VatReportJournalEntryRow {
  user_id: string
  transaction_id: string
  account_number: string
  debit: number | string | null
  credit: number | string | null
  date: string | null
}

export interface VatReportAuditSnapshotRow {
  user_id: string
  transaction_id: string
  snapshot: unknown
  created_at?: string | null
}

export interface LoadedVatReportRows {
  transactions: VatReportTransactionRow[]
  journalRows: VatReportJournalEntryRow[]
  vatV2Snapshots: VatReportAuditSnapshotRow[]
}

type VatReportInputBuildResult =
  | {
      status: 'ready'
      input: {
        transactions: VatReportTransactionInput[]
        journalRows: VatReportJournalRowInput[]
        vatV2Snapshots: VatReportSnapshotInput[]
      }
      errors: []
    }
  | {
      status: 'blocked'
      input: null
      errors: VatReportServiceError[]
    }

type VatReportQueryResult = {
  data: unknown
  error: unknown
}

type VatReportSupabaseFilterQuery = PromiseLike<VatReportQueryResult> & {
  eq(column: string, value: unknown): VatReportSupabaseFilterQuery
  gte(column: string, value: string): VatReportSupabaseFilterQuery
  lte(column: string, value: string): VatReportSupabaseFilterQuery
  like(column: string, value: string): VatReportSupabaseFilterQuery
  in(column: string, values: string[]): VatReportSupabaseFilterQuery
}

type VatReportSupabaseQuery = {
  select(columns: string): VatReportSupabaseFilterQuery
}

type VatReportSupabaseClient = {
  from(table: string): VatReportSupabaseQuery
}

function isInPeriod(date: string | null | undefined, startDate: string, endDate: string) {
  return Boolean(date && date >= startDate && date <= endDate)
}

function isOutputVatAccount(accountNumber: string) {
  return (
    accountNumber.startsWith('261') ||
    accountNumber.startsWith('262') ||
    accountNumber.startsWith('263')
  )
}

function isInputVatAccount(accountNumber: string) {
  return accountNumber.startsWith('264')
}

function isVatReportCandidateAccount(accountNumber: string) {
  return isOutputVatAccount(accountNumber) || isInputVatAccount(accountNumber)
}

function isVat26Account(accountNumber: string) {
  return accountNumber.startsWith('26')
}

function numericAmount(value: number | string | null) {
  if (value == null) return 0
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : Number.NaN
}

function serviceError(
  code: VatReportServiceErrorCode,
  message: string,
  details?: string,
  aggregationErrors?: VatReportAggregationError[]
): VatReportServiceError {
  return { code, message, details, aggregationErrors }
}

function queryError(message: string, details: unknown): VatReportServiceResult {
  const detailText =
    details instanceof Error
      ? details.message
      : typeof details === 'string'
      ? details
      : undefined

  return {
    status: 'blocked',
    report: null,
    errors: [serviceError('query_failed', message, detailText)],
  }
}

function assertLoadedTenantScope(
  userId: string,
  rows: LoadedVatReportRows
): VatReportServiceError[] {
  const errors: VatReportServiceError[] = []

  if (rows.transactions.some(row => row.user_id !== userId)) {
    errors.push(serviceError(
      'invalid_loaded_scope',
      'Loaded VAT report transactions contain rows outside the authenticated user scope.'
    ))
  }

  if (rows.journalRows.some(row => row.user_id !== userId)) {
    errors.push(serviceError(
      'invalid_loaded_scope',
      'Loaded VAT report journal rows contain rows outside the authenticated user scope.'
    ))
  }

  if (rows.vatV2Snapshots.some(row => row.user_id !== userId)) {
    errors.push(serviceError(
      'invalid_loaded_scope',
      'Loaded VAT report snapshots contain rows outside the authenticated user scope.'
    ))
  }

  return errors
}

function buildVatReportAggregatorInput(input: {
  userId: string
  startDate: string
  endDate: string
  rows: LoadedVatReportRows
}): VatReportInputBuildResult {
  const tenantErrors = assertLoadedTenantScope(input.userId, input.rows)

  if (tenantErrors.length > 0) {
    return { status: 'blocked', input: null, errors: tenantErrors }
  }

  const periodCandidateTransactionIds = new Set(
    input.rows.journalRows
      .filter(row => (
        isInPeriod(row.date, input.startDate, input.endDate) &&
        isVatReportCandidateAccount(row.account_number)
      ))
      .map(row => row.transaction_id)
  )
  const reportVatV2TransactionIds = new Set(
    input.rows.transactions
      .filter(row => (
        row.source === 'vat_v2' &&
        isInPeriod(row.date, input.startDate, input.endDate)
      ))
      .map(row => row.id)
  )
  const relevantTransactionIds = new Set([
    ...periodCandidateTransactionIds,
    ...reportVatV2TransactionIds,
  ])
  const transactions: VatReportTransactionInput[] = []
  const seenTransactions = new Set<string>()

  for (const row of input.rows.transactions) {
    if (
      !relevantTransactionIds.has(row.id) &&
      row.source !== 'vat_v2'
    ) {
      continue
    }

    if (
      row.source === 'vat_v2' &&
      !periodCandidateTransactionIds.has(row.id) &&
      !reportVatV2TransactionIds.has(row.id)
    ) {
      continue
    }

    if (seenTransactions.has(row.id)) continue

    transactions.push({
      id: row.id,
      source: row.source,
      inReportPeriod: isInPeriod(row.date, input.startDate, input.endDate),
    })
    seenTransactions.add(row.id)
  }

  const knownTransactionIds = new Set(transactions.map(row => row.id))
  const journalRows: VatReportJournalRowInput[] = input.rows.journalRows
    .filter(row => (
      knownTransactionIds.has(row.transaction_id) &&
      isVat26Account(row.account_number)
    ))
    .map(row => ({
      transactionId: row.transaction_id,
      accountNumber: row.account_number,
      debit: numericAmount(row.debit),
      credit: numericAmount(row.credit),
      inReportPeriod: isInPeriod(row.date, input.startDate, input.endDate),
    }))

  if (
    journalRows.some(row => !Number.isFinite(row.debit) || !Number.isFinite(row.credit))
  ) {
    return {
      status: 'blocked',
      input: null,
      errors: [serviceError(
        'invalid_loaded_scope',
        'Loaded VAT report journal rows contain non-numeric debit or credit amounts.'
      )],
    }
  }

  const vatV2Snapshots: VatReportSnapshotInput[] = input.rows.vatV2Snapshots
    .filter(row => reportVatV2TransactionIds.has(row.transaction_id))
    .map(row => ({
      transactionId: row.transaction_id,
      snapshot: row.snapshot,
    }))

  return {
    status: 'ready',
    input: {
      transactions,
      journalRows,
      vatV2Snapshots,
    },
    errors: [],
  }
}

export function calculateVatReportFromLoadedRows(input: {
  userId: string
  startDate: string
  endDate: string
  rows: LoadedVatReportRows
}): VatReportServiceResult {
  const aggregatorInput = buildVatReportAggregatorInput(input)

  if (aggregatorInput.status === 'blocked') {
    return {
      status: 'blocked',
      report: null,
      errors: aggregatorInput.errors,
    }
  }

  const aggregation = aggregateVatReport(aggregatorInput.input)

  if (aggregation.status === 'blocked') {
    return {
      status: 'blocked',
      report: null,
      errors: [serviceError(
        'aggregation_blocked',
        'VAT report could not be safely calculated from loaded data.',
        undefined,
        aggregation.errors
      )],
    }
  }

  return {
    status: 'ready',
    report: aggregation.report,
    errors: [],
  }
}

async function loadTransactionsByIds(
  db: VatReportSupabaseClient,
  userId: string,
  transactionIds: string[]
): Promise<{ data: VatReportTransactionRow[]; error: unknown }> {
  if (transactionIds.length === 0) return { data: [], error: null }

  const { data, error } = await db
    .from('transactions')
    .select('id, user_id, date, source')
    .eq('user_id', userId)
    .in('id', transactionIds)

  return { data: (data ?? []) as VatReportTransactionRow[], error }
}

export async function getVatReportForPeriod(
  startDate: string,
  endDate: string
): Promise<VatReportServiceResult> {
  const [{ supabase }, { getUserId }] = await Promise.all([
    import('./supabaseClient'),
    import('./accountingService'),
  ])
  const db = supabase as unknown as VatReportSupabaseClient
  let userId: string

  try {
    userId = await getUserId()
  } catch (err) {
    return queryError('Could not determine authenticated user for VAT report.', err)
  }

  const { data: period26Rows, error: period26Error } = await db
    .from('journal_entries')
    .select('user_id, transaction_id, account_number, date')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .like('account_number', '26%')

  if (period26Error) {
    return queryError('Could not load VAT report candidate journal rows.', period26Error)
  }

  const periodCandidateTransactionIds = Array.from(new Set(
    ((period26Rows ?? []) as Pick<
      VatReportJournalEntryRow,
      'account_number' | 'transaction_id'
    >[])
      .filter(row => isVatReportCandidateAccount(row.account_number))
      .map(row => row.transaction_id)
  ))

  const { data: periodVatV2Transactions, error: vatV2TransactionError } =
    await db
      .from('transactions')
      .select('id, user_id, date, source')
      .eq('user_id', userId)
      .eq('source', 'vat_v2')
      .gte('date', startDate)
      .lte('date', endDate)

  if (vatV2TransactionError) {
    return queryError('Could not load native VAT V2 transactions.', vatV2TransactionError)
  }

  const periodVatV2TransactionRows =
    (periodVatV2Transactions ?? []) as VatReportTransactionRow[]
  const periodVatV2TransactionIds = periodVatV2TransactionRows.map(row => row.id)
  const relevantTransactionIds = Array.from(new Set([
    ...periodCandidateTransactionIds,
    ...periodVatV2TransactionIds,
  ]))
  const { data: candidateTransactionRows, error: transactionError } =
    await loadTransactionsByIds(db, userId, relevantTransactionIds)

  if (transactionError) {
    return queryError('Could not load VAT report transactions.', transactionError)
  }

  const allTransactionsById = new Map<string, VatReportTransactionRow>()

  for (const row of candidateTransactionRows) {
    allTransactionsById.set(row.id, row)
  }

  for (const row of periodVatV2TransactionRows) {
    allTransactionsById.set(row.id, row)
  }

  const allTransactionRows = Array.from(allTransactionsById.values())
  const { data: all26Rows, error: all26Error } =
    relevantTransactionIds.length === 0
      ? { data: [] as VatReportJournalEntryRow[], error: null }
      : await db
        .from('journal_entries')
        .select('user_id, transaction_id, account_number, debit, credit, date')
        .eq('user_id', userId)
        .in('transaction_id', relevantTransactionIds)
        .like('account_number', '26%')

  if (all26Error) {
    return queryError('Could not load complete VAT report journal rows.', all26Error)
  }

  const { data: snapshotRows, error: snapshotError } =
    periodVatV2TransactionIds.length === 0
      ? { data: [] as VatReportAuditSnapshotRow[], error: null }
      : await db
        .from('vat_audit_snapshots')
        .select('user_id, transaction_id, snapshot, created_at')
        .eq('user_id', userId)
        .in('transaction_id', periodVatV2TransactionIds)

  if (snapshotError) {
    return queryError('Could not load VAT V2 audit snapshots.', snapshotError)
  }

  return calculateVatReportFromLoadedRows({
    userId,
    startDate,
    endDate,
    rows: {
      transactions: allTransactionRows,
      journalRows: (all26Rows ?? []) as VatReportJournalEntryRow[],
      vatV2Snapshots: (snapshotRows ?? []) as VatReportAuditSnapshotRow[],
    },
  })
}
````````

==================================================

==================================================
FILE: src/lib/vatRuntimeBooking.ts
==================================================

````typescript
import type { PaymentAccountRole } from './paymentAccountRoles'
import type { VatV2BookingReadiness } from './vatPaymentSource'
import type { VatTreatment } from './vatDomain'
import type {
  VatV2TransactionPreflightResult,
} from './vatTransactionPreflight'

export type VatV2RuntimeTransactionEvent = 'purchase' | 'unsupported'

export type VatV2RuntimeBookingBlockCode =
  | 'vat_v2_assessment_inactive'
  | 'unsupported_transaction_event'
  | 'vat_treatment_not_ready'
  | 'payment_source_not_ready'
  | 'invalid_booking_fields'
  | 'unsupported_runtime_treatment'

export interface VatV2RuntimeBookingError {
  code: VatV2RuntimeBookingBlockCode
  message: string
}

export interface VatV2RuntimeBookingRequest {
  date: string
  description: string
  treatment: VatTreatment
  paymentAccountNumber: string
  paymentRole: PaymentAccountRole
}

export interface BuildVatV2RuntimeBookingRequestInput {
  assessmentActive: boolean
  transactionEvent: VatV2RuntimeTransactionEvent
  preflight: VatV2TransactionPreflightResult
  bookingReadiness: VatV2BookingReadiness
  date: string
  description: string
}

export type VatV2RuntimeBookingRequestResult =
  | {
      status: 'ready'
      request: VatV2RuntimeBookingRequest
      errors: []
    }
  | {
      status: 'blocked'
      request: null
      errors: VatV2RuntimeBookingError[]
    }

export type VatV2RuntimeSubmitGuardResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'blocked_duplicate' }

export function shouldShowOrdinaryV1FieldsForVatV2Form(input: {
  assessmentActive: boolean
}) {
  return !input.assessmentActive
}

export function shouldRequireOrdinaryV1AmountForVatV2Form(input: {
  assessmentActive: boolean
}) {
  return shouldShowOrdinaryV1FieldsForVatV2Form(input)
}

function error(
  code: VatV2RuntimeBookingBlockCode,
  message: string
): VatV2RuntimeBookingError {
  return { code, message }
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function isPositiveCurrencyAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    roundCurrency(value) === value
  )
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isValidRuntimePaymentAccount(accountNumber: string) {
  return /^[12]\d{3}$/.test(accountNumber.trim())
}

function validateRuntimeTreatment(
  treatment: VatTreatment
): VatV2RuntimeBookingError[] {
  const errors: VatV2RuntimeBookingError[] = []
  const expectedVat = roundCurrency(treatment.taxableBase * 0.25)

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports EU service reverse charge.'
    ))
  }

  if (treatment.calculationRate !== 25) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports 25 percent calculation rate.'
    ))
  }

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports full deduction.'
    ))
  }

  if (!isPositiveCurrencyAmount(treatment.taxableBase)) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking requires a positive acquisition base.'
    ))
  }

  if (
    treatment.outputVat.amount !== expectedVat ||
    treatment.deductibleInputVat.amount !== expectedVat
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime VAT amounts must match the 25 percent acquisition base.'
    ))
  }

  if (
    treatment.acquisitionBaseField !== '21' ||
    treatment.outputVat.reportField !== '30' ||
    treatment.deductibleInputVat.reportField !== '48'
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports VAT report fields 21, 30, and 48.'
    ))
  }

  return errors
}

export function buildVatV2RuntimeBookingRequest(
  input: BuildVatV2RuntimeBookingRequestInput
): VatV2RuntimeBookingRequestResult {
  const errors: VatV2RuntimeBookingError[] = []

  if (!input.assessmentActive) {
    errors.push(error(
      'vat_v2_assessment_inactive',
      'VAT V2 assessment must be active before runtime booking.'
    ))
  }

  if (input.transactionEvent !== 'purchase') {
    errors.push(error(
      'unsupported_transaction_event',
      'VAT V2 runtime booking only supports purchase transactions.'
    ))
  }

  if (input.preflight.status !== 'ready') {
    errors.push(error(
      'vat_treatment_not_ready',
      'VAT V2 treatment must be ready before runtime booking.'
    ))
  }

  if (input.bookingReadiness.status !== 'ready_to_book') {
    errors.push(error(
      'payment_source_not_ready',
      'VAT V2 payment source must be explicitly configured before booking.'
    ))
  }

  if (!isValidDateOnly(input.date)) {
    errors.push(error(
      'invalid_booking_fields',
      'VAT V2 runtime booking requires a valid date.'
    ))
  }

  if (input.description.trim() === '') {
    errors.push(error(
      'invalid_booking_fields',
      'VAT V2 runtime booking requires a description.'
    ))
  }

  if (input.preflight.status === 'ready') {
    errors.push(...validateRuntimeTreatment(input.preflight.treatment))
  }

  if (
    input.bookingReadiness.status === 'ready_to_book' &&
    !isValidRuntimePaymentAccount(input.bookingReadiness.paymentAccountNumber)
  ) {
    errors.push(error(
      'payment_source_not_ready',
      'VAT V2 payment account must be a configured BAS asset/equity account.'
    ))
  }

  if (
    errors.length > 0 ||
    input.preflight.status !== 'ready' ||
    input.bookingReadiness.status !== 'ready_to_book'
  ) {
    return {
      status: 'blocked',
      request: null,
      errors,
    }
  }

  return {
    status: 'ready',
    request: {
      date: input.date,
      description: input.description.trim(),
      treatment: input.preflight.treatment,
      paymentAccountNumber:
        input.bookingReadiness.paymentAccountNumber.trim(),
      paymentRole: input.bookingReadiness.paymentRole,
    },
    errors: [],
  }
}

export function createVatV2RuntimeSubmitGuard() {
  let inFlight = false

  return {
    isInFlight() {
      return inFlight
    },

    async run<T>(
      operation: () => Promise<T>
    ): Promise<VatV2RuntimeSubmitGuardResult<T>> {
      if (inFlight) {
        return { status: 'blocked_duplicate' }
      }

      inFlight = true
      try {
        const value = await operation()
        return { status: 'completed', value }
      } finally {
        inFlight = false
      }
    },
  }
}

export function describeVatV2RuntimeBookingError(
  error: VatV2RuntimeBookingError
) {
  switch (error.code) {
    case 'unsupported_transaction_event':
      return 'VAT V2-bokning är bara öppen för inköp i detta steg.'
    case 'vat_treatment_not_ready':
      return 'Momsbedömningen måste vara helt klar innan bokning.'
    case 'payment_source_not_ready':
      return 'Betalningskällan måste ha ett sparat konto innan bokning.'
    case 'invalid_booking_fields':
      return 'Datum och beskrivning måste vara ifyllda korrekt.'
    case 'unsupported_runtime_treatment':
      return 'Endast EU-tjänst med 25 % omvänd moms och full avdragsrätt kan bokföras här.'
    case 'vat_v2_assessment_inactive':
    default:
      return 'VAT V2-bokning är inte aktiv för den här transaktionen.'
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatSettlementErrors.ts
==================================================

````typescript
export type VatSettlementSubmissionFailureKind =
  | 'authoritative_rejection'
  | 'indeterminate'

export class VatSettlementSubmissionError extends Error {
  readonly kind: VatSettlementSubmissionFailureKind

  constructor(kind: VatSettlementSubmissionFailureKind) {
    super('VAT settlement submission failed')
    this.name = 'VatSettlementSubmissionError'
    this.kind = kind
  }
}

function isStructuredPostgrestError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

export function classifyVatSettlementRpcError(
  error: unknown
): VatSettlementSubmissionFailureKind {
  return isStructuredPostgrestError(error)
    ? 'authoritative_rejection'
    : 'indeterminate'
}

export function createVatSettlementSubmissionError(error: unknown) {
  return new VatSettlementSubmissionError(classifyVatSettlementRpcError(error))
}

export function vatSettlementSubmissionFailureKind(
  error: unknown
): VatSettlementSubmissionFailureKind {
  if (error instanceof VatSettlementSubmissionError) return error.kind
  return 'indeterminate'
}

export function vatSettlementSubmissionErrorMessage(
  kind: VatSettlementSubmissionFailureKind
) {
  if (kind === 'authoritative_rejection') {
    return 'Avräkningen kunde inte registreras. Uppdatera uppgifterna och försök igen.'
  }

  return 'SoloLedger kunde inte bekräfta om avräkningen registrerades. Försök igen med samma uppgifter; då används samma försök så dubbelregistrering undviks.'
}
````````

==================================================

==================================================
FILE: src/lib/vatSettlementRpc.ts
==================================================

````typescript
export const RECORD_VAT_SETTLEMENT_RPC_NAME = 'record_vat_settlement_atomic'

export const TAX_ACCOUNT_EVENT_SELECT_COLUMNS =
  'id, vat_period_id, transaction_id, event_kind, event_date, amount, created_at'

export const TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN = 'user_id'

export const TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN = 'vat_period_id'

export function buildRecordVatSettlementRpcArgs(input: {
  periodId: string
  eventDate: string
  amount: number
  idempotencyKey: string
}) {
  return {
    p_vat_period_id: input.periodId,
    p_event_date: input.eventDate,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
  }
}

````````

==================================================

==================================================
FILE: src/lib/vatSettlementUi.ts
==================================================

````typescript
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

````````

==================================================

==================================================
FILE: src/lib/vatTransactionPreflight.ts
==================================================

````typescript
import type {
  CompanyVatProfile,
  ValidationError,
  ValidationResult,
  VatCalculationRateInput,
  VatCounterpartyCountry,
  VatFactsInput,
  VatGoodsOrService,
  VatTreatment,
  VatYesNoUnknown,
} from './vatDomain'
import {
  decideVatTreatment,
  type VatTreatmentDecisionBlockCode,
  type VatTreatmentDecisionError,
} from './vatTreatmentDecision.ts'

export const VAT_V2_SUPPLIER_COUNTRIES = [
  { code: 'SE', label: 'Sverige' },
  { code: 'DK', label: 'Danmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'DE', label: 'Tyskland' },
  { code: 'IE', label: 'Irland' },
  { code: 'NL', label: 'Nederländerna' },
  { code: 'FR', label: 'Frankrike' },
  { code: 'ES', label: 'Spanien' },
  { code: 'PL', label: 'Polen' },
  { code: 'NO', label: 'Norge' },
  { code: 'US', label: 'USA' },
] as const

export type VatV2SupplierCountryCode =
  typeof VAT_V2_SUPPLIER_COUNTRIES[number]['code']

export type VatV2SupplierCountryInput = VatV2SupplierCountryCode | 'unknown'

export interface VatV2TransactionFacts {
  enabled: boolean
  supplierCountry: VatV2SupplierCountryInput
  goodsOrService: VatGoodsOrService
  supplierVatCharged: VatYesNoUnknown
  calculationRate: VatCalculationRateInput
  acquisitionBaseAmount: string
}

export interface BuildVatV2TransactionPreflightInput {
  companyProfile: CompanyVatProfile
  transaction: VatV2TransactionFacts
  date: string
  description: string
  accountingCategoryId: string
  ordinaryAmount: string
}

export type VatV2TransactionPreflightBlockCode =
  | VatTreatmentDecisionBlockCode
  | 'vat_v2_not_enabled'
  | 'unsupported_vat_v2_persistence_path'

export type VatV2TransactionPreflightPath =
  | keyof VatV2TransactionFacts
  | keyof BuildVatV2TransactionPreflightInput
  | VatTreatmentDecisionError['path']
  | 'treatment.code'
  | 'treatment.calculationRate'
  | 'treatment.deductibleInputVat.entitlement'

export type VatV2TransactionPreflightError = ValidationError<
  VatV2TransactionPreflightBlockCode,
  VatV2TransactionPreflightPath
>

export type VatV2TransactionPreflightResult =
  | {
      status: 'disabled'
      facts: null
      treatment: null
      validation: ValidationResult<VatV2TransactionPreflightError> & {
        valid: false
        errors: VatV2TransactionPreflightError[]
      }
    }
  | {
      status: 'ready'
      facts: VatFactsInput
      treatment: VatTreatment
      validation: ValidationResult<VatV2TransactionPreflightError> & {
        valid: true
        errors: []
      }
    }
  | {
      status: 'blocked'
      facts: VatFactsInput | null
      treatment: VatTreatment | null
      validation: ValidationResult<VatV2TransactionPreflightError> & {
        valid: false
        errors: VatV2TransactionPreflightError[]
      }
    }

function error(
  code: VatV2TransactionPreflightBlockCode,
  path: VatV2TransactionPreflightPath,
  message: string
): VatV2TransactionPreflightError {
  return { code, path, message }
}

function blocked(
  errors: VatV2TransactionPreflightError[],
  facts: VatFactsInput | null = null,
  treatment: VatTreatment | null = null
): VatV2TransactionPreflightResult {
  return {
    status: 'blocked',
    facts,
    treatment,
    validation: {
      valid: false,
      errors,
    },
  }
}

function disabled(): VatV2TransactionPreflightResult {
  return {
    status: 'disabled',
    facts: null,
    treatment: null,
    validation: {
      valid: false,
      errors: [
        error(
          'vat_v2_not_enabled',
          'enabled',
          'VAT V2 assessment is not enabled for this transaction.'
        ),
      ],
    },
  }
}

function ready(
  facts: VatFactsInput,
  treatment: VatTreatment
): VatV2TransactionPreflightResult {
  return {
    status: 'ready',
    facts,
    treatment,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

type AcquisitionBaseAmountParseResult =
  | { amount: number }
  | { error: VatV2TransactionPreflightError }

function parseAcquisitionBaseAmount(
  value: string
): AcquisitionBaseAmountParseResult {
  const trimmed = value.trim()

  if (trimmed === '') {
    return {
      error: error(
        'invalid_amount',
        'acquisitionBaseAmount',
        'VAT V2 preflight requires an explicit acquisition base amount.'
      ),
    }
  }

  const normalized = trimmed.replace(',', '.')
  const parsed = Number(normalized)
  const rounded = Math.round(parsed * 100) / 100

  if (!Number.isFinite(parsed) || parsed <= 0 || rounded !== parsed) {
    return {
      error: error(
        'invalid_amount',
        'acquisitionBaseAmount',
        'Acquisition base amount must be a finite positive amount rounded to two decimals.'
      ),
    }
  }

  return { amount: parsed }
}

function supplierCountryToDomain(
  country: VatV2SupplierCountryInput
): VatCounterpartyCountry {
  return country === 'unknown'
    ? { kind: 'unknown' }
    : { kind: 'country', code: country }
}

function assertSupportedPersistenceTreatment(
  treatment: VatTreatment
): VatV2TransactionPreflightError[] {
  const errors: VatV2TransactionPreflightError[] = []

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(
      error(
        'unsupported_vat_v2_persistence_path',
        'treatment.code',
        'This preflight slice only supports EU service reverse charge.'
      )
    )
  }

  if (treatment.calculationRate !== 25) {
    errors.push(
      error(
        'unsupported_vat_v2_persistence_path',
        'treatment.calculationRate',
        'This preflight slice only supports 25 percent calculation rate.'
      )
    )
  }

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(
      error(
        'unsupported_vat_v2_persistence_path',
        'treatment.deductibleInputVat.entitlement',
        'This preflight slice only supports full deduction.'
      )
    )
  }

  return errors
}

export function buildVatV2TransactionPreflight(
  input: BuildVatV2TransactionPreflightInput
): VatV2TransactionPreflightResult {
  if (!input.transaction.enabled) {
    return disabled()
  }

  const amountResult = parseAcquisitionBaseAmount(
    input.transaction.acquisitionBaseAmount
  )

  if ('error' in amountResult) {
    return blocked([amountResult.error])
  }

  const facts: VatFactsInput = {
    companyProfile: input.companyProfile,
    eventKind: 'purchase',
    goodsOrService: input.transaction.goodsOrService,
    supplierCountry: supplierCountryToDomain(input.transaction.supplierCountry),
    customerCountry: { kind: 'country', code: 'SE' },
    supplierVatCharged: input.transaction.supplierVatCharged,
    usedForBusiness: 'unknown',
    calculationRate: input.transaction.calculationRate,
    deductionEntitlement: input.companyProfile.defaultDeductionEntitlement,
    accountingCategoryId: input.accountingCategoryId,
    invoiceDate: input.date,
    amount: amountResult.amount,
    currency: 'SEK',
  }

  const decision = decideVatTreatment(facts)

  if (decision.status === 'blocked') {
    return blocked(decision.validation.errors, facts)
  }

  const supportErrors = assertSupportedPersistenceTreatment(decision.treatment)

  if (supportErrors.length > 0) {
    return blocked(supportErrors, facts, decision.treatment)
  }

  return ready(facts, decision.treatment)
}

export function describeVatV2PreflightError(
  error: VatV2TransactionPreflightError
) {
  switch (error.code) {
    case 'invalid_amount':
      return 'Ange ett separat inköpsbelopp för momsberäkningen.'
    case 'unknown_supplier_country':
      return 'Leverantörsland saknas.'
    case 'unknown_customer_country':
      return 'Företagsland saknas för bedömningen.'
    case 'unknown_goods_or_service':
      return 'Ange om inköpet gäller vara eller tjänst.'
    case 'unknown_supplier_vat_charged':
      return 'Ange om leverantören har debiterat moms.'
    case 'unknown_calculation_rate':
      return 'Ange vilken momssats som ska användas för beräkningen.'
    case 'unknown_deduction_entitlement':
      return 'Företagsprofilen saknar uppgift om avdragsrätt.'
    case 'unknown_vat_registration_status':
      return 'Företagsprofilen saknar uppgift om momsregistrering.'
    case 'unknown_foreign_purchase_reporting':
      return 'Företagsprofilen saknar uppgift om utländska inköp ska redovisas.'
    case 'foreign_purchase_reporting_requires_registration':
      return 'Företagsprofilen säger att utländska inköp ska redovisas utan att momsregistrering är angiven.'
    case 'registered_requires_vat_period_type':
      return 'Företagsprofilen saknar momsperiod.'
    case 'registered_requires_vat_reporting_from':
      return 'Företagsprofilen saknar startdatum för momshantering.'
    case 'vat_reporting_from_invalid_date':
      return 'Företagsprofilens startdatum för momshantering är ogiltigt.'
    case 'partial_deduction_requires_percent':
    case 'deduction_percent_requires_partial_entitlement':
    case 'deduction_percent_out_of_range':
      return 'Delvis avdragsrätt är inte färdig i detta momsflöde.'
    case 'unsupported_vat_treatment':
      if (error.path === 'supplierVatCharged') {
        return 'Leverantören har debiterat moms. Det stöds inte säkert här ännu.'
      }
      return 'Den här typen av utlandsinköp stöds inte säkert här ännu.'
    case 'unsupported_vat_v2_persistence_path':
      if (error.path === 'treatment.calculationRate') {
        return 'Den momssatsen stöds inte för bokning i detta VAT V2-steg ännu.'
      }
      if (error.path === 'treatment.deductibleInputVat.entitlement') {
        return 'Avdragsrätten är inte full. Det stöds inte för bokning i detta VAT V2-steg ännu.'
      }
      return 'Bedömningen är inte den stödda EU-tjänst med omvänd beskattning som detta steg hanterar.'
    case 'vat_v2_not_enabled':
      return 'VAT V2-förhandskontroll är inte aktiverad för transaktionen.'
    case 'unknown_domestic_sales_vat_treatment':
      return 'Företagsprofilen saknar uppgift om inhemsk försäljning.'
    default:
      return 'SoloLedger kan inte bedöma momsflödet säkert med uppgifterna som finns.'
  }
}
````````

==================================================

==================================================
FILE: src/lib/vatTreatmentDecision.ts
==================================================

````typescript
import type {
  CompanyVatProfile,
  CompanyVatProfileValidationErrorCode,
  DeductionEntitlement,
  OutputVatReportField,
  ValidationError,
  ValidationResult,
  VatCounterpartyCountry,
  VatFactsInput,
  VatTreatment,
} from './vatDomain'
import {
  validateCompanyVatProfile,
} from './vatDomain.ts'

export type VatTreatmentDecisionBlockCode =
  | CompanyVatProfileValidationErrorCode
  | 'invalid_amount'
  | 'unknown_calculation_rate'
  | 'unknown_supplier_country'
  | 'unknown_customer_country'
  | 'unknown_goods_or_service'
  | 'unknown_supplier_vat_charged'
  | 'unknown_deduction_entitlement'
  | 'unknown_domestic_sales_vat_treatment'
  | 'unknown_vat_registration_status'
  | 'unknown_foreign_purchase_reporting'
  | 'unsupported_vat_treatment'

export type VatTreatmentDecisionPath =
  | keyof VatFactsInput
  | `companyProfile.${keyof CompanyVatProfile & string}`

export type VatTreatmentDecisionError = ValidationError<
  VatTreatmentDecisionBlockCode,
  VatTreatmentDecisionPath
>

export type VatTreatmentDecisionResult =
  | {
      status: 'ready'
      treatment: VatTreatment
      validation: ValidationResult<VatTreatmentDecisionError> & {
        valid: true
        errors: []
      }
    }
  | {
      status: 'blocked'
      treatment: null
      validation: ValidationResult<VatTreatmentDecisionError> & {
        valid: false
        errors: VatTreatmentDecisionError[]
      }
    }

const RULE_VERSION = 'vat-v2-kan18-first-slice'
const FACTS_VERSION = 'vat-facts-v1'
const HOME_COUNTRY = 'SE'

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
])

function ready(treatment: VatTreatment): VatTreatmentDecisionResult {
  return {
    status: 'ready',
    treatment,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

function blocked(
  errors: VatTreatmentDecisionError[]
): VatTreatmentDecisionResult {
  return {
    status: 'blocked',
    treatment: null,
    validation: {
      valid: false,
      errors,
    },
  }
}

function error(
  code: VatTreatmentDecisionBlockCode,
  path: VatTreatmentDecisionPath,
  message: string
): VatTreatmentDecisionError {
  return { code, path, message }
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function outputFieldForRate(
  rate: VatFactsInput['calculationRate'],
  domestic: boolean
): OutputVatReportField | null {
  if (rate === 'unknown' || rate === 0) return null

  if (domestic) {
    if (rate === 25) return '10'
    if (rate === 12) return '11'
    return '12'
  }

  if (rate === 25) return '30'
  if (rate === 12) return '31'
  return '32'
}

function countryCode(country: VatCounterpartyCountry) {
  return country.kind === 'country' ? country.code.toUpperCase() : null
}

function isHomeCountry(country: VatCounterpartyCountry) {
  return countryCode(country) === HOME_COUNTRY
}

function isEuCountry(country: VatCounterpartyCountry) {
  const code = countryCode(country)
  return code !== null && EU_COUNTRY_CODES.has(code)
}

function isOtherEuCountry(country: VatCounterpartyCountry) {
  return isEuCountry(country) && !isHomeCountry(country)
}

function calculationRateError(): VatTreatmentDecisionError {
  return error(
    'unknown_calculation_rate',
    'calculationRate',
    'VAT calculation requires an explicit calculation rate.'
  )
}

function unknownDeductionError(): VatTreatmentDecisionError {
  return error(
    'unknown_deduction_entitlement',
    'deductionEntitlement',
    'Deduction entitlement must be known before deductible input VAT can be decided.'
  )
}

function unsupportedTreatment(message: string): VatTreatmentDecisionResult {
  return blocked([
    error(
      'unsupported_vat_treatment',
      'eventKind',
      message
    ),
  ])
}

function validateDecisionInput(facts: VatFactsInput): VatTreatmentDecisionError[] {
  const profileValidation = validateCompanyVatProfile(facts.companyProfile)
  const errors: VatTreatmentDecisionError[] = profileValidation.errors.map(
    profileError => ({
      code: profileError.code,
      path: `companyProfile.${profileError.path}`,
      message: profileError.message,
    })
  )

  if (!Number.isFinite(facts.amount) || facts.amount < 0) {
    errors.push(
      error(
        'invalid_amount',
        'amount',
        'VAT treatment decisions require a finite, non-negative amount.'
      )
    )
  }

  return errors
}

function createTreatmentBase(
  facts: VatFactsInput,
  code: VatTreatment['code'],
  outputVatAmount: number,
  outputVatField: OutputVatReportField | null,
  deductibleInputVatAmount: number,
  deductionEntitlement: DeductionEntitlement
): Omit<
  VatTreatment,
  'acquisitionBaseField' | 'domesticSalesBaseField'
> {
  if (facts.calculationRate === 'unknown') {
    throw new Error('Cannot create a VatTreatment with unknown calculation rate.')
  }

  return {
    code,
    ruleVersion: RULE_VERSION,
    taxableBase: facts.amount,
    calculationRate: facts.calculationRate,
    outputVat: {
      amount: outputVatAmount,
      reportField: outputVatField,
    },
    deductibleInputVat: {
      amount: deductibleInputVatAmount,
      reportField: deductibleInputVatAmount > 0 ? '48' : null,
      entitlement: deductionEntitlement,
    },
    evidence: {
      source: 'rule',
      factsVersion: FACTS_VERSION,
    },
  }
}

function decideDomesticSale(facts: VatFactsInput): VatTreatmentDecisionResult {
  if (facts.customerCountry.kind === 'unknown') {
    return blocked([
      error(
        'unknown_customer_country',
        'customerCountry',
        'Customer country must be known before domestic sale treatment can be decided.'
      ),
    ])
  }

  if (!isHomeCountry(facts.customerCountry)) {
    return unsupportedTreatment(
      'KAN-18 first slice only verifies Swedish domestic sales.'
    )
  }

  if (facts.companyProfile.domesticSalesVatTreatment === 'unknown') {
    return blocked([
      error(
        'unknown_domestic_sales_vat_treatment',
        'companyProfile.domesticSalesVatTreatment',
        'Domestic sales VAT treatment must be known before a domestic sale can be decided.'
      ),
    ])
  }

  if (facts.companyProfile.domesticSalesVatTreatment === 'taxable') {
    if (facts.calculationRate === 'unknown') {
      return blocked([calculationRateError()])
    }

    const outputVatAmount = roundCurrency(
      facts.amount * facts.calculationRate / 100
    )

    return ready({
      ...createTreatmentBase(
        facts,
        'DOMESTIC_TAXABLE_SALE',
        outputVatAmount,
        outputFieldForRate(facts.calculationRate, true),
        0,
        'none'
      ),
      domesticSalesBaseField: '05',
    })
  }

  if (
    facts.companyProfile.domesticSalesVatTreatment === 'small_business_exempt' ||
    facts.companyProfile.domesticSalesVatTreatment === 'exempt_other'
  ) {
    return ready({
      ...createTreatmentBase(
        {
          ...facts,
          calculationRate: 0,
        },
        'DOMESTIC_EXEMPT_SALE',
        0,
        null,
        0,
        'none'
      ),
      domesticSalesBaseField: '05',
    })
  }

  return unsupportedTreatment(
    'Mixed domestic sales VAT treatment needs a later explicit rule.'
  )
}

function decideDomesticPurchase(
  facts: VatFactsInput
): VatTreatmentDecisionResult {
  if (facts.calculationRate === 'unknown') {
    return blocked([calculationRateError()])
  }

  if (facts.deductionEntitlement === 'unknown') {
    return blocked([unknownDeductionError()])
  }

  if (facts.supplierVatCharged === 'unknown') {
    return blocked([
      error(
        'unknown_supplier_vat_charged',
        'supplierVatCharged',
        'Supplier VAT charged must be known for domestic deductible purchase treatment.'
      ),
    ])
  }

  if (facts.deductionEntitlement === 'partial') {
    return unsupportedTreatment(
      'Partial deduction is outside the verified KAN-18 first slice.'
    )
  }

  if (facts.deductionEntitlement === 'none') {
    return unsupportedTreatment(
      'Domestic no-deduction purchases are outside the verified KAN-18 first slice.'
    )
  }

  if (facts.supplierVatCharged !== 'yes') {
    return unsupportedTreatment(
      'Domestic purchase without supplier-charged VAT is outside the verified KAN-18 first slice.'
    )
  }

  const inputVatAmount =
    roundCurrency(facts.amount * facts.calculationRate / 100)

  return ready(
    createTreatmentBase(
      facts,
      'DOMESTIC_DEDUCTIBLE_PURCHASE',
      0,
      null,
      inputVatAmount,
      facts.deductionEntitlement
    )
  )
}

function decideEuServicePurchase(
  facts: VatFactsInput
): VatTreatmentDecisionResult {
  const errors: VatTreatmentDecisionError[] = []

  if (facts.calculationRate === 'unknown') {
    errors.push(calculationRateError())
  }

  if (facts.supplierVatCharged === 'unknown') {
    errors.push(
      error(
        'unknown_supplier_vat_charged',
        'supplierVatCharged',
        'Supplier VAT charged must be known for EU service reverse-charge treatment.'
      )
    )
  }

  if (facts.deductionEntitlement === 'unknown') {
    errors.push(unknownDeductionError())
  }

  if (facts.companyProfile.vatRegistrationStatus === 'unknown') {
    errors.push(
      error(
        'unknown_vat_registration_status',
        'companyProfile.vatRegistrationStatus',
        'VAT registration status must be known for EU service reverse-charge treatment.'
      )
    )
  }

  if (facts.companyProfile.foreignPurchaseReporting === 'unknown') {
    errors.push(
      error(
        'unknown_foreign_purchase_reporting',
        'companyProfile.foreignPurchaseReporting',
        'Foreign purchase reporting status must be known for EU service reverse-charge treatment.'
      )
    )
  }

  if (errors.length > 0) {
    return blocked(errors)
  }

  if (facts.supplierVatCharged !== 'no') {
    return unsupportedTreatment(
      'Supplier-charged foreign VAT is outside the verified KAN-18 first slice.'
    )
  }

  if (
    facts.companyProfile.vatRegistrationStatus !== 'registered' ||
    facts.companyProfile.foreignPurchaseReporting !== 'required'
  ) {
    return unsupportedTreatment(
      'EU service purchase treatment requires verified VAT registration and foreign purchase reporting.'
    )
  }

  if (facts.deductionEntitlement === 'partial') {
    return unsupportedTreatment(
      'Partial deduction is outside the verified KAN-18 first slice.'
    )
  }

  if (facts.calculationRate === 'unknown') {
    throw new Error('Blocked EU service treatment cannot have an unknown rate.')
  }

  const calculationRate = facts.calculationRate
  const outputVatAmount = roundCurrency(
    facts.amount * calculationRate / 100
  )
  const deductibleInputVatAmount =
    facts.deductionEntitlement === 'full' ? outputVatAmount : 0

  return ready({
    ...createTreatmentBase(
      facts,
      'EU_SERVICE_REVERSE_CHARGE',
      outputVatAmount,
      outputFieldForRate(calculationRate, false),
      deductibleInputVatAmount,
      facts.deductionEntitlement
    ),
    acquisitionBaseField: '21',
  })
}

function decidePurchase(facts: VatFactsInput): VatTreatmentDecisionResult {
  if (facts.supplierCountry.kind === 'unknown') {
    return blocked([
      error(
        'unknown_supplier_country',
        'supplierCountry',
        'Supplier country must be known before purchase VAT treatment can be decided.'
      ),
    ])
  }

  if (facts.goodsOrService === 'unknown') {
    return blocked([
      error(
        'unknown_goods_or_service',
        'goodsOrService',
        'Goods or service classification must be known before purchase VAT treatment can be decided.'
      ),
    ])
  }

  if (isHomeCountry(facts.supplierCountry)) {
    return decideDomesticPurchase(facts)
  }

  if (
    facts.goodsOrService === 'service' &&
    isOtherEuCountry(facts.supplierCountry)
  ) {
    if (facts.customerCountry.kind === 'unknown') {
      return blocked([
        error(
          'unknown_customer_country',
          'customerCountry',
          'Customer country must be known for EU service reverse-charge treatment.'
        ),
      ])
    }

    if (!isHomeCountry(facts.customerCountry)) {
      return unsupportedTreatment(
        'KAN-18 first slice only verifies Swedish company purchases.'
      )
    }

    return decideEuServicePurchase(facts)
  }

  return unsupportedTreatment(
    'This purchase VAT treatment is outside the verified KAN-18 first slice.'
  )
}

export function decideVatTreatment(
  facts: VatFactsInput
): VatTreatmentDecisionResult {
  const inputErrors = validateDecisionInput(facts)

  if (inputErrors.length > 0) {
    return blocked(inputErrors)
  }

  if (facts.eventKind === 'sale') {
    return decideDomesticSale(facts)
  }

  return decidePurchase(facts)
}
````````

==================================================

==================================================
FILE: src/lib/taxAccountMovementErrors.ts
==================================================

````typescript
export type TaxAccountMovementSubmissionFailureKind =
  | 'authoritative_rejection'
  | 'indeterminate'

export class TaxAccountMovementSubmissionError extends Error {
  readonly kind: TaxAccountMovementSubmissionFailureKind
  readonly serverMessage: string | null

  constructor(
    kind: TaxAccountMovementSubmissionFailureKind,
    serverMessage: string | null = null
  ) {
    super('Tax account movement submission failed')
    this.name = 'TaxAccountMovementSubmissionError'
    this.kind = kind
    this.serverMessage = serverMessage
  }
}

function isStructuredPostgrestError(
  error: unknown
): error is { code: string; message: string } {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

export function classifyTaxAccountMovementRpcError(
  error: unknown
): TaxAccountMovementSubmissionFailureKind {
  return isStructuredPostgrestError(error)
    ? 'authoritative_rejection'
    : 'indeterminate'
}

export function createTaxAccountMovementSubmissionError(error: unknown) {
  return new TaxAccountMovementSubmissionError(
    classifyTaxAccountMovementRpcError(error),
    isStructuredPostgrestError(error) ? error.message : null
  )
}

export function taxAccountMovementSubmissionFailureKind(
  error: unknown
): TaxAccountMovementSubmissionFailureKind {
  if (error instanceof TaxAccountMovementSubmissionError) return error.kind
  return 'indeterminate'
}

export function taxAccountMovementSubmissionErrorMessage(
  kindOrError: TaxAccountMovementSubmissionFailureKind | unknown
) {
  const kind = taxAccountMovementSubmissionFailureKind(kindOrError)
  const serverMessage = kindOrError instanceof TaxAccountMovementSubmissionError
    ? kindOrError.serverMessage
    : null

  if (kind === 'authoritative_rejection') {
    if (
      serverMessage?.includes('Betalningskonto för') ||
      serverMessage?.includes('konfigurerade betalningskontot') ||
      serverMessage?.includes('betalningskontot finns inte')
    ) {
      return 'Betalningskontot för den valda pengaflytten behöver kontrolleras i inställningarna innan överföringen kan registreras.'
    }

    return 'Överföringen kunde inte registreras. Kontrollera uppgifterna och försök igen.'
  }

  return 'SoloLedger kunde inte bekräfta om överföringen registrerades. Försök igen med samma uppgifter; då används samma försök så dubbelregistrering undviks.'
}
````````

==================================================

==================================================
FILE: src/lib/taxAccountMovementRpc.ts
==================================================

````typescript
export const RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME =
  'record_tax_account_movement_atomic'

export const TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS =
  'id, vat_period_id, transaction_id, movement_kind, movement_date, amount, payment_account_role, counter_account_number, created_at'

export const TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN = 'user_id'

export const TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN = 'vat_period_id'

export function buildRecordTaxAccountMovementRpcArgs(input: {
  movementKind: string
  movementDate: string
  amount: number
  vatPeriodId: string | null
  idempotencyKey: string
}) {
  return {
    p_movement_kind: input.movementKind,
    p_movement_date: input.movementDate,
    p_amount: input.amount,
    p_vat_period_id: input.vatPeriodId,
    p_idempotency_key: input.idempotencyKey,
  }
}
````````

==================================================

==================================================
FILE: src/lib/taxAccountMovementUi.ts
==================================================

````typescript
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
````````

==================================================

==================================================
FILE: src/lib/paymentAccountRoles.ts
==================================================

````typescript
import {
  isPaymentAccountRole,
  paymentAccountRoleAccountNumberValidationMessage,
  type PaymentAccountRole,
} from './accountingKnowledge'
import { supabase } from './supabaseClient'

export type { PaymentAccountRole }

export interface ConfiguredPaymentAccountRole {
  role: PaymentAccountRole
  accountNumber: string
}

interface PaymentAccountRoleRow {
  role: string
  account_number: string
}

function assertPaymentAccountRole(role: string): asserts role is PaymentAccountRole {
  if (!isPaymentAccountRole(role)) {
    throw new Error(`Unsupported payment account role: ${role}`)
  }
}

function assertPaymentRoleAccountNumber(
  role: PaymentAccountRole,
  accountNumber: string
) {
  const message = paymentAccountRoleAccountNumberValidationMessage(
    role,
    accountNumber
  )
  if (message) {
    throw new Error(message)
  }
}

function toConfiguredRole(row: PaymentAccountRoleRow): ConfiguredPaymentAccountRole {
  assertPaymentAccountRole(row.role)

  return {
    role: row.role,
    accountNumber: row.account_number,
  }
}

export async function getConfiguredPaymentAccountRoles() {
  const { data, error } = await supabase
    .from('company_payment_account_roles')
    .select('role, account_number')
    .order('role')

  if (error) throw error

  return (data ?? []).map(row => toConfiguredRole(row as PaymentAccountRoleRow))
}

export async function setConfiguredPaymentAccountRole(
  role: PaymentAccountRole,
  accountNumber: string
) {
  assertPaymentAccountRole(role)
  assertPaymentRoleAccountNumber(role, accountNumber)

  const { data, error } = await supabase
    .from('company_payment_account_roles')
    .upsert(
      {
        role,
        account_number: accountNumber.trim(),
      },
      { onConflict: 'user_id,role' }
    )
    .select('role, account_number')
    .single()

  if (error) throw error

  return toConfiguredRole(data as PaymentAccountRoleRow)
}

export async function clearConfiguredPaymentAccountRole(
  role: PaymentAccountRole
) {
  assertPaymentAccountRole(role)

  const { error } = await supabase
    .from('company_payment_account_roles')
    .delete()
    .eq('role', role)

  if (error) throw error
}
````````

==================================================

==================================================
FILE: src/lib/transactionSourceUi.ts
==================================================

````typescript
export interface TransactionSourceLike {
  source?: string | null
}

export interface TransactionSourceUiPolicy {
  source: string | null
  systemManaged: boolean
  genericEditOffered: boolean
  genericCorrectionOffered: boolean
  label: string | null
  kind:
    | 'ordinary'
    | 'sie_import'
    | 'sie_opening_balance'
    | 'vat_closing'
    | 'vat_v2'
    | 'vat_settlement'
    | 'tax_account_movement'
}

const SYSTEM_SOURCE_POLICIES: Record<string, TransactionSourceUiPolicy> = {
  sie_import: {
    source: 'sie_import',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Importerade verifikationer',
    kind: 'sie_import',
  },
  sie_opening_balance: {
    source: 'sie_opening_balance',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Ingående balanser',
    kind: 'sie_opening_balance',
  },
  vat_closing: {
    source: 'vat_closing',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Momsavslut',
    kind: 'vat_closing',
  },
  vat_v2: {
    source: 'vat_v2',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'VAT V2-bokningar',
    kind: 'vat_v2',
  },
  vat_settlement: {
    source: 'vat_settlement',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Momsavräkning',
    kind: 'vat_settlement',
  },
  tax_account_movement: {
    source: 'tax_account_movement',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Skattekontorörelse',
    kind: 'tax_account_movement',
  },
}

const ORDINARY_TRANSACTION_POLICY: TransactionSourceUiPolicy = {
  source: null,
  systemManaged: false,
  genericEditOffered: true,
  genericCorrectionOffered: true,
  label: null,
  kind: 'ordinary',
}

function sourceFrom(input: string | null | undefined | TransactionSourceLike) {
  if (typeof input === 'string' || input == null) return input ?? null
  return input.source ?? null
}

export function getTransactionSourceUiPolicy(
  input: string | null | undefined | TransactionSourceLike
): TransactionSourceUiPolicy {
  const source = sourceFrom(input)
  return (source && SYSTEM_SOURCE_POLICIES[source]) || ORDINARY_TRANSACTION_POLICY
}

export function isTransactionSystemManagedInUi(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).systemManaged
}

export function shouldOfferGenericTransactionEdit(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).genericEditOffered
}

export function shouldOfferGenericTransactionCorrection(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).genericCorrectionOffered
}

export function transactionSourceUiLabel(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).label
}
````````

==================================================

==================================================
FILE: src/lib/supabaseClient.ts
==================================================

````typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
````````

==================================================

==================================================
FILE: src/lib/accountingKnowledge.ts
==================================================

````typescript
export type AccountGuidanceStatus =
  | 'direct'
  | 'conditional'
  | 'technical'

export interface AccountGuidance {
  /**
   * direct      = SoloLedger kan normalt rekommendera kategorin direkt.
   * conditional = användaren behöver kontrollera en eller flera saker först.
   * technical   = kategorin används av SoloLedger/systemet och är normalt
   *               inget användaren själv ska välja.
   */
  status: AccountGuidanceStatus

  /**
   * Kort förklaring på vanlig svenska av vad kategorin används till.
   */
  summary: string

  /**
   * När kategorin normalt passar.
   */
  suitableWhen?: string

  /**
   * Viktig begränsning eller situation där användaren bör vara försiktig.
   */
  warning?: string
}

/**
 * Grundkontoplan v1
 *
 * Den nya kunskapsmodellen skiljer på:
 *
 * VAD  = vad som har hänt i verksamheten
 * HUR  = hur det betalades eller reglerades
 * MOMS = hur momsen ska hanteras
 *
 * BookingCategory beskriver användarens bokföringskategori.
 * SystemAccount beskriver tekniska BAS-konton som SoloLedger behöver känna till.
 *
 * Den befintliga AccountPreset-modellen finns kvar tills Kontoplan,
 * setupDefaultAccounts och bokföringsflödet har migrerats stegvis.
 */

export type AccountGroup =
  | 'income'
  | 'purchases'
  | 'premises'
  | 'equipment'
  | 'travel'
  | 'marketing'
  | 'administration'
  | 'education'
  | 'owner'
  | 'assets'
  | 'vat'
  | 'periodization'
  | 'system'

export type Availability =
  | 'default'
  | 'quick'
  | 'guided'
  | 'system'

export type UsageType =
  | 'direct'
  | 'special'
  | 'system'

export type GuidanceStatus =
  | 'direct'
  | 'conditional'
  | 'technical'

export type VatGuidanceStatus =
  | 'standard'
  | 'conditional'
  | 'none'
  | 'technical'

export const PAYMENT_ACCOUNT_ROLES = [
  'business_payment_account',
  'owner_private_payment',
] as const

export type PaymentAccountRole = typeof PAYMENT_ACCOUNT_ROLES[number]

export interface PaymentAccountRoleRecommendation {
  role: PaymentAccountRole
  accountNumber: string
  label: string
  summary: string
}

export interface CategoryGuidance {
  /**
   * direct
   * SoloLedger kan normalt rekommendera kategorin direkt.
   *
   * conditional
   * En eller flera omständigheter måste kontrolleras först.
   *
   * technical
   * Teknisk/systemnära hantering som användaren normalt inte väljer själv.
   */
  status: GuidanceStatus

  /**
   * Kort förklaring på vanlig svenska av vad kategorin används till.
   */
  summary: string

  /**
   * Situationer där kategorin normalt passar.
   */
  suitableWhen?: string

  /**
   * Viktig begränsning eller vanlig felanvändning.
   */
  warning?: string
}

export interface VatGuidance {
  /**
   * standard
   * Normal momsbehandling är tydlig för det stödda scenariot.
   *
   * conditional
   * Momsbehandlingen beror på omständigheterna.
   *
   * none
   * Kategorien har normalt ingen separat momsbehandling.
   *
   * technical
   * Momsen hanteras av SoloLedger/systemflödet.
   */
  status: VatGuidanceStatus

  /**
   * Kort förklaring av momsbehandlingen.
   */
  summary?: string

  /**
   * Situation där användaren behöver kontrollera momsen extra noggrant.
   */
  warning?: string
}

/**
 * Tillfällig kompatibilitetsbrygga till SoloLedgers nuvarande
 * AccountPreset-modell.
 *
 * Detta beskriver hur kategorin kan representeras i dagens förenklade
 * debit/kredit/moms-mall. Det är INTE kategorins framtida bokföringsregel.
 *
 * När bokföringsflödet fullt ut skiljer på VAD, HUR och MOMS kan denna
 * kompatibilitetsmodell tas bort.
 */
export interface LegacyPresetMapping {
  debitAccount: string
  creditAccount: string
  defaultVatRate: number
  comment: string
}

export interface BookingCategory {
  /**
   * Stabilt internt id för SoloLedger-kategorin.
   */
  id: string

  /**
   * Det huvudsakliga BAS-konto som kategorin normalt hör till.
   *
   * Detta är medvetet inte samma sak som ett komplett bokföringsförslag.
   * Motkonto och moms kan bero på hur transaktionen genomfördes.
   */
  primaryAccount: string

  /**
   * Användarvänligt namn. BAS-numret är sekundärt i UX.
   */
  name: string

  /**
   * Grupp som används för struktur och navigering i Kontoplan/guiden.
   */
  group: AccountGroup

  /**
   * default = ingår i SoloLedgers grundkontoplan
   * quick   = enkelt snabbval
   * guided  = bör normalt läggas till via guide
   * system  = teknisk kategori, normalt inte användarval
   */
  availability: Availability

  /**
   * direct  = vanlig bokföringskategori
   * special = kräver särskilt flöde eller särskild hantering
   * system  = teknisk/systemstyrd
   */
  usageType: UsageType

  /**
   * Guidning för valet av själva bokföringskategorin.
   */
  categoryGuidance: CategoryGuidance

  /**
   * Separat guidning för moms.
   *
   * En kategori kan alltså vara enkel att identifiera samtidigt som
   * momsbehandlingen kräver ytterligare frågor.
   */
  vatGuidance: VatGuidance

  /**
   * Ord som framtida "Vad ska jag bokföra detta som?"-guide
   * kan använda för att hitta relevanta kandidater.
   *
   * Dessa är sökhjälp – inte automatiska bokföringsregler.
   */
  keywords?: string[]

  /**
   * Konkreta exempel som hjälper både användaren och framtida guide.
   *
   * Exemplen innebär inte att kategorin alltid är rätt utan kontroll
   * av eventuell villkorad guidning.
   */
  examples?: string[]

  /**
   * Tillfällig representation för nuvarande AccountPreset-baserade flöde.
   *
   * Ska inte användas som generell bokföringsregel. Motkonto och moms
   * kan i verkligheten bero på transaktionens betalningssätt och scenario.
   */
  legacyPreset?: LegacyPresetMapping
}

export interface SystemAccount {
  /**
   * Faktiskt BAS-kontonummer.
   */
  accountNumber: string

  /**
   * Användarvänligt/tekniskt namn.
   */
  name: string

  /**
   * Grupp för struktur i kunskapsbasen.
   */
  group: AccountGroup

  /**
   * Systemkonton ingår i kunskapsbasen men är inte vanliga
   * bokföringskategorier.
   */
  availability: 'system'

  /**
   * Vissa systemkonton används i särskilda flöden, andra är helt tekniska.
   */
  usageType: 'system' | 'special'

  /**
   * Förklaring av vilken funktion kontot har i SoloLedger.
   */
  description: string

  /**
   * V1-systemkonton ska inte kunna väljas som vanlig kategori.
   */
  userSelectable: false
}

/**
 * Grundkontoplan v1 – användarens bokföringskategorier.
 *
 * Detta är kunskapslagret för VAD som har hänt.
 *
 * primaryAccount är kategorins huvudsakliga BAS-konto, men beskriver
 * inte ensam hela konteringen. Motkonto, betalningssätt och moms
 * hanteras separat.
 *
 * resultEngine.ts är fortsatt enda sanningen för resultat- och
 * NE-klassificering. Ingen sådan mappning dupliceras här.
 */
export const BOOKING_CATEGORIES: BookingCategory[] = [
  // ---------------------------------------------------------------------------
  // DEFAULT
  // ---------------------------------------------------------------------------

  {
    id: 'forsaljning',
    primaryAccount: '3010',
    name: 'Försäljning',
    group: 'income',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '1930',
      creditAccount: '3010',
      defaultVatRate: 25,
      comment:
        'Vanlig försäljning. Moms och kontering måste anpassas efter den aktuella försäljningen.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Intäkter från varor eller tjänster som du säljer i verksamheten.',
      suitableWhen:
        'När verksamheten har sålt en vara eller tjänst och försäljningen hör till den löpande verksamheten.',
      warning:
        'Rätt försäljningskonto kan bero på vad du säljer och var kunden finns. SoloLedger ska därför inte utgå från att all försäljning behandlas likadant.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsen på försäljning beror bland annat på vad som säljs och var kunden finns.',
      warning:
        'Använd inte automatiskt 25 % moms för all försäljning. Momssats och momsbehandling måste stämma med den aktuella försäljningen.',
    },
    keywords: [
      'försäljning',
      'intäkt',
      'kund',
      'sålt',
      'såld',
      'faktura',
      'kundbetalning',
    ],
    examples: [
      'Försäljning av tjänst',
      'Försäljning av vara',
      'Betalning från kund',
    ],
  },

  {
    id: 'forbrukningsinventarier',
    primaryAccount: '5410',
    name: 'Förbrukningsinventarier',
    group: 'equipment',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5410',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment:
        'Utrustning och inventarier som enligt reglerna får kostnadsföras direkt.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Utrustning och inventarier som kan kostnadsföras direkt i verksamheten.',
      suitableWhen:
        'När inköpet är en inventarie som enligt reglerna får dras av direkt i stället för att bokföras som en tillgång och skrivas av över flera år.',
      warning:
        'Valet mellan Förbrukningsinventarier och Inventarier beror inte bara på inköpspriset. Bland annat ekonomisk livslängd och naturligt sammanhängande inköp kan påverka bedömningen.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på inköpet, leverantören och verksamhetens rätt att dra av ingående moms.',
      warning:
        'Kontrollera underlaget och momsbehandlingen innan momsen dras av.',
    },
    keywords: [
      'utrustning',
      'inventarie',
      'inventarier',
      'kamera',
      'dator',
      'skärm',
      'skrivare',
      'telefon',
      'verktyg',
    ],
    examples: [
      'Mindre utrustning till verksamheten',
      'Kamera eller tillbehör som får kostnadsföras direkt',
      'Datorutrustning som får kostnadsföras direkt',
    ],
  },

  {
    id: 'programvaror',
    primaryAccount: '5420',
    name: 'Programvaror & prenumerationer',
    group: 'equipment',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5420',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Programvaror, licenser, appar och digitala abonnemang.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Programvaror, appar, licenser och digitala abonnemang som används i verksamheten.',
      suitableWhen:
        'När du betalar för en programvara, SaaS-tjänst, app, licens eller liknande digital tjänst för verksamheten.',
      warning:
        'En konsult eller utvecklare som utför arbete åt dig är normalt en köpt tjänst, inte en programvaruprenumeration.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen kan skilja sig beroende på var leverantören finns och hur tjänsten faktureras.',
      warning:
        'Utländska leverantörer och digitala tjänster kan kräva annan momsbehandling än ett vanligt svenskt inköp.',
    },
    keywords: [
      'programvara',
      'mjukvara',
      'app',
      'saas',
      'licens',
      'prenumeration',
      'abonnemang',
      'adobe',
      'molntjänst',
    ],
    examples: [
      'Adobe Creative Cloud',
      'Bokföringsprogram',
      'Molntjänst',
      'Programlicens',
    ],
  },

  {
    id: 'resor',
    primaryAccount: '5800',
    name: 'Resor i verksamheten',
    group: 'travel',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5800',
      creditAccount: '1930',
      defaultVatRate: 6,
      comment:
        'Resor i verksamheten. Kontrollera alltid momsbehandlingen på underlaget.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Resor som görs för verksamhetens räkning.',
      suitableWhen:
        'Till exempel när du reser till ett kunduppdrag, möte eller annan plats som du behöver besöka i verksamheten.',
      warning:
        'Vanliga resor mellan bostaden och verksamhetslokalen kan omfattas av andra regler. Egen bil i verksamheten hanteras också separat.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsen kan skilja sig mellan olika typer av resor och underlag.',
      warning:
        'Utgå från det faktiska underlaget i stället för att anta en viss momssats för alla resor.',
    },
    keywords: [
      'resa',
      'resor',
      'tåg',
      'taxi',
      'buss',
      'kollektivtrafik',
      'flyg',
      'kundresa',
    ],
    examples: [
      'Tåg till kunduppdrag',
      'Taxi i samband med arbete',
      'Kollektivtrafik under en verksamhetsresa',
    ],
  },

  {
    id: 'bankavgift',
    primaryAccount: '6570',
    name: 'Bankavgifter',
    group: 'administration',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6570',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'Bank- och betaltjänstkostnader.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Avgifter som banken eller en betaltjänst tar ut för tjänster som hör till verksamheten.',
      suitableWhen:
        'Till exempel bankavgifter och andra avgifter för företagets bank- och betaltjänster.',
      warning:
        'Kontrollera att det verkligen är en avgift och inte exempelvis ränta, amortering eller ett vanligt inköp.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Vanliga bank- och finansiella avgifter har normalt ingen avdragsgill ingående moms.',
    },
    keywords: [
      'bankavgift',
      'bankkostnad',
      'bank',
      'kortavgift',
      'betaltjänst',
    ],
    examples: [
      'Bankens kontoavgift',
      'Avgift för företagets banktjänst',
    ],
  },

  {
    id: 'kurser',
    primaryAccount: '6991',
    name: 'Kurser & fortbildning',
    group: 'education',
    availability: 'default',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6991',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment:
        'Utbildning med tydlig koppling till den verksamhet du redan bedriver.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Utbildning och fortbildning kan vara avdragsgill när den har ett tydligt samband med verksamheten du redan bedriver.',
      suitableWhen:
        'Utbildningen underhåller eller utvecklar kunskaper som du behöver i din nuvarande verksamhet.',
      warning:
        'Utbildning som ger dig förutsättningar att starta en ny verksamhet eller arbeta inom ett nytt område är normalt inte avdragsgill som fortbildning. Kontrollera därför syftet med utbildningen innan du bokför den.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på utbildningen och hur den har fakturerats.',
      warning:
        'Kontrollera underlaget i stället för att anta att alla kurser har samma momsbehandling.',
    },
    keywords: [
      'kurs',
      'kurser',
      'utbildning',
      'fortbildning',
      'workshop',
      'seminarium',
    ],
    examples: [
      'Fortbildning inom det område verksamheten redan arbetar med',
      'Kurs som utvecklar befintliga yrkeskunskaper',
    ],
  },

  {
    id: 'skatter_avgifter',
    primaryAccount: '2012',
    name: 'Skatter & avgifter – eget uttag',
    group: 'owner',
    availability: 'default',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '2012',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment:
        'När firmans pengar används för ägarens F-skatt och andra privata skatter eller avgifter.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'När firmans pengar används för ägarens F-skatt eller andra privata skatter och avgifter.',
      suitableWhen:
        'När en skatt eller avgift som hör till dig som privatperson betalas med pengar från firman.',
      warning:
        'Ägarens privata skatt är inte en kostnad i den enskilda firman utan hanteras som eget uttag.',
    },
    vatGuidance: {
      status: 'none',
    },
    keywords: [
      'f-skatt',
      'preliminärskatt',
      'skatt',
      'egenavgift',
      'skatteverket',
    ],
    examples: [
      'F-skatt betald från företagskontot',
      'Privat skatt betald med firmans pengar',
    ],
  },

  {
    id: 'eget_uttag',
    primaryAccount: '2013',
    name: 'Eget uttag',
    group: 'owner',
    availability: 'default',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '2013',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'När pengar tas ut från firman för privat användning.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Pengar eller privata utgifter som tas ur den enskilda firman för ägarens privata användning.',
      suitableWhen:
        'När du för över pengar från firman till dig själv eller när firman betalar en privat kostnad.',
      warning:
        'Eget uttag är inte lön och inte en kostnad i verksamheten. En privat kostnad som betalas med firmans pengar ska inte bokföras som exempelvis 6992.',
    },
    vatGuidance: {
      status: 'none',
    },
    keywords: [
      'eget uttag',
      'privat uttag',
      'privat kostnad',
      'överföring privat',
      'ta ut pengar',
    ],
    examples: [
      'Överföring från företagskontot till privat konto',
      'Privat inköp betalt med firmans pengar',
    ],
  },

  {
    id: 'egen_insattning',
    primaryAccount: '2018',
    name: 'Egen insättning',
    group: 'owner',
    availability: 'default',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '1930',
      creditAccount: '2018',
      defaultVatRate: 0,
      comment: 'När privata pengar sätts in i firman.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Privata pengar eller privata utlägg som förs in i verksamheten.',
      suitableWhen:
        'När du sätter in privata pengar i firman eller har betalat en verklig verksamhetskostnad med privata pengar.',
      warning:
        'Om du privat har betalat en kostnad för verksamheten måste även själva kostnaden bokföras. Egen insättning beskriver hur verksamheten finansierades – inte vad som köptes.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Själva egna insättningen har ingen moms. Moms kan däremot finnas på den verksamhetskostnad som betalades privat.',
    },
    keywords: [
      'egen insättning',
      'privat utlägg',
      'privata pengar',
      'betalat privat',
      'insättning',
    ],
    examples: [
      'Sätta in privata pengar på företagskontot',
      'Verksamhetsinköp betalt med privat kort',
    ],
  },

  // ---------------------------------------------------------------------------
  // QUICK
  // ---------------------------------------------------------------------------

  {
    id: 'varor_material',
    primaryAccount: '4010',
    name: 'Varor & material för försäljning',
    group: 'purchases',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '4010',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Varor och material som köps in för försäljning eller används direkt i det som säljs.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Varor och material som köps in för att säljas vidare eller användas direkt i det som levereras till kunden.',
      suitableWhen:
        'När inköpet har en tydlig och direkt koppling till de varor eller produkter som verksamheten säljer.',
      warning:
        'Kontorsmaterial, utrustning och inventarier ska inte läggas här bara för att de används i verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på inköpet, leverantören och verksamhetens avdragsrätt.',
      warning:
        'Kontrollera fakturan och leverantörens momsbehandling.',
    },
    keywords: [
      'varor',
      'material',
      'råmaterial',
      'inköp för försäljning',
      'vidareförsäljning',
    ],
    examples: [
      'Varor som köps in för vidareförsäljning',
      'Material som direkt används i det som säljs till kund',
    ],
  },

  {
    id: 'kopta_tjanster_kunduppdrag',
    primaryAccount: '4600',
    name: 'Köpta tjänster för kunduppdrag',
    group: 'purchases',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '4600',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Extern tjänst som är en direkt del av ett kunduppdrag.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Tjänster från andra företag eller personer som är en direkt del av det du levererar till kunden.',
      suitableWhen:
        'När en extern tjänst köps in specifikt för att kunna genomföra eller leverera ett kunduppdrag.',
      warning:
        'Allmän IT-support, redovisning och andra stödtjänster hör normalt inte hit bara för att de hjälper verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror bland annat på leverantören och var tjänsten köps från.',
      warning:
        'Utländska leverantörer kan kräva särskild momsbehandling.',
    },
    keywords: [
      'underleverantör',
      'underentreprenör',
      'kunduppdrag',
      'köpt tjänst',
      'extern hjälp',
      'legoarbete',
    ],
    examples: [
      'Extern retuschör i ett specifikt kunduppdrag',
      'Underleverantör som utför en del av kundens beställning',
    ],
  },

  {
    id: 'lokalhyra',
    primaryAccount: '5010',
    name: 'Hyra för verksamhetslokal',
    group: 'premises',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5010',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'Hyra för separat verksamhetslokal – inte vanligt hemmakontor.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Hyra för en separat lokal som används i verksamheten.',
      suitableWhen:
        'Till exempel separat kontor, studio, lager eller annan verksamhetslokal.',
      warning:
        'Använd inte kategorin automatiskt för vanligt hemmakontor eller för en del av den privata bostaden. Där gäller särskilda regler.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Moms på lokalhyra beror på hur lokalen och uthyrningen behandlas.',
      warning:
        'Utgå från hyresavin eller fakturan och anta inte automatiskt att lokalhyran innehåller moms.',
    },
    keywords: [
      'lokal',
      'lokalhyra',
      'hyra',
      'studio',
      'kontor',
      'lager',
    ],
    examples: [
      'Hyra för separat fotostudio',
      'Hyra för separat kontorslokal',
      'Hyra för lagerlokal',
    ],
  },

  {
    id: 'el_verksamhetslokal',
    primaryAccount: '5020',
    name: 'El för verksamhetslokal',
    group: 'premises',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5020',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'El för separat verksamhetslokal – inte vanlig hushållsel.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Elkostnad för en separat lokal som används i verksamheten.',
      suitableWhen:
        'När elen avser exempelvis ett separat kontor, studio, lager eller annan verksamhetslokal.',
      warning:
        'Vanlig hushållsel i den privata bostaden ska inte automatiskt bokföras som verksamhetskostnad.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Kontrollera momsen på elräkningen och verksamhetens avdragsrätt.',
      warning:
        'Om kostnaden helt eller delvis hör till privatbostaden kan särskilda regler gälla.',
    },
    keywords: [
      'el',
      'elräkning',
      'verksamhetslokal',
      'studioel',
      'lokalel',
    ],
    examples: [
      'El för separat studio',
      'El för separat kontorslokal',
    ],
  },

  {
    id: 'frakt',
    primaryAccount: '5710',
    name: 'Frakt & varutransporter',
    group: 'travel',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5710',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Frakt och transport av varor i verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Frakt och transport av varor som hör till verksamheten.',
      suitableWhen:
        'När varor skickas, levereras eller transporteras i verksamheten.',
      warning:
        'Porto för brev och mindre postförsändelser hör normalt till Porto. Dina egna verksamhetsresor hör till Resor i verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på transporttjänsten och underlaget.',
      warning:
        'Kontrollera fakturan eller kvittot för den aktuella frakten.',
    },
    keywords: [
      'frakt',
      'transport',
      'varutransport',
      'leverans',
      'paketfrakt',
    ],
    examples: [
      'Frakt av varor till kund',
      'Transportkostnad för varuleverans',
    ],
  },

  {
    id: 'egen_bil',
    primaryAccount: '5843',
    name: 'Egen bil i verksamheten',
    group: 'travel',
    availability: 'quick',
    usageType: 'special',
    legacyPreset: {
      debitAccount: '5843',
      creditAccount: '2018',
      defaultVatRate: 0,
      comment: 'Privat bil som används för resor i verksamheten.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'När du använder din privata bil för resor som görs i verksamheten.',
      suitableWhen:
        'När resan är en verksamhetsresa och du använder en bil som är privatägd.',
      warning:
        'Bokför inte privata bensin-, försäkrings- eller servicekvitton här. Vanliga resor mellan bostaden och verksamhetslokalen hanteras också separat.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Själva schablonavdraget/milersättningen för användning av privat bil har ingen separat ingående moms.',
    },
    keywords: [
      'egen bil',
      'privat bil',
      'milersättning',
      'mil',
      'bilresa',
      'körjournal',
    ],
    examples: [
      'Privat bil till kunduppdrag',
      'Privat bil till verksamhetsmöte',
    ],
  },

  {
    id: 'reklam',
    primaryAccount: '5910',
    name: 'Reklam & annonsering',
    group: 'marketing',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '5910',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Reklam och annonsering för verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Annonsering och reklam som görs för att marknadsföra verksamheten.',
      suitableWhen:
        'När du köper annonser, reklamkampanjer eller motsvarande marknadsföring.',
      warning:
        'Andra typer av marknadsföringskostnader kan behöva bedömas separat om de inte faktiskt är reklam eller annonsering.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror bland annat på vilken leverantör som säljer annonseringen.',
      warning:
        'Utländska annonsplattformar kan kräva annan momsbehandling än svenska annonser.',
    },
    keywords: [
      'reklam',
      'annons',
      'annonsering',
      'google ads',
      'meta ads',
      'facebook ads',
      'instagram ads',
      'kampanj',
    ],
    examples: [
      'Google Ads',
      'Meta-annonser',
      'Tidningsannons',
      'Betald reklamkampanj',
    ],
  },

  {
    id: 'kontorsmaterial',
    primaryAccount: '6110',
    name: 'Kontorsmaterial',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6110',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Kontorsmaterial som används i verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Förbrukningsmaterial som används för vanligt kontorsarbete.',
      suitableWhen:
        'Till exempel papper, pennor, kuvert, pärmar och etiketter för verksamheten.',
      warning:
        'Datorer, skärmar, skrivare och annan utrustning är inte kontorsmaterial bara för att de står på kontoret.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på underlaget och verksamhetens avdragsrätt.',
      warning:
        'Kontrollera att inköpet faktiskt hör till verksamheten och att momsen framgår korrekt.',
    },
    keywords: [
      'kontorsmaterial',
      'papper',
      'pennor',
      'kuvert',
      'pärmar',
      'etiketter',
    ],
    examples: [
      'Kopieringspapper',
      'Pennor',
      'Kuvert',
      'Pärmar',
    ],
  },

  {
    id: 'mobiltelefoni',
    primaryAccount: '6212',
    name: 'Mobiltelefoni',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6212',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Mobilabonnemang och telefoni som hör till verksamheten.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Kostnader för mobilabonnemang och telefoni som används i verksamheten.',
      suitableWhen:
        'När kostnaden gäller själva telefonitjänsten eller mobilabonnemanget för verksamheten.',
      warning:
        'Själva mobiltelefonen är utrustning och ska inte bokföras här. Privat användning kan också påverka hur stor del av kostnaden som hör till verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsavdraget beror på hur tjänsten används i verksamheten och på underlaget.',
      warning:
        'Om abonnemanget också används privat kan avdragsrätten behöva bedömas.',
    },
    keywords: [
      'mobil',
      'mobilabonnemang',
      'telefon',
      'telefoni',
      'mobiltelefoni',
      'samtal',
    ],
    examples: [
      'Mobilabonnemang för verksamheten',
      'Telefonitjänst för företaget',
    ],
  },

  {
    id: 'internet',
    primaryAccount: '6230',
    name: 'Internet & datakommunikation',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6230',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Internet- och datakommunikationstjänster som hör till verksamheten.',
    },
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Internet- och datakommunikationstjänster som hör till verksamheten.',
      suitableWhen:
        'När kostnaden avser internet eller datakommunikation som används i verksamheten.',
      warning:
        'Ett vanligt privat internetabonnemang i bostaden är inte automatiskt fullt avdragsgillt bara för att internet också används i verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsavdraget beror på underlaget och hur tjänsten används i verksamheten.',
      warning:
        'Blandad privat användning kan påverka avdragsrätten.',
    },
    keywords: [
      'internet',
      'bredband',
      'datakommunikation',
      'fiber',
      'uppkoppling',
    ],
    examples: [
      'Internetanslutning för separat verksamhetslokal',
      'Datakommunikation för verksamheten',
    ],
  },

  {
    id: 'porto',
    primaryAccount: '6250',
    name: 'Porto',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6250',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Porto och posttjänster som används i verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Porto och posttjänster som används i verksamheten.',
      suitableWhen:
        'När du skickar brev eller andra försändelser där kostnaden är en post- eller portotjänst.',
      warning:
        'Frakt och transport av varor hör normalt till Frakt & varutransporter.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen kan skilja sig mellan olika post- och transporttjänster.',
      warning:
        'Kontrollera det faktiska underlaget i stället för att anta en momssats.',
    },
    keywords: [
      'porto',
      'frimärke',
      'brev',
      'post',
      'posttjänst',
    ],
    examples: [
      'Porto för brev',
      'Frimärken för verksamheten',
    ],
  },

  {
    id: 'foretagsforsakring',
    primaryAccount: '6310',
    name: 'Företagsförsäkring',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6310',
      creditAccount: '1930',
      defaultVatRate: 0,
      comment: 'Försäkringar som tecknats för verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Försäkringar som tecknats för verksamheten.',
      suitableWhen:
        'Till exempel ansvarsförsäkring eller sakförsäkring som hör till firman.',
      warning:
        'Privata försäkringar ska inte bokföras här bara för att du driver enskild firma.',
    },
    vatGuidance: {
      status: 'none',
      summary:
        'Vanliga försäkringstjänster har normalt ingen avdragsgill ingående moms.',
    },
    keywords: [
      'företagsförsäkring',
      'försäkring',
      'ansvarsförsäkring',
      'sakförsäkring',
    ],
    examples: [
      'Ansvarsförsäkring för verksamheten',
      'Sakförsäkring för företagets utrustning',
    ],
  },

  {
    id: 'redovisningstjanster',
    primaryAccount: '6530',
    name: 'Redovisningstjänster',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6530',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Extern hjälp med bokföring, redovisning, bokslut och liknande ekonomiadministration.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Extern hjälp med bokföring, redovisning, bokslut och liknande ekonomiadministration.',
      suitableWhen:
        'När du köper redovisnings- eller bokföringstjänster för verksamheten.',
      warning:
        'Allmän affärsrådgivning eller andra konsulttjänster kan höra till en annan kategori.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på leverantören och underlaget.',
      warning:
        'Kontrollera fakturan, särskilt om tjänsten köps från en utländsk leverantör.',
    },
    keywords: [
      'redovisning',
      'bokföring',
      'bokslut',
      'deklaration',
      'redovisningskonsult',
      'bokförare',
    ],
    examples: [
      'Hjälp med löpande bokföring',
      'Redovisningskonsult',
      'Hjälp med bokslut eller deklaration',
    ],
  },

  {
    id: 'it_tjanster',
    primaryAccount: '6540',
    name: 'IT-tjänster',
    group: 'administration',
    availability: 'quick',
    usageType: 'direct',
    legacyPreset: {
      debitAccount: '6540',
      creditAccount: '1930',
      defaultVatRate: 25,
      comment: 'Externa IT-tjänster som stödjer den egna verksamheten.',
    },
    categoryGuidance: {
      status: 'direct',
      summary:
        'Externa IT-tjänster som stödjer den egna verksamheten.',
      suitableWhen:
        'Till exempel IT-support, teknisk drift, webbutveckling eller annan extern teknisk hjälp för verksamheten.',
      warning:
        'Programvaror och SaaS hör normalt till Programvaror & prenumerationer. En extern person som arbetar direkt i ett kunduppdrag kan i stället höra till Köpta tjänster för kunduppdrag.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på leverantören och var tjänsten köps från.',
      warning:
        'Utländska IT-leverantörer kan kräva särskild momsbehandling.',
    },
    keywords: [
      'it',
      'it-support',
      'support',
      'webbutveckling',
      'utvecklare',
      'teknisk hjälp',
      'drift',
    ],
    examples: [
      'IT-konsult som reparerar eller konfigurerar företagets datorer',
      'Extern webbutvecklare för företagets egen webbplats',
      'Teknisk support för verksamheten',
    ],
  },

  // ---------------------------------------------------------------------------
  // GUIDED
  // ---------------------------------------------------------------------------

  {
    id: 'konsultarvoden',
    primaryAccount: '6550',
    name: 'Konsultarvoden',
    group: 'administration',
    availability: 'guided',
    usageType: 'direct',
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Generella konsulttjänster som hör till verksamheten när ingen mer specifik kategori passar bättre.',
      suitableWhen:
        'När du köper rådgivning eller konsultarbete för verksamheten och tjänsten inte tydligare hör hemma under exempelvis redovisning, IT eller ett kunduppdrag.',
      warning:
        'Använd inte Konsultarvoden som standard för alla externa tjänster. Redovisning hör normalt till 6530, IT-tjänster till 6540 och tjänster som är en direkt del av ett kunduppdrag kan höra till 4600.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på vilken konsulttjänst som köpts och var leverantören finns.',
      warning:
        'Kontrollera fakturan och leverantörens land innan momsbehandlingen bestäms.',
    },
    keywords: [
      'konsult',
      'konsultarvode',
      'rådgivare',
      'rådgivning',
      'expert',
    ],
    examples: [
      'Extern affärskonsult',
      'Specialistrådgivning som inte passar bättre i en annan kategori',
    ],
  },

  {
    id: 'ej_avdragsgill_verksamhetskostnad',
    primaryAccount: '6992',
    name: 'Ej avdragsgill verksamhetskostnad',
    group: 'administration',
    availability: 'guided',
    usageType: 'special',
    categoryGuidance: {
      status: 'conditional',
      summary:
        'En verklig kostnad som hör till verksamheten men som inte får dras av skattemässigt.',
      suitableWhen:
        'Endast när utgiften faktiskt hör till verksamheten och du har konstaterat att den inte är skattemässigt avdragsgill.',
      warning:
        'VIKTIGT: En privat kostnad är inte en ej avdragsgill verksamhetskostnad. Om firman betalar något privat ska det normalt hanteras som eget uttag. SoloLedger ska därför först kontrollera att utgiften verkligen hör till verksamheten.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen måste bedömas utifrån den faktiska typen av kostnad.',
      warning:
        'Att en kostnad är skattemässigt ej avdragsgill betyder inte automatiskt att alla momsfrågor behandlas på samma sätt.',
    },
    keywords: [
      'ej avdragsgill',
      'inte avdragsgill',
      'böter',
      'förseningsavgift',
      'verksamhetskostnad',
    ],
    examples: [
      'Verksamhetsrelaterad kostnad som enligt skattereglerna inte får dras av',
    ],
  },

  {
    id: 'inventarier',
    primaryAccount: '1220',
    name: 'Inventarier',
    group: 'assets',
    availability: 'guided',
    usageType: 'special',
    categoryGuidance: {
      status: 'conditional',
      summary:
        'Utrustning och inventarier som ska bokföras som tillgång och normalt skrivas av över flera år.',
      suitableWhen:
        'När inköpet är en inventarie som inte ska kostnadsföras direkt som förbrukningsinventarie.',
      warning:
        'Valet mellan Inventarier och Förbrukningsinventarier beror bland annat på värde, ekonomisk livslängd och om flera inköp är naturligt sammanhängande. SoloLedger ska använda reglerna för det aktuella året och inte en permanent beloppsgräns i kategorin.',
    },
    vatGuidance: {
      status: 'conditional',
      summary:
        'Momsbehandlingen beror på verksamhetens momsstatus, inköpet och leverantören.',
      warning:
        'För en verksamhet som inte får dra av ingående moms kan momsen påverka tillgångens anskaffningsvärde.',
    },
    keywords: [
      'inventarie',
      'inventarier',
      'tillgång',
      'avskrivning',
      'dyr utrustning',
      'kamera',
      'dator',
      'maskin',
    ],
    examples: [
      'Utrustning som ska användas under flera år och bokföras som tillgång',
      'Inventarie som ska skrivas av',
    ],
  },
]

/**
 * Grundkontoplan v1 – systemkonton.
 *
 * Dessa är BAS-konton som SoloLedger behöver känna till för bokföring,
 * rapportering, moms, eget kapital och särskilda bokföringsflöden.
 *
 * De är INTE vanliga användarkategorier och ska därför inte visas som
 * normala val när användaren väljer vad en transaktion gäller.
 *
 * Vissa konton har usageType 'special'. Det betyder att de kan ingå i
 * ett särskilt guidat flöde, men fortfarande inte ska väljas fritt som
 * en vanlig bokföringskategori.
 *
 * Resultat- och NE-klassificering hör fortsatt hemma i resultEngine.ts.
 */
export const SYSTEM_ACCOUNTS: SystemAccount[] = [
  {
    accountNumber: '1790',
    name: 'Förutbetalda kostnader',
    group: 'periodization',
    availability: 'system',
    usageType: 'system',
    description:
      'Tekniskt konto för kostnader som har betalats men helt eller delvis hör till en senare period. Användaren ska normalt beskriva periodiseringen i ett särskilt flöde i stället för att själv välja 1790.',
    userSelectable: false,
  },

  {
    accountNumber: '1930',
    name: 'Företagskonto',
    group: 'system',
    availability: 'system',
    usageType: 'system',
    description:
      'Företagets bankkonto. Detta beskriver hur en transaktion betalades eller togs emot och är därför ett betalningskonto, inte en kategori för vad transaktionen gäller.',
    userSelectable: false,
  },

  {
    accountNumber: '2010',
    name: 'Eget kapital',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för eget kapital i den enskilda firman. Ska inte användas som vanlig kategori för egna insättningar eller uttag.',
    userSelectable: false,
  },

  {
    accountNumber: '2011',
    name: 'Egna varuuttag',
    group: 'owner',
    availability: 'system',
    usageType: 'special',
    description:
      'SoloLedger känner till kontot för bland annat importerad bokföring och rapportering, men v1 stödjer inte ett komplett guidat flöde för egna varuuttag. Ett sådant uttag kan kräva hantering även av intäkt och moms, så SoloLedger ska inte förenkla det till en vanlig användarkategori.',
    userSelectable: false,
  },

  {
    accountNumber: '2014',
    name: 'Uttag av förmåner',
    group: 'owner',
    availability: 'system',
    usageType: 'special',
    description:
      'SoloLedger känner till kontot för bland annat importerad bokföring och rapportering, men v1 stödjer inte ett komplett guidat flöde för uttag av förmåner. Kontot ska därför inte erbjudas som en vanlig användarkategori.',
    userSelectable: false,
  },

  {
    accountNumber: '2017',
    name: 'Egna insättningar / kapitaltillskott',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'Kapital-/insättningskonto som SoloLedger behöver förstå vid bland annat importerad bokföring och rapportering. SoloLedgers primära användarkategori för egen insättning använder tills vidare 2018 för bakåtkompatibilitet.',
    userSelectable: false,
  },

  {
    accountNumber: '2018',
    name: 'Övriga egna insättningar',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'SoloLedgers nuvarande systemförslag för privata pengar eller privata utlägg som förs in i verksamheten. 2017 finns kvar som relaterat K1/BAS-konto för egna insättningar och kapitaltillskott.',
    userSelectable: false,
  },

  {
    accountNumber: '2019',
    name: 'Årets resultat',
    group: 'owner',
    availability: 'system',
    usageType: 'system',
    description:
      'Tekniskt konto för årets resultat och eget kapital. Ska inte väljas som vanlig bokföringskategori av användaren.',
    userSelectable: false,
  },

  {
    accountNumber: '2611',
    name: 'Utgående moms 25 %',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för utgående moms med 25 procent. Momsflödet ska skapa och hantera momsraden utifrån den aktuella transaktionen i stället för att användaren väljer kontot manuellt.',
    userSelectable: false,
  },

  {
    accountNumber: '2621',
    name: 'Utgående moms 12 %',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för utgående moms med 12 procent. Momsflödet ska skapa och hantera momsraden utifrån den aktuella transaktionen i stället för att användaren väljer kontot manuellt.',
    userSelectable: false,
  },

  {
    accountNumber: '2631',
    name: 'Utgående moms 6 %',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för utgående moms med 6 procent. Momsflödet ska skapa och hantera momsraden utifrån den aktuella transaktionen i stället för att användaren väljer kontot manuellt.',
    userSelectable: false,
  },

  {
    accountNumber: '2641',
    name: 'Ingående moms',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Systemkonto för avdragsgill ingående moms på inköp. Användaren ska normalt ange eller kontrollera momsbehandlingen för inköpet, medan SoloLedger hanterar själva momskontot.',
    userSelectable: false,
  },

  {
    accountNumber: '2650',
    name: 'Redovisningskonto för moms',
    group: 'vat',
    availability: 'system',
    usageType: 'system',
    description:
      'Tekniskt avräkningskonto för momsredovisningen. Kontot är relevant för SoloLedgers moms- och rapporteringslogik men ska inte användas som vanlig bokföringskategori.',
    userSelectable: false,
  },

  {
    accountNumber: '7830',
    name: 'Avskrivning på inventarier',
    group: 'assets',
    availability: 'system',
    usageType: 'special',
    description:
      'Kostnadskonto som används när inventarier skrivs av. Användaren ska normalt hantera inventarien genom ett särskilt inventarie- och avskrivningsflöde i stället för att själv välja 7830.',
    userSelectable: false,
  },
]

export function getSystemAccount(accountNumber: string) {
  const nr = accountNumber.trim()
  return (
    SYSTEM_ACCOUNTS.find(account => account.accountNumber === nr) ?? null
  )
}

export function isSystemAccount(accountNumber: string) {
  return getSystemAccount(accountNumber) !== null
}

export function isPaymentAccountRole(value: string): value is PaymentAccountRole {
  return (PAYMENT_ACCOUNT_ROLES as readonly string[]).includes(value)
}

export function isValidPaymentRoleAccountNumber(accountNumber: string) {
  return /^\d{4}$/.test(accountNumber.trim())
}

export function paymentAccountRoleAccountNumberValidationMessage(
  role: PaymentAccountRole,
  accountNumber: string
) {
  const normalized = accountNumber.trim()

  if (!isValidPaymentRoleAccountNumber(normalized)) {
    return 'Ange ett BAS-konto med exakt fyra siffror.'
  }

  if (role === 'business_payment_account' && !normalized.startsWith('1')) {
    return 'Företagets betalningskonto måste vara ett tillgångskonto (1xxx), till exempel 1930.'
  }

  if (role === 'owner_private_payment' && !normalized.startsWith('2')) {
    return 'Privat betalning måste kopplas till eget kapital (2xxx), till exempel 2018.'
  }

  return null
}

export function isValidPaymentRoleAccountNumberForRole(
  role: PaymentAccountRole,
  accountNumber: string
) {
  return paymentAccountRoleAccountNumberValidationMessage(role, accountNumber) === null
}

export const PAYMENT_ACCOUNT_ROLE_RECOMMENDATIONS:
  Record<PaymentAccountRole, PaymentAccountRoleRecommendation> = {
    business_payment_account: {
      role: 'business_payment_account',
      accountNumber: '1930',
      label: 'Företagskonto',
      summary:
        'Normal rekommendation när inköpet har betalats från företagets bankkonto.',
    },
    owner_private_payment: {
      role: 'owner_private_payment',
      accountNumber: '2018',
      label: 'Egen insättning',
      summary:
        'SoloLedgers nuvarande systemförslag när ägaren har betalat ett verksamhetsinköp privat.',
    },
  }

export function getPaymentAccountRoleRecommendation(
  role: PaymentAccountRole
) {
  return PAYMENT_ACCOUNT_ROLE_RECOMMENDATIONS[role]
}

/**
 * Legacy-modell.
 *
 * Den används fortfarande av nuvarande Kontoplan och setupDefaultAccounts.
 * Den tas bort eller migreras först när de delarna har kopplats över till
 * Grundkontoplan v1.
 */
export interface AccountPreset {
  id: string
  name: string
  debit_account: string
  credit_account: string
  default_vat_rate: number
  comment: string

  /**
   * Ska kategorin skapas automatiskt för en ny användare?
   */
  seedDefault?: boolean

  /**
   * Ska kategorin visas som snabbförslag i Kontoplan?
   */
  quickSuggestion?: boolean

  /**
   * Guidning som SoloLedger kan använda för att hjälpa användaren
   * förstå när kategorin passar och när extra kontroll behövs.
   */
  guidance?: AccountGuidance
}

/**
 * Legacy-kunskapskälla för nuvarande SoloLedger-kategorier.
 *
 * OBS:
 * Denna lista behålls tills nuvarande Kontoplan/setupDefaultAccounts
 * har migrerats till Grundkontoplan v1.
 *
 * Ändra inte denna lista enbart för att BOOKING_CATEGORIES ovan har
 * en nyare eller bättre modell. Migreringen görs separat och kontrollerat.
 */
export const ACCOUNT_PRESETS: AccountPreset[] = [
  {
    id: 'avskrivning_inventarier',
    name: 'Avskrivning på inventarier',
    debit_account: '7830',
    credit_account: '1220',
    default_vat_rate: 0,
    comment: 'Avskrivning på inventarier som bokförts som tillgång',
    seedDefault: true,
  },
  {
    id: 'bankavgift',
    name: 'Bankavgift',
    debit_account: '6570',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: 'Bank- och betaltjänstkostnader',
    seedDefault: true,
    guidance: {
      status: 'direct',
      summary:
        'Avgifter som banken eller en betaltjänst tar ut för tjänster som hör till verksamheten.',
      suitableWhen:
        'Till exempel bankavgifter och andra avgifter för företagets bank- och betaltjänster.',
      warning:
        'Kontrollera att det verkligen är en avgift och inte exempelvis ränta, amortering eller ett vanligt inköp.',
    },
  },
  {
    id: 'egen_insättning',
    name: 'Egen insättning',
    debit_account: '1930',
    credit_account: '2018',
    default_vat_rate: 0,
    comment: 'När du sätter in privata pengar i firman',
    seedDefault: true,
  },
  {
    id: 'eget_uttag',
    name: 'Eget uttag',
    debit_account: '2013',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: 'När du tar ut pengar från firman privat – inte lön',
    seedDefault: true,
  },
  {
    id: 'ej_avdragsgillt',
    name: 'Ej avdragsgilla kostnader',
    debit_account: '6992',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'T.ex. böter och förseningsavgifter som inte är skattemässigt avdragsgilla',
    seedDefault: true,
  },
  {
    id: 'försäljning',
    name: 'Försäljning',
    debit_account: '1930',
    credit_account: '3010',
    default_vat_rate: 25,
    comment: 'Vanlig momspliktig försäljning. Ändra momssats vid behov.',
    seedDefault: true,
  },

  // Teknisk/legacy-kategori.
  // Behålls oförändrad tills migreringen till Grundkontoplan v1 görs.
  {
    id: 'ingående_balans',
    name: 'Eget kapital, ingående balans (IB)',
    debit_account: '1930',
    credit_account: '2010',
    default_vat_rate: 0,
    comment:
      'Tekniskt konto för ingående eget kapital – använd inte för vanliga egna insättningar',
    seedDefault: true,
  },

  {
    id: 'kurser',
    name: 'Kurser & fortbildning',
    debit_account: '6991',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'Utbildning med tydlig koppling till den verksamhet du redan bedriver',
    seedDefault: true,
    guidance: {
      status: 'conditional',
      summary:
        'Utbildning och fortbildning kan vara avdragsgill när den har ett tydligt samband med verksamheten du redan bedriver.',
      suitableWhen:
        'Utbildningen underhåller eller utvecklar kunskaper som du behöver i din nuvarande verksamhet.',
      warning:
        'Utbildning som ger dig förutsättningar att starta en ny verksamhet eller arbeta inom ett nytt område är normalt inte avdragsgill som fortbildning. Kontrollera därför syftet med utbildningen innan du bokför den.',
    },
  },
  {
    id: 'prenumerationer',
    name: 'Prenumerationer & programvaror',
    debit_account: '5420',
    credit_account: '1930',
    default_vat_rate: 25,
    comment: 'T.ex. Adobe och andra programvaror/SaaS',
    seedDefault: true,
  },

  // OBS: Blandar idag VAD som köpts med HUR det betalats.
  // Behålls oförändrad tills VAD/HUR-frågan hanteras separat.
  {
    id: 'privat_utlägg',
    name: 'Privat utlägg för firman',
    debit_account: '5410',
    credit_account: '2018',
    default_vat_rate: 25,
    comment: 'När du privat har betalat ett inköp som hör till firman',
    seedDefault: true,
  },

  {
    id: 'resor',
    name: 'Resor',
    debit_account: '5800',
    credit_account: '1930',
    default_vat_rate: 6,
    comment:
      'T.ex. tåg, kollektivtrafik och taxi – kontrollera momsen på underlaget',
    seedDefault: true,
  },

  // Teknisk kategori som används av SoloLedgers periodiseringsflöde.
  {
    id: 'periodisering',
    name: 'Förutbetalda kostnader',
    debit_account: '1790',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'Används automatiskt av SoloLedger vid periodisering över årsskifte',
    seedDefault: true,
  },
  {
    id: 'skattekonto_default',
    name: 'Skatter & avgifter (eget uttag)',
    debit_account: '2012',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'När firmans pengar används för ägarens F-skatt och andra privata skatter/avgifter',
    seedDefault: true,
  },

  // Nuvarande snabbförslag i Kontoplan.
  {
    id: 'lokalhyra',
    name: 'Hyra för verksamhetslokal',
    debit_account: '5010',
    credit_account: '1930',
    default_vat_rate: 0,
    comment:
      'Hyra för separat kontor, studio, lager eller annan verksamhetslokal - inte vanligt hemmakontor',
    quickSuggestion: true,
  },
  {
    id: 'el-lokal',
    name: 'El för verksamhetslokal',
    debit_account: '5020',
    credit_account: '1930',
    default_vat_rate: 25,
    comment:
      'El för separat verksamhetslokal - inte vanlig hushållsel i bostaden',
    quickSuggestion: true,
  },
  {
    id: 'reklam',
    name: 'Reklam & Annonsering',
    debit_account: '5900',
    credit_account: '1930',
    default_vat_rate: 25,
    comment: 'Google Ads, Meta-annonser, trycksaker',
    quickSuggestion: true,
  },
  {
    id: 'frakt',
    name: 'Frakt & transporter',
    debit_account: '5710',
    credit_account: '1930',
    default_vat_rate: 25,
    comment: 'Frakt och transporter av varor i verksamheten',
    quickSuggestion: true,
  },
  {
    id: 'forsakring',
    name: 'Företagsförsäkring',
    debit_account: '6310',
    credit_account: '1930',
    default_vat_rate: 0,
    comment: 'Ansvars- och sakförsäkring för firman',
    quickSuggestion: true,
  },
  {
    id: 'milersattning',
    name: 'Egen bil i verksamheten',
    debit_account: '5843',
    credit_account: '2018',
    default_vat_rate: 0,
    comment:
      'Privat bil som används för resor i verksamheten - 25 kr/mil. Gäller inte vanliga resor mellan bostad och verksamhetslokal',
    quickSuggestion: true,
  },
]

/**
 * Kuraterad BAS-hjälp för konton SoloLedger använder eller behöver
 * kunna förklara. Detta är medvetet inte en full BAS-kontoplan.
 *
 * Denna tabell är endast för kontonamn/förklaring.
 * Resultat- och NE-klassificering hör fortfarande hemma i resultEngine.ts.
 */
export const BAS_ACCOUNT_HELP: Record<string, string> = {
  '1790': 'Övriga förutbetalda kostnader och upplupna intäkter',
  '1930': 'Företagskonto / checkkonto / affärskonto',
  '2010': 'Eget kapital',
  '2011': 'Egna varuuttag',
  '2012': 'Avräkning för skatter och avgifter',
  '2013': 'Övriga egna uttag',
  '2014': 'Uttag förmåner',
  '2017': 'Egna insättningar / årets kapitaltillskott',
  '2018': 'Övriga egna insättningar',
  '2019': 'Årets resultat',
  '2611': 'Utgående moms 25 %',
  '2621': 'Utgående moms 12 %',
  '2631': 'Utgående moms 6 %',
  '2641': 'Debiterad ingående moms',
  '2650': 'Redovisningskonto för moms',
  '3010': 'Försäljning',
  '4010': 'Inköp av varor och material',
  '4600': 'Legoarbeten och underentreprenader',
  '5010': 'Lokalhyra',
  '5020': 'El för belysning',
  '5410': 'Förbrukningsinventarier',
  '5420': 'Programvaror',
  '5710': 'Frakter och transporter',
  '5800': 'Resekostnader',
  '5843': 'Bilersättning, skattefri',
  '5900': 'Reklam och PR',
  '5910': 'Annonsering',
  '6110': 'Kontorsmateriel',
  '6212': 'Mobiltelefon',
  '6230': 'Datakommunikation',
  '6250': 'Postbefordran',
  '6310': 'Företagsförsäkringar',
  '6530': 'Redovisningstjänster',
  '6540': 'IT-tjänster',
  '6550': 'Konsultarvoden',
  '6570': 'Bankkostnader',
  '6991': 'Övriga externa kostnader',
  '6992': 'Övriga externa kostnader, ej avdragsgilla',
  '7830': 'Avskrivningar på maskiner och inventarier',
}

export function getBasAccountHelp(accountNumber: string) {
  const nr = accountNumber.trim()
  return BAS_ACCOUNT_HELP[nr] ?? null
}

/**
 * Legacy-helper.
 * Används fortfarande av setupDefaultAccounts.
 */
export function getDefaultAccountPresets() {
  return ACCOUNT_PRESETS.filter(preset => preset.seedDefault)
}

/**
 * Legacy-helper.
 * Används fortfarande av nuvarande Kontoplan.
 */
export function getQuickAccountSuggestions() {
  return ACCOUNT_PRESETS.filter(preset => preset.quickSuggestion)
}

/**
 * Grundkontoplan v1-helpers.
 *
 * Dessa används inte av nuvarande UI ännu men ger nästa steg en tydlig,
 * typad ingång till den nya kunskapsmodellen.
 */
export function getDefaultBookingCategories() {
  return BOOKING_CATEGORIES.filter(
    category => category.availability === 'default'
  )
}

export function getQuickBookingCategories() {
  return BOOKING_CATEGORIES.filter(
    category => category.availability === 'quick'
  )
}

export function getGuidedBookingCategories() {
  return BOOKING_CATEGORIES.filter(
    category => category.availability === 'guided'
  )
}

export function getBookingCategory(id: string) {
  return BOOKING_CATEGORIES.find(category => category.id === id) ?? null
}

/**
 * Översätter en kategori i Grundkontoplan v1 till den AccountPreset-form
 * som nuvarande SoloLedger fortfarande använder.
 *
 * Detta är en tillfällig kompatibilitetsbrygga. Motkonto och moms här
 * representerar dagens förenklade preset-flöde och ska inte betraktas
 * som permanenta bokföringsregler.
 */
export function bookingCategoryToAccountPreset(
  category: BookingCategory
): AccountPreset | null {
  const mapping = category.legacyPreset

  if (!mapping) {
    return null
  }

  return {
    id: category.id,
    name: category.name,
    debit_account: mapping.debitAccount,
    credit_account: mapping.creditAccount,
    default_vat_rate: mapping.defaultVatRate,
    comment: mapping.comment,
    seedDefault: category.availability === 'default',
    quickSuggestion: category.availability === 'quick',
  }
}

/**
 * AccountPreset-kompatibla kategorier som ska ingå i
 * SoloLedgers grundkontoplan för nya användare.
 */
export function getDefaultAccountPresetsV1(): AccountPreset[] {
  return getDefaultBookingCategories()
    .map(bookingCategoryToAccountPreset)
    .filter((preset): preset is AccountPreset => preset !== null)
}

/**
 * AccountPreset-kompatibla kategorier som ska visas som
 * snabbförslag i Kontoplan.
 */
export function getQuickAccountPresetsV1(): AccountPreset[] {
  return getQuickBookingCategories()
    .map(bookingCategoryToAccountPreset)
    .filter((preset): preset is AccountPreset => preset !== null)
}
````````

==================================================

==================================================
FILE: src/lib/setupDefaultAccounts.ts
==================================================

````typescript
import { supabase } from '@/lib/supabaseClient'
import { getDefaultAccountPresetsV1 } from './accountingKnowledge'

export async function setupDefaultAccounts(userId: string) {
// SoloLedger är avsett för enskild firma utan anställda.
// Grundkontoplan v1 skapar de användarkategorier som ska finnas från start.
  const defaultAccounts = getDefaultAccountPresetsV1().map(preset => ({
    id: preset.id,
    name: preset.name,
    debit_account: preset.debit_account,
    credit_account: preset.credit_account,
    default_vat_rate: preset.default_vat_rate,
    comment: preset.comment,
    user_id: userId,
  }))

  const { error } = await supabase.from('accounts').insert(defaultAccounts)
  if (error) console.error('Kunde inte skapa standardkonton:', error)
}
````````

==================================================

==================================================
FILE: src/lib/sieImport.ts
==================================================

````typescript
// src/lib/sieImport.ts
//
// Klientsidan av SIE-importen. Bygger payload från ett SieParseResult,
// beräknar dubblettskyddande hash, anropar den atomära databasfunktionen
// import_sie_batch() (se sie_import_schema.sql), och tolkar resultatet.
//
// All faktisk skrivning till transactions/journal_entries sker i databasen,
// i EN transaktion. Den här filen orkestrerar aldrig flera separata
// supabase.from(...).insert()-anrop för importen - se arkitekturanalysen
// om varför det inte kan vara transaktionssäkert från klienten.

import { supabase } from './supabaseClient'
import { getUserId } from './accountingService'
import type { SieParseResult } from './sieParser'

/** Resultatet av en lyckad importSieBatch()-körning. */
export interface ImportSieBatchResult {
  success: true
  importBatchId: string
  verificationCount: number
  importedCount: number
  openingBalanceImported: boolean
}

/**
 * Kastas när importen avvisas eller misslyckas. `code` låter UI:t skilja
 * på "redan importerad" (kan visas som info) och andra fel (bör visas som fel).
 */
export class SieImportError extends Error {
  code: 'ALREADY_IMPORTED' | 'OPENING_BALANCE_EXISTS' | 'VALIDATION_FAILED' | 'IMPORT_FAILED'

  constructor(message: string, code: SieImportError['code']) {
    super(message)
    this.name = 'SieImportError'
    this.code = code
  }
}

/**
 * Importerar ett parsat SIE-resultat till databasen.
 *
 * Förutsätter att parseResult redan är validerat i UI:t (preview-steget) -
 * denna funktion vägrar ändå köra om parseResult.errors inte är tom, som
 * ett sista skyddsnät.
 */
export async function importSieBatch(
  parseResult: SieParseResult,
  filename: string
): Promise<ImportSieBatchResult> {
  await getUserId() // kastar om ingen är inloggad - samma mönster som övriga accountingService

  if (parseResult.errors.length > 0) {
    throw new SieImportError(
      `Filen kan inte importeras: ${parseResult.errors.length} valideringsfel kvarstår (t.ex. obalanserade verifikationer). Åtgärda källfilen och försök igen.`,
      'VALIDATION_FAILED'
    )
  }
  if (parseResult.verifications.length === 0) {
    throw new SieImportError('Filen innehåller inga verifikationer att importera.', 'VALIDATION_FAILED')
  }

  const fileHash = await computeCanonicalHash(parseResult)

  const payload = {
    filename,
    file_hash: fileHash,
    company_name: parseResult.companyName,
    org_nr: parseResult.orgNr,
    fiscal_year: parseResult.year,
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

  const { data, error } = await supabase.rpc('import_sie_batch', { p_payload: payload })

  if (error) {
    if (error.code === '23505') {
      throw new SieImportError('Den här filen är redan importerad tidigare.', 'ALREADY_IMPORTED')
    }
    if (error.code === 'P2001') {
      throw new SieImportError(
        error.message || 'Det finns redan en ingående balans för räkenskapsåret. Importen avbröts.',
        'OPENING_BALANCE_EXISTS'
      )
    }
    throw new SieImportError('Importen misslyckades och rullades tillbaka: ' + error.message, 'IMPORT_FAILED')
  }
  if (!data?.success) {
    throw new SieImportError('Importen misslyckades av okänd anledning.', 'IMPORT_FAILED')
  }

  return {
    success: true,
    importBatchId: data.import_batch_id,
    verificationCount: data.verification_count,
    importedCount: data.imported_count,
    openingBalanceImported: data.opening_balance_imported ?? false,
  }
}

/**
 * Beräknar en deterministisk hash av det PARSADE innehållet - inte av
 * filens råa bytes. Detta är medvetet: SIE-filer innehåller alltid en
 * #GEN-rad (exporttidsstämpel) som ändras vid varje export även om den
 * underliggande bokföringen är identisk. Att hasha bytes skulle göra att
 * samma bokföring, exporterad två gånger, alltid räknades som "olika filer".
 *
 * Sorteringen (per verifikation och per rad) gör hashen oberoende av i
 * vilken ordning filen råkar lista verifikationer/rader.
 */
async function computeCanonicalHash(parseResult: SieParseResult): Promise<string> {
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
````````

==================================================

==================================================
FILE: src/lib/sieParser.ts
==================================================

````typescript
// src/lib/sieParser.ts
//
// Ren, beroendefri parser för SIE Typ 4-filer.
// Inga Supabase-anrop, inget UI, inga React-beroenden.
//
// Steg 1 av SIE-import: läs in filen till strukturerad data + validering.
// Import till transactions/journal_entries hanteras i ett senare steg.

// ─────────────────────────────────────────────────────────────
// Publika typer
// ─────────────────────────────────────────────────────────────

/** Ett konto från #KONTO-posten. */
export interface SieAccount {
  /** Kontonummer, t.ex. "1930". Behålls som sträng (kan ha ledande nollor). */
  number: string
  /** Kontonamn, t.ex. "Företagskonto". */
  name: string
}

/** En objekt/dimension-koppling på en #TRANS-rad, t.ex. { dimension: "1", object: "Nord" }. */
export interface SieObjectRef {
  dimension: string
  object: string
}

/** En enskild transaktionsrad (#TRANS) inom en verifikation. */
export interface SieTrans {
  /** Kontonummer raden bokförs mot. */
  accountNumber: string
  /**
   * Belopp enligt SIE-konventionen: positivt = debet, negativt = kredit.
   */
  amount: number
  /** Objekt/dimension-lista, t.ex. kostnadsställe. Tom array om ingen angavs. */
  objects: SieObjectRef[]
  /** Transaktionsdatum (YYYY-MM-DD), om angivet separat från verifikationsdatumet. */
  transDate?: string
  /** Fritext för raden, t.ex. fakturanummer. Kan vara tom sträng om filen skrev "". */
  description?: string
  /** Kvantitet/antal, om angivet. */
  quantity?: number
}

/** En verifikation (#VER + dess #TRANS-rader). */
export interface SieVer {
  /** Verifikationsserie, t.ex. "A". */
  series: string
  /** Verifikationsnummer inom serien. Behålls som sträng. */
  verNumber: string
  /** Verifikationsdatum (YYYY-MM-DD). */
  date: string
  /** Verifikationstext. */
  description: string
  /** Registreringsdatum (YYYY-MM-DD), om angivet. */
  registrationDate?: string
  /** Radernas transaktioner. */
  transactions: SieTrans[]
  /** Summan av transactions[].amount. 0 om verifikationen balanserar. */
  balanceDiff: number
}

/** Ett räkenskapsår från en #RAR-rad. */
export interface SieFiscalYear {
  /** 0 = innevarande år, -1 = föregående år, osv. */
  index: number
  /** Startdatum (YYYY-MM-DD). */
  start: string
  /** Slutdatum (YYYY-MM-DD). */
  end: string
}

/** En ingående balans-rad från en #IB-post (endast innevarande räkenskapsår, index 0). */
export interface SieOpeningBalance {
  /** Kontonummer. */
  accountNumber: string
  /**
   * Belopp enligt samma konvention som #TRANS: positivt = debet, negativt = kredit.
   */
  amount: number
}

/** En resultatkonto-rad från #RES för föregående räkenskapsår (årsnr -1). */
export interface SiePreviousYearResultBalance {
  /** Kontonummer. */
  accountNumber: string
  /** SIE-saldo: positivt = debet, negativt = kredit. */
  amount: number
}

/** Resultatet av parseSieFile. */
export interface SieParseResult {
  companyName: string | null
  orgNr: string | null
  /** Räkenskapsårets startår (från #RAR med index 0), eller null om okänt. */
  year: number | null
  fiscalYears: SieFiscalYear[]
  accounts: SieAccount[]
  verifications: SieVer[]
  /**
   * Ingående balans från #IB-poster för innevarande räkenskapsår (index 0).
   * #IB för andra index (-1, -2, ...) är jämförelseår och parsas inte -
   * de hör inte till den balans som ska skrivas in i bokföringen nu.
   */
  openingBalances: SieOpeningBalance[]
  /**
   * Resultatkontosaldon från #RES -1. Används för att verifiera att
   * en #IB-differens motsvaras av föregående års ännu ej omförda resultat.
   */
  previousYearResultBalances: SiePreviousYearResultBalance[]
  /** accounts.length, för bekvämlighet. */
  accountCount: number
  /** verifications.length, för bekvämlighet. */
  verificationCount: number
  /** Summan av alla transaktioners belopp i hela filen. Bör vara ~0. */
  totalBalanceDiff: number
  /** true om hela filen (och samtliga verifikationer) balanserar. */
  isBalanced: boolean
  /** Fel som gör att data bör hanteras med försiktighet (t.ex. obalans, trasig fil). */
  errors: string[]
  /** Varningar som inte hindrar parsning men är värda att visa användaren. */
  warnings: string[]
}

// ─────────────────────────────────────────────────────────────
// Konstanter
// ─────────────────────────────────────────────────────────────

/** Toleransgräns (kr) för avrundningsfel vid balanskontroll. */
const BALANCE_EPSILON = 0.005

// ─────────────────────────────────────────────────────────────
// Teckenkodning: PC8 / CP437 -> UTF-8 (JS-sträng)
// ─────────────────────────────────────────────────────────────

/**
 * CP437-tabell för byte-värden 128–255 (0x80–0xFF).
 * Byte-värden 0–127 motsvarar vanlig ASCII och behöver ingen mappning.
 * Detta är standard-CP437 ("PC8" i SIE-spec:en), som skiljer sig från
 * Windows-1252/Latin-1 för just de övre 128 tecknen – bl.a. Å/Ä/Ö/å/ä/ö
 * ligger på andra positioner än i Windows-1252.
 */
const CP437_UPPER_HALF: string =
  'ÇüéâäàåçêëèïîìÄÅ' +
  'ÉæÆôöòûùÿÖÜ¢£¥₧ƒ' +
  'áíóúñÑªº¿⌐¬½¼¡«»' +
  '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐' +
  '└┴┬├─┼╞╟╚╔╩╦╠═╬╧' +
  '╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩' +
  '≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0'

/**
 * CP850-tabell för byte-värden 128–255. Vissa ekonomisystem (särskilt
 * äldre danska/norska installationer) skriver CP850 trots att SIE-headern
 * anger "PC8". Skiljer sig från CP437 bl.a. i teckenblocket 0x9B–0xE7.
 */
const CP850_UPPER_HALF: string =
  'ÇüéâäàåçêëèïîìÄÅ' +
  'ÉæÆôöòûùÿÖÜø£Ø×ƒ' +
  'áíóúñÑªº¿®¬½¼¡«»' +
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' +
  'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´' +
  '\u00ADú¾¶§÷¸°¨·¹³²■\u00A0'

/** Resultatet av decodeSieBuffer(): den avkodade texten plus vilken kodning som användes och ev. varningar. */
export interface SieDecodeResult {
  content: string
  encoding: 'utf-8' | 'cp437' | 'cp850'
  warnings: string[]
}

/**
 * Avkodar rådata (t.ex. från en uppladdad fil) till en vanlig JS-sträng,
 * och returnerar samtidigt vilken teckenkodning som antogs samt ev. varningar.
 *
 * OBS: parseSieFile() nedan tar emot en redan avkodad `string` (result.content
 * härifrån). Om filen lästs in som bytes (FileReader.readAsArrayBuffer,
 * fetch().arrayBuffer(), etc.) MÅSTE den gå genom decodeSieBuffer() FÖRST –
 * annars blir svenska tecken (ÅÄÖ) felaktiga, eftersom varken UTF-8- eller
 * Windows-1252-avkodning ger samma resultat som CP437/CP850 för byte-värden ≥ 0x80.
 *
 * Kodning avgörs i turordning, eftersom verkliga SIE-filer från olika
 * ekonomisystem lögner om sin egen kodning eller använder varianter som
 * spec:en inte förutser (CP437, CP850, Windows-1252, Latin-1, UTF-8, UTF-8
 * med BOM har alla observerats i praktiken under en "#FORMAT PC8"-header):
 *
 *  1. UTF-8 BOM (EF BB BF) i filens början → UTF-8, säkert avgjort.
 *  2. Giltig UTF-8 med minst en multi-byte-sekvens (Å/Ä/Ö kräver det) →
 *     UTF-8. Många moderna exportörer (Fortnox, Bokio m.fl.) skriver
 *     faktiskt UTF-8 trots att headern anger PC8.
 *  3. Annars läses den deklarerade #FORMAT-raden (ASCII-säkert, oavsett
 *     faktisk kodning eftersom taggen och dess värden alltid är ASCII).
 *     "PC850" → CP850. "PC8" (eller inget värde alls) → CP437, som är
 *     vanligast i praktiken (bl.a. Visma).
 *  4. Om #FORMAT anger något oväntat/okänt läggs en varning till och
 *     CP437 används ändå som bästa gissning.
 */
export function decodeSieBuffer(data: ArrayBuffer | Uint8Array): SieDecodeResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const warnings: string[] = []

  if (hasUtf8Bom(bytes)) {
    return { content: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8', warnings }
  }

  if (looksLikeUtf8(bytes)) {
    return { content: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', warnings }
  }

  const declaredFormat = detectDeclaredFormat(bytes)

  if (declaredFormat === 'PC850') {
    return { content: decodeSingleByte(bytes, CP850_UPPER_HALF), encoding: 'cp850', warnings }
  }

  if (declaredFormat === undefined || declaredFormat === 'PC8') {
    return { content: decodeSingleByte(bytes, CP437_UPPER_HALF), encoding: 'cp437', warnings }
  }

  warnings.push(
    `Filens teckenkodning kunde inte fastställas säkert (deklarerat #FORMAT: "${declaredFormat}"). Antar CP437 – kontrollera svenska tecken (ÅÄÖ) i resultatet.`
  )
  return { content: decodeSingleByte(bytes, CP437_UPPER_HALF), encoding: 'cp437', warnings }
}

function decodeSingleByte(bytes: Uint8Array, upperHalfTable: string): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number
    out += b < 128 ? String.fromCharCode(b) : upperHalfTable[b - 128]
  }
  return out
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

/**
 * Läser värdet på #FORMAT-raden direkt ur råbytes, utan att först avgöra
 * kodning – går eftersom taggen och dess kända värden (PC8, PC850, UTF-8...)
 * alltid består av ASCII-tecken oavsett vilken kodning resten av filen har.
 */
function detectDeclaredFormat(bytes: Uint8Array): string | undefined {
  const headerWindow = bytes.subarray(0, Math.min(bytes.length, 4096))
  let ascii = ''
  for (let i = 0; i < headerWindow.length; i++) {
    const b = headerWindow[i] as number
    ascii += b < 128 ? String.fromCharCode(b) : ' '
  }
  const match = ascii.match(/#FORMAT\s+(\S+)/i)
  return match ? match[1].toUpperCase() : undefined
}

/** Ser bytesekvensen ut som giltig UTF-8 med minst ett multi-byte-tecken? */
function looksLikeUtf8(bytes: Uint8Array): boolean {
  let i = 0
  let sawMultiByte = false
  while (i < bytes.length) {
    const b = bytes[i] as number
    if (b < 0x80) {
      i++
      continue
    }
    let extra: number
    if ((b & 0xe0) === 0xc0) extra = 1
    else if ((b & 0xf0) === 0xe0) extra = 2
    else if ((b & 0xf8) === 0xf0) extra = 3
    else return false // ogiltig UTF-8-startbyte -> antagligen ett 8-bitars enbyte-format

    if (i + extra >= bytes.length) return false
    for (let k = 1; k <= extra; k++) {
      const cb = bytes[i + k] as number
      if ((cb & 0xc0) !== 0x80) return false
    }
    sawMultiByte = true
    i += extra + 1
  }
  return sawMultiByte
}

// ─────────────────────────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────────────────────────

interface SieToken {
  value: string
  quoted: boolean
  brace: boolean
}

/**
 * Delar upp en SIE-rad i tokens, med hänsyn till:
 *  - citerade strängar "..." (mellanslag inuti bevaras, "" = literal citation-mark)
 *  - klammerlistor {...} (t.ex. objektlistan på en #TRANS-rad) som EN token
 *  - vanliga blankstegsavgränsade fält
 */
function tokenizeLine(line: string): SieToken[] {
  const tokens: SieToken[] = []
  let i = 0
  const n = line.length

  while (i < n) {
    const ch = line[i]

    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }

    if (ch === '"') {
      i++
      let value = ''
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            value += '"'
            i += 2
            continue
          }
          i++
          break
        }
        value += line[i]
        i++
      }
      tokens.push({ value, quoted: true, brace: false })
      continue
    }

    if (ch === '{') {
      i++
      let depth = 1
      let value = ''
      while (i < n && depth > 0) {
        if (line[i] === '{') {
          depth++
          value += line[i]
          i++
          continue
        }
        if (line[i] === '}') {
          depth--
          if (depth === 0) {
            i++
            break
          }
          value += line[i]
          i++
          continue
        }
        value += line[i]
        i++
      }
      tokens.push({ value: value.trim(), quoted: false, brace: true })
      continue
    }

    let start = i
    while (i < n && line[i] !== ' ' && line[i] !== '\t') i++
    tokens.push({ value: line.slice(start, i), quoted: false, brace: false })
  }

  return tokens
}

/** Tolkar en objektlista, t.ex. "1 Nord 6 0001" -> [{dimension:"1",object:"Nord"}, {dimension:"6",object:"0001"}]. */
function parseObjectList(raw: string, warnings: string[], context: string): SieObjectRef[] {
  if (!raw || raw.trim() === '') return []
  const tokens = tokenizeLine(raw)
  const refs: SieObjectRef[] = []
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    refs.push({ dimension: tokens[i].value, object: tokens[i + 1].value })
  }
  if (tokens.length % 2 !== 0) {
    warnings.push(
      `Ofullständigt dimension/objekt-par i objektlistan "{${raw}}" (${context}) – sista värdet "${tokens[tokens.length - 1].value}" saknar sin motpart och ignoreras.`
    )
  }
  return refs
}

/** Konverterar SIE-datum "YYYYMMDD" -> "YYYY-MM-DD". Returnerar originalvärdet oförändrat om formatet inte känns igen. */
function formatSieDate(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }
  return raw
}

function isEightDigitDate(value: string | undefined): value is string {
  return value !== undefined && /^\d{8}$/.test(value)
}

/** Tolkar ett SIE-belopp (decimalpunkt normalt, men tål decimalkomma). */
function parseSieAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '' || Number.isNaN(Number(normalized))) return null
  return Number(normalized)
}

// ─────────────────────────────────────────────────────────────
// Huvudfunktion
// ─────────────────────────────────────────────────────────────

/**
 * Parsar innehållet i en SIE Typ 4-fil.
 *
 * `content` förväntas vara en redan avkodad JS-sträng (se decodeSieBuffer()
 * ovan om filen lästs in som råa bytes med CP437/PC8-kodning).
 *
 * Kastar aldrig exceptions för vanliga formatfel i filen – dessa samlas
 * istället i `errors`/`warnings` på returvärdet.
 */
export function parseSieFile(content: string): SieParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  const accounts = new Map<string, SieAccount>()
  const verifications: SieVer[] = []
  const fiscalYears: SieFiscalYear[] = []
  const openingBalances: SieOpeningBalance[] = []
  const previousYearResultBalances: SiePreviousYearResultBalance[] = []
  const referencedAccounts = new Set<string>()

  let companyName: string | null = null
  let orgNr: string | null = null

  const lines = content.split(/\r\n|\r|\n/)

  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (trimmed.length === 0 || !trimmed.startsWith('#')) {
      i++
      continue
    }

    const tokens = tokenizeLine(trimmed)
    const tag = tokens[0]?.value ?? ''

    switch (tag) {
      case '#FNAMN': {
        companyName = tokens[1]?.value ?? null
        i++
        break
      }

      case '#ORGNR': {
        orgNr = tokens[1]?.value ?? null
        i++
        break
      }

      case '#RAR': {
        const indexRaw = tokens[1]?.value
        const startRaw = tokens[2]?.value
        const endRaw = tokens[3]?.value
        const indexNum = indexRaw !== undefined ? Number(indexRaw) : NaN

        if (indexRaw === undefined || Number.isNaN(indexNum) || !startRaw || !endRaw) {
          warnings.push(`Ogiltig eller ofullständig #RAR-rad, hoppar över: "${trimmed}"`)
        } else {
          fiscalYears.push({
            index: indexNum,
            start: formatSieDate(startRaw),
            end: formatSieDate(endRaw),
          })
        }
        i++
        break
      }

      case '#KONTO': {
        const number = tokens[1]?.value
        const name = tokens[2]?.value ?? ''

        if (number === undefined) {
          warnings.push(`#KONTO saknar kontonummer, hoppar över: "${trimmed}"`)
        } else {
          accounts.set(number, { number, name })
        }
        i++
        break
      }

      case '#IB': {
        // #IB <arsnr> <kontonr> <belopp> [<objektlista>]
        // Bara arsnr "0" (innevarande räkenskapsår) är relevant för en import -
        // andra index (-1, -2, ...) är jämförelseår för tidigare perioder,
        // inte den öppningsbalans som ska skrivas in i bokföringen nu.
        const arsnrRaw = tokens[1]?.value
        const accountNumber = tokens[2]?.value
        const amountRaw = tokens[3]?.value

        if (arsnrRaw === undefined || accountNumber === undefined || amountRaw === undefined) {
          warnings.push(`Ofullständig #IB-rad, hoppar över: "${trimmed}"`)
          i++
          break
        }

        if (arsnrRaw !== '0') {
          i++
          break
        }

        const ibAmount = parseSieAmount(amountRaw)
        if (ibAmount === null) {
          warnings.push(
            `Ogiltigt belopp "${amountRaw}" på #IB-rad för konto ${accountNumber}, hoppar över.`
          )
          i++
          break
        }

        openingBalances.push({ accountNumber, amount: ibAmount })
        i++
        break
      }

      case '#RES': {
        // #RES <arsnr> <kontonr> <saldo> [<kvantitet>]
        // För IB-avstämningen behöver vi endast föregående års resultat
        // (årsnr -1). #RES 0 hör till innevarande års resultat.
        const arsnrRaw = tokens[1]?.value
        const accountNumber = tokens[2]?.value
        const amountRaw = tokens[3]?.value

        if (arsnrRaw === '-1') {
          if (accountNumber === undefined || amountRaw === undefined) {
            warnings.push(`Ofullständig #RES -1-rad, hoppar över: "${trimmed}"`)
          } else {
            const resultAmount = parseSieAmount(amountRaw)
            if (resultAmount === null) {
              warnings.push(
                `Ogiltigt belopp "${amountRaw}" på #RES -1-rad för konto ${accountNumber}, hoppar över.`
              )
            } else {
              previousYearResultBalances.push({
                accountNumber,
                amount: resultAmount,
              })
            }
          }
        }

        i++
        break
      }

      case '#VER': {
        const { ver, nextIndex } = parseVerBlock(lines, i, tokens, warnings, errors)
        if (ver) {
          verifications.push(ver)
          for (const t of ver.transactions) referencedAccounts.add(t.accountNumber)
        }
        i = nextIndex
        break
      }

      default: {
        // Kända men ej stödda taggar i v1 (#UB, #RES, #DIM, #OBJEKT, #KTYP,
        // #SRU, #PROGRAM, #GEN, #ADRESS, #FNR, #TAXAR, #KPTYP, #VALUTA, #FLAGGA,
        // #FORMAT, #SIETYP, m.fl.) ignoreras medvetet – filen ska inte
        // underkännas bara för att de förekommer.
        i++
        break
      }
    }
  }

  // ── Metadata-validering ──────────────────────────────────
  if (companyName === null) warnings.push('Saknar #FNAMN (företagsnamn) i filen.')
  if (orgNr === null) warnings.push('Saknar #ORGNR (organisationsnummer) i filen.')
  if (fiscalYears.length === 0) warnings.push('Saknar #RAR (räkenskapsår) i filen.')
  if (accounts.size === 0) warnings.push('Filen innehåller inga #KONTO-poster.')
  if (verifications.length === 0) warnings.push('Filen innehåller inga verifikationer (#VER).')

  const currentFiscalYear = fiscalYears.find((fy) => fy.index === 0)
  const year = currentFiscalYear ? Number(currentFiscalYear.start.slice(0, 4)) : null

  // ── Saknade konton (refererade i #TRANS men aldrig definierade via #KONTO) ──
  const missingAccounts = Array.from(referencedAccounts)
    .filter((acc) => !accounts.has(acc))
    .sort((a, b) => Number(a) - Number(b))
  for (const acc of missingAccounts) {
    warnings.push(`Konto ${acc} används i en verifikation men saknar #KONTO-post.`)
  }

  // ── Balanskontroll ───────────────────────────────────────
  let totalBalanceDiff = 0
  for (const ver of verifications) {
    totalBalanceDiff += ver.balanceDiff
    if (Math.abs(ver.balanceDiff) > BALANCE_EPSILON) {
      errors.push(
        `Verifikation ${ver.series}${ver.verNumber} (${ver.date}) balanserar inte: differens ${ver.balanceDiff.toFixed(2)} kr.`
      )
    }
  }

  const isBalanced = Math.abs(totalBalanceDiff) <= BALANCE_EPSILON
  if (!isBalanced) {
    errors.push(`Hela filen balanserar inte: total differens ${totalBalanceDiff.toFixed(2)} kr.`)
  }

  // ── Balanskontroll för ingående balans (#IB) ──────────────
  // Två legitima fall accepteras:
  //
  // 1) #IB balanserar redan själv. Då behövs ingen syntetisk resultatrad,
  //    även om filen samtidigt innehåller #RES -1 som jämförelseinformation.
  //
  // 2) #IB har en differens som exakt motsvaras av föregående års resultat
  //    i #RES -1. Då kan importen balansera öppningsverifikationen genom att
  //    lägga nettot på konto 2019 (Årets resultat).
  //
  // Exempel: sum(#IB 0) = -800 och sum(#RES -1) = +800 -> tillsammans 0.
  if (openingBalances.length > 0) {
    const openingBalanceDiff = openingBalances.reduce((sum, ob) => sum + ob.amount, 0)
    const previousYearResultDiff = previousYearResultBalances.reduce(
      (sum, res) => sum + res.amount,
      0
    )

    if (Math.abs(openingBalanceDiff) > BALANCE_EPSILON) {
      const reconciledDiff = openingBalanceDiff + previousYearResultDiff

      if (
        previousYearResultBalances.length === 0 ||
        Math.abs(reconciledDiff) > BALANCE_EPSILON
      ) {
        errors.push(
          previousYearResultBalances.length > 0
            ? `Ingående balans (#IB) stämmer inte mot föregående års resultat (#RES -1): differens ${reconciledDiff.toFixed(2)} kr.`
            : `Ingående balans (#IB) balanserar inte: differens ${openingBalanceDiff.toFixed(2)} kr.`
        )
      }
    }
  }


  return {
    companyName,
    orgNr,
    year,
    fiscalYears,
    accounts: Array.from(accounts.values()).sort((a, b) => Number(a.number) - Number(b.number)),
    verifications,
    openingBalances,
    previousYearResultBalances,
    accountCount: accounts.size,
    verificationCount: verifications.length,
    totalBalanceDiff,
    isBalanced,
    errors,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────
// Verifikationsblock (#VER { ... })
// ─────────────────────────────────────────────────────────────

function parseVerBlock(
  lines: string[],
  startIndex: number,
  headerTokens: SieToken[],
  warnings: string[],
  errors: string[]
): { ver: SieVer | null; nextIndex: number } {
  const series = headerTokens[1]?.value
  const verNumber = headerTokens[2]?.value
  const dateRaw = headerTokens[3]?.value

  if (series === undefined || verNumber === undefined || !isEightDigitDate(dateRaw)) {
    errors.push(`Trasig #VER-rad, kan inte importera säkert: "${lines[startIndex].trim()}"`)
    // Försök ändå hitta blockets slut så att resten av filen kan parsas korrekt.
    return { ver: null, nextIndex: skipToBlockEnd(lines, startIndex + 1) }
  }

  let pos = 4
  let description = ''
  let registrationDate: string | undefined

  if (headerTokens[pos] !== undefined) {
    description = headerTokens[pos].value
    pos++
  }
  if (isEightDigitDate(headerTokens[pos]?.value)) {
    registrationDate = formatSieDate(headerTokens[pos].value)
    pos++
  }

  // Hitta öppningsklammern. Normalt står den på nästa rad, men vi tolererar
  // tomma rader emellan.
  let j = startIndex + 1
  while (j < lines.length && lines[j].trim() === '') j++

  if (j >= lines.length || lines[j].trim() !== '{') {
    errors.push(
      `Verifikation ${series}${verNumber} saknar öppningsklammer "{", kan inte importera säkert.`
    )
    return { ver: null, nextIndex: j }
  }

  const transactions: SieTrans[] = []
  let k = j + 1
  let closed = false

  while (k < lines.length) {
    const lineTrimmed = lines[k].trim()

    if (lineTrimmed === '') {
      k++
      continue
    }
    if (lineTrimmed === '}') {
      closed = true
      k++
      break
    }

    const rowTokens = tokenizeLine(lineTrimmed)
    const rowTag = rowTokens[0]?.value ?? ''

    if (rowTag === '#TRANS') {
      const trans = parseTransLine(rowTokens, warnings, errors, `${series}${verNumber}`)
      if (trans) transactions.push(trans)
    } else if (rowTag === '#BTRANS' || rowTag === '#RTRANS') {
      // Budget- respektive saldoförda transaktioner – utanför scope i v1.
    } else {
      warnings.push(
        `Okänd rad inuti verifikation ${series}${verNumber}, ignoreras: "${lineTrimmed}"`
      )
    }

    k++
  }

  if (!closed) {
    errors.push(`Verifikation ${series}${verNumber} saknar avslutande klammer "}", kan inte importera säkert.`)
  }

  if (transactions.length === 0) {
    errors.push(
      `Verifikation ${series}${verNumber} innehåller inga giltiga #TRANS-rader och kan inte importeras.`
    )
  }

  const balanceDiff = transactions.reduce((sum, t) => sum + t.amount, 0)

  const ver: SieVer = {
    series,
    verNumber,
    date: formatSieDate(dateRaw),
    description,
    registrationDate,
    transactions,
    balanceDiff,
  }

  return { ver, nextIndex: k }
}

/** Om en #VER-rad är trasig: hoppa fram till och med raden efter matchande "}", så att resten av filen ändå kan parsas. */
function skipToBlockEnd(lines: string[], from: number): number {
  let j = from
  while (j < lines.length && lines[j].trim() === '') j++
  if (j >= lines.length || lines[j].trim() !== '{') return j
  j++
  while (j < lines.length && lines[j].trim() !== '}') j++
  return j < lines.length ? j + 1 : j
}

// ─────────────────────────────────────────────────────────────
// #TRANS-rader
// ─────────────────────────────────────────────────────────────

/**
 * #TRANS kontonr {objektlista} belopp [transdat] [transtext] [kvantitet] [sign]
 *
 * Endast kontonr, objektlista och belopp är obligatoriska. Övriga fält är
 * positionella och valfria, vilket kräver sekventiell tolkning eftersom
 * verkliga filer blandar korta (4 fält) och långa (7-10 fält) TRANS-rader.
 */
function parseTransLine(
  tokens: SieToken[],
  warnings: string[],
  errors: string[],
  verLabel: string
): SieTrans | null {
  const accountNumber = tokens[1]?.value
  const objectToken = tokens[2]
  const amountRaw = tokens[3]?.value

  if (accountNumber === undefined || amountRaw === undefined) {
    errors.push(`Ofullständig #TRANS-rad i verifikation ${verLabel}, kan inte importera säkert.`)
    return null
  }

  const amount = parseSieAmount(amountRaw)
  if (amount === null) {
    errors.push(
      `Ogiltigt belopp "${amountRaw}" på konto ${accountNumber} i verifikation ${verLabel}, kan inte importera säkert.`
    )
    return null
  }

  const objects = objectToken?.brace
    ? parseObjectList(objectToken.value, warnings, `konto ${accountNumber}, verifikation ${verLabel}`)
    : []

  let pos = 4
  let transDate: string | undefined
  let description: string | undefined
  let quantity: number | undefined

  if (isEightDigitDate(tokens[pos]?.value)) {
    transDate = formatSieDate(tokens[pos].value)
    pos++
  }

  if (tokens[pos] !== undefined) {
    description = tokens[pos].value
    pos++
  }

  if (tokens[pos] !== undefined) {
    const qty = parseSieAmount(tokens[pos].value)
    if (qty !== null) {
      quantity = qty
      pos++
    }
  }
  // Ev. kvarvarande token (sign/kvantitetsenhet) lämnas omedvetet oparsad i v1.

  return {
    accountNumber,
    amount,
    objects,
    transDate,
    description,
    quantity,
  }
}
````````

==================================================

