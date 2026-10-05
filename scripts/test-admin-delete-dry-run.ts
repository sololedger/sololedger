import { readFileSync } from 'node:fs'

import {
  ADMIN_DELETE_DRY_RUN_COUNT_KEYS,
  ADMIN_DELETE_DRY_RUN_COUNT_LABELS,
  normalizeAdminDeleteDryRunCounts,
  type AdminDeleteDryRunCountKey,
} from '../src/lib/adminDeleteDryRun.ts'

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

const legacyKeys: AdminDeleteDryRunCountKey[] = [
  'transactions',
  'journal_entries',
  'favorites',
  'import_batches',
  'accounts',
  'closed_years',
  'ver_nr_sequences',
  'attachments',
]

const lifecycleKeys: AdminDeleteDryRunCountKey[] = [
  'customer_invoice_bookings',
  'customer_invoices',
  'tax_account_movements',
  'tax_account_events',
  'vat_v2_booking_idempotency',
  'vat_audit_snapshots',
  'vat_periods',
  'company_payment_account_roles',
]

for (const key of [...lifecycleKeys, ...legacyKeys]) {
  assert(
    ADMIN_DELETE_DRY_RUN_COUNT_KEYS.includes(key),
    `Dry-run count inventory includes ${key}`
  )
  assert(
    ADMIN_DELETE_DRY_RUN_COUNT_LABELS[key].length > 0,
    `AdminPanel has a Swedish label for ${key}`
  )
}

const normalizedEmpty = normalizeAdminDeleteDryRunCounts({})
for (const key of ADMIN_DELETE_DRY_RUN_COUNT_KEYS) {
  assertEqual(normalizedEmpty[key], 0, `Missing dry-run count defaults ${key} to zero`)
}

const normalizedLifecycle = normalizeAdminDeleteDryRunCounts({
  customer_invoice_bookings: 10,
  customer_invoices: 11,
  tax_account_movements: 1,
  tax_account_events: 2,
  vat_v2_booking_idempotency: 3,
  vat_audit_snapshots: 4,
  vat_periods: 5,
  company_payment_account_roles: 6,
  transactions: 7,
  journal_entries: 8,
  attachments: 9,
})

assertEqual(normalizedLifecycle.customer_invoice_bookings, 10, 'Customer invoice booking count is preserved')
assertEqual(normalizedLifecycle.customer_invoices, 11, 'Customer invoice count is preserved')
assertEqual(normalizedLifecycle.tax_account_movements, 1, 'Movement count is preserved')
assertEqual(normalizedLifecycle.tax_account_events, 2, 'Event count is preserved')
assertEqual(
  normalizedLifecycle.vat_v2_booking_idempotency,
  3,
  'VAT V2 idempotency count is preserved'
)
assertEqual(normalizedLifecycle.vat_audit_snapshots, 4, 'Audit snapshot count is preserved')
assertEqual(normalizedLifecycle.vat_periods, 5, 'VAT period count is preserved')
assertEqual(
  normalizedLifecycle.company_payment_account_roles,
  6,
  'Payment-role count is preserved'
)
assertEqual(normalizedLifecycle.transactions, 7, 'Legacy transaction count is preserved')
assertEqual(normalizedLifecycle.journal_entries, 8, 'Legacy journal count is preserved')
assertEqual(normalizedLifecycle.attachments, 9, 'Storage attachment count is preserved')
assertEqual(normalizedLifecycle.import_batches, 0, 'Unspecified legacy count remains zero')

const edgeFunctionSource = readFileSync('supabase/functions/delete-user/index.ts', 'utf8')

for (const key of [...lifecycleKeys, ...legacyKeys.filter(key => key !== 'attachments')]) {
  assert(
    edgeFunctionSource.includes(`'${key}'`),
    `Edge Function TABLES includes ${key}`
  )
}

assert(
  edgeFunctionSource.includes('attachments: attachmentPaths.length'),
  'Edge Function still includes storage attachment count'
)
assert(
  edgeFunctionSource.includes("action: 'dry-run'"),
  'Edge Function still returns dry-run action'
)
assert(
  edgeFunctionSource.includes('databaseDelete: dbDeleteResult'),
  'Delete-success response still includes databaseDelete result'
)
assert(edgeFunctionSource.includes('Unauthorized'), 'Unauthorized behavior remains present')
assert(edgeFunctionSource.includes('Forbidden'), 'Forbidden behavior remains present')
assert(
  edgeFunctionSource.includes('Ogiltig action'),
  'Invalid action behavior remains present'
)

console.log('admin delete dry-run contract tests passed')
