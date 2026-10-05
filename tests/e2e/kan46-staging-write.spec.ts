import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

test.describe('KAN-46 staging write acceptance', () => {
  test.setTimeout(120_000)

  test.beforeAll(() => {
    assertWriteE2EEnvironment()
  })

  test('books external customer invoices without duplicate income or VAT', async () => {
    const supabase = await createAuthenticatedSupabaseClient()
    const year = 2090 + Math.floor(Math.random() * 100)
    const runTag = `E2E-KAN-46-${Date.now()}`

    const sameYearInvoice = await createInvoice(supabase, {
      invoiceNumber: `${runTag}-same-year`,
      customerName: 'E2E svensk kund',
      invoiceDate: `${year}-06-01`,
      serviceDate: `${year}-06-01`,
      dueDate: `${year}-06-30`,
      grossAmount: 1250,
      vatTreatment: 'taxable',
      vatRate: 25,
    })

    const sameYearPayment = await rpc(supabase, 'record_customer_invoice_payment_atomic', {
      p_invoice_id: sameYearInvoice.invoiceId,
      p_payment_date: `${year}-07-02`,
      p_idempotency_key: crypto.randomUUID(),
    })
    await expectJournalBalance(supabase, sameYearPayment.transactionId, '1930', 1250)
    await expectJournalBalance(supabase, sameYearPayment.transactionId, '3010', -1000)
    await expectJournalBalance(supabase, sameYearPayment.transactionId, '2611', -250)

    const unknownYear = year + 20
    const unknownInvoice = await createInvoice(supabase, {
      invoiceNumber: `${runTag}-unknown`,
      customerName: 'E2E osaker moms',
      invoiceDate: `${unknownYear}-12-10`,
      serviceDate: `${unknownYear}-12-10`,
      dueDate: `${unknownYear + 1}-01-10`,
      grossAmount: 500,
      vatTreatment: 'unknown',
    })

    const { error: unknownVatBookingError } = await supabase.rpc('book_customer_invoice_year_end_receivable_atomic', {
      p_invoice_id: unknownInvoice.invoiceId,
      p_fiscal_year: unknownYear,
      p_idempotency_key: crypto.randomUUID(),
    })
    expect(unknownVatBookingError?.message ?? '').toMatch(/momsstatus är osäker/i)

    const yearEndInvoice = await createInvoice(supabase, {
      invoiceNumber: `${runTag}-year-end`,
      customerName: 'E2E julfoto',
      invoiceDate: `${year}-12-20`,
      serviceDate: `${year}-12-19`,
      dueDate: `${year + 1}-01-20`,
      grossAmount: 2500,
      vatTreatment: 'taxable',
      vatRate: 25,
    })

    const { error: unbookedCloseError } = await supabase.rpc('close_year_atomic', {
      p_year: year,
    })
    expect(unbookedCloseError?.message ?? '').toMatch(/inte bokförd som kundfordran/i)

    const receivable = await rpc(supabase, 'book_customer_invoice_year_end_receivable_atomic', {
      p_invoice_id: yearEndInvoice.invoiceId,
      p_fiscal_year: year,
      p_idempotency_key: crypto.randomUUID(),
    })
    await expectJournalBalance(supabase, receivable.transactionId, '1510', 2500)
    await expectJournalBalance(supabase, receivable.transactionId, '3010', -2000)
    await expectJournalBalance(supabase, receivable.transactionId, '2611', -500)

    await expectInvoicePaymentStatus(supabase, yearEndInvoice.invoiceId, 'unpaid')

    const settlement = await rpc(supabase, 'settle_customer_invoice_receivable_atomic', {
      p_invoice_id: yearEndInvoice.invoiceId,
      p_payment_date: `${year + 1}-01-15`,
      p_idempotency_key: crypto.randomUUID(),
    })
    await expectJournalBalance(supabase, settlement.transactionId, '1930', 2500)
    await expectJournalBalance(supabase, settlement.transactionId, '1510', -2500)
    await expectJournalBalance(supabase, settlement.transactionId, '3010', 0)
    await expectJournalBalance(supabase, settlement.transactionId, '2611', 0)
    await expectInvoicePaymentStatus(supabase, yearEndInvoice.invoiceId, 'paid')
  })
})

type InvoiceInput = {
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  serviceDate: string
  dueDate: string
  grossAmount: number
  vatTreatment: 'taxable' | 'exempt' | 'unknown'
  vatRate?: number
}

async function createInvoice(supabase: SupabaseClient, input: InvoiceInput) {
  return rpc(supabase, 'create_customer_invoice_atomic', {
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
    },
  })
}

async function rpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    throw new Error(`${fn} failed: ${error.message}`)
  }
  expect(data?.success).toBe(true)
  return {
    invoiceId: String(data.invoice_id),
    transactionId: data.transaction_id == null ? null : String(data.transaction_id),
  }
}

async function expectJournalBalance(
  supabase: SupabaseClient,
  transactionId: string | null,
  accountNumber: string,
  expected: number
) {
  expect(transactionId).not.toBeNull()
  const { data, error } = await supabase
    .from('journal_entries')
    .select('debit, credit')
    .eq('transaction_id', transactionId)
    .eq('account_number', accountNumber)
  if (error) {
    throw new Error(`journal lookup failed: ${error.message}`)
  }

  const actual = (data ?? []).reduce(
    (sum, row) => sum + Number(row.debit ?? 0) - Number(row.credit ?? 0),
    0
  )
  expect(Math.round(actual * 100) / 100).toBe(expected)
}

async function expectInvoicePaymentStatus(
  supabase: SupabaseClient,
  invoiceId: string,
  expected: 'unpaid' | 'paid'
) {
  const { data, error } = await supabase
    .from('customer_invoices')
    .select('payment_status')
    .eq('id', invoiceId)
    .single()
  if (error) {
    throw new Error(`invoice lookup failed: ${error.message}`)
  }
  expect(data.payment_status).toBe(expected)
}

async function createAuthenticatedSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.SOLOLEDGER_E2E_EMAIL
  const password = process.env.SOLOLEDGER_E2E_PASSWORD

  if (!url || !anonKey || !email || !password) {
    throw new Error('Missing staging E2E Supabase environment.')
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  expect(loginError).toBeNull()

  return supabase
}
