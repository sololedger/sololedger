import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

const year = 2026
const runTag = `E2E-KAN-14-${Date.now()}`
const customIncomeType = `${runTag}-3041`
const legacyIncomeType = `${runTag}-legacy-forsaljning`

type ProfileSnapshot = {
  vat_status: string | null
  vat_period_type: string | null
  vat_management_from: string | null
  domestic_sales_vat_treatment: string | null
  foreign_purchase_reporting: string | null
  default_deduction_entitlement: string | null
}

test.describe.serial('KAN-14 staging write acceptance', () => {
  let supabase: SupabaseClient
  let admin: SupabaseClient
  let userId: string
  let originalProfile: ProfileSnapshot | null = null

  test.beforeAll(async () => {
    assertWriteE2EEnvironment()
    supabase = await createAuthenticatedSupabaseClient()
    admin = createAdminSupabaseClient()
    const user = await currentUser(supabase)
    userId = user.id
    originalProfile = await readProfile(admin, userId)
    await ensureAccounts(admin, userId)
    await ensureBusinessPaymentRole(admin, userId)
  })

  test.afterAll(async () => {
    if (admin && userId && originalProfile) {
      await updateProfile(admin, userId, originalProfile)
    }
  })

  test('enforces domestic sales treatment for ordinary manual 3xxx income categories', async () => {
    await updateProfile(admin, userId, {
      vat_status: 'registered',
      vat_period_type: 'month',
      vat_management_from: `${year}-01-01`,
      domestic_sales_vat_treatment: 'small_business_exempt',
      foreign_purchase_reporting: 'required',
      default_deduction_entitlement: 'none',
    })

    for (const type of ['forsaljning', legacyIncomeType, customIncomeType]) {
      await expectManualBookingFailure(
        supabase,
        type,
        25,
        /momsfri|0 %% moms|0 % moms/i
      )
    }

    const exemptTxId = await bookManualTransaction(
      supabase,
      customIncomeType,
      0,
      1000,
      `${runTag} exempt 0 percent domestic sale`
    )
    await expectJournalNet(supabase, exemptTxId, '1930', 1000)
    await expectJournalNet(supabase, exemptTxId, '3041', -1000)
    await expectJournalNet(supabase, exemptTxId, '2611', 0)

    await updateProfile(admin, userId, {
      vat_status: 'registered',
      vat_period_type: 'month',
      vat_management_from: `${year}-01-01`,
      domestic_sales_vat_treatment: 'taxable',
      foreign_purchase_reporting: 'required',
      default_deduction_entitlement: 'none',
    })
    const taxableTxId = await bookManualTransaction(
      supabase,
      'forsaljning',
      25,
      1250,
      `${runTag} taxable domestic sale`
    )
    await expectJournalNet(supabase, taxableTxId, '1930', 1250)
    await expectJournalNet(supabase, taxableTxId, '3010', -1000)
    await expectJournalNet(supabase, taxableTxId, '2611', -250)

    await updateProfile(admin, userId, {
      vat_status: 'registered',
      vat_period_type: 'month',
      vat_management_from: `${year}-01-01`,
      domestic_sales_vat_treatment: 'unknown',
      foreign_purchase_reporting: 'required',
      default_deduction_entitlement: 'none',
    })
    await expectManualBookingFailure(
      supabase,
      'forsaljning',
      0,
      /saknar säker momsuppgift|gissar inte/i
    )

    await updateProfile(admin, userId, {
      vat_status: 'registered',
      vat_period_type: 'month',
      vat_management_from: `${year}-01-01`,
      domestic_sales_vat_treatment: 'mixed',
      foreign_purchase_reporting: 'required',
      default_deduction_entitlement: 'none',
    })
    await expectManualBookingFailure(
      supabase,
      customIncomeType,
      0,
      /saknar säker momsuppgift|gissar inte/i
    )
  })

  test('keeps correction, import, customer invoice, and VAT V2 sources outside the manual-sale trigger', async () => {
    await updateProfile(admin, userId, {
      vat_status: 'registered',
      vat_period_type: 'month',
      vat_management_from: `${year}-01-01`,
      domestic_sales_vat_treatment: 'small_business_exempt',
      foreign_purchase_reporting: 'required',
      default_deduction_entitlement: 'none',
    })
    const originalTxId = await bookManualTransaction(
      supabase,
      'forsaljning',
      0,
      900,
      `${runTag} correction original`
    )

    await updateProfile(admin, userId, {
      vat_status: 'registered',
      vat_period_type: 'month',
      vat_management_from: `${year}-01-01`,
      domestic_sales_vat_treatment: 'unknown',
      foreign_purchase_reporting: 'required',
      default_deduction_entitlement: 'none',
    })
    const { error: correctionError } = await supabase.rpc(
      'create_correction_transaction_atomic',
      { p_original_tx_id: originalTxId }
    )
    expect(correctionError).toBeNull()

    const { error: sieInsertError } = await admin.from('transactions').insert({
      user_id: userId,
      date: `${year}-11-03`,
      description: `${runTag} representative SIE source row`,
      amount: 1250,
      type: 'forsaljning',
      vat_rate: 25,
      source: 'sie_import',
    })
    expect(sieInsertError).toBeNull()

    const invoice = await createInvoiceByRpc(supabase, {
      invoiceNumber: `${runTag}-exempt-invoice`,
      customerName: 'E2E KAN-14 momsfri kund',
      invoiceDate: `${year}-11-04`,
      serviceDate: `${year}-11-04`,
      dueDate: `${year}-11-20`,
      grossAmount: 1000,
      vatTreatment: 'exempt',
      vatRate: 0,
      attachmentUrl: `${runTag}/invoice.pdf`,
    })
    await recordInvoicePaymentByRpc(
      supabase,
      invoice.invoiceId,
      `${year}-11-15`
    )
    const invoicePaymentTxId = await expectCustomerInvoiceBooking(
      supabase,
      invoice.invoiceId,
      'payment_same_year'
    )
    await expectJournalNet(supabase, invoicePaymentTxId, '1930', 1000)
    await expectJournalNet(supabase, invoicePaymentTxId, '3010', -1000)
    await expectJournalNet(supabase, invoicePaymentTxId, '2611', 0)

    const noDeductionTxId = await bookVatV2(supabase, {
      description: `${runTag} Adobe no deduction`,
      deductionEntitlement: 'none',
      deductibleInputVatAmount: 0,
      deductibleInputVatReportField: null,
    })
    await expectVatV2Journal(supabase, noDeductionTxId, {
      expected4535Debits: [57, 228],
      expected2645Debit: 0,
    })
    const noDeductionSnapshot = await readVatSnapshot(supabase, noDeductionTxId)
    expect(noDeductionSnapshot.vat.taxableBase).toBe(228)
    expect(noDeductionSnapshot.vat.acquisitionBaseField).toBe('21')
    expect(noDeductionSnapshot.vat.outputVat.amount).toBe(57)
    expect(noDeductionSnapshot.vat.outputVat.reportField).toBe('30')
    expect(noDeductionSnapshot.vat.deductibleInputVat.amount).toBe(0)
    expect(noDeductionSnapshot.vat.deductibleInputVat.reportField).toBeNull()
    expect(
      Number(noDeductionSnapshot.vat.outputVat.amount) -
        Number(noDeductionSnapshot.vat.deductibleInputVat.amount)
    ).toBe(57)

    const fullDeductionTxId = await bookVatV2(supabase, {
      description: `${runTag} EU service full deduction`,
      deductionEntitlement: 'full',
      deductibleInputVatAmount: 57,
      deductibleInputVatReportField: '48',
    })
    await expectVatV2Journal(supabase, fullDeductionTxId, {
      expected4535Debits: [228],
      expected2645Debit: 57,
    })
    const fullDeductionSnapshot = await readVatSnapshot(
      supabase,
      fullDeductionTxId
    )
    expect(fullDeductionSnapshot.vat.taxableBase).toBe(228)
    expect(fullDeductionSnapshot.vat.outputVat.amount).toBe(57)
    expect(fullDeductionSnapshot.vat.outputVat.reportField).toBe('30')
    expect(fullDeductionSnapshot.vat.deductibleInputVat.amount).toBe(57)
    expect(fullDeductionSnapshot.vat.deductibleInputVat.reportField).toBe('48')
    expect(
      Number(fullDeductionSnapshot.vat.outputVat.amount) -
        Number(fullDeductionSnapshot.vat.deductibleInputVat.amount)
    ).toBe(0)
  })
})

async function createAuthenticatedSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.SOLOLEDGER_E2E_EMAIL
  const password = process.env.SOLOLEDGER_E2E_PASSWORD

  if (!url || !anonKey || !email || !password) {
    throw new Error('Missing staging E2E Supabase environment.')
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  return client
}

function createAdminSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SOLOLEDGER_E2E_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Missing staging E2E service role environment.')
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function currentUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    throw new Error(`Could not resolve staging E2E user: ${error?.message}`)
  }
  return data.user
}

async function readProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('profiles')
    .select(
      'vat_status, vat_period_type, vat_management_from, domestic_sales_vat_treatment, foreign_purchase_reporting, default_deduction_entitlement'
    )
    .eq('id', userId)
    .single()
  if (error) {
    throw new Error(`profile read failed: ${error.message}`)
  }
  return data as ProfileSnapshot
}

async function updateProfile(
  client: SupabaseClient,
  userId: string,
  profile: ProfileSnapshot
) {
  const { error } = await client
    .from('profiles')
    .update(profile)
    .eq('id', userId)
  if (error) {
    throw new Error(`profile update failed: ${error.message}`)
  }
}

async function ensureAccounts(client: SupabaseClient, userId: string) {
  const { error } = await client.from('accounts').upsert(
    [
      {
        id: 'forsaljning',
        user_id: userId,
        name: 'Försäljning',
        debit_account: '1930',
        credit_account: '3010',
        default_vat_rate: 25,
        comment: 'E2E canonical sale category',
      },
      {
        id: legacyIncomeType,
        user_id: userId,
        name: 'E2E legacy försäljning',
        debit_account: '1930',
        credit_account: '3010',
        default_vat_rate: 25,
        comment: 'E2E KAN-14 legacy-like sale category',
      },
      {
        id: customIncomeType,
        user_id: userId,
        name: 'E2E KAN-14 egen intäkt 3041',
        debit_account: '1930',
        credit_account: '3041',
        default_vat_rate: 25,
        comment: 'E2E KAN-14 custom income category',
      },
    ],
    { onConflict: 'id,user_id' }
  )
  if (error) {
    throw new Error(`account setup failed: ${error.message}`)
  }
}

async function ensureBusinessPaymentRole(client: SupabaseClient, userId: string) {
  const { error } = await client.from('company_payment_account_roles').upsert(
    {
      user_id: userId,
      role: 'business_payment_account',
      account_number: '1930',
    },
    { onConflict: 'user_id,role' }
  )
  if (error) {
    throw new Error(`payment role setup failed: ${error.message}`)
  }
}

async function bookManualTransaction(
  client: SupabaseClient,
  type: string,
  vatRate: number,
  amount: number,
  description: string
) {
  const { data, error } = await client.rpc('book_transaction_atomic', {
    p_payload: {
      date: `${year}-11-02`,
      description,
      amount,
      type,
      vat_rate: vatRate,
      file_url: null,
    },
  })
  if (error) {
    throw new Error(`manual booking failed: ${error.message}`)
  }
  return String(data.transaction_id)
}

async function expectManualBookingFailure(
  client: SupabaseClient,
  type: string,
  vatRate: number,
  messagePattern: RegExp
) {
  const { error } = await client.rpc('book_transaction_atomic', {
    p_payload: {
      date: `${year}-11-02`,
      description: `${runTag} blocked ${type} ${vatRate}`,
      amount: 1250,
      type,
      vat_rate: vatRate,
      file_url: null,
    },
  })
  expect(error?.message ?? '').toMatch(messagePattern)
}

async function createInvoiceByRpc(
  client: SupabaseClient,
  payload: {
    invoiceNumber: string
    customerName: string
    invoiceDate: string
    serviceDate: string
    dueDate: string
    grossAmount: number
    vatTreatment: 'taxable' | 'exempt'
    vatRate: number
    attachmentUrl: string
  }
) {
  const { data, error } = await client.rpc('create_customer_invoice_atomic', {
    p_payload: {
      invoice_number: payload.invoiceNumber,
      customer_name: payload.customerName,
      customer_country: 'SE',
      currency: 'SEK',
      invoice_date: payload.invoiceDate,
      service_date: payload.serviceDate,
      due_date: payload.dueDate,
      gross_amount: payload.grossAmount,
      vat_treatment: payload.vatTreatment,
      vat_rate: payload.vatRate,
      attachment_url: payload.attachmentUrl,
    },
  })
  if (error) {
    throw new Error(`create invoice failed: ${error.message}`)
  }
  return { invoiceId: String(data.invoice_id) }
}

async function recordInvoicePaymentByRpc(
  client: SupabaseClient,
  invoiceId: string,
  paymentDate: string
) {
  const { error } = await client.rpc('record_customer_invoice_payment_atomic', {
    p_invoice_id: invoiceId,
    p_payment_date: paymentDate,
    p_idempotency_key: crypto.randomUUID(),
  })
  if (error) {
    throw new Error(`record invoice payment failed: ${error.message}`)
  }
}

async function expectCustomerInvoiceBooking(
  client: SupabaseClient,
  invoiceId: string,
  kind: string
) {
  const { data, error } = await client
    .from('customer_invoice_bookings')
    .select('transaction_id')
    .eq('invoice_id', invoiceId)
    .eq('booking_kind', kind)
    .single()
  if (error) {
    throw new Error(`customer invoice booking lookup failed: ${error.message}`)
  }
  return String(data.transaction_id)
}

async function bookVatV2(
  client: SupabaseClient,
  input: {
    description: string
    deductionEntitlement: 'full' | 'none'
    deductibleInputVatAmount: number
    deductibleInputVatReportField: '48' | null
  }
) {
  const { data, error } = await client.rpc(
    'book_vat_v2_eu_service_reverse_charge_atomic',
    {
      p_payload: {
        date: `${year}-11-06`,
        description: input.description,
        treatment_code: 'EU_SERVICE_REVERSE_CHARGE',
        calculation_rate: 25,
        deduction_entitlement: input.deductionEntitlement,
        taxable_base: 228,
        output_vat_amount: 57,
        deductible_input_vat_amount: input.deductibleInputVatAmount,
        acquisition_base_field: '21',
        output_vat_report_field: '30',
        deductible_input_vat_report_field:
          input.deductibleInputVatReportField,
        payment_account_role: 'business_payment_account',
        rule_version: 'vat-v2-kan18-first-slice',
        facts_version: 'vat-facts-v1',
        idempotency_key: crypto.randomUUID(),
        file_url: `${runTag}/vat-v2.pdf`,
      },
    }
  )
  if (error) {
    throw new Error(`VAT V2 booking failed: ${error.message}`)
  }
  return String(data.transaction_id)
}

async function readJournalRows(client: SupabaseClient, transactionId: string) {
  const { data, error } = await client
    .from('journal_entries')
    .select('account_number, debit, credit')
    .eq('transaction_id', transactionId)
  if (error) {
    throw new Error(`journal lookup failed: ${error.message}`)
  }
  return data
}

async function expectJournalNet(
  client: SupabaseClient,
  transactionId: string,
  accountNumber: string,
  expected: number
) {
  const rows = await readJournalRows(client, transactionId)
  const net = rows
    .filter(row => row.account_number === accountNumber)
    .reduce(
      (sum, row) => sum + Number(row.debit ?? 0) - Number(row.credit ?? 0),
      0
    )
  expect(net).toBe(expected)
}

async function expectVatV2Journal(
  client: SupabaseClient,
  transactionId: string,
  expected: {
    expected4535Debits: number[]
    expected2645Debit: number
  }
) {
  const rows = await readJournalRows(client, transactionId)
  const debit4535 = rows
    .filter(row => row.account_number === '4535')
    .map(row => Number(row.debit ?? 0))
    .filter(amount => amount > 0)
    .sort((a, b) => a - b)
  expect(debit4535).toEqual([...expected.expected4535Debits].sort((a, b) => a - b))
  await expectJournalNet(client, transactionId, '2614', -57)
  await expectJournalNet(client, transactionId, '1930', -228)
  await expectJournalNet(
    client,
    transactionId,
    '2645',
    expected.expected2645Debit
  )
}

async function readVatSnapshot(client: SupabaseClient, transactionId: string) {
  const { data, error } = await client
    .from('vat_audit_snapshots')
    .select('snapshot')
    .eq('transaction_id', transactionId)
    .single()
  if (error) {
    throw new Error(`VAT audit snapshot lookup failed: ${error.message}`)
  }
  return data.snapshot as any
}
